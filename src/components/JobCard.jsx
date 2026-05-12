import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobSpecialty } from "../utils/jobDisplay";

function JobCard({ job, onApplyClick, onDetailClick }) {
  const status = normalizeJobStatus(job);
  const canApply = canApplyToJob(job);
  const badge = getJobStatusLabel(job);
  const openDetail = () => onDetailClick?.(job);
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <article
      className="home-job-card"
      role={onDetailClick ? "link" : undefined}
      tabIndex={onDetailClick ? 0 : undefined}
      onClick={openDetail}
      onKeyDown={onDetailClick ? handleKeyDown : undefined}
      aria-label={`${job.event_name || job.title || "통역 공고"} 상세 보기`}
    >
      <div>
        <span className={`home-job-status ${status}`}>
          {badge}
        </span>
        <h3>{job.event_name || job.title || "공고 제목 미입력"}</h3>
        <p className="home-job-company">{job.company_name || "기업명 확인 중"}</p>
      </div>

      <dl>
        <JobInfo
          label="날짜"
          value={formatDateRange(
            job.start_date,
            job.end_date,
            job.event_date || job.date
          )}
        />
        <JobInfo label="장소" value={job.location || job.event_location} />
        <JobInfo label="모집 인원" value={getRecruitmentCountDisplay(job)} />
        <JobInfo label="분야" value={getJobSpecialty(job)} />
      </dl>

      <p className="home-job-level-note">요구 레벨 기준 일급 적용</p>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onApplyClick?.(job);
        }}
        disabled={!canApply}
      >
        {canApply ? "지원하기" : badge}
      </button>
    </article>
  );
}

function JobInfo({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "-"}</dd>
    </div>
  );
}

function getRecruitmentCountDisplay(job) {
  return `${getMatchedCount(job)}/${getTotalPeopleCount(job)}`;
}

function getMatchedCount(job) {
  return getPositiveInteger(
    job.matched_count ?? job.matchedCount ?? job.matched_applications_count,
    0
  );
}

function getTotalPeopleCount(job) {
  return getPositiveInteger(job.people_count ?? job.people, 1);
}

function getPositiveInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value)) || fallback;
  }

  const parsed = String(value ?? "").match(/\d+/)?.[0];
  if (!parsed) return fallback;

  return Math.max(0, Number.parseInt(parsed, 10)) || fallback;
}

export default JobCard;
