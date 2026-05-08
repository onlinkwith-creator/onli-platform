import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./Jobs.css";

function JobList({ onBackClick, onJobClick }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("requests")
      .select("*")
      .eq("is_public", true)
      .in("status", ["pending", "matching"])
      .gte("event_date", today)
      .order("event_date", { ascending: true });

    if (error) {
      console.error(error);
      setErrorMessage("통역 공고를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    setJobs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(fetchJobs);
  }, [fetchJobs]);

  return (
    <div className="jobs-page">
      <div className="jobs-shell">
        <button type="button" onClick={onBackClick} className="jobs-back">
          ← 메인으로
        </button>

        <header className="jobs-header">
          <p className="jobs-kicker">ON-LI JOBS</p>
          <h1>통역 공고</h1>
          <p>공개된 한일 통역 의뢰를 확인하고 지원할 수 있습니다.</p>
        </header>

        {loading ? (
          <MessageBox text="공고를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : jobs.length === 0 ? (
          <MessageBox text="현재 공개된 통역 공고가 없습니다." />
        ) : (
          <div className="jobs-grid">
            {jobs.map((job) => (
              <article key={job.id} className="job-card">
                <div className="job-card-head">
                  <div>
                    <span>{job.required_level || "레벨 협의"}</span>
                    <h2>{job.event_name || "행사명 미입력"}</h2>
                  </div>
                  <strong>{formatKRW(job.interpreter_fee || job.interpreter_price)}</strong>
                </div>

                <dl>
                  <Info label="날짜" value={job.event_date} />
                  <Info label="장소" value={job.event_location} />
                  <Info label="분야" value={job.job_field || "한일 비즈니스 통역"} />
                  <Info
                    label="필요 인원"
                    value={job.required_count ? `${job.required_count}명` : "협의"}
                  />
                </dl>

                <p>{job.job_description || job.request_detail || "업무 내용 협의"}</p>

                <button type="button" onClick={() => onJobClick(job)}>
                  공고 상세 보기
                </button>
              </article>
            ))}
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

export default JobList;
