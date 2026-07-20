import { useEffect, useRef, useState } from "react";
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
import { JAPAN_PREFECTURES, normalizeRegion, uniqueRegions } from "../utils/regions";
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

const regionOptions = JAPAN_PREFECTURES;

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

function RegisterInterpreter({ authUser, onBackClick, onSubmitSuccess, onLoginClick, onSignupClick }) {
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isBusiness, setIsBusiness] = useState(false);

  useEffect(() => {
    const checkBusinessProfile = async () => {
      if (!authUser || !supabase) {
        setCheckingStatus(false);
        return;
      }
      try {
        const { data } = await supabase
          .from("businesses")
          .select("id")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (data) {
          setIsBusiness(true);
        }
      } catch (err) {
        console.error("Error checking business profile:", err);
      } finally {
        setCheckingStatus(false);
      }
    };
    checkBusinessProfile();
  }, [authUser]);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const submittingRef = useRef(false);
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [customRegionInput, setCustomRegionInput] = useState("");
  const [form, setForm] = useState({
    name: "",
    gender: "",
    age: "",
    region: "",
    phone: "",
    email: "",
    school: "",
    kakaoOrLine: "",
    jlpt: "N1 보유",
    stayPeriod: "",
    has_experience: false,
    experience_count: 0,
    specialties: [],
    availableRegions: [],
    customRegions: [],
    availableTasks: "",
  });
  const authEmail = normalizeEmail(authUser?.email);

  useEffect(() => {
    if (!authEmail) return;
    setForm((current) => ({ ...current, email: authEmail }));
  }, [authEmail]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      ...(name === "has_experience"
        ? {
            has_experience: value === "true",
            experience_count: value === "true" ? "" : 0,
          }
        : { [name]: value }),
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

  const addCustomRegion = () => {
    const region = normalizeRegion(customRegionInput);
    if (!region) return;
    setForm((current) => {
      if ([...current.availableRegions, ...current.customRegions].includes(region)) return current;
      return { ...current, customRegions: [...current.customRegions, region] };
    });
    setCustomRegionInput("");
  };

  const handleCustomRegionKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomRegion();
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
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

    if (form.availableRegions.length === 0 && form.customRegions.length === 0) {
      setErrorMessage("활동 가능 지역을 선택해주세요.");
      return;
    }

    if (form.specialties.length === 0) {
      setErrorMessage("전문 분야를 1개 이상 선택해주세요.");
      return;
    }

    if (!form.kakaoOrLine.trim()) {
      const message = "카카오톡 ID를 입력해주세요.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (form.has_experience && String(form.experience_count).trim() === "") {
      setErrorMessage("통역 경험 횟수를 입력해주세요.");
      return;
    }

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const userEmail = normalizeEmail(user?.email);

    if (userError) {
      console.error("Interpreter register auth user fetch error:", userError);
    }

    if (!user || !userEmail) {
      const message = "로그인해주세요.";
      setErrorMessage(message);
      alert(message);
      onLoginClick?.();
      return;
    }

    // Final check for business profile before submitting
    try {
      const { data: businessCheck } = await supabase
        .from("businesses")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (businessCheck) {
        const message = "기업 계정으로는 통역사 등록을 할 수 없습니다.";
        setErrorMessage(message);
        alert(message);
        return;
      }
    } catch (err) {
      console.error("Business check error on submit:", err);
    }

    console.log("BEFORE DB INSERT");

    const managementConfig = MANAGEMENT_NUMBER_CONFIG.interpreters;
    const profilePayload = {
      name: form.name,
      gender: form.gender,
      age: form.age,
      region: form.region,
      phone: form.phone,
      email: userEmail,
      school: form.school,
      kakao_or_line: form.kakaoOrLine.trim(),
      jlpt: form.jlpt,
      stay_period: form.stayPeriod,
      has_experience: form.has_experience,
      experience_count: form.has_experience ? Number(form.experience_count || 0) : 0,
      specialties: form.specialties,
      available_regions: form.availableRegions,
      custom_regions: uniqueRegions(form.customRegions),
      available_tasks: form.availableTasks,
      agreed_terms: true,
      agreed_policy: true,
      agreed_at: new Date().toISOString(),
    };
    const basePayload = {
      ...profilePayload,
      approved: false,
      status: "pending",
    };
    const existingInterpreter = await findExistingInterpreterProfile(user, userEmail);
    const isReactivatingWithdrawn = isWithdrawnProfile(existingInterpreter);

    let payload = null;
    let data = null;
    let error = null;

    if (existingInterpreter?.id) {
      payload = {
        ...profilePayload,
        auth_user_id: user.id,
        ...(isReactivatingWithdrawn
          ? {
              status: "active",
              is_public: true,
              withdrawn_at: null,
            }
          : {}),
      };

      const updateResult = await updateExistingInterpreter(existingInterpreter.id, payload);
      data = updateResult.data;
      error = updateResult.error;
    } else {
      payload = await addManagementNumber({
        supabase,
        table: "interpreters",
        payload: { ...basePayload, auth_user_id: user.id },
        ...managementConfig,
      });

      const insertResult = await insertInterpreter(payload);
      data = insertResult.data;
      error = insertResult.error;

      if (isManagementNumberConflict(error, managementConfig.column)) {
        payload = await addManagementNumber({
          supabase,
          table: "interpreters",
          payload: { ...basePayload, auth_user_id: user.id },
          ...managementConfig,
        });
        const retryResult = await insertInterpreter(payload);
        data = retryResult.data;
        error = retryResult.error;
      }
    }

    console.log("DB UPSERT RESULT", {
      data,
      error,
    });

    if (error) {
      if (isAgreementColumnError(error)) {
        console.error("약관 동의 저장 실패:", error);
      }
      console.error("Interpreter save error:", error);
      console.error("DB SAVE ERROR", error);
      console.error("save failed", {
        table: "interpreters",
        payload,
        error,
      });
      console.error("등록 실패 원인:", error.message);
      alert(`등록 실패: ${error.message}`);
      return;
    }

    await syncInterpreterContactProfile({
      interpreterId: data?.id || existingInterpreter?.id,
      userId: user.id,
      phone: profilePayload.phone,
      email: profilePayload.email,
      kakaoId: profilePayload.kakao_or_line,
    });

    console.log("INTERPRETER REGISTER SUCCESS");
    console.log("REGISTER FORM EMAIL CHECK", {
      email: form.email,
      mail: form.mail,
      interpreter_email: form.interpreter_email,
      contact_email: form.contact_email,
    });

    const interpreterEmail = (
      form.email ||
      form.mail ||
      form.interpreter_email ||
      form.contact_email ||
      ""
    ).trim();

    console.log("INTERPRETER USER EMAIL TARGET", interpreterEmail);

    if (interpreterEmail) {
      try {
        console.log("SEND interpreter_registered_user START", interpreterEmail);

        const result = await sendAutoEmail("interpreter_registered_user", interpreterEmail, {
          requestId: data?.id || "",
          interpreterId: data?.id || "",
          name: form.name,
          email: interpreterEmail,
        });

        if (!result.ok) {
          console.error("interpreter_registered_user failed", result.error || result);
        }

        console.log("SEND interpreter_registered_user DONE");
      } catch (e) {
        console.error("interpreter_registered_user failed", e);
      }
    } else {
      console.warn("SKIP interpreter_registered_user: no interpreter email", form);
    }

    try {
      console.log("SEND interpreter_registered_admin START");

      const result = await sendAutoEmail("interpreter_registered_admin", ADMIN_EMAILS, {
        requestId: data?.id || "",
        interpreterId: data?.id || "",
        name: form.name,
        email: interpreterEmail,
        phone: form.phone,
        kakaoOrLine: form.kakaoOrLine.trim(),
      });

      if (!result.ok) {
        console.error("interpreter_registered_admin failed", result.error || result);
      }

      console.log("SEND interpreter_registered_admin DONE");
    } catch (e) {
      console.error("interpreter_registered_admin failed", e);
    }

    setAgreements(initialTermsAgreement);
    setSuccessMessage(
      isReactivatingWithdrawn
        ? "재가입 신청이 완료되었습니다. 프로필 정보가 다시 활성화되었습니다."
        : "등록 신청이 완료되었습니다. 승인 후 마이페이지 이용을 위해 통역사 계정을 생성해주세요."
    );
    setTimeout(() => {
      onSubmitSuccess?.();
      if (!onSubmitSuccess) onBackClick?.();
    }, 700);
    } finally {
      submittingRef.current = false;
    }
  };

  if (checkingStatus) {
    return (
      <div className="register-page">
        <div className="register-shell">
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px", color: "#fff" }}>
            <p>프로필 확인 중...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isBusiness) {
    return (
      <div className="register-page">
        <div className="register-shell">
          <section className="register-hero" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div className="register-hero-copy">
              <p className="register-kicker" style={{ color: "#ef4444" }}>ACCESS DENIED</p>
              <h1>통역사 등록 제한</h1>
              <p style={{ marginTop: "24px", color: "#e2e8f0" }}>
                이미 기업으로 등록된 계정은 통역사 등록을 할 수 없습니다. <br />
                통역사 이용은 별도 계정으로 가입해주세요.
              </p>
              <div style={{ display: "flex", gap: "16px", marginTop: "32px", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={onBackClick}
                  className="register-submit-button"
                  style={{ background: "#4f46e5", maxWidth: "200px", margin: "0" }}
                >
                  마이페이지로 돌아가기
                </button>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="register-submit-button"
                  style={{ background: "#ef4444", maxWidth: "200px", margin: "0" }}
                >
                  로그아웃
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

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

        <section className="register-guide-grid" aria-label="통역사 등록 안내">
          <LevelSystemCard className="register-level-system-card" />
          <RegisterSidebar />
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
              <Field
                label="로그인 이메일"
                name="email"
                type="email"
                value={authEmail || form.email}
                readOnly
                placeholder="로그인 계정 이메일"
                required
              />
              <Field
                label="전화번호"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="전화번호를 입력해주세요"
                required
              />
              <Field
                label="카카오톡 ID"
                name="kakaoOrLine"
                value={form.kakaoOrLine}
                onChange={handleChange}
                placeholder="카카오톡 ID를 입력해주세요"
                required
              />
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
              <Field label="통역 경험 횟수">
                <input
                  name="experience_count"
                  type="number"
                  min="0"
                  value={form.experience_count}
                  onChange={handleChange}
                  disabled={!form.has_experience}
                  required={form.has_experience}
                />
              </Field>
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
              <div className="register-custom-regions register-field-wide">
                <label htmlFor="custom-region-input">기타 활동 가능 지역</label>
                <input
                  id="custom-region-input"
                  value={customRegionInput}
                  onChange={(event) => setCustomRegionInput(event.target.value)}
                  onKeyDown={handleCustomRegionKeyDown}
                  onBlur={addCustomRegion}
                  placeholder="예) 하코네, 닛코, 비에이, 유후인 등"
                />
                {form.customRegions.length > 0 && (
                  <div className="register-custom-region-tags">
                    {form.customRegions.map((region) => (
                      <span key={region} className="register-custom-region-tag">
                        {region}
                        <button
                          type="button"
                          aria-label={`${region} 삭제`}
                          onClick={() => setForm((current) => ({
                            ...current,
                            customRegions: current.customRegions.filter((item) => item !== region),
                          }))}
                        >×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                <div className="register-account-actions">
                  <button type="button" onClick={onLoginClick}>
                    통역사 로그인
                  </button>
                  <button type="button" onClick={onSignupClick}>
                    계정 만들기
                  </button>
                </div>
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
        </div>

        <footer className="register-footer" aria-label="ON-LI 사업자 정보">
          <strong>ON-LI</strong>
          <span>사업자등록번호 141-15-02905</span>
        </footer>
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

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column|schema cache/i.test(error?.message || "")
  );
}

function isWithdrawnProfile(profile = {}) {
  const status = String(profile?.status || "").trim().toLowerCase();
  return status === "withdrawn" || Boolean(profile?.withdrawn_at);
}

async function findExistingInterpreterProfile(user, email) {
  const selectColumns = "id, email, status, withdrawn_at, auth_user_id";
  const exactEmail = normalizeEmail(email);

  const { data, error } = await supabase
    .from("interpreters")
    .select(selectColumns)
    .or(`auth_user_id.eq.${user.id},email.ilike.${exactEmail}`);

  if (error && isMissingColumnError(error) && /auth_user_id/i.test(error.message || "")) {
    console.warn("Retry interpreter lookup without auth_user_id column", error);
    return findExistingInterpreterProfileByEmail(exactEmail);
  }

  if (error) {
    throw error;
  }

  return pickExistingInterpreterProfile(data || [], user, exactEmail);
}

async function findExistingInterpreterProfileByEmail(email) {
  const { data, error } = await supabase
    .from("interpreters")
    .select("id, email, status, withdrawn_at")
    .ilike("email", email);

  if (error) throw error;

  return pickExistingInterpreterProfile(data || [], null, email);
}

function pickExistingInterpreterProfile(profiles = [], user, email) {
  const exactEmail = normalizeEmail(email);
  return (
    profiles.find((profile) => profile.auth_user_id && profile.auth_user_id === user?.id) ||
    profiles.find((profile) => normalizeEmail(profile.email) === exactEmail) ||
    null
  );
}

async function syncInterpreterContactProfile({
  interpreterId,
  userId,
  phone,
  email,
  kakaoId,
}) {
  if (!interpreterId) return;

  const { error } = await supabase
    .from("interpreter_profiles")
    .upsert(
      {
        interpreter_id: interpreterId,
        user_id: userId,
        auth_user_id: userId,
        phone: phone || null,
        email: normalizeEmail(email) || null,
        kakao_id: kakaoId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "interpreter_id" }
    );

  if (error) {
    console.warn("Interpreter contact profile sync skipped:", {
      interpreterId,
      userId,
      error,
    });
  }
}

async function updateExistingInterpreter(id, payload) {
  const { data, error } = await supabase
    .from("interpreters")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (!error || !isMissingColumnError(error) || !("auth_user_id" in payload)) {
    return { data, error };
  }

  console.warn("Retry interpreter update without auth_user_id column", error);
  const legacyPayload = { ...payload };
  delete legacyPayload.auth_user_id;

  return supabase
    .from("interpreters")
    .update(legacyPayload)
    .eq("id", id)
    .select("id")
    .single();
}

async function insertInterpreter(payload) {
  const { data, error } = await supabase
    .from("interpreters")
    .insert([payload])
    .select("id")
    .single();

  if (!error || !isMissingColumnError(error) || !("auth_user_id" in payload)) {
    return { data, error };
  }

  console.warn("Retry interpreter insert without auth_user_id column", error);
  const legacyPayload = { ...payload };
  delete legacyPayload.auth_user_id;

  return supabase
    .from("interpreters")
    .insert([legacyPayload])
    .select("id")
    .single();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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

function LevelSystemCard({ className = "" }) {
  return (
    <div className={`register-sidebar-card ${className}`.trim()}>
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
  );
}

export default RegisterInterpreter;
