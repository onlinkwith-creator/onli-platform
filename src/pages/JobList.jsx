import { useCallback, useEffect, useState } from "react";
import JobCard from "../components/JobCard";
import { supabase } from "../supabase";
import { fetchPublicJobs } from "../utils/jobsApi";
import "./Home.css";
import "./Jobs.css";

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function JobList({ onBackClick, onApplyClick, onDetailClick }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await fetchPublicJobs(supabase);

      if (error) throw error;

      setJobs(data || []);
    } catch (error) {
      console.error("jobs fetch error:", error);
      setJobs([]);
      setErrorMessage(
        getSupabaseErrorMessage(error, "통역 공고를 불러오지 못했습니다.")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(fetchJobs);
  }, [fetchJobs]);

  return (
    <div className="jobs-page">
      <div className="jobs-shell">
        <button type="button" onClick={onBackClick} className="jobs-back main-return-button">
          ← 메인으로
        </button>

        <header className="jobs-header">
          <p className="jobs-kicker">ON-LI JOBS</p>
          <h1>전체 통역 공고</h1>
          <p>공개된 한일 통역 공고를 확인하고 지원할 수 있습니다.</p>
        </header>

        {loading ? (
          <MessageBox text="공고를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : jobs.length === 0 ? (
          <MessageBox text="현재 등록된 공고가 없습니다." />
        ) : (
          <div className="home-job-grid jobs-card-grid">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onDetailClick={() => onDetailClick(job)}
                onApplyClick={() => onApplyClick(job)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBox({ text }) {
  return <div className="jobs-message">{text}</div>;
}

export default JobList;
