import { useEffect, useRef, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import DateRangeInput from "../components/DateRangeInput";
import { supabase, supabaseConfigError } from "../supabase";
import { ADMIN_EMAILS, getEmailRecipient, sendAutoEmail } from "../lib/email";
import { getUrgency } from "../utils/pricing";
import { MATCHING_STATUS } from "../utils/status";
import {
  ASSIGNMENT_STATUS,
  OPERATION_STATUS,
  SETTLEMENT_FLOW_STATUS,
} from "../utils/operationsStatus";
import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "../utils/managementNumber";
import { normalizeRequestType } from "../utils/designatedRequest";
import "./RequestForm.css";

const initialForm = {
  companyName: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  eventName: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  eventLocation: "",
  languageDirection: "양방향",
  requestedLevel: "운영팀 추천받기",
  requestedPeopleCount: "1",
  preferredGender: "성별 무관",
  interpretationTypes: [],
  industryField: "무역",
  customIndustryField: "",
  referenceMaterial: "없음",
  referenceFileName: "",
  referenceFile: null,
  requestDetails: "",
};

const levelOptions = ["운영팀 추천받기", "LV1", "LV2", "LV3", "LV4"];
const languageDirectionOptions = ["한국어 → 일본어", "일본어 → 한국어", "양방향"];

const fieldOptions = [
  "화장품",
  "IT",
  "제조",
  "무역",
  "의료",
  "기타",
];

const defaultInterpretationLanguage = "한일 통역";
const requestReferenceBucket = "request-files";
const referenceFileMaxSize = 10 * 1024 * 1024;
const allowedReferenceFileExtensions = new Set(["pdf", "jpg", "jpeg", "png"]);
const interpretationTypeOptions = [
  "전시회",
  "상담회",
  "비즈니스 미팅",
  "출장 동행",
  "현장 운영 지원",
];

const requestSteps = [
  "의뢰 접수",
  "운영팀 검토",
  "조건 확인",
  "통역사 추천",
  "일정 확정",
];

const sectionMeta = {
  basic: {
    icon: "01",
    title: "기본 정보",
    description: "의뢰하시는 기업 정보를 입력해주세요.",
  },
  event: {
    icon: "02",
    title: "행사 정보",
    description: "의뢰 검토에 필요한 일정과 장소를 입력해주세요.",
  },
  request: {
    icon: "03",
    title: "통역 조건",
    description: "유형, 분야를 선택해주세요.",
  },
  details: {
    icon: "04",
    title: "참고 자료 및 요청사항",
    description: "자료 보유 여부와 추가 요청을 알려주세요.",
  },
};

function RequestForm({ user, interpreter, duplicateTemplate, onBackClick, onSubmitSuccess }) {
  const isGeneralRequest = !interpreter;
  const [form, setForm] = useState(initialForm);
  const requestedLevel = isGeneralRequest
    ? form.requestedLevel
    : interpreter?.level || null;
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const referenceFileInputRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Prepopulate from duplicate template
  useEffect(() => {
    if (duplicateTemplate) {
      const detailsText = duplicateTemplate.request_details || duplicateTemplate.request_detail || "";
      
      const parsedTypes = [];
      interpretationTypeOptions.forEach(opt => {
        if (detailsText.includes(opt)) {
          parsedTypes.push(opt);
        }
      });
      
      const industryField = duplicateTemplate.interpretation_field || duplicateTemplate.job_field || "";
      const isFieldOption = fieldOptions.includes(industryField);
      const formIndustryField = isFieldOption ? industryField : (industryField ? "기타" : "무역");
      const customIndustryField = isFieldOption ? "" : industryField;
      
      let customDetails = "";
      const match = detailsText.match(/추가 요청사항:\s*([\s\S]*)$/);
      if (match) {
        customDetails = match[1].trim();
      }

      Promise.resolve().then(() => {
        setForm({
          companyName: duplicateTemplate.company_name || "",
          contactName: duplicateTemplate.manager_name || duplicateTemplate.contact_name || "",
          contactPhone: duplicateTemplate.phone || "",
          contactEmail: duplicateTemplate.email || "",
          eventName: duplicateTemplate.event_name || "",
          startDate: duplicateTemplate.start_date || duplicateTemplate.event_date || "",
          endDate: duplicateTemplate.end_date || "",
          startTime: duplicateTemplate.event_start_time || "",
          endTime: duplicateTemplate.event_end_time || "",
          eventLocation: duplicateTemplate.event_location || "",
          languageDirection: duplicateTemplate.language_direction || "양방향",
          requestedLevel: duplicateTemplate.requested_level || "운영팀 추천받기",
          requestedPeopleCount: String(duplicateTemplate.requested_people_count || duplicateTemplate.required_count || "1"),
          preferredGender: duplicateTemplate.preferred_gender || "성별 무관",
          interpretationTypes: parsedTypes,
          industryField: formIndustryField,
          customIndustryField: customIndustryField,
          referenceMaterial: "없음",
          referenceFileName: "",
          referenceFile: null,
          requestDetails: customDetails,
        });
      });
    }
  }, [duplicateTemplate]);

  // Prepopulate from user's business profile if not duplicating
  useEffect(() => {
    if (user && !duplicateTemplate) {
      const fetchBusinessProfile = async () => {
        try {
          const { data, error } = await supabase
            .from("businesses")
            .select("*")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          if (!error && data) {
            setForm(current => ({
              ...current,
              companyName: data.company_name || "",
              contactName: data.contact_name || "",
              contactPhone: data.contact_phone || "",
              contactEmail: data.contact_email || "",
            }));
          }
        } catch (err) {
          console.error("Error loading business profile for form auto-populate:", err);
        }
      };
      fetchBusinessProfile();
    }
  }, [user, duplicateTemplate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const updateFormValue = (name, value) => {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const toggleArrayValue = (name, value) => {
    setForm((current) => {
      const selected = current[name] || [];
      const next = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];

      return {
        ...current,
        [name]: next,
      };
    });
  };

  const handleReferenceMaterialChange = (value) => {
    setForm((current) => ({
      ...current,
      referenceMaterial: value,
      ...(value === "없음"
        ? {
            referenceFileName: "",
            referenceFile: null,
          }
        : {}),
    }));

    if (value === "없음" && referenceFileInputRef.current) {
      referenceFileInputRef.current.value = "";
    }
  };

  const handleReferenceFileChange = (file) => {
    if (!file) {
      updateFormValue("referenceFileName", "");
      updateFormValue("referenceFile", null);
      return;
    }

    const validationMessage = getReferenceFileValidationMessage(file);
    if (validationMessage) {
      alert(validationMessage);
      if (referenceFileInputRef.current) referenceFileInputRef.current.value = "";
      return;
    }

    setForm((current) => ({
      ...current,
      referenceFileName: file.name,
      referenceFile: file,
    }));
  };

  const uploadReferenceFile = async (file) => {
    if (!file) return null;

    const validationMessage = getReferenceFileValidationMessage(file);
    if (validationMessage) {
      const error = new Error(validationMessage);
      console.error("Reference file validation failed:", {
        fileName: file.name,
        fileSize: file.size,
        message: validationMessage,
      });
      setErrorMessage(validationMessage);
      alert(validationMessage);
      throw error;
    }

    const filePath = getReferenceStoragePath(file);

    const { error } = await supabase.storage
      .from(requestReferenceBucket)
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      console.error("REFERENCE_UPLOAD_FAILED", {
        error,
        message: error?.message,
        details: error?.details,
        statusCode: error?.statusCode,
        status: error?.status,
        name: error?.name,
        bucket: requestReferenceBucket,
        filePath,
        originalFileName: file.name,
        fileSize: file.size,
      });
      const message = `참고자료 업로드 실패: ${error?.message || "참고 자료 파일 업로드에 실패했습니다. 다시 시도해주세요."}`;
      setErrorMessage(message);
      alert(message);
      throw error;
    }

    return {
      fileName: file.name,
      filePath,
      fileUrl: filePath,
    };
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
    console.log("COMPANY REQUEST SUBMIT START");
    console.log("COMPANY REQUEST FORM DATA", form);

    setErrorMessage("");

    if (!areTermsAgreed(agreements)) {
      const message = "약관 동의 후 제출 가능합니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    if (!form.startDate) {
      const message = "행사 시작일을 선택해주세요.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (!form.endDate) {
      const message = "행사 종료일을 선택해주세요.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (form.endDate < form.startDate) {
      const message = "종료일은 시작일보다 빠를 수 없습니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (form.interpretationTypes.length === 0) {
      const message = "통역 유형을 1개 이상 선택해주세요.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    const urgency = getUrgency(form.startDate);
    const industryField =
      form.industryField === "기타"
        ? form.customIndustryField.trim() || "기타"
        : form.industryField;
    const referenceFileUpload = await uploadReferenceFile(form.referenceFile);
    const requestDetails = [
      `통역 언어: ${form.languageDirection || defaultInterpretationLanguage}`,
      `통역 유형: ${form.interpretationTypes.join(", ")}`,
      `산업 분야: ${industryField}`,
      `진행 시간: ${formatTimeRange(form.startTime, form.endTime)}`,
      `참고 자료: ${form.referenceMaterial}${
        form.referenceFileName ? ` (${form.referenceFileName})` : ""
      }`,
      referenceFileUpload?.fileName ? `참고 자료 파일명: ${referenceFileUpload.fileName}` : "",
      referenceFileUpload?.filePath ? `참고 자료 파일 경로: ${referenceFileUpload.filePath}` : "",
      referenceFileUpload?.fileUrl ? `참고 자료 파일 URL: ${referenceFileUpload.fileUrl}` : "",
      form.requestDetails ? `추가 요청사항: ${form.requestDetails}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const contact = `${form.contactPhone} / ${form.contactEmail}`;
    const eventName =
      form.eventName.trim() ||
      `${form.companyName} ${form.interpretationTypes[0] || "통역"} 의뢰`;
    const requestType = interpreter
      ? "designated"
      : urgency === "NORMAL"
        ? "general"
        : "urgent";
    const isDesignatedRequest = Boolean(interpreter?.id);

    const requestPayload = {
      company_auth_user_id: user?.id || null,
      interpreter_id: interpreter?.id || null,
      interpreter_name: interpreter?.name || "",
      company_name: form.companyName,
      contact_name: form.contactName,
      contact_email_or_phone: contact,
      manager_name: form.contactName,
      email: form.contactEmail,
      phone: form.contactPhone,
      event_name: eventName,
      event_date: form.startDate,
      start_date: form.startDate,
      end_date: form.endDate,
      event_start_time: form.startTime || null,
      event_end_time: form.endTime || null,
      event_location: form.eventLocation,
      language_direction: form.languageDirection,
      work_hours: 0,
      requested_level: requestedLevel,
      requested_people_count: Number(form.requestedPeopleCount || 1),
      preferred_gender: form.preferredGender,
      interpretation_field: industryField,
      urgency,
      request_details: requestDetails,
      request_detail: requestDetails,
      reference_file_name: referenceFileUpload?.fileName || null,
      reference_file_path: referenceFileUpload?.filePath || null,
      reference_file_url: referenceFileUpload?.fileUrl || null,
      materials_available: form.referenceMaterial === "있음",
      estimate_status: "estimate_preparing",
      request_type: normalizeRequestType(requestType),
      admin_checked: false,
      checked_at: null,
      status: MATCHING_STATUS.DRAFT,
      matching_status: MATCHING_STATUS.DRAFT,
      assignment_status: isDesignatedRequest
        ? ASSIGNMENT_STATUS.ASSIGNING
        : ASSIGNMENT_STATUS.WAITING,
      operation_status: OPERATION_STATUS.BEFORE_OPERATION,
      settlement_status: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED,
      is_public: false,
      job_description: requestDetails,
      job_field: industryField,
      required_level:
        requestedLevel === "운영팀 추천받기" ? null : requestedLevel,
      required_count: Number(form.requestedPeopleCount || 1),
      agreed_terms: true,
      agreed_policy: true,
      agreed_at: new Date().toISOString(),
    };
    const designatedPayload = {
      ...requestPayload,
      selected_interpreter_id: interpreter?.id || null,
      selected_interpreter_name: interpreter?.name || "",
    };
    const managementConfig = MANAGEMENT_NUMBER_CONFIG.requests;
    let insertPayload = await addManagementNumber({
      supabase,
      table: "requests",
      payload: designatedPayload,
      ...managementConfig,
    });

    console.log("COMPANY REQUEST BEFORE DB INSERT");

    let { data, error } = await supabase
      .from("requests")
      .insert([insertPayload])
      .select("id")
      .single();

    if (isManagementNumberConflict(error, managementConfig.column)) {
      insertPayload = await addManagementNumber({
        supabase,
        table: "requests",
        payload: designatedPayload,
        ...managementConfig,
      });
      const retryResult = await supabase
        .from("requests")
        .insert([insertPayload])
        .select("id")
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    console.log("COMPANY REQUEST DB INSERT RESULT", {
      data,
      error,
    });

    if (error && isMissingColumnError(error)) {
      const legacyRequestPayload = { ...requestPayload };
      delete legacyRequestPayload.assignment_status;
      delete legacyRequestPayload.operation_status;
      delete legacyRequestPayload.settlement_status;
      delete legacyRequestPayload.matching_status;
      delete legacyRequestPayload.request_type;
      delete legacyRequestPayload.admin_checked;
      delete legacyRequestPayload.checked_at;
      delete legacyRequestPayload.request_no;
      delete legacyRequestPayload.reference_file_name;
      delete legacyRequestPayload.reference_file_path;
      delete legacyRequestPayload.reference_file_url;
      delete legacyRequestPayload.event_start_time;
      delete legacyRequestPayload.event_end_time;
      delete legacyRequestPayload.language_direction;
      delete legacyRequestPayload.materials_available;
      delete legacyRequestPayload.estimate_status;
      const fallbackResult = await supabase
        .from("requests")
        .insert([legacyRequestPayload])
        .select("id")
        .single();
      data = fallbackResult.data;
      error = fallbackResult.error;
      console.log("COMPANY REQUEST DB INSERT FALLBACK RESULT", {
        data,
        error,
      });
    }

    if (error) {
      if (isAgreementColumnError(error)) {
        console.error("약관 동의 저장 실패:", error);
      }
      console.error("COMPANY REQUEST DB INSERT ERROR", error);
      console.error("insert failed", {
        table: "requests",
        payload: insertPayload,
        error,
      });
      console.error("request insert error:", error);
      const message = isSupabasePermissionError(error)
        ? "통역사는 통역 의뢰를 할 수 없습니다."
        : "의뢰 저장에 실패했습니다. 다시 시도해주세요.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    const companyEmail = getEmailRecipient(
      form.contactEmail,
      requestPayload.email,
      requestPayload.contact_email_or_phone
    );
    const emailPayload = {
      requestId: data?.id || "",
      request_id: data?.id || "",
      companyName: requestPayload.company_name,
      contactName: requestPayload.contact_name,
      contactEmail: companyEmail || requestPayload.contact_email_or_phone,
      contact: requestPayload.contact_email_or_phone,
      eventName: requestPayload.event_name,
      date:
        requestPayload.start_date === requestPayload.end_date
          ? requestPayload.start_date
          : `${requestPayload.start_date} ~ ${requestPayload.end_date}`,
      location: requestPayload.event_location,
      requestedLevel: requestPayload.requested_level,
      requestedPeopleCount: requestPayload.requested_people_count,
      languageDirection: requestPayload.language_direction,
      eventTime: formatTimeRange(form.startTime, form.endTime),
      interpretationField: requestPayload.interpretation_field,
      interpretationTypes: form.interpretationTypes.join(", "),
      requestDetails: form.requestDetails || "-",
      designatedInterpreterName: interpreter?.name || "",
    };

    console.log("COMPANY REQUEST SUCCESS - START EMAILS", companyEmail);
    console.log("COMPANY REQUEST START EMAIL FLOW");
    console.log("COMPANY EMAIL TARGET:", companyEmail);

    try {
      if (companyEmail) {
        const result = await sendAutoEmail(
          "company_request_received_user",
          companyEmail,
          emailPayload
        );
        if (!result.ok) console.error("Company email failed", result.error || result);
      } else {
        console.warn("SKIP company_request_received_user: no email", form);
        console.warn(
          "EMAIL SKIPPED: SKIP COMPANY EMAIL: company email is empty",
          {
            form,
            requestPayload,
            companyEmail,
          }
        );
      }
    } catch (error) {
      console.error("USER EMAIL FAILED", error);
      console.error("Company email failed", error);
    }

    if (interpreter?.id) {
      try {
        console.log("DESIGNATED INTERPRETER EMAIL START");
        const result = await sendAutoEmail(
          "designated_request_received_interpreter",
          "",
          {
            ...emailPayload,
            interpreterId: interpreter.id,
            interpreter_id: interpreter.id,
            interpreterName: interpreter.name || "",
          }
        );
        if (!result.ok) {
          console.error("Designated interpreter email failed", result.error || result);
        } else {
          console.log("Designated interpreter email sent successfully", {
            interpreterId: interpreter.id,
            resolvedInBrowser: false,
          });
        }
      } catch (error) {
        console.error("DESIGNATED INTERPRETER EMAIL FAILED", error);
      }
    }

    try {
      console.log("COMPANY ADMIN EMAIL START");
      const result = await sendAutoEmail(
        "company_request_received_admin",
        ADMIN_EMAILS,
        {
          ...emailPayload,
          companyName: form.companyName,
          email: companyEmail,
        }
      );
      if (!result.ok) console.error("Company admin email failed", result.error || result);
    } catch (error) {
      console.error("ADMIN EMAIL FAILED", error);
      console.error("Company admin email failed", error);
    }

    alert(
      isDesignatedRequest
        ? "통역 의뢰가 접수되었습니다.\n\n선택하신 통역사의 일정 및 가능 여부 확인 후 최종 매칭됩니다.\n일정이 맞지 않는 경우 ON-LI에서 조건에 맞는 다른 통역사를 안내해드립니다."
        : "통역 의뢰가 접수되었습니다.\n\nON-LI 담당자가 내용을 확인 후\n영업일 기준 3시간 이내 연락드립니다."
    );
    setForm(initialForm);
    if (referenceFileInputRef.current) {
      referenceFileInputRef.current.value = "";
    }
    setAgreements(initialTermsAgreement);
    onSubmitSuccess();
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled = isSubmitting || !areTermsAgreed(agreements);

  return (
    <div className="request-page">
      <div className="request-container">
        <header className="request-hero">
          <div className="request-hero-copy">
            <nav className="request-breadcrumb" aria-label="현재 위치">
              <button type="button" onClick={onBackClick}>홈</button>
              <span aria-hidden="true">/</span>
              <span>통역 의뢰</span>
            </nav>
            <p className="request-eyebrow">ON-LI REQUEST</p>
            <h1>통역 의뢰</h1>
            <p className="request-description">
              {isGeneralRequest
                ? "전시회·상담회·기업 미팅 등 통역이 필요한 일정 정보를 입력해주세요."
                : `${interpreter?.name || "선택한 통역사"}님과의 매칭 검토에 필요한 의뢰 정보를 입력해주세요.`}
              <br />
              접수 후 ON-LI 담당자가 조건을 확인하고 빠르게 연락드립니다.
            </p>
          </div>
          <div className="request-hero-actions">
            <button
              type="button"
              onClick={onBackClick}
              className={`request-back-button${
                isGeneralRequest ? " main-return-button" : ""
              }`}
            >
              {isGeneralRequest ? "메인으로" : "상세 페이지로"}
            </button>
          </div>
        </header>

        <section className="request-guide-grid" aria-label="통역 의뢰 안내">
          <div className="request-guide-panel">
            <span className="request-guide-kicker">REQUEST GUIDE</span>
            <h2>필요한 조건만 알려주시면<br />적합한 통역사를 연결합니다.</h2>
            <p>일정과 현장 조건을 바탕으로 ON-LI 운영팀이 의뢰 내용을 검토합니다.</p>
            <div className="request-guide-items">
              <div><strong>01</strong><span>일정·장소 입력</span></div>
              <div><strong>02</strong><span>통역 조건 선택</span></div>
              <div><strong>03</strong><span>운영팀 검토</span></div>
            </div>
          </div>
          <aside className="request-preparation-card">
            <h2>접수 전 준비사항</h2>
            <ul>
              <li>행사 일정과 장소</li>
              <li>필요 인원과 통역 분야</li>
              <li>선택 사항인 참고 자료</li>
            </ul>
            <p><strong>빠른 안내</strong> 영업일 기준 3시간 이내 연락드립니다.</p>
          </aside>
        </section>

        <div className="request-step-card" aria-label="통역 의뢰 진행 단계">
          {requestSteps.map((step, index) => (
            <div
              key={step}
              className={`request-step${index === 0 ? " is-active" : ""}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="request-form-shell">
          <SectionBlock meta={sectionMeta.basic}>
            <div className="request-grid request-grid-2">
              <Field label="회사명" name="companyName" value={form.companyName} onChange={handleChange} required />
              <Field label="담당자명" name="contactName" value={form.contactName} onChange={handleChange} required />
              <Field label="연락처" name="contactPhone" type="tel" value={form.contactPhone} onChange={handleChange} required />
              <Field label="이메일" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} required />
            </div>
          </SectionBlock>

          <SectionBlock meta={sectionMeta.event}>
            <div className="request-grid request-grid-2 request-event-grid">
              <div className="request-event-date">
                <DateRangeInput
                  required
                  showQuickButtons
                  label="행사 날짜"
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={({ startDate, endDate }) =>
                    setForm((current) => ({
                      ...current,
                      startDate,
                      endDate,
                    }))
                  }
                />
              </div>
              <Field label="행사명 또는 프로젝트명" name="eventName" value={form.eventName} onChange={handleChange} placeholder="선택 입력" />
              <Field label="장소" name="eventLocation" value={form.eventLocation} onChange={handleChange} required />
              <Field label="시작 시간" name="startTime" type="time" value={form.startTime} onChange={handleChange} />
              <Field label="종료 시간" name="endTime" type="time" value={form.endTime} onChange={handleChange} />
            </div>
          </SectionBlock>

          <SectionBlock meta={sectionMeta.request} className="request-section-compact">
            <div
              className={`request-grid request-grid-2 request-grid-request${
                isGeneralRequest ? "" : " request-grid-request-designated"
              }`}
            >
              <div className="request-grid-area request-grid-area-left">
                <CheckboxGroup
                  label="통역 유형"
                  options={interpretationTypeOptions}
                  values={form.interpretationTypes}
                  onChange={(value) => toggleArrayValue("interpretationTypes", value)}
                />
                <TabField
                  label="언어 방향"
                  value={form.languageDirection}
                  onChange={(value) => updateFormValue("languageDirection", value)}
                  options={languageDirectionOptions}
                />
                <TabField
                  className="request-grid-area-field"
                  label="산업 분야"
                  value={form.industryField}
                  onChange={(value) => updateFormValue("industryField", value)}
                  options={fieldOptions}
                />
                {form.industryField === "기타" && (
                  <Field
                    label="기타 산업 분야"
                    name="customIndustryField"
                    value={form.customIndustryField}
                    onChange={handleChange}
                    placeholder="산업 분야를 입력해주세요"
                    required
                  />
                )}
                <Field
                  className="request-grid-area-people"
                  label="필요 인원 수"
                  name="requestedPeopleCount"
                  type="number"
                  min="1"
                  placeholder="예: 3"
                  value={form.requestedPeopleCount}
                  onChange={handleChange}
                  required
                />
                <TabField
                  className="request-grid-area-gender"
                  label="희망 성별"
                  value={form.preferredGender}
                  onChange={(value) => updateFormValue("preferredGender", value)}
                  options={["성별 무관", "여성 희망", "남성 희망"]}
                />
              </div>
              {isGeneralRequest && (
                <div className="request-grid-area request-grid-area-right">
                  <TabField
                    className="request-grid-area-level"
                    label="희망 통역 레벨"
                    value={form.requestedLevel}
                    onChange={(value) => updateFormValue("requestedLevel", value)}
                    options={levelOptions}
                    helpText="행사 성격에 맞는 통역 수준을 선택해주세요."
                  />
                  <div className="level-guide-box request-grid-area-guide">
                    <div className="level-guide-title">레벨 기준 안내</div>
                    <div className="level-guide-list">
                      <div className="level-guide-item"><strong>LV1</strong> 기본 응대 / 운영 지원</div>
                      <div className="level-guide-item"><strong>LV2</strong> 고객 응대 / 제품 설명</div>
                      <div className="level-guide-item"><strong>LV3</strong> 상담 지원 / 현장 운영</div>
                      <div className="level-guide-item"><strong>LV4</strong> B2B 협의 / 수행통역</div>
                    </div>
                    <div className="level-guide-note">레벨 선택이 어렵다면 운영팀 추천받기를 선택해주세요.</div>
                  </div>
                </div>
              )}
            </div>
          </SectionBlock>

          <SectionBlock meta={sectionMeta.details}>
            <TabField
              label="사전 자료 업로드 가능 여부"
              value={form.referenceMaterial}
              onChange={handleReferenceMaterialChange}
              options={["있음", "없음"]}
            />
            {form.referenceMaterial === "있음" && (
              <label className="request-field request-full-width">
                <span className="request-field-label">참고 자료 파일</span>
                <input
                  ref={referenceFileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="request-input request-file-input"
                  onChange={(event) =>
                    handleReferenceFileChange(event.target.files?.[0] || null)
                  }
                />
                <span className="request-help-text">
                  PDF, JPG, PNG 파일만 업로드할 수 있습니다. 원본 파일명은 요청 내용에 함께 기록됩니다.
                </span>
              </label>
            )}
            <label className="request-field request-full-width">
              <span className="request-field-label">요청 내용</span>
              <textarea
                name="requestDetails"
                value={form.requestDetails}
                onChange={handleChange}
                maxLength={500}
                rows={4}
                className="request-input request-textarea"
                placeholder="요청사항을 입력해주세요 (선택)"
              />
              <span className="request-count">{form.requestDetails.length} / 500</span>
            </label>
          </SectionBlock>

          {errorMessage && <p className="request-error" role="alert">{errorMessage}</p>}

          <TermsAgreement
            agreements={agreements}
            className="request-terms-agreement"
            onChange={handleAgreementChange}
            role="client"
          />

          <div className="request-submit-card">
            <div>
              <strong>의뢰 접수 후 영업일 기준 3시간 이내 담당자가 연락드립니다.</strong>
              <p>일정, 장소, 분야를 확인한 뒤 적합한 통역 조건을 안내합니다.</p>
              {!isGeneralRequest && (
                <p className="request-designated-note">
                  선택하신 통역사의 일정 및 가능 여부 확인 후 최종 매칭됩니다.
                  일정이 맞지 않는 경우 ON-LI에서 조건에 맞는 다른 통역사를 안내해드립니다.
                </p>
              )}
              <span className="request-security-note">
                입력하신 정보는 안전하게 보호되며, 통역 매칭 용도로만 사용됩니다.
              </span>
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="request-submit-button"
            >
              {isSubmitting ? "접수 중..." : "통역 의뢰하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column|schema cache/i.test(error?.message || "")
  );
}
function isSupabasePermissionError(error) {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "42501" ||
    error.status === 403 ||
    /permission|policy|access denied|not authorized|forbidden|rls|row level security/.test(
      message
    )
  );
}
function isAgreementColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|column|schema cache/i.test(error?.message || "")
  );
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} ~ ${endTime}`;
  if (startTime) return `${startTime} 시작`;
  if (endTime) return `${endTime} 종료`;
  return "미정";
}

function getReferenceFileValidationMessage(file) {
  if (!file) return "";

  const extension = getFileExtension(file.name);
  if (!allowedReferenceFileExtensions.has(extension)) {
    return "참고 자료는 PDF, JPG, JPEG, PNG 파일만 업로드할 수 있습니다.";
  }

  const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
  if (file.type && !allowedMimeTypes.has(file.type)) {
    return "참고 자료는 PDF, JPG, JPEG, PNG 파일만 업로드할 수 있습니다.";
  }

  if (file.size > referenceFileMaxSize) {
    return "참고 자료 파일은 최대 10MB까지 업로드할 수 있습니다.";
  }

  return "";
}

function getReferenceStoragePath(file) {
  const extension = getFileExtension(file.name) || "bin";
  const timestamp = getStorageTimestamp();
  const storageId = getStorageId().replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);

  return `requests/reference_files/request_${timestamp}_${storageId}.${extension}`;
}

function getFileExtension(fileName) {
  const extension = String(fileName || "").split(".").pop();
  return String(extension || "").trim().toLowerCase();
}

function getStorageTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function getStorageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2, 12);
}

function Field({ label, className, ...inputProps }) {
  return (
    <label className={`request-field${className ? ` ${className}` : ""}`}>
      <span className="request-field-label">{label}</span>
      <input className="request-input" {...inputProps} />
    </label>
  );
}

function TabField({ label, options, value, onChange, helpText, className }) {
  return (
    <div className={`request-field${className ? ` ${className}` : ""}`}>
      <span className="request-field-label">{label}</span>
      <div className="request-pill-group">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`request-pill${value === option ? " is-active" : ""}`}
          >
            {option}
          </button>
        ))}
      </div>
      {helpText && <span className="request-help-text">{helpText}</span>}
    </div>
  );
}

function CheckboxGroup({ label, options, values, onChange, className }) {
  return (
    <fieldset className={`request-field request-checkbox-field${className ? ` ${className}` : ""}`}>
      <legend className="request-field-label">{label}</legend>
      <div className="request-checkbox-grid">
        {options.map((option) => (
          <label key={option} className="request-checkbox-option">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SectionBlock({ meta, children, className }) {
  return (
    <section className={`request-section-card${className ? ` ${className}` : ""}`}>
      <div className="request-section-copy">
        <span className="request-section-icon">{meta.icon}</span>
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
      </div>
      <div className="request-section-fields">{children}</div>
    </section>
  );
}

export default RequestForm;
