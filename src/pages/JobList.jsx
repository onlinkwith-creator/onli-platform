import { useCallback, useEffect, useState } from "react";
import JobCard from "../components/JobCard";
import { supabase } from "../supabase";
import "./Home.css";
import "./Jobs.css";

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function JobList({ onBackClick, onApplyClick, onCreateJobClick, onDetailClick }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*");

      if (error) {
        console.error("Jobs fetch error:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        setErrorMessage(getSupabaseErrorMessage(error, "데이터를 불러오지 못했습니다."));
        setJobs([]);
        return;
      }

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
      <div className="home-bg-glow" />
      <div className="jobs-shell">
        <button type="button" onClick={onBackClick} className="jobs-back main-return-button">
          ← 메인으로
        </button>

        <header className="jobs-header jobs-list-header">
          <div>
            <p className="jobs-kicker">ON-LI JOBS</p>
            <h1>전체 통역 공고</h1>
            <p>공개된 한일 통역 공고를 확인하고 지원할 수 있습니다.</p>
          </div>
          <button
            type="button"
            className="jobs-create-button"
            onClick={onCreateJobClick}
          >
            통역 공고 등록
          </button>
        </header>

        {loading ? (
          <JobSkeletonGrid />
        ) : errorMessage ? (
          <div className="jobs-message-card error">
            <p>{errorMessage}</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="jobs-message-card empty">
            <div className="empty-icon">📂</div>
            <p>현재 표시할 데이터가 없습니다.</p>
          </div>
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

function JobSkeletonGrid() {
  return (
    <div className="jobs-card-grid">
      {[1, 2, 3].map((n) => (
        <div key={n} className="job-skeleton-card">
          <div className="skeleton-badge"></div>
          <div className="skeleton-title"></div>
          <div className="skeleton-company"></div>
          <div className="skeleton-info-row"></div>
          <div className="skeleton-info-row"></div>
          <div className="skeleton-info-row"></div>
          <div className="skeleton-button"></div>
        </div>
      ))}
    </div>
  );
}

export default JobList;
