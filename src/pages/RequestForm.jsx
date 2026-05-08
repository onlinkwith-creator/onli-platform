import { useState } from "react";
import { supabase } from "../supabase";
import {
  calculateEstimatedPrice,
  calculateInterpreterPay,
  getUrgency,
} from "../utils/pricing";

const initialForm = {
  companyName: "",
  managerName: "",
  email: "",
  phone: "",
  eventName: "",
  eventDate: "",
  eventLocation: "",
  workHours: "",
  requestDetail: "",
};

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
      workHours: form.workHours,
    });
    const interpreterPay = calculateInterpreterPay(estimatedPrice);

    const { error } = await supabase.from("requests").insert([
      {
        interpreter_id: interpreter?.id || null,
        interpreter_name: interpreter?.name || "",
        company_name: form.companyName,
        manager_name: form.managerName,
        email: form.email,
        phone: form.phone,
        event_name: form.eventName,
        event_date: form.eventDate,
        event_location: form.eventLocation,
        work_hours: Number(form.workHours || 0),
        urgency,
        estimated_price: estimatedPrice,
        interpreter_pay: interpreterPay,
        request_detail: form.requestDetail,
        status: "pending",
        is_public: false,
        job_description: form.requestDetail,
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
        <button type="button" onClick={onBackClick} style={styles.backButton}>
          {isGeneralRequest ? "← 메인으로" : "← 상세 페이지로"}
        </button>

        <div style={styles.card}>
          <div style={styles.header}>
            <p style={styles.label}>ON-LI REQUEST</p>
            <h1 style={styles.title}>통역 의뢰 문의</h1>
            <p style={styles.description}>
              {isGeneralRequest
                ? "전시회·상담회·비즈니스 미팅 통역 공고를 등록해보세요."
                : `${interpreter?.name || "선택한 통역사"}님에게 전달할 행사 정보를 입력해주세요.`}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <Field label="기업명" name="companyName" value={form.companyName} onChange={handleChange} required />
            <Field label="담당자명" name="managerName" value={form.managerName} onChange={handleChange} required />
            <Field label="이메일" name="email" type="email" value={form.email} onChange={handleChange} required />
            <Field label="연락처" name="phone" value={form.phone} onChange={handleChange} required />
            <Field label="행사명" name="eventName" value={form.eventName} onChange={handleChange} required />
            <Field label="날짜" name="eventDate" type="date" value={form.eventDate} onChange={handleChange} required />
            <Field label="장소" name="eventLocation" value={form.eventLocation} onChange={handleChange} required />
            <Field label="근무시간" name="workHours" type="number" min="1" value={form.workHours} onChange={handleChange} required />

            <label style={{ ...styles.field, ...styles.fullWidth }}>
              <span style={styles.fieldLabel}>요청내용</span>
              <textarea
                name="requestDetail"
                value={form.requestDetail}
                onChange={handleChange}
                required
                rows={6}
                style={{ ...styles.input, resize: "vertical" }}
                placeholder="행사 목적, 통역 유형, 참석자 정보 등"
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
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontWeight: "600",
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
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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
