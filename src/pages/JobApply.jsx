import { useCallback, useEffect, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import { canApplyToJob, getJobStatusLabel, isPublicJob } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
import { sendAdminAutoEmail, sendAutoEmail } from "../lib/email";
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
    if (submitting || submitted) return;
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
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setSubmitting(false);
      return;
    }

    const application = {
      job_id: job.id,
      applicant_name: form.name,
      phone: form.phone,
      email: form.email,
      message: [
        form.message,
        form.gender ? `성별: ${form.gender}` : "",
        form.japaneseLevel ? `일본어 수준: ${form.japaneseLevel}` : "",
        form.experience ? `통역 경험: ${form.experience}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: "지원완료",
      agreed_terms: true,
      agreed_policy: true,
      agreed_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase.from("job_applications").insert([application]);

      if (error) {
        if (isAgreementColumnError(error)) {
          console.error("약관 동의 저장 실패:", error);
        }
        console.error("지원 실패:", error);
        throw error;
      }

      const emailPayload = {
        name: form.name,
        jobTitle: job.title || "공고 제목 미입력",
        date: formatDateRange(job.start_date, job.end_date, job.event_date || job.date),
        email: form.email,
        phone: form.phone,
        levelOrExperience: [form.japaneseLevel, form.experience]
          .filter(Boolean)
          .join(" / "),
      };

      void Promise.all([
        sendAutoEmail("job_applied_user", form.email, emailPayload),
        sendAdminAutoEmail("job_applied_admin", emailPayload),
      ]);

      setSubmitted(true);
      setForm(initialForm);
      setAgreements(initialTermsAgreement);
    } catch (error) {
      console.error("지원 실패:", error);
      const message = error?.message || "지원서 제출에 실패했습니다. 입력값을 확인해주세요.";
      setErrorMessage(message);
      alert("제출에 실패했습니다.");
      setSubmitting(false);
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

export default JobApply;
