import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobActivityFeeLabel, getJobSpecialty } from "../utils/jobDisplay";

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
        <JobInfo label="레벨 기준 활동비" value={<ActivityFee value={getJobActivityFeeLabel(job)} />} />
        <JobInfo label="분야" value={getJobSpecialty(job)} />
      </dl>

      <p className="home-job-level-note">레벨에 따라 프로젝트와 활동 조건이 달라집니다.</p>

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

function ActivityFee({ value }) {
  const [level, ...description] = String(value || "").split(" ");

  return (
    <span className="home-job-activity-fee">
      <strong>{level}</strong>
      <small>{description.join(" ")}</small>
    </span>
  );
}

export default JobCard;
