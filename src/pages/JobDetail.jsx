import { useCallback, useEffect, useState } from "react";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../components/TermsAgreement";
import { supabase, supabaseConfigError } from "../supabase";
import { canApplyToJob, getJobStatusLabel, isPublicJob } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobLevelSummary, getJobPayDisplay, getJobSpecialty } from "../utils/jobDisplay";
import { attachPublicJobCounts } from "../utils/jobsApi";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import "./Jobs.css";

const initialForm = {
  applicantName: "",
  applicantPhone: "",
  applicantEmail: "",
  message: "",
};

// TODO: 실서비스 전에는 Supabase Auth 기반으로 통역사 본인 계정만 지원 가능하게 해야 함.

function JobDetail({ jobId, onBackClick, onApplyClick }) {
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

    const [jobWithCounts] = await attachPublicJobCounts(supabase, [data]);
    setJob(jobWithCounts || data);
    setLoading(false);
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

    try {
      const { error } = await supabase.from("job_applications").insert([
        {
          job_id: job.id,
          applicant_name: form.applicantName,
          phone: form.applicantPhone,
          email: form.applicantEmail,
          message: form.message,
          status: "지원완료",
          agreed_terms: true,
          agreed_policy: true,
          agreed_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        if (isAgreementColumnError(error)) {
          console.error("약관 동의 저장 실패:", error);
        }
        throw error;
      }

      setSubmitted(true);
      setForm(initialForm);
      setAgreements(initialTermsAgreement);
    } catch (error) {
      console.error("지원 실패:", error);
      const message = error?.message || "지원 접수에 실패했습니다. 입력값을 확인해주세요.";
      setErrorMessage(message);
      alert("제출에 실패했습니다.");
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
              <div className="job-detail-title-row">
                <p className="jobs-kicker">JOB DETAIL</p>
                <span className="job-detail-status">{getJobStatusLabel(job)}</span>
              </div>
              <h1>{job.event_name || job.title || "공고 제목 미입력"}</h1>
              <p className="job-detail-lead">
                {job.company_name || "기업명 확인 중"} ·{" "}
                {job.language || "한국어/일본어"} · {getJobLevelSummary(job)}
              </p>

              <div className="job-detail-grid">
                <Info label="기업명" value={job.company_name} />
                <Info
                  label="날짜"
                  value={formatDateRange(
                    job.start_date,
                    job.end_date,
                    job.event_date || job.date
                  )}
                />
                <Info label="장소" value={job.location || job.event_location} />
                <Info label="언어" value={job.language || "한국어/일본어"} />
                <Info label="필요 레벨" value={getJobLevelSummary(job)} />
                <Info label="일급" value={getJobPayDisplay(job)} />
                <Info label="모집 인원" value={getRecruitmentCountDisplay(job)} />
                <Info label="전문 분야" value={getJobSpecialty(job)} />
                <Info label="지원 마감일" value={job.deadline || "상시"} />
                <Info label="상태" value={getJobStatusLabel(job)} />
              </div>

              <p className="job-detail-level-note">
                요구 레벨에 맞는 일급 기준이 적용됩니다.
              </p>

              <section>
                <h2>행사 설명</h2>
                <p>
                  {job.description ||
                    job.job_description ||
                    "ON-LI 운영팀이 행사 목적과 현장 난이도를 확인한 뒤 적합한 통역사를 매칭합니다."}
                </p>
              </section>

              <section>
                <h2>이런 통역사를 찾고 있습니다</h2>
                <p>
                  {job.preference ||
                    `${getJobLevelSummary(job)} 역량을 바탕으로 한일 비즈니스 현장에서 안정적으로 소통할 수 있는 분을 찾고 있습니다.`}
                </p>
              </section>

              <section className="job-detail-process">
                <h2>진행 일정</h2>
                <div>
                  <span>공고 확인</span>
                  <span>운영팀 검토</span>
                  <span>최종 배정</span>
                  <span>현장 안내</span>
                </div>
              </section>

              <section>
                <h2>우대 사항 및 안내</h2>
                <p>{job.dress_code || job.preferred_gender || "상세 안내는 매칭 확정 후 운영팀을 통해 전달됩니다."}</p>
              </section>
            </article>

            <aside className="job-apply-card">
              <div className="job-apply-summary">
                <p className="jobs-kicker">ON-LI MATCHING</p>
                <h2>{canApplyToJob(job) ? "지원 가능한 공고입니다" : getJobStatusLabel(job)}</h2>
                <p>레벨에 따라 프로젝트와 활동 조건이 달라지며, 지원 내용은 ON-LI 운영팀 검토 후 매칭에 반영됩니다.</p>
                <button
                  type="button"
                  onClick={() => onApplyClick?.(job)}
                  disabled={!canApplyToJob(job)}
                >
                  {canApplyToJob(job) ? "지원 페이지로 이동" : getJobStatusLabel(job)}
                </button>
              </div>
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

                    <TermsAgreement
                      agreements={agreements}
                      onChange={handleAgreementChange}
                      role="interpreter"
                    />

                    <p className="jobs-notice">
                      지원 내용은 ON-LI 운영팀을 통해 전달됩니다.
                    </p>

                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !canApplyToJob(job) ||
                        !areTermsAgreed(agreements)
                      }
                    >
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

function isAgreementColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|column|schema cache/i.test(error?.message || "")
  );
}

export default JobDetail;
