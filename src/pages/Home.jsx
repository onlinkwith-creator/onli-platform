import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import "./Home.css";

const sampleJobs = [
  {
    title: "뷰티월드 재팬 2026 통역",
    location: "도쿄 빅사이트",
    date: "2026.05.18 ~ 2026.05.20",
    pay: "220,000원 ~ 280,000원",
    language: "한국어 ↔ 일본어",
    level: "Lv2 이상",
    preference: "뷰티/화장품 전시회 경험",
    status: "모집중",
    headcount: "3/5명 모집",
  },
  {
    title: "K-콘텐츠 팝업스토어 통역",
    location: "시부야",
    date: "2026.06 예정",
    pay: "180,000원 ~ 230,000원",
    language: "한국어 ↔ 일본어",
    level: "Lv1 이상",
    preference: "이벤트 스태프 경험",
    status: "모집중",
    headcount: "2/4명 모집",
  },
  {
    title: "BtoB 비즈니스 상담회 통역",
    location: "도쿄도 내 전시장",
    date: "일정 협의",
    pay: "250,000원 ~ 300,000원",
    language: "한국어 ↔ 일본어",
    level: "Lv3 이상",
    preference: "비즈니스 미팅 통역 경험",
    status: "마감임박",
    headcount: "1/2명 모집",
  },
  {
    title: "IT 전시회 부스 통역",
    location: "마쿠하리 멧세",
    date: "2026.07 예정",
    pay: "220,000원 ~ 260,000원",
    language: "한국어 ↔ 일본어",
    level: "Lv2 이상",
    preference: "IT/스타트업 분야 관심자",
    status: "모집중",
    headcount: "4/6명 모집",
  },
];

function Home({
  onRegisterClick,
  onListClick,
  onInterpreterClick,
  onJobsClick,
  onJobCreateClick,
}) {
  const [featuredInterpreters, setFeaturedInterpreters] = useState([]);
  const [interpreterLoading, setInterpreterLoading] = useState(true);

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchFeaturedInterpreters = useCallback(async () => {
    setInterpreterLoading(true);

    const { data, error } = await supabase
      .from("interpreters")
      .select("*")
      .eq("approved", true)
      .in("status", ["active", "warning"])
      .order("id", { ascending: false })
      .limit(10);

    if (error) {
      console.error(error);
      setFeaturedInterpreters([]);
      setInterpreterLoading(false);
      return;
    }

    setFeaturedInterpreters(data || []);
    setInterpreterLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(fetchFeaturedInterpreters);
  }, [fetchFeaturedInterpreters]);

  return (
    <div className="home-page">
      <div className="home-bg-glow" />

      <header className="home-header">
        <div>
          <div className="home-brand-sub">ON-LI</div>
          <h2 className="home-brand-title">On-Link Interpretation</h2>
          <div className="home-brand-line" />
        </div>

        <nav className="home-nav" aria-label="메인 메뉴">
          <button type="button" onClick={() => scrollToSection("about-onli")}>
            ON-LI 소개
          </button>
          <button type="button" onClick={() => scrollToSection("interpreters")}>
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

          <h1>
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
            title="공고 등록 / 의뢰 접수"
            text="행사 일정·장소·인원을 입력"
          />
          <Step
            number="2"
            title="ON-LI 검토 및 매칭"
            text="조건에 맞는 통역사 선정"
          />
          <Step
            number="3"
            title="사전 안내 및 범위 확정"
            text="장소·복장·업무 범위 공유"
          />
          <Step
            number="4"
            title="현장 진행 및 완료 확인"
            text="현장 진행 후 완료 확인"
          />
        </div>
      </section>

      <section className="home-company-cta">
        <div>
          <p className="home-brand-sub">FOR COMPANIES</p>
          <h2>통역 공고가 필요하신가요?</h2>
          <p>전시회·상담회·비즈니스 미팅 통역 공고를 등록해보세요.</p>
        </div>
        <button type="button" onClick={onJobCreateClick}>
          공고 등록하기
        </button>
      </section>

      <section className="home-jobs-preview">
        <div className="home-section-head">
          <div>
            <p className="home-brand-sub">OPEN JOBS</p>
            <h2>현재 모집 중인 통역 공고</h2>
          </div>
        </div>

        <div className="home-job-grid">
          {sampleJobs.map((job) => (
            <JobPreviewCard key={job.title} job={job} />
          ))}
        </div>
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

function JobPreviewCard({ job }) {
  const isUrgent = job.status === "마감임박";

  return (
    <article className="home-job-card">
      <div>
        <span className={isUrgent ? "home-job-status urgent" : "home-job-status"}>
          {job.status}
        </span>
        <h3>{job.title}</h3>
      </div>

      <dl>
        <JobInfo label="장소" value={job.location} />
        <JobInfo label="날짜" value={job.date} />
        <JobInfo label="일급" value={job.pay} />
        <JobInfo label="언어" value={job.language} />
        <JobInfo label="레벨" value={job.level} />
        <JobInfo label="우대" value={job.preference} />
        <JobInfo label="인원" value={job.headcount} />
      </dl>

      <button
        type="button"
        onClick={() => alert("지원 기능은 준비 중입니다.")}
      >
        지원하기
      </button>
    </article>
  );
}

function JobInfo({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
          <dt>JLPT</dt>
          <dd>{interpreter.jlpt || "-"}</dd>
        </div>
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
