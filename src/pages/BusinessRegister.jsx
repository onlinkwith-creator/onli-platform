import { useState } from "react";
import { supabase } from "../supabase";
import "./BusinessRegister.css";

const PRIMARY_FIELDS_OPTIONS = [
  "뷰티",
  "패션",
  "식품",
  "의료",
  "IT",
  "관광",
  "제조",
  "비즈니스",
  "기타",
];

const COUNTRY_OPTIONS = [
  { value: "한국", label: "한국" },
  { value: "일본", label: "일본" },
  { value: "기타", label: "기타 (미국, 중국 등)" },
];

function BusinessRegister({ user, onRegisterSuccess, onBackClick }) {
  const [form, setForm] = useState({
    companyName: "",
    businessNumber: "",
    contactName: "",
    contactPhone: "",
    country: "한국",
    primaryFields: [],
    taxInvoiceRequired: false,
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleFieldToggle = (field) => {
    setForm((current) => {
      const exists = current.primaryFields.includes(field);
      const nextFields = exists
        ? current.primaryFields.filter((f) => f !== field)
        : [...current.primaryFields, field];
      return { ...current, primaryFields: nextFields };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setErrorMessage("로그인이 필요한 서비스입니다.");
      return;
    }

    if (!form.companyName.trim()) {
      setErrorMessage("회사명을 입력해주세요.");
      return;
    }
    if (!form.businessNumber.trim()) {
      setErrorMessage("사업자등록번호를 입력해주세요.");
      return;
    }
    if (!form.contactName.trim()) {
      setErrorMessage("담당자명을 입력해주세요.");
      return;
    }
    if (!form.contactPhone.trim()) {
      setErrorMessage("담당자 연락처를 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const { error } = await supabase.from("businesses").insert({
        auth_user_id: user.id,
        company_name: form.companyName.trim(),
        business_number: form.businessNumber.trim(),
        contact_name: form.contactName.trim(),
        contact_email: user.email,
        contact_phone: form.contactPhone.trim(),
        country: form.country,
        primary_fields: form.primaryFields,
        tax_invoice_required: form.taxInvoiceRequired,
        notes: form.notes.trim(),
        status: "검토중",
      });

      if (error) {
        console.error("Error registering business:", error);
        if (error.code === "23505") {
          setErrorMessage("이미 등록된 기업 계정입니다.");
        } else {
          setErrorMessage(`등록 오류: ${error.message || "다시 시도해주세요."}`);
        }
        return;
      }

      onRegisterSuccess?.();
    } catch (err) {
      console.error("Unexpected error during business registration:", err);
      setErrorMessage("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="business-register-page">
      <div className="register-bg-glow" />
      <section className="business-register-card">
        <button type="button" onClick={onBackClick} className="register-back-btn">
          ← 이전으로
        </button>
        <p className="business-register-kicker">ON-LI CLIENT</p>
        <h1>기업 회원 등록</h1>
        <p className="business-register-desc">
          비즈니스 통역 의뢰 및 매칭 관리를 위해 기업 정보를 등록해 주세요.
        </p>

        <form className="business-register-form" onSubmit={handleSubmit}>
          <div className="form-group-row">
            <label className="business-register-field">
              <span>회사명 <span className="required-star">*</span></span>
              <input
                name="companyName"
                type="text"
                value={form.companyName}
                onChange={handleChange}
                placeholder="예: 주식회사 온리"
                required
              />
            </label>

            <label className="business-register-field">
              <span>사업자등록번호 <span className="required-star">*</span></span>
              <input
                name="businessNumber"
                type="text"
                value={form.businessNumber}
                onChange={handleChange}
                placeholder="000-00-00000"
                required
              />
            </label>
          </div>

          <div className="form-group-row">
            <label className="business-register-field">
              <span>담당자명 <span className="required-star">*</span></span>
              <input
                name="contactName"
                type="text"
                value={form.contactName}
                onChange={handleChange}
                placeholder="담당자 이름"
                required
              />
            </label>

            <label className="business-register-field">
              <span>담당자 이메일</span>
              <input
                name="contactEmail"
                type="email"
                value={user?.email || ""}
                disabled
                className="disabled-input"
              />
            </label>
          </div>

          <div className="form-group-row">
            <label className="business-register-field">
              <span>담당자 연락처 <span className="required-star">*</span></span>
              <input
                name="contactPhone"
                type="text"
                value={form.contactPhone}
                onChange={handleChange}
                placeholder="010-0000-0000"
                required
              />
            </label>

            <label className="business-register-field">
              <span>국가 <span className="required-star">*</span></span>
              <select
                name="country"
                value={form.country}
                onChange={handleChange}
                className="register-select"
                required
              >
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="business-register-field field-full-width">
            <span>주요 의뢰 분야 (중복 선택 가능)</span>
            <div className="field-chips-grid">
              {PRIMARY_FIELDS_OPTIONS.map((field) => {
                const selected = form.primaryFields.includes(field);
                return (
                  <button
                    key={field}
                    type="button"
                    className={`field-chip-btn ${selected ? "active" : ""}`}
                    onClick={() => handleFieldToggle(field)}
                  >
                    {field}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="business-register-field field-full-width">
            <span>세금계산서 필요 여부</span>
            <div className="radio-toggle-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="taxInvoiceRequired"
                  value="false"
                  checked={form.taxInvoiceRequired === false}
                  onChange={() => setForm((c) => ({ ...c, taxInvoiceRequired: false }))}
                />
                <span>발행 불필요</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="taxInvoiceRequired"
                  value="true"
                  checked={form.taxInvoiceRequired === true}
                  onChange={() => setForm((c) => ({ ...c, taxInvoiceRequired: true }))}
                />
                <span>발행 필요 (세금계산서/영수증)</span>
              </label>
            </div>
          </div>

          <label className="business-register-field field-full-width">
            <span>기타 요청사항</span>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="추가적인 요구사항이나 문의 사항을 입력해 주세요."
              rows={3}
            />
          </label>

          {errorMessage && (
            <div className="business-register-error">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            className="business-register-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "기업 등록 중..." : "등록 완료"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default BusinessRegister;
