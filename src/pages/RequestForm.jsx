import { useRef, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import DateRangeInput from "../components/DateRangeInput";
import { supabase, supabaseConfigError } from "../supabase";
import { ADMIN_EMAILS, getEmailRecipient, sendAutoEmail } from "../lib/email";
import {
  calculateEstimatedPrice,
  calculateInterpreterPay,
  getUrgency,
} from "../utils/pricing";
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
import "./RequestForm.css";

const initialForm = {
  companyName: "",
  contactName: "",
  contactEmailOrPhone: "",
  eventName: "",
  startDate: "",
  endDate: "",
  eventLocation: "",
  requestedLevel: "운영팀 추천받기",
  requestedPeopleCount: "",
  preferredGender: "성별 무관",
  interpretationField: "일반 비즈니스",
  requestDetails: "",
};

const levelOptions = ["운영팀 추천받기", "LV1", "LV2", "LV3", "LV4"];
const companyDailyRates = {
  LV1: 220000,
  LV2: 245000,
  LV3: 280000,
  LV4: 300000,
};

const formatWon = (amount) => `₩${Number(amount).toLocaleString("ko-KR")}`;

const getInclusiveDateCount = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return null;
  }

  const diffTime = new Date(endDate) - new Date(startDate);
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return days > 0 ? days : null;
};

const fieldOptions = [
  "뷰티/코스메",
  "패션",
  "식품",
  "의료/헬스케어",
  "IT/스타트업",
  "관광/문화",
  "제조/기계",
  "일반 비즈니스",
  "기타",
];

const requestSteps = [
  "의뢰 접수",
  "운영팀 검토",
  "공고 등록",
  "매칭 진행",
  "배정 완료",
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
    description: "통역이 필요한 행사명을 알려주세요.",
  },
  period: {
    icon: "03",
    title: "행사 기간",
    description: "시작일과 종료일을 선택해주세요.",
  },
  location: {
    icon: "04",
    title: "행사 장소",
    description: "통역사가 방문할 장소를 입력해주세요.",
  },
  request: {
    icon: "05",
    title: "통역 요청 정보",
    description: "매칭에 필요한 조건을 선택해주세요.",
  },
  details: {
    icon: "06",
    title: "추가 요청사항",
    description: "행사 목적이나 현장 요청을 남겨주세요.",
  },
};

function RequestForm({ interpreter, onBackClick, onSubmitSuccess }) {
  const isGeneralRequest = !interpreter;
  const [form, setForm] = useState(initialForm);
  const requestedLevel = isGeneralRequest
    ? form.requestedLevel
    : interpreter?.level || null;
  const isRecommendedLevel = requestedLevel === "운영팀 추천받기";
  const estimateLevel = isRecommendedLevel ? null : requestedLevel;
  const estimateDays = getInclusiveDateCount(form.startDate, form.endDate);
  const estimatePeopleCount = Number(form.requestedPeopleCount);
  const estimateDailyRate = companyDailyRates[estimateLevel];
  const canShowEstimate =
    Boolean(form.startDate) &&
    Boolean(form.endDate) &&
    Boolean(estimateLevel) &&
    Boolean(estimateDailyRate) &&
    Number.isFinite(estimatePeopleCount) &&
    estimatePeopleCount > 0 &&
    Boolean(estimateDays);
  const estimatedUsageAmount = canShowEstimate
    ? estimateDailyRate * estimateDays * estimatePeopleCount
    : null;
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");

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

    const urgency = getUrgency(form.startDate);
    const estimatedPrice = calculateEstimatedPrice({
      level: interpreter?.level,
      experienceCount: interpreter?.experience_count,
      urgency,
      workHours: 0,
    });
    const interpreterPay = calculateInterpreterPay(estimatedPrice);
    const requestDetails = form.requestDetails;
    const contact = form.contactEmailOrPhone;

    const requestPayload = {
      interpreter_id: interpreter?.id || null,
      interpreter_name: interpreter?.name || "",
      company_name: form.companyName,
      contact_name: form.contactName,
      contact_email_or_phone: contact,
      manager_name: form.contactName,
      email: contact,
      phone: contact,
      event_name: form.eventName,
      event_date: form.startDate,
      start_date: form.startDate,
      end_date: form.endDate,
      event_location: form.eventLocation,
      work_hours: 0,
      requested_level: requestedLevel,
      requested_people_count: Number(form.requestedPeopleCount || 1),
      preferred_gender: form.preferredGender,
      interpretation_field: form.interpretationField,
      urgency,
      estimated_price: estimatedPrice,
      interpreter_pay: interpreterPay,
      request_details: requestDetails,
      request_detail: requestDetails,
      status: MATCHING_STATUS.DRAFT,
      assignment_status: ASSIGNMENT_STATUS.WAITING,
      operation_status: OPERATION_STATUS.BEFORE_OPERATION,
      settlement_status: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED,
      is_public: false,
      job_description: requestDetails,
      job_field: form.interpretationField,
      required_level:
        requestedLevel === "운영팀 추천받기" ? null : requestedLevel,
      required_count: Number(form.requestedPeopleCount || 1),
      interpreter_fee: interpreterPay,
      agreed_terms: true,
      agreed_policy: true,
      agreed_at: new Date().toISOString(),
    };
    const designatedPayload = {
      ...requestPayload,
      request_type: interpreter ? "지정의뢰" : "일반의뢰",
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
      delete legacyRequestPayload.request_no;
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
      form.company_email,
      form.contact_email,
      form.email,
      form.manager_email,
      form.contactEmailOrPhone,
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
      interpretationField: requestPayload.interpretation_field,
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
        const { data: interpreterData, error: interpreterError } = await supabase
          .from("interpreters")
          .select("email")
          .eq("id", interpreter.id)
          .single();

        if (interpreterError) {
          console.error("Failed to query interpreter email:", interpreterError);
        } else if (interpreterData?.email) {
          const interpreterEmail = interpreterData.email;
          const result = await sendAutoEmail(
            "designated_request_received_interpreter",
            interpreterEmail,
            {
              ...emailPayload,
              interpreterName: interpreter.name || "",
            }
          );
          if (!result.ok) {
            console.error("Designated interpreter email failed", result.error || result);
          } else {
            console.log("Designated interpreter email sent successfully to:", interpreterEmail);
          }
        } else {
          console.warn("Designated interpreter email is empty for interpreter:", interpreter.id);
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

    alert("의뢰 문의가 접수되었습니다.");
    setForm(initialForm);
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
        <button
          type="button"
          onClick={onBackClick}
          className={`request-back-button${
            isGeneralRequest ? " main-return-button" : ""
          }`}
        >
          {isGeneralRequest ? "메인으로 돌아가기" : "상세 페이지로"}
        </button>

        <header className="request-hero">
          <div>
            <p className="request-eyebrow">ON-LI REQUEST</p>
            <h1>통역 의뢰하기</h1>
            <p className="request-description">
              {isGeneralRequest
                ? "전시회·상담회·비즈니스 미팅 등 통역이 필요한 일정 정보를 입력해주세요."
                : `${interpreter?.name || "선택한 통역사"}님과의 매칭 검토에 필요한 행사 정보를 입력해주세요.`}
              <br />
              접수 후 ON-LI 운영팀이 내용을 검토하여 적합한 통역사를 매칭합니다.
            </p>
          </div>
          <div className="request-hero-mark" aria-hidden="true">
            <span />
          </div>
        </header>

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
            <div className="request-grid request-grid-3">
              <Field label="회사명" name="companyName" value={form.companyName} onChange={handleChange} required />
              <Field label="담당자명" name="contactName" value={form.contactName} onChange={handleChange} required />
              <Field label="연락처 또는 이메일" name="contactEmailOrPhone" value={form.contactEmailOrPhone} onChange={handleChange} required />
            </div>
          </SectionBlock>

          <SectionBlock meta={sectionMeta.event}>
            <Field label="행사명" name="eventName" value={form.eventName} onChange={handleChange} required />
          </SectionBlock>

          <SectionBlock meta={sectionMeta.period}>
            <div className="request-full-width">
              <DateRangeInput
                required
                showQuickButtons
                label="행사 기간"
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
          </SectionBlock>

          <SectionBlock meta={sectionMeta.location}>
            <Field label="행사 장소" name="eventLocation" value={form.eventLocation} onChange={handleChange} required />
          </SectionBlock>

          <SectionBlock meta={sectionMeta.request} className="request-section-compact">
            <div
              className={`request-grid request-grid-2 request-grid-request${
                isGeneralRequest ? "" : " request-grid-request-designated"
              }`}
            >
              <div className="request-grid-area request-grid-area-left">
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
                  className="request-grid-area-field"
                  label="통역 분야"
                  value={form.interpretationField}
                  onChange={(value) => updateFormValue("interpretationField", value)}
                  options={fieldOptions}
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
              <EstimatedPriceCard
                amount={estimatedUsageAmount}
                isRecommendedLevel={isRecommendedLevel}
              />
            </div>
          </SectionBlock>

          <SectionBlock meta={sectionMeta.details}>
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

          {errorMessage && <p className="request-error">{errorMessage}</p>}

          <TermsAgreement
            agreements={agreements}
            className="request-terms-agreement"
            onChange={handleAgreementChange}
            role="client"
          />

          <div className="request-submit-card">
            <div>
              <strong>정확한 정보를 입력해주시면 더 빠르고 정확한 매칭이 가능합니다.</strong>
              <p>문의사항은 언제든지 연락주세요. 친절하게 안내해드리겠습니다.</p>
              <span className="request-security-note">
                입력하신 정보는 안전하게 보호되며, 통역 매칭 용도로만 사용됩니다.
              </span>
            </div>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="request-submit-button"
            >
              {isSubmitting ? "접수 중..." : "통역 의뢰 제출하기"}
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

function EstimatedPriceCard({
  amount,
  isRecommendedLevel,
}) {
  const hasAmount = amount !== null;
  const platformFee = hasAmount ? Math.round(amount * 0.03) : null;
  const totalAmount = hasAmount ? amount + platformFee : null;

  return (
    <aside className="request-estimate-card" aria-live="polite">
      <div>
        <span className="request-estimate-label">예상 이용 금액</span>
      </div>

      {hasAmount ? (
        <>
          <div className="request-estimate-total">
            <span>총 이용 예정 금액</span>
            <strong className="request-estimate-amount">{formatWon(totalAmount)}</strong>
          </div>
          <div className="request-estimate-divider" aria-hidden="true" />
          <span className="request-estimate-detail-label">상세 내역</span>
          <div className="request-estimate-breakdown">
            <div className="request-estimate-row">
              <span>통역 활동 비용</span>
              <strong>{formatWon(amount)}</strong>
            </div>
            <div className="request-estimate-row">
              <span>ON-LI 플랫폼 이용 수수료</span>
              <strong>{formatWon(platformFee)}</strong>
            </div>
          </div>
        </>
      ) : isRecommendedLevel ? (
        <p className="request-estimate-empty">
          ON-LI 운영팀이 행사 조건 확인 후
          <br />
          최적의 통역 인력을 추천하고 최종 금액을 안내드립니다.
        </p>
      ) : (
        <p className="request-estimate-empty">
          행사 날짜, 인원 수, 희망 레벨을 선택하면 예상 금액이 표시됩니다.
        </p>
      )}

      <p className="request-estimate-note">
        ※ 표시 금액은 ON-LI 플랫폼 이용 수수료가 포함된 최종 예상 금액입니다.
        <br />
        ※ 현금영수증 발행이 가능합니다.
        <br />
        ※ 최종 금액은 일정, 업무 범위, 매칭 조건에 따라 변경될 수 있습니다.
      </p>
    </aside>
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
