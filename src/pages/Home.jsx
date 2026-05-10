import { useCallback, useEffect, useState } from "react";
import JobCard from "../components/JobCard";
import { supabase } from "../supabase";
import { fetchPublicJobs } from "../utils/jobsApi";
import "./Home.css";

function getSupabaseErrorMessage(error, fallback) {
  return error?.message ? `${fallback} (${error.message})` : fallback;
}

function Home({
  onAboutClick,
  onRegisterClick,
  onListClick,
  onInterpreterClick,
  onJobsClick,
  onJobApplyClick,
  onRequestClick,
}) {
  const [featuredInterpreters, setFeaturedInterpreters] = useState([]);
  const [featuredJobs, setFeaturedJobs] = useState([]);
  const [interpreterLoading, setInterpreterLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsErrorMessage, setJobsErrorMessage] = useState("");

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchFeaturedInterpreters = useCallback(async () => {
    setInterpreterLoading(true);

    try {
      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .eq("approved", true)
        .in("status", ["active", "warning"])
        .order("id", { ascending: false })
        .limit(10);

      if (error) throw error;

      setFeaturedInterpreters(data || []);
    } catch (error) {
      console.error(error);
      setFeaturedInterpreters([]);
    } finally {
      setInterpreterLoading(false);
    }
  }, []);

  const fetchFeaturedJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsErrorMessage("");

    try {
      const { data, error } = await fetchPublicJobs(supabase, { limit: 4 });

      if (error) throw error;

      setFeaturedJobs(data || []);
    } catch (error) {
      console.error("jobs fetch error:", error);
      setFeaturedJobs([]);
      setJobsErrorMessage(
        getSupabaseErrorMessage(error, "통역 공고를 불러오지 못했습니다.")
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

  return (
    <div className="home-page">
      <div className="home-bg-glow" />

      <header className="home-header">
        <div className="home-logo-area">
          <div className="home-brand-sub">ON-LI</div>
          <h2 className="home-brand-title">On-Link Interpretation</h2>
          <div className="home-brand-line" />
        </div>

        <nav className="home-nav" aria-label="메인 메뉴">
          <button type="button" onClick={onAboutClick}>
            ON-LI 소개
          </button>
          <button type="button" onClick={onListClick}>
            통역사
          </button>
          <button type="button" onClick={onJobsClick}>
            통역 공고
          </button>
          <button type="button" onClick={() => scrollToSection("contact")}>
            문의하기
          </button>
        </nav>
      </header>

      <main className="home-main" id="about-onli">
        <section className="home-hero">
          <p className="home-pill">한일 비지니스 통역 매칭 플랫폼</p>

          <h1 className="home-hero-title">
            <span>한일 비즈니스 통역을</span>
            <br />
            <strong>더 정확하고 빠르게.</strong>
          </h1>

          <p className="home-description">
            ON-LI는 전시회, 미팅, 상담회 현장에 맞는 통역 인재를 연결하는
            한일 통역 매칭 플랫폼입니다.
          </p>

          <p className="home-sub-badge">전시회 · 상담회 · 비즈니스 미팅 특화</p>

          <div className="home-actions">
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
        </section>

        <section className="home-feature-card">
          <h3>ON-LI의 특징</h3>

          <div className="home-feature-list">
            <Feature
              symbol="01"
              title="레벨제 운영"
              text="경험과 역량에 따른 Lv1~Lv4 매칭 구조"
            />
            <Feature
              symbol="02"
              title="현장 중심 매칭"
              text="전시회, 상담회, 미팅 목적에 맞춘 인재 연결"
            />
            <Feature
              symbol="03"
              title="한일 비즈니스 특화"
              text="한국 기업의 일본 진출 현장에 최적화"
            />
          </div>
        </section>
      </main>

      <section className="home-process">
        <div className="home-process-head">
          <p className="home-brand-sub">PROCESS</p>
          <h2>진행 프로세스</h2>
        </div>

        <div className="home-process-grid">
          <Step
            number="1"
            title="기업 의뢰 접수"
            text="행사 일정·장소·인원을 전달"
          />
          <Step
            number="2"
            title="운영팀 검토"
            text="의뢰 내용과 필요 레벨 확인"
          />
          <Step
            number="3"
            title="공고 등록 및 모집"
            text="관리자 확인 후 통역사 모집"
          />
          <Step
            number="4"
            title="매칭 진행"
            text="조건에 맞는 통역사 선정"
          />
          <Step
            number="5"
            title="최종 배정 완료"
            text="사전 안내 후 일정 확정"
          />
        </div>
      </section>

      <section className="home-company-cta">
        <div>
          <p className="home-brand-sub">FOR COMPANIES</p>
          <h2>통역 의뢰가 필요하신가요?</h2>
          <p>의뢰 내용을 보내주시면 운영팀 검토 후 공고 등록과 매칭을 진행합니다.</p>
        </div>
        <button type="button" onClick={onRequestClick}>
          통역 의뢰하기
        </button>
      </section>

      <section className="home-jobs-preview">
        <div className="home-section-head">
          <div>
            <p className="home-brand-sub">OPEN JOBS</p>
            <h2>현재 모집 중인 통역 공고</h2>
          </div>
          <button type="button" onClick={onJobsClick}>
            전체 공고 확인하기
          </button>
        </div>

        {jobsLoading ? (
          <div className="home-empty">통역 공고를 불러오는 중입니다...</div>
        ) : jobsErrorMessage ? (
          <div className="home-empty">{jobsErrorMessage}</div>
        ) : featuredJobs.length === 0 ? (
          <div className="home-empty">현재 모집 중인 공고가 없습니다.</div>
        ) : (
          <div className="home-job-grid">
            {featuredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onApplyClick={() => onJobApplyClick(job)}
              />
            ))}
          </div>
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
        ) : featuredInterpreters.length === 0 ? (
          <div className="home-empty">현재 승인된 통역사가 없습니다.</div>
        ) : (
          <div className="home-interpreter-grid">
            {featuredInterpreters.map((interpreter) => (
              <InterpreterCard
                key={interpreter.id}
                interpreter={interpreter}
                onProfileClick={() => onInterpreterClick(interpreter)}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="home-footer" id="contact">
        <div>
          <strong>ON-LI</strong>
          <span>Korea-Japan Interpretation Platform</span>
        </div>
        <button type="button" onClick={onListClick}>
          Contact
        </button>
        <span>Copyright ON-LI. All rights reserved.</span>
      </footer>
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

function Step({ number, title, text }) {
  return (
    <div className="home-step">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </div>
  );
}

function InterpreterCard({ interpreter, onProfileClick }) {
  const specialties = Array.isArray(interpreter.specialties)
    ? interpreter.specialties
    : [];
  const specialtyBadges = specialties.length > 0 ? specialties : ["일반 비즈니스"];
  const availableRegionLabel = getAvailableRegionLabel(interpreter);
  const experience = getExperienceLabel(interpreter);

  return (
    <article className="home-interpreter-card">
      <div className="home-interpreter-head">
        <div>
          <h3>{interpreter.name || "이름 미입력"}</h3>
          <p>{availableRegionLabel}</p>
        </div>
        <span>{interpreter.level || "Lv1"}</span>
      </div>

      <div className="home-interpreter-badges">
        {specialtyBadges.slice(0, 3).map((badge) => (
          <span key={badge}>{badge}</span>
        ))}
      </div>

      <dl>
        <div>
          <dt>전문 분야</dt>
          <dd>{specialtyBadges.join(", ")}</dd>
        </div>
        <div>
          <dt>통역 경험</dt>
          <dd>{experience}</dd>
        </div>
      </dl>

      <button type="button" onClick={onProfileClick}>
        프로필 보기
      </button>
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
  const rawExperience =
    interpreter.interpretation_experience || interpreter.experience_count;
  const numericExperience = Number(rawExperience);

  if (!rawExperience && rawExperience !== 0) return "확인 중";
  if (Number.isNaN(numericExperience)) return String(rawExperience);
  if (numericExperience >= 10) return "10회 이상";
  return `${numericExperience}회`;
}

export default Home;
