import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./Jobs.css";

const initialForm = {
  applicantName: "",
  applicantEmail: "",
  message: "",
};

// TODO: 실서비스 전에는 Supabase Auth 기반으로 통역사 본인 계정만 지원 가능하게 해야 함.

function JobDetail({ jobId, onBackClick }) {
  const [job, setJob] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJob = useCallback(async () => {
    if (!jobId) {
      setLoading(false);
      setErrorMessage("공고 정보를 찾을 수 없습니다.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .eq("id", jobId)
      .eq("is_public", true)
      .in("status", ["pending", "matching"])
      .gte("event_date", today)
      .single();

    if (error) {
      console.error(error);
      setErrorMessage("공고 정보를 불러오지 못했습니다.");
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

    if (!job) return;

    setSubmitting(true);
    setErrorMessage("");

    const { error } = await supabase.from("request_applications").insert([
      {
        request_id: job.id,
        applicant_name: form.applicantName,
        applicant_email: form.applicantEmail,
        message: form.message,
        status: "pending",
      },
    ]);

    setSubmitting(false);

    if (error) {
      console.error(error);
      setErrorMessage(
        error.code === "23505"
          ? "이미 같은 이메일로 지원한 공고입니다."
          : "지원 접수에 실패했습니다. 입력값을 확인해주세요."
      );
      return;
    }

    alert("지원이 접수되었습니다.");
    setForm(initialForm);
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
              <h1>{job.event_name || "행사명 미입력"}</h1>
              <p className="job-detail-lead">
                {job.client_visible_name || "기업명 비공개"} ·{" "}
                {job.job_field || "한일 비즈니스 통역"}
              </p>

              <div className="job-detail-grid">
                <Info label="행사 날짜" value={job.event_date} />
                <Info label="장소" value={job.event_location} />
                <Info
                  label="시간"
                  value={job.work_hours ? `${job.work_hours}시간` : "협의"}
                />
                <Info
                  label="필요 인원"
                  value={job.required_count ? `${job.required_count}명` : "협의"}
                />
                <Info label="통역 레벨" value={job.required_level || "협의"} />
                <Info
                  label="지급 예정 금액"
                  value={formatKRW(job.interpreter_fee || job.interpreter_price)}
                />
                <Info label="지원 마감일" value={job.deadline || "상시"} />
                <Info label="상태" value={job.status || "pending"} />
              </div>

              <section>
                <h2>업무 내용</h2>
                <p>{job.job_description || job.request_detail || "업무 내용 협의"}</p>
              </section>

              <section>
                <h2>복장/주의사항</h2>
                <p>{job.dress_code || "추후 안내"}</p>
              </section>
            </article>

            <aside className="job-apply-card">
              <h2>지원하기</h2>
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

                <button type="submit" disabled={submitting}>
                  {submitting ? "지원 접수 중..." : "지원하기"}
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

function formatKRW(value) {
  const number = Number(value || 0);
  return number > 0 ? `₩${number.toLocaleString()}` : "금액 협의";
}

export default JobDetail;
