import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";

function JobCard({ job, onApplyClick }) {
  const status = normalizeJobStatus(job);
  const canApply = canApplyToJob(job);
  const badge = getJobStatusLabel(job);

  return (
    <article className="home-job-card">
      <div>
        <span className={`home-job-status ${status}`}>
          {badge}
        </span>
        <h3>{job.title || "공고 제목 미입력"}</h3>
      </div>

      <dl>
        <JobInfo label="장소" value={job.location || job.event_location} />
        <JobInfo
          label="날짜"
          value={formatDateRange(
            job.start_date,
            job.end_date,
            job.event_date || job.date
          )}
        />
        <JobInfo label="일급" value={job.pay} />
        <JobInfo label="언어" value={job.language} />
        <JobInfo label="레벨" value={job.level || job.requested_level} />
        <JobInfo label="우대" value={job.preference || job.field} />
        <JobInfo label="인원" value={job.people || job.people_count} />
      </dl>

      <button type="button" onClick={onApplyClick} disabled={!canApply}>
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

export default JobCard;
