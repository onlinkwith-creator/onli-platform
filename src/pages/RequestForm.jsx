import { useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import { getEmailRecipient, sendAdminAutoEmail, sendAutoEmail } from "../lib/email";
import {
  calculateEstimatedPrice,
  calculateInterpreterPay,
  getUrgency,
} from "../utils/pricing";

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

function RequestForm({ interpreter, onBackClick, onSubmitSuccess }) {
  const isGeneralRequest = !interpreter;
  const [form, setForm] = useState(initialForm);
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

    setErrorMessage("");

    if (!areTermsAgreed(agreements)) {
      const message = "약관 동의 후 제출 가능합니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    setIsSubmitting(true);

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setIsSubmitting(false);
      return;
    }

    if (form.endDate < form.startDate) {
      const message = "종료일은 시작일보다 빠를 수 없습니다.";
      setErrorMessage(message);
      alert(message);
      setIsSubmitting(false);
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
      requested_level: form.requestedLevel,
      requested_people_count: Number(form.requestedPeopleCount || 1),
      preferred_gender: form.preferredGender,
      interpretation_field: form.interpretationField,
      urgency,
      estimated_price: estimatedPrice,
      interpreter_pay: interpreterPay,
      request_details: requestDetails,
      request_detail: requestDetails,
      status: "pending",
      is_public: false,
      job_description: requestDetails,
      job_field: form.interpretationField,
      required_level:
        form.requestedLevel === "운영팀 추천받기" ? null : form.requestedLevel,
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

    let { error } = await supabase.from("requests").insert([designatedPayload]);

    if (error && isMissingColumnError(error)) {
      const fallbackResult = await supabase.from("requests").insert([requestPayload]);
      error = fallbackResult.error;
    }

    setIsSubmitting(false);

    if (error) {
      if (isAgreementColumnError(error)) {
        console.error("약관 동의 저장 실패:", error);
      }
      console.error("request insert error:", error);
      const message =
        error.code === "42501"
          ? "의뢰 저장 권한 설정이 필요합니다. Supabase requests 테이블의 insert 정책을 확인해주세요."
          : `의뢰저장 실패: ${error.message || "입력값을 확인한 뒤 다시 시도해주세요."}`;
      setErrorMessage(message);
      alert("제출에 실패했습니다.");
      return;
    }

    const companyEmail = getEmailRecipient(
      requestPayload.email,
      requestPayload.contact_email_or_phone
    );
    const emailPayload = {
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

    void (async () => {
      console.log("COMPANY EMAIL TARGET", companyEmail);

      try {
        if (companyEmail) {
          const result = await sendAutoEmail(
            "company_request_received_user",
            companyEmail,
            emailPayload
          );
          if (!result.ok) console.error("Company email failed", result.error || result);
        } else {
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
        console.error("Company email failed", error);
      }

      try {
        const result = await sendAdminAutoEmail(
          "company_request_received_admin",
          emailPayload
        );
        if (!result.ok) console.error("Company admin email failed", result.error || result);
      } catch (error) {
        console.error("Company admin email failed", error);
      }
    })();

    alert("의뢰 문의가 접수되었습니다.");
    setForm(initialForm);
    setAgreements(initialTermsAgreement);
    onSubmitSuccess();
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button
          type="button"
          onClick={onBackClick}
          className={isGeneralRequest ? "main-return-button" : undefined}
          style={styles.backButton}
        >
          {isGeneralRequest ? "메인으로 돌아가기" : "← 상세 페이지로"}
        </button>

        <div style={styles.card}>
          <div style={styles.header}>
            <p style={styles.label}>ON-LI REQUEST</p>
            <h1 style={styles.title}>통역 의뢰하기</h1>
            <p style={styles.description}>
              {isGeneralRequest
                ? "전시회·상담회·비즈니스 미팅 등 통역이 필요한 일정 정보를 입력해주세요."
                : `${interpreter?.name || "선택한 통역사"}님과의 매칭 검토에 필요한 행사 정보를 입력해주세요.`}
              <br />
              접수 후 ON-LI 운영팀이 내용을 검토하여 적합한 통역사를 매칭합니다.
            </p>
            <div style={styles.process}>
              {["의뢰 접수", "운영팀 검토", "공고 등록", "매칭 진행", "배정 완료"].map(
                (step, index, steps) => (
                  <span key={step} style={styles.processItem}>
                    {step}
                    {index < steps.length - 1 && <b style={styles.processArrow}>→</b>}
                  </span>
                )
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <SectionTitle title="기본 정보" />
            <Field label="회사명" name="companyName" value={form.companyName} onChange={handleChange} required />
            <Field label="담당자명" name="contactName" value={form.contactName} onChange={handleChange} required />
            <Field label="연락처 또는 이메일" name="contactEmailOrPhone" value={form.contactEmailOrPhone} onChange={handleChange} required />

            <SectionTitle title="행사 정보" />
            <Field label="행사명" name="eventName" value={form.eventName} onChange={handleChange} required />
            <Field label="시작일" name="startDate" type="date" value={form.startDate} onChange={handleChange} required />
            <Field label="종료일" name="endDate" type="date" value={form.endDate} onChange={handleChange} required />
            <Field label="행사 장소" name="eventLocation" value={form.eventLocation} onChange={handleChange} required />

            <SectionTitle title="통역 요청 정보" />
            <Field label="필요 인원 수" name="requestedPeopleCount" type="number" min="1" placeholder="예: 3" value={form.requestedPeopleCount} onChange={handleChange} required />
            <TabField
              label="희망 통역 레벨"
              value={form.requestedLevel}
              onChange={(value) => updateFormValue("requestedLevel", value)}
              options={levelOptions}
              helpText="행사 성격에 맞는 통역 수준을 선택해주세요."
            />
            <TabField
              label="희망 성별"
              value={form.preferredGender}
              onChange={(value) => updateFormValue("preferredGender", value)}
              options={["성별 무관", "여성 희망", "남성 희망"]}
            />
            <TabField
              label="통역 분야"
              value={form.interpretationField}
              onChange={(value) => updateFormValue("interpretationField", value)}
              options={fieldOptions}
            />

            <label style={{ ...styles.field, ...styles.fullWidth }}>
              <span style={styles.fieldLabel}>요청 내용</span>
              <textarea
                name="requestDetails"
                value={form.requestDetails}
                onChange={handleChange}
                required
                rows={4}
                style={{ ...styles.input, ...styles.textarea }}
                placeholder="행사 목적, 통역 상황, 요청사항을 간단히 적어주세요."
              />
            </label>

            {errorMessage && <p style={styles.error}>{errorMessage}</p>}

            <TermsAgreement
              agreements={agreements}
              className="request-terms-agreement"
              onChange={handleAgreementChange}
              role="client"
            />

            <button
              type="submit"
              disabled={isSubmitting || !areTermsAgreed(agreements)}
              style={{
                ...styles.submitButton,
                opacity: isSubmitting || !areTermsAgreed(agreements) ? 0.65 : 1,
                cursor:
                  isSubmitting || !areTermsAgreed(agreements)
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {isSubmitting ? "접수 중..." : "의뢰 문의 제출하기"}
            </button>
          </form>
        </div>
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

function isAgreementColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|column|schema cache/i.test(error?.message || "")
  );
}

function Field({ label, ...inputProps }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input style={styles.input} {...inputProps} />
    </label>
  );
}

function TabField({ label, options, value, onChange, helpText }) {
  return (
    <div style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <div style={styles.tabGroup}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            style={{
              ...styles.tabButton,
              ...(value === option ? styles.tabButtonActive : {}),
            }}
          >
            {option}
          </button>
        ))}
      </div>
      {helpText && <span style={styles.helpText}>{helpText}</span>}
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <div style={styles.sectionTitle}>
      <span>{title}</span>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    padding: "48px 20px",
    boxSizing: "border-box",
    color: "#111827",
  },
  requestTermsAgreement: {
    gridColumn: "1 / -1",
  },
  container: {
    maxWidth: "860px",
    margin: "0 auto",
  },
  backButton: {
    marginBottom: "22px",
    padding: "12px 18px",
    borderRadius: "12px",
    border: "1px solid #395597",
    backgroundColor: "#395597",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "700",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "28px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    border: "1px solid #e5e7eb",
  },
  header: {
    marginBottom: "24px",
    textAlign: "left",
  },
  label: {
    fontSize: "12px",
    letterSpacing: "4px",
    color: "#395597",
    fontWeight: "800",
    margin: "0 0 8px",
  },
  title: {
    margin: 0,
    fontSize: "34px",
    fontWeight: "900",
    color: "#111827",
  },
  description: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "15px",
    lineHeight: 1.65,
  },
  process: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 10px",
    marginTop: "18px",
    paddingTop: "16px",
    borderTop: "1px solid #eef2f7",
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: "800",
  },
  processItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
  },
  processArrow: {
    color: "#cbd5e1",
    fontWeight: "900",
  },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  sectionTitle: {
    gridColumn: "1 / -1",
    marginTop: "8px",
    paddingTop: "12px",
    borderTop: "1px solid #f1f5f9",
    color: "#395597",
    fontSize: "14px",
    fontWeight: "900",
    textAlign: "left",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    textAlign: "left",
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  fieldLabel: {
    color: "#374151",
    fontSize: "13px",
    fontWeight: "800",
  },
  input: {
    width: "100%",
    minHeight: "46px",
    padding: "0 13px",
    borderRadius: "11px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  tabGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  tabButton: {
    minHeight: "42px",
    padding: "0 13px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#374151",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "800",
    fontFamily: "inherit",
  },
  tabButtonActive: {
    border: "1px solid #395597",
    background: "#395597",
    color: "#ffffff",
  },
  textarea: {
    minHeight: "112px",
    padding: "13px",
    lineHeight: 1.55,
    resize: "vertical",
  },
  helpText: {
    color: "#6b7280",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  error: {
    gridColumn: "1 / -1",
    margin: 0,
    color: "#dc2626",
    fontSize: "14px",
    fontWeight: "700",
  },
  submitButton: {
    gridColumn: "1 / -1",
    marginTop: "4px",
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "#395597",
    color: "white",
    fontWeight: "900",
    fontSize: "15px",
  },
};

export default RequestForm;
