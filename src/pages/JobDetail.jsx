import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  Languages,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { publicSupabase, supabase, supabaseConfigError } from "../supabase";
import { useAuth } from "../hooks/useAuth";
import {
  checkInterpreterScheduleConflict,
  getScheduleRange,
} from "../utils/scheduleConflict";
import { canApplyToJob, getJobStatusLabel, isPublicJob, normalizeJobStatus } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobLevelSummary, getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
import { attachPublicJobCounts } from "../utils/jobsApi";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import { ADMIN_EMAILS, sendAutoEmail } from "../lib/email";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  findExistingJobApplication,
  isDuplicateApplicationError,
  normalizeApplicationEmail,
  normalizeApplicationPhone,
} from "../utils/applicationContact";
import { APPLICATION_STATUS } from "../utils/status";
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

// TODO: 실서비스 전에는 Supabase Auth 기반으로 통역사 본인 계정만 지원 가능하게 해야 함.

function JobDetail({ jobId, onBackClick, onLoginClick, onRegisterClick }) {
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
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      setErrorMessage("공고 정보를 찾을 수 없습니다.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    if (!publicSupabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    const { data, error } = await publicSupabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      console.error("Supabase select error:", error);
      alert(error.message);
      setErrorMessage("공고 정보를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    console.log("loaded jobs:", data ? [data] : []);

    if (!isPublicJob(data)) {
      setJob(null);
      setErrorMessage("지원할 수 없는 공고입니다.");
      setLoading(false);
      return;
    }

    const [jobWithCounts] = await attachPublicJobCounts(publicSupabase, [data]);
    setJob(jobWithCounts || data);
    setLoading(false);
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
          .ilike("email", normalizedEmail);

        if (error) {
          console.error("Failed to fetch interpreter profile for application", error);
          return;
        }

        const matched = (data || []).find(
          (item) => String(item.email || "").toLowerCase().trim() === normalizedEmail
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log("JOB DETAIL APPLY SUBMIT START");
    console.log("JOB DETAIL APPLY FORM DATA", form);

    if (submittingRef.current || submitting || submitted) return;

    if (!job) return;
    if (!canApplyToJob(job)) {
      setErrorMessage("지원할 수 없는 공고입니다.");
      return;
    }
    if (authLoading) {
      setErrorMessage("로그인 상태를 확인 중입니다.");
      return;
    }
    if (!user) {
      const message = "회원가입 및 로그인 후 지원 가능합니다.";
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
      const message = "통역사 등록을 완료한 계정만 공고에 지원할 수 있습니다.";
      setErrorMessage(message);
      alert(message);
      onRegisterClick?.();
      return;
    }

    if (!areTermsAgreed(agreements)) {
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

    const matchedInterpreter = interpreterProfile;

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
      status: APPLICATION_STATUS.PENDING,
      agreed_terms: true,
      agreed_policy: true,
      agreed_at: new Date().toISOString(),
    };

    try {
      const existingApplication = await findExistingJobApplication(supabase, {
        jobId: job.id,
        email: applicantEmail,
        phone: applicantPhone,
      });

      if (existingApplication) {
        setErrorMessage(DUPLICATE_APPLICATION_MESSAGE);
        alert(DUPLICATE_APPLICATION_MESSAGE);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      if (matchedInterpreter?.id) {
        const range = getScheduleRange(job);
        const { conflicts, error: conflictError } = await checkInterpreterScheduleConflict({
          interpreterId: matchedInterpreter.id,
          newStartDate: range.startDate,
          newEndDate: range.endDate,
          supabase,
        });
        if (conflictError) {
          console.warn("지원 단계 일정 충돌 확인 실패:", conflictError);
        } else if (conflicts.length > 0) {
          alert(
            "해당 기간에 이미 배정된 일정이 있습니다. 지원은 가능하지만 관리자 검토 시 제한될 수 있습니다."
          );
        }
      }

      const managementConfig = MANAGEMENT_NUMBER_CONFIG.job_applications;
      let insertPayload = await addManagementNumber({
        supabase,
        table: "job_applications",
        payload: application,
        ...managementConfig,
      });

      console.log("JOB DETAIL APPLY BEFORE DB INSERT");
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
        const fallbackApplication = { ...insertPayload };
        delete fallbackApplication.interpreter_id;
        delete fallbackApplication.application_no;
        const fallbackResult = await supabase
          .from("job_applications")
          .insert([fallbackApplication])
          .select("id")
          .single();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      console.log("JOB DETAIL APPLY DB INSERT RESULT", {
        data,
        error,
      });

      if (error) {
        if (isAgreementColumnError(error)) {
          console.error("약관 동의 저장 실패:", error);
        }
        console.error("JOB DETAIL APPLY DB INSERT ERROR", error);
        console.error("insert failed", {
          table: "job_applications",
          payload: insertPayload,
          error,
        });
        console.error("지원 실패:", error);
        throw error;
      }

      const emailPayload = {
        requestId: data?.id || "",
        applicationId: data?.id || "",
        jobId: job.id,
        name: form.name,
        jobTitle: job.title || job.event_name || "공고 제목 미입력",
        date: formatDateRange(job.start_date, job.end_date, job.event_date || job.date),
        email: applicantEmail,
        phone: form.phone,
        levelOrExperience: [form.japaneseLevel, form.experience]
          .filter(Boolean)
          .join(" / "),
      };

      console.log("JOB APPLICATION SUCCESS - START EMAILS", applicantEmail);
      console.log("JOB DETAIL APPLY START EMAIL FLOW");
      console.log("APPLICANT EMAIL TARGET:", applicantEmail);

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
        console.log("JOB DETAIL APPLY ADMIN EMAIL START");
        const result = await sendAutoEmail("job_applied_admin", ADMIN_EMAILS, {
          ...emailPayload,
          name: form.name,
          email: applicantEmail,
          jobTitle: job.title || job.event_name || "공고 제목 미입력",
        });
        if (!result.ok) {
          console.error("Job application admin email failed", result.error || result);
        }
      } catch (error) {
        console.error("ADMIN EMAIL FAILED", error);
        console.error("Job application admin email failed", error);
      }

      setSubmitted(true);
      setForm(initialForm);
      setAgreements(initialTermsAgreement);
    } catch (error) {
      console.error("지원 실패:", error);
      if (isDuplicateApplicationError(error)) {
        setErrorMessage(DUPLICATE_APPLICATION_MESSAGE);
        alert(DUPLICATE_APPLICATION_MESSAGE);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      const message = error?.message || "지원 접수에 실패했습니다. 입력값을 확인해주세요.";
      setErrorMessage(message);
      alert("제출에 실패했습니다.");
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="job-detail-page">
      <div className="home-bg-glow" />
      <div className="job-detail-container">
        {loading ? (
          <MessageBox text="공고 정보를 불러오는 중입니다..." />
        ) : errorMessage && !job ? (
          <MessageBox text={errorMessage} />
        ) : (
          <div className="job-detail-layout">
            
            {/* 상단 헤더 영역 */}
            <header className="job-detail-hero">
              <div className="job-detail-hero-content">
                <div className="job-detail-hero-left">
                  <div className="job-detail-actions-row">
                    <button type="button" onClick={onBackClick} className="jobs-back-btn">
                      <ArrowLeft size={16} />
                      공고 목록으로
                    </button>
                  </div>
                  
                  <div className="job-detail-hero-label-row">
                    <span className="job-detail-hero-kicker">JOB DETAIL</span>
                    <span className={`home-job-status ${normalizeJobStatus(job)}`}>
                      {getJobStatusLabel(job)}
                    </span>
                  </div>
                  
                  <h1 className="job-detail-hero-title">
                    {job.event_name || job.title || "공고 제목 미입력"}
                  </h1>
                  
                  <div className="job-detail-hero-meta">
                    <MetaItem icon={Building2} text={job.company_name || "기업명 확인 중"} />
                    <MetaItem icon={Languages} text={job.language || "한국어/일본어"} />
                    <MetaItem icon={BadgeCheck} text={getJobLevelSummary(job)} />
                    <MetaItem icon={Briefcase} text={getJobSpecialty(job)} />
                    <MetaItem icon={MapPin} text={job.location || job.event_location || "장소 확인 중"} />
                  </div>
                </div>
                
                <div className="job-detail-hero-visual">
                  <div className="job-detail-visual-card">
                    <Sparkles size={22} />
                    <span>ON-LI</span>
                    <div className="job-detail-visual-orbit">
                      <ShieldCheck size={28} />
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* 메인 콘텐츠 영역 (2열 구조) */}
            <div className="job-detail-main-content">
              {/* 좌측 메인 정보 컬럼 */}
              <div className="job-main-column">
                
                {/* 공고 정보 카드 */}
                <section className="job-info-card">
                  <h2 className="job-detail-section-title">
                    <ClipboardList size={20} />
                    공고 정보
                  </h2>
                  <div className="job-info-grid">
                    <Info icon={Building2} label="기업명" value={job.company_name} />
                    <Info
                      icon={Calendar}
                      label="날짜"
                      value={formatDateRange(
                        job.start_date,
                        job.end_date,
                        job.event_date || job.date
                      )}
                    />
                    <Info icon={MapPin} label="장소" value={job.location || job.event_location} />
                    <Info icon={Languages} label="언어" value={job.language || "한국어/일본어"} />
                    <Info icon={BadgeCheck} label="필요 레벨" value={getJobLevelSummary(job)} />
                    <Info icon={Star} label="일급" value={getJobPayDisplay(job)} />
                    <Info icon={Users} label="모집 인원" value={getRecruitmentCountDisplay(job)} />
                    <Info icon={Briefcase} label="전문 분야" value={getJobSpecialty(job)} />
                    <Info icon={Clock} label="지원 마감일" value={job.deadline || "상시"} />
                    <Info icon={ShieldCheck} label="상태" value={getJobStatusLabel(job)} />
                  </div>

                  <div className="job-info-detail-sections">
                    <section className="job-detail-desc-section">
                      <h2 className="job-section-title">공고 정보</h2>
                      <div className="job-detail-desc-block">
                        <p>
                          {job.description ||
                            job.job_description ||
                            "ON-LI 운영팀이 행사 목적과 현장 난이도를 확인한 뒤 적합한 통역사를 매칭합니다."}
                        </p>
                      </div>
                    </section>

                    <section className="job-detail-desc-section">
                      <h2 className="job-section-title">이런 통역사를 찾고 있습니다</h2>
                      <div className="job-detail-desc-block">
                        <p>
                          {job.preference ||
                            `${getJobLevelSummary(job)} 역량을 바탕으로 한일 비즈니스 현장에서 안정적으로 소통할 수 있는 분을 찾고 있습니다.`}
                        </p>
                      </div>
                    </section>

                    <section className="job-detail-desc-section">
                      <h2 className="job-section-title">우대 사항 및 안내</h2>
                      <div className="job-detail-desc-block">
                        <p>
                          {job.dress_code ||
                            job.preferred_gender ||
                            "현장 성격과 기업 요청 사항에 맞춰 단정한 비즈니스 매너와 안정적인 커뮤니케이션 역량을 우대합니다."}
                        </p>
                      </div>
                    </section>

                    <section className="job-detail-desc-section">
                      <h2 className="job-section-title">추가 안내 사항</h2>
                      <div className="job-detail-desc-block">
                        <ul className="job-detail-bullets-list">
                          <li>요구 레벨에 맞는 일급 기준이 적용됩니다.</li>
                          <li>배정 완료 시 지원이 제한될 수 있습니다.</li>
                          <li>운영팀 확인 후 최종 연락드립니다.</li>
                        </ul>
                      </div>
                    </section>
                  </div>
                </section>
                
              </div>

              {/* 우측 사이드 패널 컬럼 */}
              <div className="job-side-column">
                <aside className="job-apply-sidebar">
                  <div className="job-apply-card">
                    <div className="job-apply-header">
                      <div className="job-apply-title-row">
                        <h2>
                          <Send size={20} />
                          지원하기
                        </h2>
                        <span className={`home-job-status ${normalizeJobStatus(job)}`}>
                          {getJobStatusLabel(job)}
                        </span>
                      </div>
                      <p>{canApplyToJob(job) ? "현재 지원 가능한 공고입니다." : "현재 지원 상태를 확인해주세요."}</p>
                    </div>

                    {submitted ? (
                      <div className="jobs-success-inline job-apply-state-box">
                        <h2>지원 완료</h2>
                        <p>지원이 완료되었습니다. 담당자가 검토 후 연락드립니다.</p>
                        <button type="button" onClick={onBackClick} className="jobs-create-btn">
                          공고 목록으로 돌아가기
                        </button>
                      </div>
                    ) : (
                      <>
                        {authLoading || profileLoading ? (
                          <div className="jobs-success-inline job-apply-state-box">
                            <h2>지원 자격 확인 중</h2>
                            <p>로그인 및 통역사 등록 정보를 확인하고 있습니다.</p>
                          </div>
                        ) : !user ? (
                          <div className="jobs-success-inline job-apply-state-box">
                            <h2>로그인이 필요합니다</h2>
                            <p>회원가입 및 로그인 후 통역 공고에 지원할 수 있습니다.</p>
                            <button type="button" onClick={onLoginClick} className="jobs-create-btn">
                              로그인 / 회원가입
                            </button>
                          </div>
                        ) : !interpreterProfile ? (
                          <div className="job-register-required-box">
                            <h2>통역사 등록이 필요합니다</h2>
                            <p>통역사 프로필 등록을 완료한 계정만 공고에 지원할 수 있습니다.</p>
                            <button type="button" onClick={onRegisterClick} className="job-register-outline-btn">
                              통역사 등록하기 <ArrowRight size={16} />
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleSubmit}>
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

                            <label>
                              <span>지원 메모</span>
                              <textarea
                                name="message"
                                value={form.message}
                                onChange={handleChange}
                                rows={5}
                                placeholder="비즈니스 현장 참여 경험 및 간략한 자기소개를 기재해주세요."
                                required
                              />
                            </label>

                            {errorMessage && <p className="jobs-error">{errorMessage}</p>}

                            <TermsAgreement
                              agreements={agreements}
                              onChange={handleAgreementChange}
                              role="interpreter"
                            />

                            <button
                              type="submit"
                              className="job-apply-submit-btn"
                              disabled={
                                submitting ||
                                !canApplyToJob(job) ||
                                !areTermsAgreed(agreements)
                              }
                            >
                              {canApplyToJob(job)
                                ? submitting
                                  ? "지원 중..."
                                  : (
                                    <>
                                      <Send size={18} />
                                      지원하기
                                    </>
                                  )
                                : getJobStatusLabel(job)}
                            </button>
                          </form>
                        )}
                        <div className="job-matching-note">
                          <ShieldCheck size={24} />
                          <strong>ON-LI MATCHING</strong>
                          <p>
                            레벨에 따라 프로젝트와 활동 조건이 달라지며,
                            지원 내용은 ON-LI 운영팀 검토 후 매칭에 반영됩니다.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </aside>
              </div>

            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, text }) {
  return (
    <span className="job-detail-meta-item">
      <Icon size={15} />
      {text}
    </span>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="job-info-row">
      <span className="job-info-icon">
        <Icon size={17} />
      </span>
      <span className="label">{label}</span>
      <span className="value">{value || "-"}</span>
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

export default JobDetail;
