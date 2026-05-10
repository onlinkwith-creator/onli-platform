import { useState } from "react";
import { supabase } from "../supabase";
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
  eventDate: "",
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setIsSubmitting(true);
    setErrorMessage("");

    const urgency = getUrgency(form.eventDate);
    const estimatedPrice = calculateEstimatedPrice({
      level: interpreter?.level,
      experienceCount: interpreter?.experience_count,
      urgency,
      workHours: 0,
    });
    const interpreterPay = calculateInterpreterPay(estimatedPrice);
    const requestDetails = form.requestDetails;
    const contact = form.contactEmailOrPhone;

    const { error } = await supabase.from("requests").insert([
      {
        interpreter_id: interpreter?.id || null,
        interpreter_name: interpreter?.name || "",
        company_name: form.companyName,
        contact_name: form.contactName,
        contact_email_or_phone: contact,
        manager_name: form.contactName,
        email: contact,
        phone: contact,
        event_name: form.eventName,
        event_date: form.eventDate,
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
      },
    ]);

    setIsSubmitting(false);

    if (error) {
      console.error("의뢰 저장 실패:", error);
      setErrorMessage(
        error.code === "42501"
          ? "의뢰 저장 권한 설정이 필요합니다. Supabase requests 테이블의 insert 정책을 확인해주세요."
          : "의뢰 저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도해주세요."
      );
      return;
    }

    alert("의뢰 문의가 접수되었습니다.");
    setForm(initialForm);
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
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <Field label="회사명" name="companyName" value={form.companyName} onChange={handleChange} required />
            <Field label="담당자명" name="contactName" value={form.contactName} onChange={handleChange} required />
            <Field label="연락처 또는 이메일" name="contactEmailOrPhone" value={form.contactEmailOrPhone} onChange={handleChange} required />
            <Field label="행사명" name="eventName" value={form.eventName} onChange={handleChange} required />
            <Field label="행사 날짜" name="eventDate" type="date" value={form.eventDate} onChange={handleChange} required />
            <Field label="행사 장소" name="eventLocation" value={form.eventLocation} onChange={handleChange} required />

            <Field
              label="필요 인원 수"
              name="requestedPeopleCount"
              type="number"
              min="1"
              placeholder="예: 3"
              value={form.requestedPeopleCount}
              onChange={handleChange}
              required
            />

            <label style={styles.field}>
              <span style={styles.fieldLabel}>희망 통역 레벨</span>
              <select
                name="requestedLevel"
                value={form.requestedLevel}
                onChange={handleChange}
                style={styles.input}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>희망 성별</span>
              <select
                name="preferredGender"
                value={form.preferredGender}
                onChange={handleChange}
                style={styles.input}
              >
                <option value="성별 무관">성별 무관</option>
                <option value="여성 희망">여성 희망</option>
                <option value="남성 희망">남성 희망</option>
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>통역 분야</span>
              <select
                name="interpretationField"
                value={form.interpretationField}
                onChange={handleChange}
                style={styles.input}
              >
                {fieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...styles.field, ...styles.fullWidth }}>
              <span style={styles.fieldLabel}>요청 내용</span>
              <textarea
                name="requestDetails"
                value={form.requestDetails}
                onChange={handleChange}
                required
                rows={5}
                style={{ ...styles.input, resize: "vertical" }}
                placeholder="행사 목적, 통역 상황, 요청사항을 간단히 적어주세요."
              />
            </label>

            {errorMessage && <p style={styles.error}>{errorMessage}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...styles.submitButton,
                opacity: isSubmitting ? 0.65 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
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

function Field({ label, ...inputProps }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      <input style={styles.input} {...inputProps} />
    </label>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    padding: "60px 24px",
    boxSizing: "border-box",
    color: "#111827",
  },
  container: {
    maxWidth: "900px",
    margin: "0 auto",
  },
  backButton: {
    marginBottom: "30px",
    padding: "12px 18px",
    borderRadius: "12px",
    border: "1px solid #395597",
    backgroundColor: "#395597",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "700",
  },
  card: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: "28px",
    padding: "36px",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(255,255,255,0.8)",
  },
  header: {
    marginBottom: "30px",
  },
  label: {
    fontSize: "12px",
    letterSpacing: "4px",
    color: "#4f46e5",
    fontWeight: "800",
    marginBottom: "10px",
  },
  title: {
    margin: 0,
    fontSize: "38px",
    fontWeight: "900",
    color: "#111827",
  },
  description: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "15px",
  },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "18px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    textAlign: "left",
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  fieldLabel: {
    color: "#374151",
    fontSize: "14px",
    fontWeight: "800",
  },
  input: {
    width: "100%",
    padding: "15px 16px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
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
    marginTop: "8px",
    padding: "16px",
    borderRadius: "16px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "900",
    fontSize: "15px",
  },
};

export default RequestForm;
