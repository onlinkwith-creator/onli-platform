import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatDateRange } from "../utils/dateRange";
import { getJobSpecialty } from "../utils/jobDisplay";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import { Calendar, MapPin, Users, Award, Briefcase } from "lucide-react";

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
        <div className={`home-job-status ${status}`}>
          {badge}
        </div>
        <p className="home-job-company">{job.company_name || "기업명 확인 중"}</p>
        <h3>{job.event_name || job.title || "공고 제목 미입력"}</h3>
      </div>

      <div className="home-job-info-list">
        <div className="home-job-info-item">
          <Calendar size={15} aria-hidden="true" />
          <span>{formatDateRange(job.start_date, job.end_date, job.event_date || job.date) || "-"}</span>
        </div>
        <div className="home-job-info-item">
          <MapPin size={15} aria-hidden="true" />
          <span>{job.location || job.event_location || "-"}</span>
        </div>
        <div className="home-job-info-item">
          <Users size={15} aria-hidden="true" />
          <span>{getRecruitmentCountDisplay(job) || "-"}</span>
        </div>
        <div className="home-job-info-item">
          <Award size={15} aria-hidden="true" />
          <span>{getRequiredLevelDisplay(job) || "-"}</span>
        </div>
        <div className="home-job-info-item">
          <Briefcase size={15} aria-hidden="true" />
          <span>{getJobSpecialty(job) || "-"}</span>
        </div>
      </div>

      <p className="home-job-level-note">Lv 기준 통역 단가 적용</p>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onApplyClick?.(job);
        }}
        disabled={!canApply}
        className={canApply ? "apply-btn-active" : "apply-btn-disabled"}
      >
        {canApply ? "지원하기" : badge}
      </button>
    </article>
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

export default JobCard;
