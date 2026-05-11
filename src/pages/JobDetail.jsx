import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import { canApplyToJob, getJobStatusLabel, isPublicJob } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import "./Jobs.css";

const initialForm = {
  applicantName: "",
  applicantPhone: "",
  applicantEmail: "",
  message: "",
};

// TODO: 실서비스 전에는 Supabase Auth 기반으로 통역사 본인 계정만 지원 가능하게 해야 함.

function JobDetail({ jobId, onBackClick }) {
  const [job, setJob] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("공고 정보를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    if (!isPublicJob(data)) {
      setJob(null);
      setErrorMessage("지원할 수 없는 공고입니다.");
      setLoading(false);
      return;
    }

    setJob(data);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    queueMicrotask(fetchJob);
  }, [fetchJob]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting || submitted) return;

    if (!job) return;
    if (!canApplyToJob(job)) {
      setErrorMessage("지원할 수 없는 공고입니다.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.from("job_applications").insert([
        {
          job_id: job.id,
          applicant_name: form.applicantName,
          phone: form.applicantPhone,
          email: form.applicantEmail,
          message: form.message,
          status: "지원완료",
        },
      ]);

      if (error) throw error;

      setSubmitted(true);
      setForm(initialForm);
    } catch (error) {
      console.error("지원 실패:", error);
      const message = error?.message || "지원 접수에 실패했습니다. 입력값을 확인해주세요.";
      setErrorMessage(message);
      alert(message);
      setSubmitting(false);
    }
  };

  return (
    <div className="jobs-page">
      <div className="jobs-shell">
        <button type="button" onClick={onBackClick} className="jobs-back">
          ← 공고 목록으로
        </button>

        {loading ? (
          <MessageBox text="공고 정보를 불러오는 중입니다..." />
        ) : errorMessage && !job ? (
          <MessageBox text={errorMessage} />
        ) : (
          <div className="job-detail-layout">
            <article className="job-detail-card">
              <p className="jobs-kicker">JOB DETAIL</p>
              <h1>{job.title || job.event_name || "공고 제목 미입력"}</h1>
              <p className="job-detail-lead">
                {job.location || job.event_location || "장소 협의"} ·{" "}
                {job.language || job.field || "한일 비즈니스 통역"}
              </p>

              <div className="job-detail-grid">
                <Info
                  label="일정"
                  value={formatDateRange(
                    job.start_date,
                    job.end_date,
                    job.event_date || job.date
                  )}
                />
                <Info label="장소" value={job.location || job.event_location} />
                <Info label="일급" value={job.pay} />
                <Info label="필요 인원" value={job.people || job.people_count} />
                <Info label="통역 레벨" value={job.level || job.requested_level || "협의"} />
                <Info label="지원 마감일" value={job.deadline || "상시"} />
                <Info label="상태" value={getJobStatusLabel(job)} />
              </div>

              <section>
                <h2>업무 내용</h2>
                <p>{job.job_description || job.preference || "업무 내용 협의"}</p>
              </section>

              <section>
                <h2>복장/주의사항</h2>
                <p>{job.dress_code || job.preferred_gender || "추후 안내"}</p>
              </section>
            </article>

            <aside className="job-apply-card">
              {submitted ? (
                <div className="jobs-success-inline">
                  <h2>지원 완료</h2>
                  <p>지원이 완료되었습니다. 담당자가 검토 후 연락드립니다.</p>
                  <button type="button" onClick={onBackClick}>
                    공고 목록으로 돌아가기
                  </button>
                </div>
              ) : (
                <>
                  <h2>{canApplyToJob(job) ? "지원하기" : getJobStatusLabel(job)}</h2>
                  <form onSubmit={handleSubmit}>
                    <label>
                      <span>이름</span>
                      <input
                        name="applicantName"
                        value={form.applicantName}
                        onChange={handleChange}
                        required
                      />
                    </label>
                    <label>
                      <span>연락처</span>
                      <input
                        name="applicantPhone"
                        value={form.applicantPhone}
                        onChange={handleChange}
                        required
                      />
                    </label>
                    <label>
                      <span>이메일(optional)</span>
                      <input
                        name="applicantEmail"
                        type="email"
                        value={form.applicantEmail}
                        onChange={handleChange}
                      />
                    </label>
                    <label>
                      <span>지원 메시지</span>
                      <textarea
                        name="message"
                        value={form.message}
                        onChange={handleChange}
                        rows={5}
                        required
                      />
                    </label>

                    {errorMessage && <p className="jobs-error">{errorMessage}</p>}

                    <p className="jobs-notice">
                      지원 내용은 ON-LI 운영팀을 통해 전달됩니다.
                    </p>

                    <button type="submit" disabled={submitting || !canApplyToJob(job)}>
                      {canApplyToJob(job)
                        ? submitting
                          ? "지원 중..."
                          : "지원하기"
                        : getJobStatusLabel(job)}
                </button>
                  </form>
                </>
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

export default JobDetail;
