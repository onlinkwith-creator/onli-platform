import { useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import { ADMIN_EMAILS, sendAutoEmail } from "../lib/email";
import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "../utils/managementNumber";
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
    console.log("REGISTER SUBMIT START");
    console.log("REGISTER FORM DATA", form);

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

    console.log("BEFORE DB INSERT");

    const managementConfig = MANAGEMENT_NUMBER_CONFIG.interpreters;
    const basePayload = {
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
    };
    let payload = await addManagementNumber({
      supabase,
      table: "interpreters",
      payload: basePayload,
      ...managementConfig,
    });

    let { data, error } = await supabase
      .from("interpreters")
      .insert([payload])
      .select("id")
      .single();

    if (isManagementNumberConflict(error, managementConfig.column)) {
      payload = await addManagementNumber({
        supabase,
        table: "interpreters",
        payload: basePayload,
        ...managementConfig,
      });
      const retryResult = await supabase
        .from("interpreters")
        .insert([payload])
        .select("id")
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    console.log("DB INSERT RESULT", {
      data,
      error,
    });

    if (error) {
      if (isAgreementColumnError(error)) {
        console.error("약관 동의 저장 실패:", error);
      }
      console.error("DB INSERT ERROR", error);
      console.error("insert failed", {
        table: "interpreters",
        payload,
        error,
      });
      console.error("등록 실패 원인:", error.message);
      alert("제출에 실패했습니다.");
      return;
    }

    const emailPayload = {
      name: form.name,
      gender: form.gender,
      age: form.age,
      email: form.email,
      phone: form.phone,
      region: form.region,
      regions: form.availableRegions.join(", "),
      jlpt: form.jlpt,
      experience: form.has_experience ? "통역 경험 있음" : "통역 경험 없음",
      hasExperience: form.has_experience ? "통역 경험 있음" : "통역 경험 없음",
      specialties: form.specialties.join(", "),
      availableRegions: form.availableRegions.join(", "),
      createdAt: new Date().toISOString(),
    };
    const interpreterEmail = (
      form.email ||
      form.contact_email ||
      form.mail ||
      ""
    ).trim();

    console.log("INTERPRETER REGISTER SUCCESS - START EMAILS");
    console.log("START EMAIL FLOW");
    console.log("USER EMAIL START", interpreterEmail);
    console.log("INTERPRETER EMAIL TARGET:", interpreterEmail);

    try {
      if (interpreterEmail) {
        const result = await sendAutoEmail(
          "interpreter_registered_user",
          interpreterEmail,
          emailPayload
        );
        if (!result.ok) console.error("Interpreter user email failed", result.error || result);
      } else {
        console.warn("NO INTERPRETER EMAIL FOUND", form);
        console.warn("Interpreter email missing", form);
        console.warn("SKIP interpreter_registered_user: no email", form);
      }
    } catch (error) {
      console.error("USER EMAIL FAILED", error);
      console.error("Interpreter user email failed", error);
    }

    try {
      console.log("ADMIN EMAIL START");
      const result = await sendAutoEmail(
        "interpreter_registered_admin",
        ADMIN_EMAILS,
        {
          ...emailPayload,
          name: form.name,
          email: interpreterEmail,
          phone: form.phone,
        }
      );
      if (!result.ok) console.error("Interpreter admin email failed", result.error || result);
    } catch (error) {
      console.error("ADMIN EMAIL FAILED", error);
      console.error("Interpreter admin email failed", error);
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
            <h1>통역사 등록하기</h1>
            <p>
              한국어와 일본어 능력을 바탕으로 전시회·상담회·비즈니스 현장에서
              활동할 통역사를 모집합니다. 등록 후 ON-LI 운영팀 검토를 거쳐 승인
              여부를 안내드립니다.
            </p>
          </div>
        </section>

        <StepIndicator />

        <div className="register-layout">
          <form onSubmit={handleSubmit} className="register-form">
            <FormSectionCard
              icon="01"
              title="기본 정보"
              description="프로필 검토에 필요한 기본 정보를 입력해주세요."
            >
              <Field label="이름" name="name" value={form.name} onChange={handleChange} required />
              <Field label="성별">
                <select name="gender" value={form.gender} onChange={handleChange} required>
                  <option value="">성별 선택</option>
                  <option value="남자">남자</option>
                  <option value="여자">여자</option>
                </select>
              </Field>
              <Field label="나이" name="age" value={form.age} onChange={handleChange} required />
              <Field label="거주 지역" name="region" value={form.region} onChange={handleChange} required />
            </FormSectionCard>

            <FormSectionCard
              icon="02"
              title="연락처 정보"
              description="운영팀 안내와 매칭 연락에 사용할 정보를 입력해주세요."
            >
              <Field label="이메일" name="email" type="email" value={form.email} onChange={handleChange} required />
              <Field label="전화번호" name="phone" value={form.phone} onChange={handleChange} required />
              <Field label="카카오/라인 ID" name="kakaoOrLine" value={form.kakaoOrLine} onChange={handleChange} />
            </FormSectionCard>

            <FormSectionCard
              icon="03"
              title="언어 / 레벨 정보"
              description="언어 역량과 학력 정보를 바탕으로 운영팀이 레벨을 검토합니다."
            >
              <Field label="JLPT">
                <select name="jlpt" value={form.jlpt} onChange={handleChange} required>
                  <option value="N1 보유">N1 보유</option>
                  <option value="N1 미보유">N1 미보유</option>
                </select>
              </Field>
              <Field label="학교 및 전공" name="school" value={form.school} onChange={handleChange} />
              <div className="register-level-guide register-field-wide">
                <span>레벨 안내</span>
                <div className="register-level-pill-row">
                  {levelSystemCards.map((item) => (
                    <span key={item.level} className={`register-level-pill is-${item.tone}`}>
                      {item.level}
                    </span>
                  ))}
                </div>
              </div>
            </FormSectionCard>

            <FormSectionCard
              icon="04"
              title="활동 가능 정보"
              description="활동 가능한 지역과 업무, 전문 분야를 선택해주세요."
            >
              <Field label="일본 거주 기간" name="stayPeriod" value={form.stayPeriod} onChange={handleChange} required />
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
              <ChipGroup
                title="전문 분야 선택"
                description="강점이 있는 분야를 1개 이상 선택해주세요."
                options={specialtyOptions}
                values={form.specialties}
                onToggle={(value) => toggleArrayValue("specialties", value)}
              />
            </FormSectionCard>

            <FormSectionCard
              icon="05"
              title="통역 경험 정보"
              description="기존 통역 경험 여부를 알려주세요."
            >
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
            </FormSectionCard>

            <FormSectionCard
              icon="06"
              title="추가 정보 및 동의"
              description="약관 동의 후 등록을 제출할 수 있습니다."
            >
              {errorMessage && <p className="register-message is-error register-field-wide">{errorMessage}</p>}
              {successMessage && <p className="register-message is-success register-field-wide">{successMessage}</p>}
              <div className="register-field-wide">
                <TermsAgreement
                  agreements={agreements}
                  onChange={handleAgreementChange}
                  role="interpreter"
                />
              </div>
            </FormSectionCard>

            <section className="register-submit-card">
              <div>
                <strong>입력하신 정보는 ON-LI 운영팀 검토 후 승인 여부가 안내됩니다.</strong>
                <p>승인된 통역사만 공개 프로필에 표시되며 매칭 기회가 제공됩니다.</p>
              </div>
              <button
                type="submit"
                className="register-submit-button"
                disabled={!areTermsAgreed(agreements)}
              >
                통역사 등록 제출하기
              </button>
              <button type="button" onClick={onBackClick} className="register-back-button">
                메인으로 돌아가기
              </button>
            </section>
          </form>

          <RegisterSidebar />
        </div>
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

function FormSectionCard({ icon, title, description, children }) {
  return (
    <section className="register-section-card">
      <div className="register-section-head">
        <span>{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
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
  const steps = ["정보 입력", "운영팀 검토", "레벨 확인", "승인 완료", "활동 시작"];
  return (
    <nav className="register-steps" aria-label="등록 단계">
      {steps.map((step, index) => (
        <div key={step} className={`register-step${index === 0 ? " is-active" : ""}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{step}</strong>
        </div>
      ))}
    </nav>
  );
}

function RegisterSidebar() {
  return (
    <aside className="register-sidebar" aria-label="통역사 등록 안내">
      <div className="register-sidebar-card">
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
      </div>

      <div className="register-sidebar-card">
        <h3>ON-LI 통역사의 혜택</h3>
        <ul className="register-benefit-list">
          <li>다양한 비즈니스 매칭 기회</li>
          <li>전문성 기반 레벨 성장</li>
          <li>안정적인 활동 지원</li>
          <li>커뮤니티 및 교육 지원</li>
        </ul>
      </div>

      <div className="register-sidebar-card register-help-card">
        <h3>도움이 필요하신가요?</h3>
        <p>등록 과정에서 문제가 있으시면 언제든 문의해주세요.</p>
        <a href="mailto:onlinkwith@gmail.com">문의하기</a>
      </div>
    </aside>
  );
}

export default RegisterInterpreter;
