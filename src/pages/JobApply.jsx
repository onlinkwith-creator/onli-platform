import { useCallback, useEffect, useRef, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { publicSupabase, supabase, supabaseConfigError } from "../supabase";
import { useAuth } from "../hooks/useAuth";
import { canApplyToJob, getJobStatusLabel, isPublicJob } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
import {
  ensureInterpreterAuthLink,
  pickCurrentUserInterpreterProfile,
} from "../utils/interpreterApproval";
import { ADMIN_EMAILS, sendAutoEmail } from "../lib/email";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  buildLegacyJobApplicationPayload,
  findExistingJobApplication,
  getJobApplicationSubmitErrorMessage,
  getSupabaseErrorDetails,
  isDuplicateApplicationError,
  normalizeApplicationEmail,
  normalizeApplicationPhone,
} from "../utils/applicationContact";
import {
  checkInterpreterScheduleConflict,
  getScheduleRange,
} from "../utils/scheduleConflict";
import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "../utils/managementNumber";
import "./Jobs.css";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  gender: "",
  japaneseLevel: "",
  experience: "",
  message: "",
};

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function JobApply({
  jobId,
  onBackClick,
  onSubmitSuccess,
  onHomeClick,
  onLoginClick,
  onMypageClick,
  onRegisterClick,
}) {
  const { user, loading: authLoading } = useAuth();
  const [interpreterProfile, setInterpreterProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [job, setJob] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [agreements, setAgreements] = useState(initialTermsAgreement);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingApplication, setExistingApplication] = useState(null);
  const [applicationCheckLoading, setApplicationCheckLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      setErrorMessage("지원할 공고 정보를 찾을 수 없습니다.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      if (!publicSupabase) throw supabaseConfigError;

      const { data, error } = await publicSupabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) {
        console.error("Supabase select error:", error);
        alert(error.message);
        throw error;
      }

      console.log("loaded jobs:", data ? [data] : []);

      if (!isPublicJob(data)) {
        setJob(null);
        setErrorMessage("지원할 수 없는 공고입니다.");
        return;
      }

      setJob(data);
    } catch (error) {
      console.error(error);
      setJob(null);
      setErrorMessage(
        getSupabaseErrorMessage(error, "지원할 공고를 불러오지 못했습니다.")
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    queueMicrotask(fetchJob);
  }, [fetchJob]);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user || !supabase) {
        setInterpreterProfile(null);
        return;
      }
      setProfileLoading(true);
      try {
        const normalizedEmail = String(user.email || "").toLowerCase().trim();
        const { data, error } = await supabase
          .from("interpreters")
          .select("*")
          .or(`auth_user_id.eq.${user.id},email.ilike.${normalizedEmail}`);

        if (error) {
          console.error("Failed to fetch interpreter profile for application", error);
          return;
        }

        const matched = await ensureInterpreterAuthLink(
          supabase,
          pickCurrentUserInterpreterProfile(data || [], user),
          user
        );

        if (matched) {
          setInterpreterProfile(matched);
          setForm({
            name: matched.name || "",
            phone: matched.phone || "",
            email: matched.email || user.email || "",
            gender: matched.gender === "남자" ? "남성" : matched.gender === "여자" ? "여성" : (matched.gender || ""),
            japaneseLevel: matched.level || "LV1",
            experience: [
              matched.school ? `출신학교/전공: ${matched.school}` : "",
              matched.jlpt ? `JLPT: ${matched.jlpt}` : "",
              matched.experience_count ? `통역 경험 횟수: ${matched.experience_count}회` : "",
              matched.available_tasks ? `수행 가능 업무: ${matched.available_tasks}` : "",
            ].filter(Boolean).join("\n") || "프로필 정보 참고",
            message: "",
          });
        } else {
          setInterpreterProfile(null);
        }
      } catch (err) {
        console.error("Error loading interpreter profile", err);
      } finally {
        setProfileLoading(false);
      }
    };

    queueMicrotask(loadProfile);
  }, [user]);

  useEffect(() => {
    const checkExistingApplication = async () => {
      if (!job?.id || !interpreterProfile?.id || !supabase) {
        setExistingApplication(null);
        setSubmitted(false);
        return;
      }

      setApplicationCheckLoading(true);
      try {
        const application = await findExistingJobApplication(supabase, {
          jobId: job.id,
          interpreterId: interpreterProfile.id,
        });
        setExistingApplication(application || null);
        setSubmitted(Boolean(application));
      } catch (error) {
        console.error("기존 지원 여부 확인 실패:", getSupabaseErrorDetails(error));
      } finally {
        setApplicationCheckLoading(false);
      }
    };

    queueMicrotask(checkExistingApplication);
  }, [job?.id, interpreterProfile?.id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submittingRef.current || submitting || submitted) return;
    if (!job) return;
    if (!canApplyToJob(job)) {
      setErrorMessage("지원할 수 없는 공고입니다.");
      return;
    }
    if (existingApplication) {
      setErrorMessage(DUPLICATE_APPLICATION_MESSAGE);
      setSubmitted(true);
      return;
    }
    if (authLoading) {
      setErrorMessage("로그인 상태를 확인 중입니다.");
      return;
    }
    if (!user) {
      const message = "로그인 후 지원할 수 있습니다.";
      setErrorMessage(message);
      alert(message);
      onLoginClick?.();
      return;
    }
    if (profileLoading) {
      setErrorMessage("통역사 등록 정보를 확인 중입니다.");
      return;
    }
    if (!interpreterProfile) {
      const message = "통역사 등록 후 지원할 수 있습니다.";
      setErrorMessage(message);
      alert(message);
      onRegisterClick?.();
      return;
    }

    if (!hasRegisteredResume(interpreterProfile)) {
      const message = "이력서를 등록한 후 지원할 수 있습니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    if (!areTermsAgreed(agreements, { requireCancelPolicy: true })) {
      const message = "약관 동의 후 제출 가능합니다.";
      setErrorMessage(message);
      alert(message);
      return;
    }

    setSubmitting(true);
    submittingRef.current = true;
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    const applicantEmail = normalizeApplicationEmail(form.email);
    const applicantPhone = normalizeApplicationPhone(form.phone);

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await supabase.auth.getUser();

    if (currentUserError || !currentUser?.id || currentUser.id !== user.id) {
      const message = "지원 처리 권한이 없습니다. 로그인 상태와 통역사 승인 상태를 확인해주세요.";
      setErrorMessage(message);
      alert(message);
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    const matchedInterpreter = await ensureInterpreterAuthLink(
      supabase,
      interpreterProfile,
      currentUser
    );
    setInterpreterProfile(matchedInterpreter);

    const agreedAt = new Date().toISOString();
    const application = {
      job_id: job.id,
      interpreter_id: matchedInterpreter?.id || null,
      applicant_name: form.name.trim(),
      phone: applicantPhone,
      applicant_phone: applicantPhone,
      email: applicantEmail,
      applicant_email: applicantEmail,
      message: [
        form.message,
        form.gender ? `성별: ${form.gender}` : "",
        form.japaneseLevel ? `일본어 수준: ${form.japaneseLevel}` : "",
        form.experience ? `통역 경험: ${form.experience}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: "pending",
      agreed_terms: true,
      agreed_policy: true,
      agreed_cancel_policy: true,
      agreed_at: agreedAt,
      cancel_policy_agreed_at: agreedAt,
    };
    const managementConfig = MANAGEMENT_NUMBER_CONFIG.job_applications;

    try {
      const existingApplication = await findExistingJobApplication(supabase, {
        jobId: job.id,
        interpreterId: matchedInterpreter?.id,
        email: applicantEmail,
        phone: applicantPhone,
      });

      if (existingApplication) {
        setErrorMessage(DUPLICATE_APPLICATION_MESSAGE);
        alert(DUPLICATE_APPLICATION_MESSAGE);
        setExistingApplication(existingApplication);
        setSubmitted(true);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      if (matchedInterpreter?.id) {
        const range = getScheduleRange(job);
        const { conflicts, error } = await checkInterpreterScheduleConflict({
          interpreterId: matchedInterpreter.id,
          newStartDate: range.startDate,
          newEndDate: range.endDate,
          supabase,
        });
        if (error) {
          console.warn("지원 단계 일정 충돌 확인 실패:", error);
        } else if (conflicts.length > 0) {
          alert(
            "해당 기간에 이미 배정된 일정이 있습니다. 지원은 가능하지만 관리자 검토 시 제한될 수 있습니다."
          );
        }
      }

      let insertPayload = await addManagementNumber({
        supabase,
        table: "job_applications",
        payload: application,
        ...managementConfig,
      });
      let { data, error } = await supabase
        .from("job_applications")
        .insert([insertPayload])
        .select("id")
        .single();

      if (isManagementNumberConflict(error, managementConfig.column)) {
        insertPayload = await addManagementNumber({
          supabase,
          table: "job_applications",
          payload: application,
          ...managementConfig,
        });
        const retryResult = await supabase
          .from("job_applications")
          .insert([insertPayload])
          .select("id")
          .single();
        data = retryResult.data;
        error = retryResult.error;
      }

      if (error && isAgreementColumnError(error)) {
        const fallbackApplication = buildLegacyJobApplicationPayload(error, insertPayload);
        const fallbackResult = await supabase
          .from("job_applications")
          .insert([fallbackApplication])
          .select("id")
          .single();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        const errorDetails = getSupabaseErrorDetails(error);
        console.error("지원서 제출 실패:", {
          ...errorDetails,
          table: "job_applications",
          payloadKeys: Object.keys(insertPayload || {}),
          status: insertPayload?.status,
          interpreter_id: insertPayload?.interpreter_id,
        });
        throw error;
      }

      const emailPayload = {
        requestId: data?.id || "",
        applicationId: data?.id || "",
        jobId: job.id,
        name: form.name,
        jobTitle: job.title || "공고 제목 미입력",
        date: formatDateRange(job.start_date, job.end_date, job.event_date || job.date),
        email: form.email,
        phone: form.phone,
        levelOrExperience: [form.japaneseLevel, form.experience]
          .filter(Boolean)
          .join(" / "),
      };
      try {
        if (applicantEmail) {
          const result = await sendAutoEmail(
            "job_applied_user",
            applicantEmail,
            emailPayload
          );
          if (!result.ok) console.error("Applicant email failed", result.error || result);
        } else {
          console.warn("SKIP job_applied_user: no email", { form, application });
          console.warn("EMAIL SKIPPED: SKIP APPLICANT EMAIL: form.email is empty", {
            form,
            application,
          });
        }
      } catch (error) {
        console.error("USER EMAIL FAILED", error);
        console.error("Applicant email failed", error);
      }

      try {
        const result = await sendAutoEmail("job_applied_admin", ADMIN_EMAILS, {
          ...emailPayload,
          name: form.name,
          email: applicantEmail,
          jobTitle: job.title || "공고 제목 미입력",
        });
        if (!result.ok) {
          console.error("Job application admin email failed", result.error || result);
        }
      } catch (error) {
        console.error("ADMIN EMAIL FAILED", error);
        console.error("Job application admin email failed", error);
      }

      setSubmitted(true);
      setExistingApplication(data || { id: data?.id });
      setForm(initialForm);
      setAgreements(initialTermsAgreement);
    } catch (error) {
      console.error("지원 실패:", getSupabaseErrorDetails(error));
      if (isDuplicateApplicationError(error)) {
        setErrorMessage(DUPLICATE_APPLICATION_MESSAGE);
        alert(DUPLICATE_APPLICATION_MESSAGE);
        setExistingApplication({ id: "duplicate" });
        setSubmitted(true);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      const message = getJobApplicationSubmitErrorMessage(error);
      setErrorMessage(message);
      alert(message);
      setSubmitting(false);
      submittingRef.current = false;
      return;
    } finally {
      if (!submitted) setSubmitting(false);
    }
  };

  const goToJobs = () => {
    onSubmitSuccess();
  };

  const goHome = () => {
    onHomeClick?.();
  };

  if (submitted) {
    return (
      <div className="jobs-page">
        <div className="jobs-shell">
          <div className="jobs-success-box">
            <p className="jobs-kicker">APPLICATION COMPLETE</p>
            <h1>지원된 통역공고입니다</h1>
            <p>이미 지원한 통역공고입니다.</p>
            <div className="jobs-success-actions">
              <button type="button" onClick={goToJobs}>
                공고 목록으로 돌아가기
              </button>
              <button type="button" className="secondary" onClick={goHome}>
                메인으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <div className="jobs-shell">
        <button type="button" onClick={onBackClick} className="jobs-back">
          ← 전체 공고로
        </button>

        {loading ? (
          <MessageBox text="지원할 공고를 불러오는 중입니다..." />
        ) : errorMessage && !job ? (
          <MessageBox text={errorMessage} />
        ) : (
          <div className="job-detail-layout">
            <article className="job-detail-card">
              <p className="jobs-kicker">JOB APPLY</p>
              <h1>{job.title || "공고 제목 미입력"}</h1>
              <p className="job-detail-lead">
                {job.location || "장소 협의"} ·{" "}
                {formatDateRange(job.start_date, job.end_date, job.event_date || job.date)}
              </p>

              <div className="job-detail-grid">
                <Info label="일급" value={getJobPayDisplay(job)} />
                <Info label="언어" value={job.language} />
                <Info label="전문 분야" value={getJobSpecialty(job)} />
                <Info label="모집 인원" value={job.people} />
                <Info label="우대" value={job.preference} />
                <Info
                  label="상태"
                  value={getJobStatusLabel(job)}
                />
              </div>
            </article>

            <aside className="job-apply-card">
              <h2>지원하기</h2>
              {authLoading || profileLoading ? (
                <div className="jobs-success-inline">
                  <h2>지원 자격 확인 중</h2>
                  <p>로그인 및 통역사 등록 정보를 확인하고 있습니다.</p>
                </div>
              ) : !user ? (
                <div className="jobs-success-inline">
                  <h2>로그인이 필요합니다</h2>
                  <p>회원가입 및 로그인 후 통역 공고에 지원할 수 있습니다.</p>
                  <button type="button" onClick={onLoginClick || onHomeClick}>
                    로그인 / 회원가입
                  </button>
                </div>
              ) : !interpreterProfile ? (
                <div className="jobs-success-inline">
                  <h2>통역사 등록이 필요합니다</h2>
                  <p>통역사 프로필 등록을 완료한 계정만 공고에 지원할 수 있습니다.</p>
                  <button type="button" onClick={onRegisterClick || onHomeClick}>
                    통역사 등록하기
                  </button>
                </div>
              ) : !hasRegisteredResume(interpreterProfile) ? (
                <div className="jobs-success-inline">
                  <h2>이력서 등록이 필요합니다</h2>
                  <p>통역 지원을 위해 이력서 등록이 필요합니다.</p>
                  <button type="button" onClick={onMypageClick || onHomeClick}>
                    이력서 등록하러 가기
                  </button>
                </div>
              ) : (
              <form onSubmit={handleSubmit}>
                {interpreterProfile ? (
                  <div className="interpreter-profile-summary-card">
                    <p className="summary-title">통역사 정보 자동 입력됨</p>
                    <div className="summary-details">
                      <span><strong>이름:</strong> {interpreterProfile.name}</span>
                      <span><strong>연락처:</strong> {interpreterProfile.phone}</span>
                      <span><strong>이메일:</strong> {interpreterProfile.email}</span>
                      <span><strong>레벨:</strong> {interpreterProfile.level || "LV1"}</span>
                    </div>
                    <p className="summary-footer">프로필 등록 정보로 자동 지원됩니다.</p>
                  </div>
                ) : (
                  <>
                    <label>
                      <span>이름</span>
                      <input name="name" value={form.name} onChange={handleChange} required />
                    </label>

                    <label>
                      <span>연락처</span>
                      <input name="phone" value={form.phone} onChange={handleChange} required />
                    </label>

                    <label>
                      <span>이메일</span>
                      <input
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                      />
                    </label>

                    <label>
                      <span>성별</span>
                      <select name="gender" value={form.gender} onChange={handleChange} required>
                        <option value="">선택해주세요</option>
                        <option value="여성">여성</option>
                        <option value="남성">남성</option>
                        <option value="기타/응답 안 함">기타/응답 안 함</option>
                      </select>
                    </label>

                    <label>
                      <span>일본어 수준</span>
                      <select
                        name="japaneseLevel"
                        value={form.japaneseLevel}
                        onChange={handleChange}
                        required
                      >
                        <option value="">선택해주세요</option>
                        <option value="LV1">LV1</option>
                        <option value="LV2">LV2</option>
                        <option value="LV3">LV3</option>
                        <option value="LV4">LV4</option>
                      </select>
                    </label>

                    <label>
                      <span>통역 경험</span>
                      <textarea
                        name="experience"
                        value={form.experience}
                        onChange={handleChange}
                        rows={4}
                        required
                      />
                    </label>
                  </>
                )}

                <label>
                  <span>지원 메모</span>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    rows={4}
                    required
                  />
                </label>

                {errorMessage && <p className="jobs-error">{errorMessage}</p>}

                <TermsAgreement
                  agreements={agreements}
                  onChange={handleAgreementChange}
                  requireCancelPolicy
                  role="interpreter"
                />

                <p className="jobs-notice">
                  제출된 지원서는 ON-LI 운영팀 검토 후 공고 담당자에게 전달됩니다.
                  <br />
                  배정 확정 후 지원 취소 및 철회 시 취소 규정에 따라 위약금이 발생할 수 있습니다.
                </p>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    submitted ||
                    applicationCheckLoading ||
                    authLoading ||
                    profileLoading ||
                    !user ||
                    !interpreterProfile ||
                    !canApplyToJob(job) ||
                    !hasRegisteredResume(interpreterProfile) ||
                    !areTermsAgreed(agreements, { requireCancelPolicy: true })
                  }
                >
                  {!canApplyToJob(job)
                    ? "마감됨"
                    : submitted
                      ? "지원된 통역공고입니다"
                    : applicationCheckLoading
                      ? "지원 여부 확인 중..."
                    : submitting
                      ? "제출 중..."
                      : "제출하기"}
                </button>
              </form>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function MessageBox({ text }) {
  return <div className="jobs-message">{text}</div>;
}

function isAgreementColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|column|schema cache/i.test(error?.message || "")
  );
}

function hasRegisteredResume(profile = {}) {
  return Boolean(
    String(profile.resume_url || "").trim() ||
      String(profile.resume_file_url || "").trim() ||
      String(profile.resume_file_name || "").trim()
  );
}

export default JobApply;
