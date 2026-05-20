import { useCallback, useEffect, useRef, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import { canApplyToJob, getJobStatusLabel, isPublicJob } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
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

function JobApply({ jobId, onBackClick, onSubmitSuccess, onHomeClick }) {
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
      setErrorMessage("지원할 공고 정보를 찾을 수 없습니다.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      if (!supabase) throw supabaseConfigError;

      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (error) throw error;

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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAgreementChange = (name, checked) => {
    setAgreements((current) => ({ ...current, [name]: checked }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log("JOB APPLY SUBMIT START");
    console.log("JOB APPLY FORM DATA", form);

    if (submittingRef.current || submitting || submitted) return;
    if (!job) return;
    if (!canApplyToJob(job)) {
      setErrorMessage("지원할 수 없는 공고입니다.");
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

    const matchedInterpreter = await findInterpreterByEmail(applicantEmail);
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
    const managementConfig = MANAGEMENT_NUMBER_CONFIG.job_applications;

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

      console.log("JOB APPLY BEFORE DB INSERT");
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

      console.log("JOB APPLY DB INSERT RESULT", {
        data,
        error,
      });

      if (error) {
        if (isAgreementColumnError(error)) {
          console.error("약관 동의 저장 실패:", error);
        }
        console.error("JOB APPLY DB INSERT ERROR", error);
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
        jobTitle: job.title || "공고 제목 미입력",
        date: formatDateRange(job.start_date, job.end_date, job.event_date || job.date),
        email: form.email,
        phone: form.phone,
        levelOrExperience: [form.japaneseLevel, form.experience]
          .filter(Boolean)
          .join(" / "),
      };
      console.log("JOB APPLICATION SUCCESS - START EMAILS", applicantEmail);
      console.log("JOB APPLY START EMAIL FLOW");
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
        console.log("JOB APPLY ADMIN EMAIL START");
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
      const message = error?.message || "지원서 제출에 실패했습니다. 입력값을 확인해주세요.";
      setErrorMessage(message);
      alert("제출에 실패했습니다.");
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
            <h1>지원 완료</h1>
            <p>지원이 완료되었습니다. 담당자가 검토 후 연락드립니다.</p>
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
              <form onSubmit={handleSubmit}>
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
                  role="interpreter"
                />

                <p className="jobs-notice">
                  제출된 지원서는 ON-LI 운영팀 검토 후 공고 담당자에게 전달됩니다.
                </p>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    submitted ||
                    !canApplyToJob(job) ||
                    !areTermsAgreed(agreements)
                  }
                >
                  {!canApplyToJob(job)
                    ? "마감됨"
                    : submitting
                      ? "제출 중..."
                      : "제출하기"}
                </button>
              </form>
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

async function findInterpreterByEmail(email) {
  if (!email || !supabase) return null;

  const { data, error } = await supabase
    .from("interpreters")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.warn("지원자 통역사 정보 확인 실패:", error);
    return null;
  }

  return data || null;
}

export default JobApply;
