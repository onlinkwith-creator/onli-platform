import { useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import "./RegisterInterpreter.css";

const specialtyOptions = [
  "뷰티",
  "전시회",
  "스타트업",
  "게임/콘텐츠",
  "의료",
  "F&B",
  "패션",
  "관광",
  "일반 비즈니스",
];

const regionOptions = [
  "도쿄",
  "가나가와",
  "치바",
  "사이타마",
  "오사카",
  "교토",
  "효고",
  "나고야",
  "후쿠오카",
  "기타",
];

const levelSystemCards = [
  {
    level: "LV1",
    text: "일반 행사 및 운영 통역 대응",
    tone: "gray",
  },
  {
    level: "LV2",
    text: "비즈니스 상담 및 현장 대응 가능",
    tone: "green",
  },
  {
    level: "LV3",
    text: "전문 분야 통역 및 기업 미팅 대응",
    tone: "blue",
  },
  {
    level: "LV4",
    text: "고난도 비즈니스 및 VIP 대응",
    tone: "purple",
  },
];

function RegisterInterpreter({ onBackClick, onSubmitSuccess }) {
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [form, setForm] = useState({
    name: "",
    gender: "",
    age: "",
    region: "",
    email: "",
    phone: "",
    school: "",
    kakaoOrLine: "",
    jlpt: "N1 보유",
    stayPeriod: "",
    has_experience: false,
    specialties: [],
    availableRegions: [],
    availableTasks: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "has_experience" ? value === "true" : value,
    }));
  };

  const toggleArrayValue = (field, value) => {
    setForm((current) => {
      const values = current[field];
      const hasValue = values.includes(value);
      return {
        ...current,
        [field]: hasValue
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!areTermsAgreed(agreements)) {
      const message = "약관 동의 후 제출 가능합니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (!form.gender) {
      setErrorMessage("성별을 선택해주세요.");
      return;
    }

    if (form.availableRegions.length === 0) {
      setErrorMessage("활동 가능 지역을 선택해주세요.");
      return;
    }

    if (form.specialties.length === 0) {
      setErrorMessage("전문 분야를 1개 이상 선택해주세요.");
      return;
    }

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    const { error } = await supabase.from("interpreters").insert([
      {
        name: form.name,
        gender: form.gender,
        age: form.age,
        region: form.region,
        email: form.email,
        phone: form.phone,
        school: form.school,
        kakao_or_line: form.kakaoOrLine,
        jlpt: form.jlpt,
        stay_period: form.stayPeriod,
        has_experience: form.has_experience,
        specialties: form.specialties,
        available_regions: form.availableRegions,
        available_tasks: form.availableTasks,
        approved: false,
        status: "pending",
        agreed_terms: true,
        agreed_policy: true,
        agreed_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      if (isAgreementColumnError(error)) {
        console.error("약관 동의 저장 실패:", error);
      }
      console.error("등록 실패 원인:", error.message);
      alert("제출에 실패했습니다.");
      return;
    }

    setAgreements(initialTermsAgreement);
    setSuccessMessage("등록이 완료되었습니다. 메인 페이지로 이동합니다.");
    setTimeout(() => {
      onSubmitSuccess?.();
      if (!onSubmitSuccess) onBackClick?.();
    }, 700);
  };

  return (
    <div className="register-page">
      <div className="register-shell">
        <section className="register-hero">
          <div className="register-hero-copy">
            <p className="register-kicker">ON-LI INTERPRETER</p>
            <h1>한일 비즈니스 현장에서 활동할 통역사를 모집합니다</h1>
            <p>
              전시회·상담회·비즈니스 미팅 중심의 통역 매칭 플랫폼에서
              전문성을 가진 통역사와 기업을 연결합니다.
            </p>
          </div>

          <div className="register-hero-panel" aria-label="레벨 기반 성장 시스템">
            <div className="register-level-head">
              <span>LEVEL SYSTEM</span>
              <strong>레벨 기반 성장 시스템</strong>
              <p>실력과 경험에 따라 더 높은 프로젝트와 활동 기회를 제공합니다.</p>
            </div>
            <div className="register-level-flow" aria-label="LV1부터 LV4까지 성장 단계">
              {levelSystemCards.map((item) => (
                <article key={item.level} className={`register-level-card is-${item.tone}`}>
                  <strong>{item.level}</strong>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
            <p className="register-level-note">
              실력과 경험이 쌓일수록 더 높은 수준의 프로젝트에 참여할 수 있습니다.
            </p>
            <div className="register-trust-grid">
              <TrustMetric value="120+" label="활동 통역사" />
              <TrustMetric value="300+" label="누적 매칭" />
              <TrustMetric value="24h" label="평균 응답" />
            </div>
          </div>
        </section>

        <section className="register-trust">
          <TrustCard title="한일 비즈니스 특화" text="일본 현장 커뮤니케이션에 맞춘 의뢰를 중심으로 운영합니다." />
          <TrustCard title="운영팀 검토" text="등록 후 프로필과 활동 정보를 확인한 뒤 매칭에 반영합니다." />
          <TrustCard title="현장 중심 매칭" text="전시회, 상담회, 미팅 목적에 맞춰 통역사를 연결합니다." />
        </section>

        <StepIndicator />

        <form onSubmit={handleSubmit} className="register-form">
          <FormSectionCard eyebrow="SECTION 1" title="기본 정보">
            <Field label="이름" name="name" value={form.name} onChange={handleChange} required />
            <Field label="나이" name="age" value={form.age} onChange={handleChange} required />
            <Field label="성별">
              <select name="gender" value={form.gender} onChange={handleChange} required>
                <option value="">성별 선택</option>
                <option value="남자">남자</option>
                <option value="여자">여자</option>
              </select>
            </Field>
            <Field label="거주 지역" name="region" value={form.region} onChange={handleChange} required />
            <Field label="연락처" name="phone" value={form.phone} onChange={handleChange} required />
            <Field label="이메일" name="email" type="email" value={form.email} onChange={handleChange} required />
          </FormSectionCard>

          <FormSectionCard eyebrow="SECTION 2" title="활동 정보">
            <Field label="학교 및 전공" name="school" value={form.school} onChange={handleChange} />
            <Field label="JLPT">
              <select name="jlpt" value={form.jlpt} onChange={handleChange} required>
                <option value="N1 보유">N1 보유</option>
                <option value="N1 미보유">N1 미보유</option>
              </select>
            </Field>
            <Field label="일본 거주 기간" name="stayPeriod" value={form.stayPeriod} onChange={handleChange} required />
            <Field label="통역 경험 여부">
              <select
                name="has_experience"
                value={String(form.has_experience)}
                onChange={handleChange}
                required
              >
                <option value="true">통역 경험 있음</option>
                <option value="false">통역 경험 없음</option>
              </select>
            </Field>
            <Field label="카카오/라인 ID" name="kakaoOrLine" value={form.kakaoOrLine} onChange={handleChange} />
            <Field label="통역 가능 업무" className="register-field-wide">
              <input
                name="availableTasks"
                placeholder="상담 통역, 부스 응대, 바이어 미팅, 제품 설명 등"
                value={form.availableTasks}
                onChange={handleChange}
              />
            </Field>

            <ChipGroup
              title="활동 가능 지역"
              description="활동 가능한 지역을 모두 선택해주세요."
              options={regionOptions}
              values={form.availableRegions}
              onToggle={(value) => toggleArrayValue("availableRegions", value)}
            />
          </FormSectionCard>

          <FormSectionCard eyebrow="SECTION 3" title="전문 분야">
            <ChipGroup
              title="전문 분야 선택"
              description="강점이 있는 분야를 1개 이상 선택해주세요."
              options={specialtyOptions}
              values={form.specialties}
              onToggle={(value) => toggleArrayValue("specialties", value)}
            />
          </FormSectionCard>

          <section className="register-submit-card">
            {errorMessage && <p className="register-message is-error">{errorMessage}</p>}
            {successMessage && <p className="register-message is-success">{successMessage}</p>}
            <TermsAgreement
              agreements={agreements}
              onChange={handleAgreementChange}
              role="interpreter"
            />
            <button
              type="submit"
              className="register-submit-button"
              disabled={!areTermsAgreed(agreements)}
            >
              통역사 등록 신청하기
            </button>
            <p>등록 후 운영팀 검토가 진행됩니다.</p>
            <button type="button" onClick={onBackClick} className="register-back-button">
              메인으로 돌아가기
            </button>
          </section>
        </form>
      </div>
    </div>
  );
}

function isAgreementColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|column|schema cache/i.test(error?.message || "")
  );
}

function FormSectionCard({ eyebrow, title, children }) {
  return (
    <section className="register-section-card">
      <div className="register-section-head">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="register-section-grid">{children}</div>
    </section>
  );
}

function Field({ label, children, className = "", ...inputProps }) {
  return (
    <label className={`register-field ${className}`.trim()}>
      <span>{label}</span>
      {children || <input {...inputProps} />}
    </label>
  );
}

function ChipGroup({ title, description, options, values, onToggle }) {
  return (
    <div className="register-chip-group">
      <div className="register-chip-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <SelectedSummary values={values} />
      </div>
      <div className="register-chip-list">
        {options.map((option) => (
          <SelectChip
            key={option}
            label={option}
            selected={values.includes(option)}
            onClick={() => onToggle(option)}
          />
        ))}
      </div>
    </div>
  );
}

function SelectChip({ label, selected, onClick }) {
  return (
    <button
      type="button"
      className={`register-chip${selected ? " is-selected" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SelectedSummary({ values }) {
  return (
    <p className="register-selected-summary">
      {values.length > 0 ? values.join(" · ") : "아직 선택 전"}
    </p>
  );
}

function StepIndicator() {
  const steps = ["기본 정보", "활동 정보", "전문 분야", "등록 완료"];
  return (
    <nav className="register-steps" aria-label="등록 단계">
      {steps.map((step, index) => (
        <div key={step} className="register-step">
          <span>{index + 1}</span>
          <strong>{step}</strong>
        </div>
      ))}
    </nav>
  );
}

function TrustMetric({ value, label }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TrustCard({ title, text }) {
  return (
    <div className="register-trust-card">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

export default RegisterInterpreter;
