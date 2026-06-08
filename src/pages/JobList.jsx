import { useCallback, useEffect, useMemo, useState } from "react";
import JobCard from "../components/JobCard";
import { supabase } from "../supabase";
import { normalizeJobStatus } from "../utils/jobStatus";
import "./Jobs.css";

const initialFilters = {
  field: "전체",
  region: "전체",
  level: "",
  date: "",
  status: "전체",
  keyword: "",
};

const regionOptions = [
  "전체", "도쿄", "가나가와", "치바", "사이타마", "오사카", "교토", "후쿠오카", "기타"
];

const fieldOptions = [
  "전체", "뷰티", "패션", "식품", "의료", "IT", "관광", "제조", "비즈니스", "기타"
];

const levelOptions = [
  { value: "", label: "전체" },
  { value: "LV1", label: "LV1" },
  { value: "LV2", label: "LV2" },
  { value: "LV3", label: "LV3" },
  { value: "LV4", label: "LV4" },
];

const statusOptions = [
  { value: "전체", label: "전체" },
  { value: "recruiting", label: "모집 중" },
  { value: "assigning", label: "배정 중" },
  { value: "closed", label: "배정 완료" },
];

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function JobList({ onBackClick, onApplyClick, onCreateJobClick, onDetailClick }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("latest");
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("visibility", "public");

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

  // Client-side filtering logic matching the premium specifications
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const keyword = filters.keyword.trim().toLowerCase();
      
      // Status Match (mapping database status)
      const jobStatus = normalizeJobStatus(job);
      const statusMatches =
        filters.status === "전체" ||
        (filters.status === "recruiting" && (jobStatus === "recruiting" || jobStatus === "open")) ||
        (filters.status === "assigning" && (jobStatus === "assigning" || jobStatus === "assigned")) ||
        (filters.status === "closed" && jobStatus === "closed");

      // Region Match
      const location = String(job.location || job.event_location || "").toLowerCase();
      const regionMatches =
        filters.region === "전체" ||
        location.includes(filters.region.toLowerCase()) ||
        (filters.region === "가나가와" && location.includes("카나가와"));

      // Field Specialty Match
      const specialty = String(job.specialty || job.category || "").toLowerCase();
      const fieldMatches =
        filters.field === "전체" ||
        specialty.includes(filters.field.toLowerCase()) ||
        (filters.field === "비즈니스" && specialty.includes("일반"));

      // Level Match
      const level = getRequiredLevelDisplay(job).toUpperCase();
      const levelMatches = !filters.level || level.includes(filters.level);

      // Date Match (filtering by month)
      const dateMatches = !filters.date || (() => {
        const selectedYearMonth = filters.date; // "YYYY-MM"
        const startStr = job.start_date || job.event_date || job.date || "";
        const endStr = job.end_date || job.event_date || job.date || "";
        if (!startStr) return false;
        return startStr.includes(selectedYearMonth) || endStr.includes(selectedYearMonth);
      })();

      // Keyword Text Match
      const searchStr = `${job.event_name || job.title || ""} ${job.company_name || ""} ${job.location || ""} ${job.requirements || ""}`.toLowerCase();
      const keywordMatches = !keyword || searchStr.includes(keyword);

      return statusMatches && regionMatches && fieldMatches && levelMatches && dateMatches && keywordMatches;
    });
  }, [jobs, filters]);

  // Reset page when filter or sort shifts
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Client-side sorting logic
  const sortedJobs = useMemo(() => {
    let result = [...filteredJobs];
    if (sortBy === "pay") {
      result.sort((a, b) => {
        const parsePay = (jb) => {
          const val = jb.pay || jb.dailyPay || jb.daily_pay || jb.wage || jb.price || "";
          const num = Number(String(val).replace(/[^0-9]/g, ""));
          return isNaN(num) ? 0 : num;
        };
        return parsePay(b) - parsePay(a);
      });
    } else {
      // default: latest
      result.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        return Number(b.id || 0) - Number(a.id || 0);
      });
    }
    return result;
  }, [filteredJobs, sortBy]);

  // Client-side pagination (9 cards per page)
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * 9;
    return sortedJobs.slice(start, start + 9);
  }, [sortedJobs, currentPage]);

  const totalPages = Math.ceil(sortedJobs.length / 9);

  const updateFilter = (name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  return (
    <div className="jobs-page">
      <div className="home-bg-glow" />
      <div className="jobs-shell">
        
        {/* Premium Recruiter Hero Section */}
        <div className="jobs-hero-container">
          <div className="jobs-hero-left">
            <button type="button" onClick={onBackClick} className="jobs-back-btn">
              ← 메인으로
            </button>
            <span className="jobs-kicker">ON-LI JOBS</span>
            <h1 className="jobs-hero-title">전체 통역 공고</h1>
            <p className="jobs-hero-subtitle">
              전시회·상담회·비즈니스 현장에 맞는<br />
              통역 공고를 확인하세요.
            </p>
          </div>

          <div className="jobs-hero-right">
            <div className="jobs-hero-illustration-wrapper">
              <button
                type="button"
                className="jobs-create-btn"
                onClick={onCreateJobClick}
              >
                통역공고 등록
              </button>

              <div className="jobs-hero-illustration">
                <div className="illustration-glow-circle-1" />
                <div className="illustration-glow-circle-2" />
                <div className="illustration-card-mockup">
                  <span className="mockup-badge">Recruiting</span>
                  <div className="mockup-lines">
                    <div className="mockup-line-1" />
                    <div className="mockup-line-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

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
          <>
            <div className="jobs-toolbar jobs-toolbar-mobile">
              <p className="jobs-result-text">
                총 {sortedJobs.length}개의 통역 공고가 표시됩니다
              </p>

              <div className="jobs-list-actions">
                <button
                  type="button"
                  className="jobs-filter-toggle"
                  onClick={() => setIsMobileFilterOpen((current) => !current)}
                  aria-expanded={isMobileFilterOpen}
                  aria-controls="jobs-filter-panel"
                >
                  필터
                </button>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="jobs-sort-select"
                >
                  <option value="latest">최신 등록순</option>
                  <option value="pay">일급 높은순</option>
                </select>
              </div>
            </div>

            {/* Glassmorphic Filters */}
            <div
              id="jobs-filter-panel"
              className={`jobs-filter-card ${isMobileFilterOpen ? "is-open" : "is-collapsed"}`}
            >
              <div className="jobs-filter-head">
                <h2 className="jobs-filter-title">통역 공고 검색 필터</h2>
                <button
                  type="button"
                  onClick={() => setFilters(initialFilters)}
                  className="jobs-reset-button"
                >
                  필터 초기화
                </button>
              </div>

              <div className="jobs-filter-grid">
                <FilterSelect
                  label="통역 분야"
                  value={filters.field}
                  onChange={(val) => updateFilter("field", val)}
                  options={fieldOptions}
                />
                <FilterSelect
                  label="활동 지역"
                  value={filters.region}
                  onChange={(val) => updateFilter("region", val)}
                  options={regionOptions}
                />
                <FilterSelect
                  label="요구 레벨"
                  value={filters.level}
                  onChange={(val) => updateFilter("level", val)}
                  options={levelOptions}
                />
                <label className="jobs-filter-field">
                  <span className="jobs-filter-label">날짜 선택</span>
                  <input
                    type="month"
                    value={filters.date}
                    onChange={(e) => updateFilter("date", e.target.value)}
                    className="jobs-filter-input"
                  />
                </label>
                <FilterSelect
                  label="모집 상태"
                  value={filters.status}
                  onChange={(val) => updateFilter("status", val)}
                  options={statusOptions}
                />
                <label className="jobs-filter-field">
                  <span className="jobs-filter-label">키워드 검색</span>
                  <input
                    value={filters.keyword}
                    onChange={(e) => updateFilter("keyword", e.target.value)}
                    placeholder="공고명, 기업명, 장소 검색"
                    className="jobs-filter-input"
                  />
                </label>
              </div>
            </div>

            <div className="jobs-toolbar jobs-toolbar-desktop">
              <p className="jobs-result-text">
                총 {sortedJobs.length}개의 통역 공고가 표시됩니다
              </p>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="jobs-sort-select"
              >
                <option value="latest">최신 등록순</option>
                <option value="pay">일급 높은순</option>
              </select>
            </div>

            {filteredJobs.length === 0 ? (
              <div className="jobs-message-card empty">
                <div className="empty-icon">📂</div>
                <p>현재 표시할 데이터가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="home-job-grid jobs-card-grid">
                  {paginatedJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      className="jobs-list-card"
                      onDetailClick={() => onDetailClick(job)}
                      onApplyClick={() => onApplyClick(job)}
                    />
                  ))}
                </div>

                {/* Circular Pagination buttons */}
                {totalPages > 1 && (
                  <div className="jobs-pagination">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="jobs-page-btn"
                    >
                      &lt;
                    </button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`jobs-page-btn ${currentPage === pageNum ? "active" : ""}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="jobs-page-btn"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="jobs-filter-field">
      <span className="jobs-filter-label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="jobs-filter-input"
      >
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
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

function getRequiredLevelDisplay(job = {}) {
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
  return level || "운영팀 추천";
}

export default JobList;
