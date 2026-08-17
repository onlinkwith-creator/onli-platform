import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatCompactJobDateRange } from "../utils/dateRange";
import { getJobSpecialty } from "../utils/jobDisplay";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import { Calendar, MapPin, Users, Award, Briefcase } from "lucide-react";

function JobCard({ job, onApplyClick, onDetailClick, className = "" }) {
  const status = normalizeJobStatus(job);
  const canApply = canApplyToJob(job);
  const badge = getJobStatusLabel(job);
  const dateLabel = formatCompactJobDateRange(job.start_date, job.end_date, job.event_date || job.date) || "-";
  const locationLabel = job.location || job.event_location || "-";
  const recruitmentLabel = getRecruitmentCountDisplay(job) || "-";
  const levelLabel = getRequiredLevelDisplay(job) || "-";
  const specialtyLabel = getJobSpecialty(job) || "-";
  const openDetail = () => onDetailClick?.(job);
  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <article
      className={`home-job-card job-card${className ? ` ${className}` : ""}`}
      role={onDetailClick ? "link" : undefined}
      tabIndex={onDetailClick ? 0 : undefined}
      onClick={openDetail}
      onKeyDown={onDetailClick ? handleKeyDown : undefined}
      aria-label={`${job.event_name || job.title || "통역 공고"} 상세 보기`}
    >
      <div className="home-job-card-body job-card-body">
        <div>
          <div className="home-job-card-top">
            <div className={`home-job-status ${status}`}>
              {badge}
            </div>
          </div>
          <p className="home-job-company truncate">ON-LI 공개 공고</p>
          <h3 className="truncate">{job.event_name || job.title || "공고 제목 미입력"}</h3>
        </div>

        <div className="home-job-info-list job-info-list">
          <div className="home-job-info-item min-w-0">
            <Calendar size={15} aria-hidden="true" />
            <span className="truncate">{dateLabel}</span>
          </div>
          <div className="home-job-info-item min-w-0">
            <MapPin size={15} aria-hidden="true" />
            <span className="truncate">{locationLabel}</span>
          </div>
          <div className="home-job-info-item min-w-0">
            <Users size={15} aria-hidden="true" />
            <span className="truncate">{recruitmentLabel}</span>
          </div>
          <div className="home-job-info-item min-w-0">
            <Award size={15} aria-hidden="true" />
            <span className="truncate">{levelLabel}</span>
          </div>
          <div className="home-job-info-item min-w-0">
            <Briefcase size={15} aria-hidden="true" />
            <span className="truncate">{specialtyLabel}</span>
          </div>
        </div>
      </div>

      <div className="job-divider job-card-divider" />

      <div className="home-job-card-action job-card-footer">
        <p className="home-job-level-note">레벨 기준 통역 단가 적용</p>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onApplyClick?.(job);
          }}
          disabled={!canApply}
          className={canApply ? "apply-btn-active job-card-actions" : "apply-btn-disabled job-card-actions"}
        >
          {canApply ? "지원하기" : badge}
        </button>
      </div>
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
  const matched = String(level).match(/(?:lv|level)?\s*([1-4])/i);

  if (matched) return `Lv ${matched[1]}`;
  return level || "운영팀 추천";
}

export default JobCard;
