import { canApplyToJob, getJobStatusLabel, normalizeJobStatus } from "../utils/jobStatus";
import { formatCompactJobDateRange } from "../utils/dateRange";
import { getJobSpecialty } from "../utils/jobDisplay";
import { getRecruitmentCountDisplay } from "../utils/jobRecruitment";
import { Calendar, MapPin, Users, Award, Briefcase } from "lucide-react";

function JobCard({ job, onApplyClick, onDetailClick }) {
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
      className="home-job-card"
      role={onDetailClick ? "link" : undefined}
      tabIndex={onDetailClick ? 0 : undefined}
      onClick={openDetail}
      onKeyDown={onDetailClick ? handleKeyDown : undefined}
      aria-label={`${job.event_name || job.title || "통역 공고"} 상세 보기`}
    >
      <div className="home-job-card-body">
        <div>
          <div className="home-job-card-top">
            <div className={`home-job-status ${status}`}>
              {badge}
            </div>
            <span className="home-job-mobile-level">{levelLabel}</span>
          </div>
          <p className="home-job-company truncate">{job.company_name || "기업명 확인 중"}</p>
          <h3 className="truncate">{job.event_name || job.title || "공고 제목 미입력"}</h3>
          <p className="home-job-mobile-date">{dateLabel}</p>
          <p className="home-job-mobile-summary">{locationLabel} · {recruitmentLabel}</p>
          <p className="home-job-mobile-category">
            <Briefcase size={15} aria-hidden="true" />
            <span>{specialtyLabel}</span>
          </p>
        </div>

        <div className="home-job-info-list">
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

      <div className="home-job-card-action">
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
  const matched = String(level).match(/lv\s*(\d)/i);

  if (matched) return `Lv${matched[1]}`;
  return level || "운영팀 추천";
}

export default JobCard;
