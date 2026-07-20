import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Calendar,
  CircleCheck,
  Languages,
  MapPin,
  ShieldCheck,
  Star,
  Tag,
} from "lucide-react";
import { getLevelBadgeClass, normalizeLevel } from "../utils/levelBadge";
import { isOnliCertified } from "../utils/publicInterpreter";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusBadgeClass,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import { mergeRegions } from "../utils/regions";
import "./InterpreterDetail.css";

const DEFAULT_INTRO =
  "전시회·상담회·비즈니스 미팅 등 다양한 분야에서 정확하고 신뢰도 높은 통역을 제공합니다.";
const CONSULTATION_FALLBACK = "자세한 내용은 상담 후 안내드리겠습니다.";
const EMPTY_TEXT = "미입력";

function InterpreterDetail({ interpreter, onBackClick, onRequestClick }) {
  if (!interpreter) {
    return (
      <main className="interpreter-detail-page">
        <MessageBox text="통역사 정보를 찾을 수 없습니다." />
      </main>
    );
  }

  const profile = getProfile(interpreter);

  return (
    <main className="interpreter-detail-page">
      <div className="interpreter-detail-container">
        <button type="button" onClick={onBackClick} className="interpreter-detail-back">
          <ArrowLeft size={17} aria-hidden="true" />
          메인으로 돌아가기
        </button>

        <ProfileHero
          interpreter={interpreter}
          profile={profile}
          onRequestClick={onRequestClick}
        />

        <InfoMetricGrid profile={profile} />

        <div className="interpreter-detail-content-grid">
          <ExperienceCard profile={profile} />
          <AboutCard profile={profile} />
        </div>

        <ProfileCTA
          interpreter={interpreter}
          name={profile.name}
          onBackClick={onBackClick}
          onRequestClick={onRequestClick}
        />
      </div>
    </main>
  );
}

function ProfileHero({ interpreter, profile, onRequestClick }) {
  return (
    <section className="profile-hero-card" aria-labelledby="interpreter-profile-title">
      <div className="profile-hero-main">
        {isOnliCertified(interpreter) && (
          <div className="profile-verified-kicker">
            <BadgeCheck size={17} aria-hidden="true" />
            <span>⭐ ON-LI 인증 통역사</span>
            <em>ON-LI CERTIFIED</em>
          </div>
        )}

        <h1 id="interpreter-profile-title">{profile.name}</h1>
        <p className="profile-summary">{profile.summary}</p>

        <div className="profile-badge-row" aria-label="핵심 프로필 정보">
          {profile.heroBadges.map((badge) => (
            <span key={badge} className="profile-chip">
              {badge}
            </span>
          ))}
        </div>

        <p className="profile-intro">{profile.intro}</p>
      </div>

      <aside className="profile-hero-side" aria-label="프로필 인증 및 의뢰">
        <div className={`profile-level-badge ${getLevelBadgeClass(interpreter.level)}`}>
          {isOnliCertified(interpreter) ? (
            <>
              <ShieldCheck size={30} aria-hidden="true" />
              <span>ON-LI 인증</span>
            </>
          ) : (
            <>
              <Languages size={30} aria-hidden="true" />
              <span>INTERPRETER</span>
            </>
          )}
          <strong>{profile.level}</strong>
        </div>
        <span className={`profile-status-badge ${profile.statusClass}`}>
          <span aria-hidden="true" />
          {profile.statusLabel}
        </span>
        <button
          type="button"
          onClick={() => onRequestClick(interpreter)}
          className="profile-primary-button"
        >
          이 통역사 지정해서 의뢰하기
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="profile-designated-note">
          선택하신 통역사의 일정 및 가능 여부 확인 후 최종 매칭됩니다.
          일정이 맞지 않는 경우 ON-LI에서 조건에 맞는 다른 통역사를 안내해드립니다.
        </p>
      </aside>
    </section>
  );
}

function InfoMetricGrid({ profile }) {
  const metrics = [
    {
      icon: MapPin,
      label: "활동 가능 지역",
      value: profile.availableRegions,
    },
    {
      icon: Languages,
      label: "가능 언어",
      value: profile.languageLevel,
    },
    {
      icon: Star,
      label: "활동 레벨",
      value: profile.level,
    },
    {
      icon: Calendar,
      label: "일본 체류 기간",
      value: profile.stayPeriod,
    },
    {
      icon: ShieldCheck,
      label: "ON-LI 플랫폼 테스트",
      value: profile.platformTest,
    },
    {
      icon: Briefcase,
      label: "가능 업무",
      value: profile.availableTasks,
    },
    {
      icon: Tag,
      label: "전문 분야",
      value: profile.specialtyText,
    },
  ];

  return (
    <section className="profile-metric-grid" aria-label="통역사 핵심 정보">
      {metrics.map(({ icon: Icon, label, value }) => (
        <div key={label} className="profile-metric-item">
          <span className="profile-metric-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <span className="profile-metric-label">{label}</span>
          <strong>{value || EMPTY_TEXT}</strong>
        </div>
      ))}
    </section>
  );
}

function ExperienceCard({ profile }) {
  return (
    <section className="profile-info-card">
      <div className="profile-section-head">
        <p>Experience</p>
        <h2>현장 경험</h2>
      </div>

      <div className={`profile-experience-status ${profile.hasExperience ? "is-active" : ""}`}>
        <CircleCheck size={20} aria-hidden="true" />
        <span>{profile.experienceLabel}</span>
      </div>

      <div className="profile-card-block">
        <span className="profile-card-label">전문 분야</span>
        <BadgeList items={profile.specialties} fallback="일반 비즈니스" />
      </div>

      <div className="profile-card-block">
        <span className="profile-card-label">가능 업무</span>
        <BadgeList items={profile.tasks} fallback={EMPTY_TEXT} />
      </div>

      <div className="profile-card-block">
        <span className="profile-card-label">최근 참여 행사</span>
        <RecentEventList events={profile.recentEvents} />
      </div>
    </section>
  );
}

function AboutCard({ profile }) {
  return (
    <section className="profile-info-card">
      <div className="profile-section-head">
        <p>About Interpreter</p>
        <h2>통역사 소개</h2>
      </div>

      <p className="profile-about-text">{profile.about}</p>

      <div className="profile-soft-box">
        <AboutRow label="강점" value={profile.strengths} />
        <AboutRow label="통역 스타일" value={profile.style} />
        <AboutRow label="주요 통역 분야" value={profile.mainFields} />
      </div>
    </section>
  );
}

function ProfileCTA({ interpreter, name, onBackClick, onRequestClick }) {
  return (
    <section className="profile-bottom-cta" aria-label="프로필 하단 액션">
      <div>
        <span>{isOnliCertified(interpreter) ? "⭐ ON-LI 인증 통역사" : "○ 등록 통역사"}</span>
        <strong>{name} 통역사와 의뢰를 시작해보세요.</strong>
        <p className="profile-designated-note">
          선택하신 통역사의 일정 및 가능 여부 확인 후 최종 매칭됩니다.
          일정이 맞지 않는 경우 ON-LI에서 조건에 맞는 다른 통역사를 안내해드립니다.
        </p>
      </div>
      <div className="profile-bottom-actions">
        <button
          type="button"
          onClick={() => onRequestClick(interpreter)}
          className="profile-primary-button"
        >
          이 통역사 지정해서 의뢰하기
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button type="button" onClick={onBackClick} className="profile-secondary-button">
          <ArrowLeft size={17} aria-hidden="true" />
          메인으로 돌아가기
        </button>
      </div>
    </section>
  );
}

function BadgeList({ items, fallback }) {
  const list = items.length ? items : fallback ? [fallback] : [];

  return (
    <div className="profile-badge-list">
      {list.map((item) => (
        <span key={item} className={item === EMPTY_TEXT ? "profile-empty-chip" : "profile-chip"}>
          {item}
        </span>
      ))}
    </div>
  );
}

function RecentEventList({ events }) {
  if (events.length === 0) {
    return <p className="profile-empty-note">등록된 최근 참여 행사가 없습니다.</p>;
  }

  return (
    <ul className="profile-event-list">
      {events.map((event) => (
        <li key={`${event.name}-${event.date}`}>
          <span>{event.name}</span>
          {event.date ? <time>{event.date}</time> : null}
        </li>
      ))}
    </ul>
  );
}

function AboutRow({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MessageBox({ text }) {
  return <div className="interpreter-detail-message">{text}</div>;
}

function getProfile(interpreter) {
  const level = normalizeDisplayLevel(interpreter.level);
  const specialties = getList(
    interpreter.specialties ||
      interpreter.specialty ||
      interpreter.field ||
      interpreter.interpretation_field
  );
  const tasks = getList(interpreter.available_tasks || interpreter.available_work);
  const regions = mergeRegions(
    getList(interpreter.available_regions || interpreter.active_region || interpreter.region),
    getList(interpreter.custom_regions)
  );
  const intro = getFirstText(
    interpreter.self_intro,
    interpreter.introduction,
    interpreter.intro,
    interpreter.profile_intro,
    interpreter.description
  );
  const languageLevel = formatLanguageLevel(
    interpreter.language_level || interpreter.jlpt_level || interpreter.jlpt
  );
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const specialtyFallback = specialties[0] || tasks[0] || "일반 비즈니스";
  const mainFields = formatInlineList([...specialties, ...tasks], "일반 비즈니스");

  return {
    name: interpreter.name || "이름 미입력",
    summary: [
      interpreter.gender || "성별 미입력",
      formatAge(interpreter.age),
      interpreter.region || regions[0] || "지역 미입력",
    ].join(" · "),
    level,
    statusLabel: getInterpreterActivityStatusLabel(activityStatus),
    statusClass: getInterpreterActivityStatusBadgeClass(activityStatus),
    heroBadges: uniqueList([languageLevel, level, specialtyFallback]).slice(0, 4),
    intro: intro || DEFAULT_INTRO,
    about: intro || CONSULTATION_FALLBACK,
    availableRegions: formatInlineList(regions, interpreter.region || EMPTY_TEXT),
    languageLevel,
    stayPeriod: interpreter.residence_period || interpreter.stay_period || EMPTY_TEXT,
    platformTest: getPlatformTestLabel(interpreter),
    availableTasks: formatInlineList(tasks, EMPTY_TEXT),
    specialtyText: formatInlineList(specialties, "일반 비즈니스"),
    hasExperience: Boolean(
      interpreter.has_experience ||
        interpreter.interpretation_experience ||
        interpreter.experience ||
        interpreter.experience_count
    ),
    experienceLabel: getExperienceLabel(interpreter),
    recentEvents: getRecentEvents(interpreter),
    specialties,
    tasks,
    strengths: getFirstText(interpreter.strengths) || getStrengthsText(specialties, tasks),
    style: getFirstText(interpreter.interpretation_style, interpreter.style) || "정확 · 자연스러움 · 신속한 전달",
    mainFields,
  };
}

function getExperienceLabel(interpreter) {
  if (interpreter.experience_count) return `통역 경험 ${interpreter.experience_count}회`;
  if (interpreter.experience) return String(interpreter.experience);
  if (interpreter.interpretation_experience) return String(interpreter.interpretation_experience);
  return interpreter.has_experience ? "통역 경험 있음" : "통역 경험 없음";
}

function getRecentEvents(interpreter) {
  const source =
    interpreter.recent_events ||
    interpreter.recent_event ||
    interpreter.recent_projects ||
    interpreter.event_history ||
    interpreter.participated_events;

  if (Array.isArray(source)) {
    return source
      .map((event) => {
        if (typeof event === "string") return { name: event.trim(), date: "" };
        return {
          name: getFirstText(event?.name, event?.title, event?.event_name),
          date: getFirstText(event?.date, event?.period, event?.month),
        };
      })
      .filter((event) => event.name);
  }

  return getList(source).map((event) => ({ name: event, date: "" }));
}

function getInterpreterActivityStatus(interpreter = {}) {
  const status = String(interpreter.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

function getPlatformTestLabel(interpreter) {
  if (interpreter.status !== "active" && interpreter.status !== "승인 완료" && interpreter.status !== "활동중") return "검토 중";
  if (interpreter.platform_test === false || interpreter.test_completed === false) {
    return "확인 중";
  }
  return "완료";
}

function normalizeDisplayLevel(value) {
  const normalized = normalizeLevel(value || "LV1");
  return normalized.replace(/^LV/i, "Lv");
}

function formatLanguageLevel(value) {
  const text = String(value || "").trim();
  if (!text) return "JLPT N1";
  if (/^jlpt/i.test(text)) return text.replace(/^jlpt/i, "JLPT");
  if (/^n[1-5]/i.test(text)) return `JLPT ${text.toUpperCase()}`;
  return text;
}

function formatAge(value) {
  if (value === null || value === undefined || value === "") return "나이 미입력";
  return `${value}세`;
}

function getStrengthsText(specialties, tasks) {
  const hasBusinessFields = [...specialties, ...tasks].length > 0;
  return hasBusinessFields
    ? "전문 용어 이해도, 비즈니스 매너, 현장 대응력"
    : CONSULTATION_FALLBACK;
}

function getFirstText(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function getList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatInlineList(value, fallback) {
  const list = Array.isArray(value) ? value.filter(Boolean) : getList(value);
  return list.length ? list.join(", ") : fallback;
}

function uniqueList(values) {
  return values.filter(Boolean).filter((value, index, array) => array.indexOf(value) === index);
}

export default InterpreterDetail;
