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
import {
  JOB_STATUS,
  getApplicationAvailability,
  getApplicationAvailabilityLabel,
  getJobStatusLabel,
  isPublicJob,
  normalizeJobStatus,
} from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobLevelSummary, getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
import { attachPublicJobCounts } from "../utils/jobsApi";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import {
  ensureInterpreterAuthLink,
  pickCurrentUserInterpreterProfile,
} from "../utils/interpreterApproval";
import {
  DUPLICATE_APPLICATION_MESSAGE,
  findExistingJobApplication,
  getApplicationPhoneDisplay,
  getJobApplicationSubmitErrorMessage,
  getSupabaseErrorDetails,
  isDuplicateApplicationError,
  normalizeApplicationEmail,
  normalizeApplicationPhone,
} from "../utils/applicationContact";
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

function JobDetail({ jobId, isAdmin, onBackClick, onLoginClick, onRegisterClick, onHomeClick, onMypageClick }) {
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
  const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      setSubmitStatus({ type: "error", message: "공고 정보를 찾을 수 없습니다." });
      return;
    }

    setLoading(true);
    setSubmitStatus({ type: "error", message: "" });

    if (!publicSupabase) {
      setSubmitStatus({ type: "error", message: supabaseConfigError.message });
      setLoading(false);
      return;
    }

    const { data, error } = await publicSupabase
      .from("public_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      console.error("Supabase select error:", error);
      alert(error.message);
      setSubmitStatus({ type: "error", message: "공고 정보를 불러오지 못했습니다." });
      setLoading(false);
      return;
    }

    console.log("loaded jobs:", data ? [data] : []);

    if (!isPublicJob(data) && !isAdmin) {
      setJob(null);
      setSubmitStatus({ type: "error", message: "현재 공개되지 않은 통역공고입니다." });
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
    const availability = getApplicationAvailability(job);
    if (!availability.allowed) {
      setSubmitStatus({ type: "error", message: getApplicationAvailabilityLabel(availability) });
      return;
    }
    if (existingApplication) {
      setSubmitStatus({ type: "error", message: DUPLICATE_APPLICATION_MESSAGE });
      setSubmitted(true);
      return;
    }
    if (authLoading) {
      setSubmitStatus({ type: "error", message: "로그인 상태를 확인 중입니다." });
      return;
    }
    if (!user) {
      const message = "로그인 후 지원할 수 있습니다.";
      setSubmitStatus({ type: "error", message: message });
      alert(message);
      onLoginClick?.();
      return;
    }
    if (profileLoading) {
      setSubmitStatus({ type: "error", message: "통역사 등록 정보를 확인 중입니다." });
      return;
    }
    if (!interpreterProfile) {
      const message = "통역사 등록 후 지원할 수 있습니다.";
      setSubmitStatus({ type: "error", message: message });
      alert(message);
      onRegisterClick?.();
      return;
    }

    if (!hasRegisteredResume(interpreterProfile)) {
      const message = "이력서를 등록한 후 지원할 수 있습니다.";
      setSubmitStatus({ type: "error", message: message });
      alert(message);
      return;
    }

    if (!areTermsAgreed(agreements, { requireCancelPolicy: true })) {
      const message = "약관 동의 후 제출 가능합니다.";
      setSubmitStatus({ type: "error", message: message });
      alert(message);
      return;
    }

    if (import.meta.env.DEV) {
      console.debug("application consent state", {
        agreedTerms: agreements.agreedTerms,
        agreedPolicy: agreements.agreedPolicy,
        agreedCancelPolicy: agreements.agreedCancelPolicy,
      });
    }

    setSubmitting(true);
    submittingRef.current = true;
    setSubmitStatus({ type: "error", message: "" });

    try {
      if (!supabase) {
      setSubmitStatus({ type: "error", message: supabaseConfigError.message });
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
      setSubmitStatus({ type: "error", message: message });
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
    if (!job?.id) throw new Error("지원할 공고 정보를 찾을 수 없습니다.");
    if (!matchedInterpreter?.id) throw new Error("통역사 프로필 정보를 찾을 수 없습니다.");

    const application = {
      job_id: job.id,
      interpreter_id: matchedInterpreter.id,
      applicant_name: form.name.trim() || null,
      phone: applicantPhone || null,
      email: applicantEmail || null,
      message:
        [
          form.message,
          form.gender ? `성별: ${form.gender}` : "",
          form.japaneseLevel ? `일본어 수준: ${form.japaneseLevel}` : "",
          form.experience ? `통역 경험: ${form.experience}` : "",
        ]
          .filter(Boolean)
          .join("\n\n") || null,
      status: "pending",
      agreed_terms: Boolean(agreements.agreedTerms),
      agreed_policy: Boolean(agreements.agreedPolicy),
      agreed_cancel_policy: Boolean(agreements.agreedCancelPolicy),
      agreed_at: areTermsAgreed(agreements, { requireCancelPolicy: true }) ? agreedAt : null,
      cancel_policy_agreed_at: agreements.agreedCancelPolicy ? agreedAt : null,
    };

    const existingApplication = await findExistingJobApplication(supabase, {
      jobId: job.id,
      interpreterId: matchedInterpreter?.id,
      email: applicantEmail,
    });

    if (existingApplication) {
      setSubmitStatus({ type: "error", message: DUPLICATE_APPLICATION_MESSAGE });
      alert(DUPLICATE_APPLICATION_MESSAGE);
      setExistingApplication(existingApplication);
      setSubmitted(true);
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

      const { data, error } = await supabase
        .from("job_applications")
        .insert([application])
        .select(
          "id, agreed_terms, agreed_policy, agreed_cancel_policy, agreed_at, cancel_policy_agreed_at"
        )
        .single();

      if (error) {
        const errorDetails = getSupabaseErrorDetails(error);
        console.error("job_applications insert failed", {
          ...errorDetails,
          payload: import.meta.env.DEV
            ? application
            : { ...application, email: "[masked]", phone: "[masked]", message: "[masked]" },
        });
        throw error;
      }

      alert("지원이 완료되었습니다.");

      if (import.meta.env.DEV) console.debug("saved consent data", data);

      setSubmitted(true);
      setExistingApplication(data || { id: data?.id });
      setForm(initialForm);
      setAgreements(initialTermsAgreement);
      setSubmitStatus({ type: "success", message: "지원이 완료되었습니다." });
      setSubmitting(false);
      submittingRef.current = false;
    } catch (error) {
      console.error("지원 저장 실패:", getSupabaseErrorDetails(error));
      if (isDuplicateApplicationError(error)) {
        setSubmitStatus({ type: "error", message: DUPLICATE_APPLICATION_MESSAGE });
        alert(DUPLICATE_APPLICATION_MESSAGE);
        setExistingApplication({ id: "duplicate" });
        setSubmitted(true);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      const message = getJobApplicationSubmitErrorMessage(error);
      setSubmitStatus({ type: "error", message: message });
      alert(message);
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const applicationAvailability = getApplicationAvailability(job || {});

  return (
    <div className="job-detail-page">
      <div className="home-bg-glow" />
      <div className="job-detail-container">
        {loading ? (
          <MessageBox text="공고 정보를 불러오는 중입니다..." />
        ) : submitStatus.message && !job ? (
          <MessageBox text={submitStatus.message} />
        ) : (
          <div className="job-detail-layout">
            
            {/* 상단 헤더 영역 */}
            <header className="job-detail-hero">
              <div className="job-detail-hero-content">
                <div className="job-detail-hero-left">
                  <div className="job-detail-actions-row">
                    <button type="button" onClick={onHomeClick} className="jobs-back-btn">
                      <ArrowLeft size={16} />
                      메인으로
                    </button>
                    <button type="button" onClick={onBackClick} className="jobs-back-btn">
                      <ArrowLeft size={16} />
                      공고 목록으로
                    </button>
                  </div>

                  <button type="button" onClick={onHomeClick} className="mobile-back-link">
                    ← 메인으로
                  </button>
                  
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
                    <MetaItem icon={Building2} text="ON-LI 공개 공고" />
                    <MetaItem icon={Languages} text={job.language || "한국어/일본어"} />
                    <MetaItem icon={BadgeCheck} text={getJobLevelSummary(job)} />
                    <MetaItem icon={Briefcase} text={getJobSpecialty(job)} />
                    <MetaItem icon={MapPin} text={job.location || job.event_location || "장소 확인 중"} />
                  </div>
                </div>
                
                <div className="job-detail-hero-visual">
                  <div className="job-detail-visual-card job-detail-brand-card">
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
                <section className="job-detail-mobile-summary-card">
                  <div className="job-detail-mobile-summary-head">
                    <span className={`home-job-status ${normalizeJobStatus(job)}`}>
                      {getJobStatusLabel(job)}
                    </span>
                    <h2>{job.event_name || job.title || "공고 제목 미입력"}</h2>
                  </div>
                  <p className="job-detail-mobile-summary-date">
                    {formatDateRange(job.start_date, job.end_date, job.event_date || job.date)}
                  </p>
                  <p className="job-detail-mobile-summary-meta">
                    {(job.location || job.event_location || "장소 확인 중")} · {getRecruitmentCountDisplay(job)} · {getJobLevelBadgeLabel(job)}
                  </p>
                  <a className="job-detail-mobile-apply-link" href="#job-apply-section">
                    {getApplicationAvailabilityLabel(applicationAvailability)}
                  </a>
                </section>
                
                {/* 공고 정보 카드 */}
                <section className="job-info-card">
                  <h2 className="job-detail-section-title">
                    <ClipboardList size={20} />
                    공고 정보
                  </h2>
                  <div className="job-detail-mobile-info-slider" aria-label="공고 상세 정보">
                    <section className="job-detail-mobile-info-card">
                      <h3>근무 정보</h3>
                      <MobileInfo label="날짜" value={formatDateRange(job.start_date, job.end_date, job.event_date || job.date)} />
                      <MobileInfo label="장소" value={job.location || job.event_location} />
                      <MobileInfo label="언어" value={job.language || "한국어/일본어"} />
                      <MobileInfo label="모집인원" value={getRecruitmentCountDisplay(job)} />
                    </section>
                    <section className="job-detail-mobile-info-card">
                      <h3>조건</h3>
                      <MobileInfo label="필요 레벨" value={getJobLevelSummary(job)} />
                      <MobileInfo label="일급" value={getJobPayDisplay(job)} />
                      <MobileInfo label="전문 분야" value={getJobSpecialty(job)} />
                      <MobileInfo label="성별" value={job.preferred_gender} />
                    </section>
                    <section className="job-detail-mobile-info-card">
                      <h3>지원 정보</h3>
                      <MobileInfo label="지원 마감" value={job.deadline || "상시"} />
                      <MobileInfo label="상태" value={getJobStatusLabel(job)} />
                      <MobileInfo label="공고 구분" value="ON-LI 공개 공고" />
                    </section>
                  </div>
                  <div className="job-info-grid">
                    <Info icon={Building2} label="공고 구분" value="ON-LI 공개 공고" />
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
                          <li>레벨 기준 통역 단가가 적용됩니다.</li>
                          <li>배정 완료 시 지원이 제한될 수 있습니다.</li>
                          <li>운영팀 확인 후 최종 연락드립니다.</li>
                          <li>배정 확정 후 지원 취소 및 철회 시 취소 규정에 따라 위약금이 발생할 수 있습니다.</li>
                        </ul>
                      </div>
                    </section>
                  </div>
                </section>
                
              </div>

              {/* 우측 사이드 패널 컬럼 */}
              <div className="job-side-column">
                <aside className="job-apply-sidebar" id="job-apply-section">
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
                      <p>
                        {applicationAvailability.allowed && normalizeJobStatus(job) === JOB_STATUS.ASSIGNING
                          ? "배정 진행 중이며, 남은 인원에 한해 지원 가능합니다."
                          : applicationAvailability.allowed
                            ? "현재 지원 가능한 공고입니다."
                            : getApplicationAvailabilityLabel(applicationAvailability)}
                      </p>
                    </div>

                    {submitted ? (
                      <div className="jobs-success-inline job-apply-state-box">
                        <h2>지원된 통역공고입니다</h2>
                        <p>이미 지원한 통역공고입니다.</p>
                        <button type="button" className="job-apply-submit-btn" disabled>
                          지원된 통역공고입니다
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
                        ) : !hasRegisteredResume(interpreterProfile) ? (
                          <div className="job-register-required-box">
                            <h2>이력서 등록이 필요합니다</h2>
                            <p>통역 지원을 위해 이력서 등록이 필요합니다.</p>
                            <button type="button" onClick={onMypageClick} className="job-register-outline-btn">
                              이력서 등록하러 가기 <ArrowRight size={16} />
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleSubmit}>
                            <div className="interpreter-profile-summary-card">
                              <p className="summary-title">통역사 정보 자동 입력됨</p>
                              <div className="summary-details">
                                <span><strong>이름:</strong> {interpreterProfile.name}</span>
                                <span><strong>연락처:</strong> {getApplicationPhoneDisplay(interpreterProfile.phone)}</span>
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

                            {submitStatus.message && <p className={submitStatus.type === "success" ? "jobs-success" : "jobs-error"}>{submitStatus.message}</p>}

                            <TermsAgreement
                              agreements={agreements}
                              onChange={handleAgreementChange}
                              requireCancelPolicy
                              role="interpreter"
                            />

                            <button
                              type="submit"
                              className="job-apply-submit-btn"
                              disabled={
                                submitting ||
                                applicationCheckLoading ||
                                !applicationAvailability.allowed ||
                                !hasRegisteredResume(interpreterProfile) ||
                                !areTermsAgreed(agreements, { requireCancelPolicy: true })
                              }
                            >
                              {applicationAvailability.allowed
                                ? applicationCheckLoading
                                  ? "지원 여부 확인 중..."
                                  : submitting
                                  ? "지원 중..."
                                  : (
                                    <>
                                      <Send size={18} />
                                      지원하기
                                    </>
                                  )
                                : getApplicationAvailabilityLabel(applicationAvailability)}
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

function hasRegisteredResume(profile = {}) {
  return Boolean(
    String(profile.resume_url || "").trim() ||
      String(profile.resume_file_url || "").trim() ||
      String(profile.resume_file_name || "").trim()
  );
}

function MobileInfo({ label, value }) {
  return (
    <div className="job-detail-mobile-info-row">
      <span className="label">{label}</span>
      <span className="value">{value || "-"}</span>
    </div>
  );
}

function getJobLevelBadgeLabel(job = {}) {
  const level =
    job.requested_level ||
    job.preferred_level ||
    job.interpreter_level ||
    job.level ||
    job.target_level ||
    job.required_level ||
    "";
  const matched = String(level).match(/lv\s*(\d)/i);

  if (matched) return `Lv${matched[1]}`;
  return level || "레벨 협의";
}

export default JobDetail;
