import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";

function JobCard({ job, onApplyClick }) {
  const status = normalizeJobStatus(job);
  const canApply = canApplyToJob(job);
  const badge = getJobStatusLabel(job);

  return (
    <article className="home-job-card">
      <div>
        <span className={`home-job-status ${status === "closing_soon" ? "urgent" : status}`}>
          {badge}
        </span>
        <h3>{job.title || "공고 제목 미입력"}</h3>
      </div>

      <dl>
        <JobInfo label="장소" value={job.location} />
        <JobInfo label="날짜" value={job.date} />
        <JobInfo label="일급" value={job.pay} />
        <JobInfo label="언어" value={job.language} />
        <JobInfo label="레벨" value={job.level} />
        <JobInfo label="우대" value={job.preference} />
        <JobInfo label="인원" value={job.people} />
      </dl>

      <button type="button" onClick={onApplyClick} disabled={!canApply}>
        {canApply ? "지원하기" : "마감됨"}
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
