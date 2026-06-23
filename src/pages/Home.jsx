import { useCallback, useEffect, useRef, useState } from "react";
import JobCard from "../components/JobCard";
import { supabase, supabaseConfigError } from "../supabase";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusBadgeClass,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import { getLevelBadgeClass, getLevelBadgeStyle, normalizeLevel } from "../utils/levelBadge";
import {
  getPrimaryPublicInterpreterInfo,
  PUBLIC_INTERPRETER_SELECT,
} from "../utils/publicInterpreter";
import { isPublicInterpreterVisible } from "../utils/accountStatus";
import { sortJobsByDisplayPriority } from "../utils/jobStatus";
import { fetchPublicJobs } from "../utils/jobsApi";
import "./Home.css";
import {
  Building2,
  Camera,
  Clock,
  Mail,
  MessageCircle,
  UserRound,
  User,
  MapPin,
  Briefcase,
  Languages,
  Award,
  UserCheck,
  Menu,
  X,
} from "lucide-react";

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function isApprovedInterpreter(interpreter = {}) {
  const approved = interpreter.approved;
  return approved === true || approved === 1 || String(approved).toLowerCase() === "true";
}

function Home({
  user,
  isAdmin,
  onLogoutClick,
  onAboutClick,
  onRegisterClick,
  onListClick,
  onInterpreterClick,
  onJobsClick,
  onJobDetailClick,
  onJobApplyClick,
  onRequestClick,
  onInterpreterLoginClick,
  onMypageClick,
  onAdminClick,
}) {
  const HOME_JOB_PREVIEW_LIMIT = 4;
  const [featuredInterpreters, setFeaturedInterpreters] = useState([]);
  const [previewJobs, setPreviewJobs] = useState([]);
  const [interpreterLoading, setInterpreterLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [interpreterErrorMessage, setInterpreterErrorMessage] = useState("");
  const [jobsErrorMessage, setJobsErrorMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleHeaderAction = (action) => {
    setMobileMenuOpen(false);
    action?.();
  };

  const fetchFeaturedInterpreters = useCallback(async () => {
    setInterpreterLoading(true);
    setInterpreterErrorMessage("");

    try {
      if (!supabase) throw supabaseConfigError;

      const { data, error } = await supabase
        .from("public_interpreters")
        .select(PUBLIC_INTERPRETER_SELECT);

      if (error) {
        console.error("Interpreters fetch error:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        setInterpreterErrorMessage(
          getSupabaseErrorMessage(error, "데이터를 불러오지 못했습니다.")
        );
        setFeaturedInterpreters([]);
        return;
      }

      setFeaturedInterpreters((data || []).filter(isPublicInterpreterVisible).slice(0, 10));
    } catch (error) {
      console.error(error);
      setFeaturedInterpreters([]);
      setInterpreterErrorMessage(
        getSupabaseErrorMessage(error, "데이터를 불러오지 못했습니다.")
      );
    } finally {
      setInterpreterLoading(false);
    }
  }, []);

  const fetchFeaturedJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsErrorMessage("");

    try {
      if (!supabase) throw supabaseConfigError;

      const { data, error } = await fetchPublicJobs(supabase, {
        limit: HOME_JOB_PREVIEW_LIMIT,
      });

      if (error) {
        console.error("Jobs fetch error:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        setJobsErrorMessage(
          getSupabaseErrorMessage(error, "데이터를 불러오지 못했습니다.")
        );
        setPreviewJobs([]);
        return;
      }

      setPreviewJobs(sortJobsByDisplayPriority(data || []));
    } catch (error) {
      console.error("jobs fetch error:", error);
      setPreviewJobs([]);
      setJobsErrorMessage(
        getSupabaseErrorMessage(error, "데이터를 불러오지 못했습니다.")
      );
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(fetchFeaturedInterpreters);
  }, [fetchFeaturedInterpreters]);

  useEffect(() => {
    queueMicrotask(fetchFeaturedJobs);
  }, [fetchFeaturedJobs]);

  const mobileFeaturedInterpreters = featuredInterpreters
    .filter(isApprovedInterpreter)
    .slice(0, 5);

  return (
    <div className="home-page">
      <div className="home-bg-glow" />

      <header className="home-header">
        <div className="home-header-inner">
          <div className="home-logo-area" onClick={() => window.location.href = "/"} style={{ cursor: "pointer" }}>
            <img src="/logo.png" alt="ON-LI Logo" className="home-header-logo" />
            <div className="home-header-brand-text-group">
              <span className="home-header-brand-title">ON-LI</span>
              <span className="home-header-brand-subtitle">On-Link Interpretation</span>
            </div>
          </div>
          <div className="home-mobile-header-actions">
            {user ? (
              <button
                type="button"
                className="home-mobile-login-btn"
                onClick={() => handleHeaderAction(isAdmin ? onAdminClick : onMypageClick)}
              >
                {isAdmin ? "관리자" : "마이페이지"}
              </button>
            ) : (
              <button
                type="button"
                className="home-mobile-login-btn"
                onClick={() => handleHeaderAction(onInterpreterLoginClick)}
              >
                로그인
              </button>
            )}
            <button
              type="button"
              className="home-mobile-menu-btn"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={mobileMenuOpen}
              aria-controls="home-mobile-nav"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
          <nav
            className={`home-nav${mobileMenuOpen ? " is-open" : ""}`}
            id="home-mobile-nav"
            aria-label="메인 메뉴"
          >
            <button type="button" onClick={() => handleHeaderAction(onAboutClick)}>
              ON-LI 소개
            </button>
            <button type="button" onClick={() => handleHeaderAction(onListClick)}>
              통역사
            </button>
            <button type="button" onClick={() => handleHeaderAction(onJobsClick)}>
              통역 공고
            </button>
            <button type="button" onClick={() => handleHeaderAction(() => scrollToSection("contact"))}>
              문의하기
            </button>
            {user ? (
              <div className="home-header-user-zone">
                <span className="home-user-email">
                  <User size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                  {user.email}
                </span>
                <span className="home-header-divider">|</span>
                {isAdmin ? (
                  <button type="button" className="home-header-mypage-btn" onClick={() => handleHeaderAction(onAdminClick)}>
                    관리자 페이지
                  </button>
                ) : (
                  <button type="button" className="home-header-mypage-btn" onClick={() => handleHeaderAction(onMypageClick)}>
                    마이페이지
                  </button>
                )}
                <button type="button" className="home-header-logout-btn" onClick={() => handleHeaderAction(onLogoutClick)}>
                  로그아웃
                </button>
              </div>
            ) : (
              <button type="button" className="home-header-login-btn" onClick={() => handleHeaderAction(onInterpreterLoginClick)}>
                로그인
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="home-main" id="about-onli">
        <section className="home-hero">
          <p className="home-pill">검증된 한일 비즈니스 통역 플랫폼</p>

          <h1 className="home-hero-title">
            <span>한일 비즈니스를 연결하는</span>
            <br />
            <strong>전문 통역 매칭 플랫폼 ON-LI</strong>
          </h1>

          <p className="home-description">
            전시회 · 상담회 · 기업 미팅에 맞는
            <br />
            검증된 통역 인재를 빠르게 연결합니다.
          </p>

          <p className="home-sub-badge">전시회 · 상담회 · 비즈니스 미팅 특화</p>
        </section>

        <section className="home-feature-card">
          <h3>ON-LI의 특징</h3>

          <div className="home-feature-list">
            <Feature
              symbol="01"
              title="필요한 통역사를, 공고 하나로."
              text="조건을 올리면 맞는 통역사가 직접 지원합니다."
            />
            <Feature
              symbol="02"
              title="감이 아닌, 검증된 기준으로 선택."
              text="경험·분야·레벨을 보고 비교하세요."
            />
            <Feature
              symbol="03"
              title="모집부터 정산까지 한 번에."
              text="매칭부터 관리까지 ON-LI에서 간편하게."
            />
          </div>
        </section>
      </main>

      <section className="home-about-summary" aria-labelledby="home-about-summary-title">
        <div>
          <p className="home-brand-sub">ABOUT ON-LI</p>
          <h2 id="home-about-summary-title">필요한 현장에 맞는 통역 인재를 빠르게 연결합니다.</h2>
          <p>
            전시회 · 상담회 · 기업 미팅에 맞는
            <br />
            검증된 통역 인재를 빠르게 연결합니다.
          </p>
        </div>
        <button type="button" onClick={onAboutClick}>
          ON-LI 소개 보기
        </button>
      </section>

      <section className="home-mobile-overview-slider" aria-label="ON-LI 특징">
        <article className="home-mobile-overview-slide">
          <h3>ON-LI의 특징</h3>
          <div className="home-mobile-feature-list">
            <Feature
              symbol="01"
              title="필요한 통역사를, 공고 하나로."
              text="조건을 올리면 맞는 통역사가 직접 지원합니다."
            />
            <Feature
              symbol="02"
              title="감이 아닌, 검증된 기준으로 선택."
              text="경험·분야·레벨을 보고 비교하세요."
            />
            <Feature
              symbol="03"
              title="모집부터 정산까지 한 번에."
              text="매칭부터 관리까지 ON-LI에서 간편하게."
            />
          </div>
        </article>
      </section>

      <section className="home-cta-stack" aria-label="ON-LI 이용 안내">
        <div className="home-company-cta">
          <div className="home-cta-icon" aria-hidden="true">
              <Building2 size={28} strokeWidth={1.8} />
          </div>
          <div className="home-cta-copy">
            <p className="home-brand-sub">FOR COMPANIES</p>
            <h2>통역 의뢰가 필요하신가요?</h2>
            <p>
              일본 현장 통역 준비를 더 간편하게.
              <br />
              전시회, 상담회, 출장 일정에 맞는 통역 인력을 찾아보세요.
            </p>
          </div>
          <div className="home-cta-actions">
            <button type="button" onClick={onRequestClick}>
              통역 의뢰하기
            </button>
            <button type="button" onClick={onJobsClick} className="home-secondary">
              전체 통역공고 확인하기
            </button>
          </div>
        </div>

        <div className="home-interpreter-cta">
          <div className="home-cta-icon" aria-hidden="true">
              <UserRound size={28} strokeWidth={1.8} />
          </div>
          <div className="home-cta-copy">
            <p className="home-brand-sub">FOR INTERPRETERS</p>
            <h2>통역사로 활동하고 싶으신가요?</h2>
            <p>
              한국어와 일본어 능력을 바탕으로
              <br />
              비즈니스 현장에서 활동할 통역사를 모집합니다.
            </p>
          </div>
          <div className="home-cta-actions">
            <button
              type="button"
              onClick={onRegisterClick}
              className="home-primary"
            >
              통역사 등록하기
            </button>
            <button type="button" onClick={onListClick} className="home-secondary">
              등록된 통역사 보기
            </button>
          </div>
        </div>
      </section>

      <section className="home-jobs-preview">
        <div className="home-section-head">
          <div>
            <p className="home-brand-sub">JOBS</p>
            <h2>통역 공고</h2>
          </div>
          <button type="button" onClick={onJobsClick}>
            전체 공고 확인하기
          </button>
        </div>

        {jobsLoading ? (
          <div className="home-empty">통역 공고를 불러오는 중입니다...</div>
        ) : jobsErrorMessage ? (
          <div className="home-empty">{jobsErrorMessage}</div>
        ) : previewJobs.length === 0 ? (
          <div className="home-empty">현재 표시할 공고가 없습니다.</div>
        ) : (
          <>
            <HomeCarousel
              railClassName="home-job-carousel"
              ariaLabel="현재 모집 중인 통역 공고"
              previousLabel="이전 공고 보기"
              nextLabel="다음 공고 보기"
            >
                {previewJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onDetailClick={() => onJobDetailClick(job)}
                    onApplyClick={() => onJobApplyClick(job)}
                  />
                ))}
            </HomeCarousel>
            <button type="button" onClick={onJobsClick} className="home-jobs-mobile-more home-mobile-section-action">
              전체 공고 확인하기
            </button>
          </>
        )}
      </section>

      <section className="home-interpreters" id="interpreters">
        <div className="home-section-head">
          <div>
            <p className="home-brand-sub">INTERPRETERS</p>
            <h2>등록된 통역사</h2>
          </div>
          <button type="button" onClick={onListClick}>
            전체 통역사 보기
          </button>
        </div>

        {interpreterLoading ? (
          <div className="home-empty">통역사 정보를 불러오는 중입니다...</div>
        ) : interpreterErrorMessage ? (
          <div className="home-empty">{interpreterErrorMessage}</div>
        ) : featuredInterpreters.length === 0 ? (
          <div className="home-empty">현재 승인된 통역사가 없습니다.</div>
        ) : (
          <>
            <HomeCarousel
              railClassName="home-interpreter-grid home-interpreter-grid-desktop"
              ariaLabel="등록된 통역사"
              previousLabel="이전 통역사 보기"
              nextLabel="다음 통역사 보기"
            >
              {featuredInterpreters.map((interpreter) => (
                <InterpreterCard
                  key={interpreter.id}
                  interpreter={interpreter}
                  onProfileClick={() => onInterpreterClick(interpreter)}
                />
              ))}
            </HomeCarousel>

            <div className="home-interpreter-grid home-interpreter-grid-mobile" aria-label="등록된 통역사">
              {(mobileFeaturedInterpreters.length > 0 ? mobileFeaturedInterpreters : featuredInterpreters.slice(0, 5)).map((interpreter) => (
                <InterpreterCard
                  key={interpreter.id}
                  interpreter={interpreter}
                  onProfileClick={() => onInterpreterClick(interpreter)}
                />
              ))}
            </div>

            <button type="button" onClick={onListClick} className="home-mobile-section-action">
              전체 통역사 보기
            </button>
          </>
        )}
      </section>

      <footer className="home-footer" id="contact">
        <div className="home-footer-top">
          <div className="home-footer-brand" aria-label="ON-LI 브랜드">
            <div className="home-footer-logo-area">
              <img src="/logo.png" alt="ON-LI Logo" className="home-footer-logo" />
              <div className="home-footer-brand-text-group">
                <span className="home-footer-brand-title">ON-LI</span>
                <span className="home-footer-brand-subtitle">On-Link Interpretation</span>
              </div>
            </div>
            <span className="home-footer-brand-desc">한일 비즈니스 통역 매칭 플랫폼</span>
          </div>
          <div className="home-footer-contact" aria-label="운영 문의">
            <a
              className="home-footer-contact-item"
              href="https://www.instagram.com/onlink_official?igsh=NjZkb3ZkN3NtZG1y&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Camera size={22} aria-hidden="true" />
              <span>Instagram</span>
            </a>
            <a
              className="home-footer-contact-item"
              href="http://pf.kakao.com/_xeNxfxhX"
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={22} aria-hidden="true" />
              <span>KakaoTalk</span>
            </a>
            <a className="home-footer-contact-item" href="mailto:onlinkwith@gmail.com,onlinkcp@gmail.com">
              <Mail size={22} aria-hidden="true" />
              <span>메일 문의</span>
            </a>
            <span className="home-footer-contact-item" aria-label="운영시간">
              <Clock size={22} aria-hidden="true" />
              <span>평일 10:00 - 18:00</span>
            </span>
          </div>
        </div>

        <nav className="home-footer-policies" aria-label="약관 및 정책">
          <a className="home-footer-link" href="/terms">
            이용약관
          </a>
          <a className="home-footer-link" href="/client-policy">
            기업 이용약관
          </a>
          <a className="home-footer-link" href="/interpreter-policy">
            통역사 활동 약관
          </a>
          <a className="home-footer-link" href="/privacy">
            개인정보처리방침
          </a>
        </nav>

        <div className="home-footer-divider" aria-hidden="true" />
        <span className="home-footer-copy">© 2025 ON-LI. All rights reserved. | 사업자등록번호: 141-15-02905</span>
      </footer>
    </div>
  );
}

function HomeCarousel({
  children,
  railClassName = "",
  ariaLabel,
  previousLabel,
  nextLabel,
}) {
  const carouselRef = useRef(null);

  const scrollCarousel = (direction) => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const firstCard = carousel.firstElementChild;
    const cardWidth = firstCard?.getBoundingClientRect().width || 280;
    const gap = Number.parseFloat(getComputedStyle(carousel).columnGap) || 14;

    carousel.scrollBy({
      left: direction * (cardWidth + gap),
      behavior: "smooth",
    });
  };

  return (
    <div className="home-carousel-wrap">
      <button
        type="button"
        className="home-carousel-button"
        onClick={() => scrollCarousel(-1)}
        aria-label={previousLabel}
      >
        ‹
      </button>
      <div
        className={`home-carousel ${railClassName}`.trim()}
        ref={carouselRef}
        aria-label={ariaLabel}
      >
        {children}
      </div>
      <button
        type="button"
        className="home-carousel-button"
        onClick={() => scrollCarousel(1)}
        aria-label={nextLabel}
      >
        ›
      </button>
    </div>
  );
}

function Feature({ symbol, title, text }) {
  return (
    <div className="home-feature">
      <span className="home-feature-symbol">{symbol}</span>
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}

function InterpreterCard({ interpreter, onProfileClick }) {
  const getSpecialtiesList = (value) => {
    if (Array.isArray(value)) {
      return value
        .flatMap(item => typeof item === "string" ? item.split(/[,/]/) : [item])
        .map(String)
        .map(s => s.trim())
        .filter(Boolean);
    }
    if (!value) return [];
    return String(value)
      .split(/[,/]/)
      .map(s => s.trim())
      .filter(Boolean);
  };

  const specialties = getSpecialtiesList(interpreter.specialties);
  const specialtyBadges = specialties.length > 0 ? specialties : ["일반 비즈니스"];
  const visibleSpecialties = specialtyBadges.slice(0, 2);
  const hiddenCount = specialtyBadges.length - visibleSpecialties.length;

  const availableRegionLabel = getAvailableRegionLabel(interpreter);
  const experience = getExperienceLabel(interpreter);
  const activityStatus = getInterpreterActivityStatus(interpreter);
  const statusLabel = getInterpreterActivityStatusLabel(activityStatus);
  const publicInfo = getPrimaryPublicInterpreterInfo(interpreter);
  const openProfile = () => {
    onProfileClick?.();
  };
  const handleCardKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfile();
    }
  };

  return (
    <article
      className="home-interpreter-card interpreter-card"
      role="button"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={handleCardKeyDown}
      aria-label={`${interpreter.name || "통역사"} 프로필 보기`}
    >
      <span
        className={`home-interpreter-level ${getHomeLevelClass(interpreter.level)} level-badge home-interpreter-level-badge`}
        style={getLevelBadgeStyle(interpreter.level)}
      >
        {normalizeLevel(interpreter.level || "Lv1")}
      </span>
      <div className="home-interpreter-card-body">
        <div className="home-interpreter-card-header">
          <h3 className="truncate home-interpreter-name">{interpreter.name || "이름 미입력"}</h3>
          <div className="home-interpreter-meta-row">
            <div className="home-interpreter-left-badges">
              <span
                className={`home-job-status ${activityStatus === "active" ? "recruiting" : activityStatus === "paused" ? "closing_soon" : "closed"} interpreter-status-badge status-badge home-interpreter-status-badge`}
              >
                {statusLabel}
              </span>
              <span className={`registration-badge ${isApprovedInterpreter(interpreter) ? "verified verified-badge" : "regular"} home-interpreter-registration-badge`}>
                {isApprovedInterpreter(interpreter) ? "검증됨" : "일반 등록"}
              </span>
            </div>
          </div>
        </div>

        <div className="home-interpreter-info-list">
          <div className="home-interpreter-info-item min-w-0">
            <MapPin size={15} aria-hidden="true" />
            <span className="info-label">활동 지역</span>
            <span className="info-value truncate">{availableRegionLabel}</span>
          </div>
          <div className="home-interpreter-info-item min-w-0">
            <Briefcase size={15} aria-hidden="true" />
            <span className="info-label">전문 분야</span>
            <span className="info-value specialties-text truncate">
              {visibleSpecialties.join(" / ") + (hiddenCount > 0 ? ` +${hiddenCount}` : "")}
            </span>
          </div>
          <div className="home-interpreter-info-item min-w-0">
            <Languages size={15} aria-hidden="true" />
            <span className="info-label">언어 수준</span>
            <span className="info-value truncate">{interpreter.language_level || interpreter.jlpt || "한국어 · 일본어"}</span>
          </div>
          <div className="home-interpreter-info-item min-w-0">
            <Award size={15} aria-hidden="true" />
            <span className="info-label">통역 횟수</span>
            <span className="info-value truncate">{experience}</span>
          </div>
          {publicInfo?.label && publicInfo.label !== "통역 횟수" && (
            <div className="home-interpreter-info-item min-w-0">
              <User size={15} aria-hidden="true" />
              <span className="info-label">{publicInfo.label}</span>
              <span className="info-value truncate">{publicInfo.value}</span>
            </div>
          )}
        </div>
      </div>

      <div className="home-interpreter-card-action">
        <div className="home-interpreter-status-row">
          <div className="status-label-group">
            <UserCheck size={15} aria-hidden="true" />
            <span className="info-label">활동 상태</span>
          </div>
          <span
            className={`home-activity-badge ${getInterpreterActivityStatusBadgeClass(activityStatus)}`}
          >
            {statusLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openProfile();
          }}
        >
          프로필 보기
        </button>
      </div>
    </article>
  );
}

function getAvailableRegionLabel(interpreter) {
  const regions = Array.isArray(interpreter.available_regions)
    ? interpreter.available_regions.filter(Boolean)
    : [];

  if (regions.length === 0) return "활동 지역 확인 중";

  const visibleRegions = regions.slice(0, 2);
  const hiddenCount = regions.length - visibleRegions.length;

  return [...visibleRegions, hiddenCount > 0 ? `+${hiddenCount}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function getExperienceLabel(interpreter) {
  const count = interpreter.experience_count;
  if (count !== null && count !== undefined && count !== "") {
    const numericCount = Number(count);
    if (Number.isFinite(numericCount)) return `${numericCount}회`;
    return `${count}`;
  }
  return interpreter.has_experience ? "경험 있음" : "경험 없음";
}

function getInterpreterActivityStatus(interpreter = {}) {
  const status = String(interpreter.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

function getHomeLevelClass(level) {
  return getLevelBadgeClass(level);
}

export default Home;
