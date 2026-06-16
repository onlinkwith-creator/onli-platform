import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import "./About.css";

const serviceFeatures = [
  {
    number: "01",
    title: "한일 비즈니스 특화",
    text: "전시회·상담회·출장 등 한국 기업의 일본 비즈니스 환경에 맞는 통역 인력 연결을 지원합니다.",
  },
  {
    number: "02",
    title: "조건 기반 매칭",
    text: "언어, 분야, 경험, 일정 정보를 기반으로 필요 조건에 맞는 인력을 확인할 수 있습니다.",
  },
  {
    number: "03",
    title: "현장 경험 확인",
    text: "부스 운영, 제품 설명, 상담 지원 등 다양한 활동 경험 정보를 제공합니다.",
  },
  {
    number: "04",
    title: "레벨 정보 제공",
    text: "LV1~LV4 기준으로 가능 업무 범위 확인을 돕습니다.",
  },
];

const challengeCards = [
  {
    number: "01",
    title: "현지 인력 탐색",
    problem: "일본 현장에서 활동 가능한 통역 인력을 찾기 어렵습니다.",
    solution: "등록된 통역 인력 정보를 기반으로 조건에 맞는 연결을 지원합니다.",
  },
  {
    number: "02",
    title: "일정 관리",
    problem: "행사 일정과 통역 가능 여부 확인 과정이 복잡합니다.",
    solution: "일정 확인과 매칭 진행 과정을 온라인으로 관리합니다.",
  },
  {
    number: "03",
    title: "정산 관리",
    problem: "해외 인력 비용 처리와 관리가 번거롭습니다.",
    solution: "정산 진행을 위한 관리 시스템을 제공합니다.",
  },
];

const fieldCards = [
  { icon: "🏢", label: "일본 전시회 통역" },
  { icon: "🤝", label: "바이어 상담회 통역" },
  { icon: "💼", label: "한일 비즈니스 미팅" },
  { icon: "🏭", label: "공장 및 현장 방문" },
  { icon: "✈", label: "일본 출장 수행 통역" },
  { icon: "💻", label: "온라인 화상회의 통역" },
];

const processSteps = [
  {
    number: "01",
    title: "의뢰 접수",
    text: "필요 일정과 조건을 전달합니다.",
  },
  {
    number: "02",
    title: "조건 확인",
    text: "현장 조건과 통역 범위를 확인합니다.",
  },
  {
    number: "03",
    title: "통역사 추천",
    text: "목적에 맞는 통역사를 추천합니다.",
  },
  {
    number: "04",
    title: "자료 공유",
    text: "사전 자료와 진행 정보를 공유합니다.",
  },
  {
    number: "05",
    title: "현장/온라인 진행",
    text: "행사 현장 또는 온라인 미팅을 지원합니다.",
  },
  {
    number: "06",
    title: "피드백",
    text: "진행 후 필요한 피드백을 확인합니다.",
  },
];

const matchingMethodCards = [
  {
    number: "01",
    title: "검증된 통역사",
    text: "이력서와 통역 경험 정보를 기반으로 통역사를 검토합니다.",
  },
  {
    number: "02",
    title: "분야별 매칭",
    text: "전시회, 상담회, 기업 미팅 등 목적에 맞는 통역사를 연결합니다.",
  },
  {
    number: "03",
    title: "진행 관리",
    text: "의뢰 접수부터 조건 확인, 자료 공유, 현장 진행까지 지원합니다.",
  },
  {
    number: "04",
    title: "기준별 요금 산정",
    text: "일정, 시간, 분야, 통역 난이도, 요구되는 전문성을 기준으로 산정합니다.",
  },
];

const interpreterPoints = [
  "분야별 경력 등록",
  "프로젝트 단위 매칭",
  "비즈니스 현장 경험 확대",
];

function About({ onBackClick, onRequestClick, onListClick }) {
  const [stats, setStats] = useState({
    matchedRequests: 0,
    activeInterpreters: 0,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      try {
        const [matchedResult, interpreterResult] = await Promise.all([
          supabase
            .from("requests")
            .select("id", { count: "exact", head: true })
            .or("matching_status.eq.matched,assigned_interpreter_id.not.is.null"),
          supabase
            .from("interpreters")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
        ]);

        if (matchedResult.error) {
          console.error("About matched request count error:", matchedResult.error);
        }
        if (interpreterResult.error) {
          console.error("About active interpreter count error:", interpreterResult.error);
        }

        if (!isMounted) return;

        setStats({
          matchedRequests: matchedResult.error ? 0 : matchedResult.count || 0,
          activeInterpreters: interpreterResult.error ? 0 : interpreterResult.count || 0,
        });
      } catch (error) {
        console.error("About stats fetch error:", error);
        if (isMounted) {
          setStats({
            matchedRequests: 0,
            activeInterpreters: 0,
          });
        }
      }
    };

    fetchStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const heroStats = useMemo(
    () => [
      { label: "누적 매칭", value: `${stats.matchedRequests}+` },
      { label: "등록 통역 인력", value: `${stats.activeInterpreters}+` },
      { label: "대응 가능 분야", value: "8개+" },
      { label: "지원 지역", value: "일본 전역" },
    ],
    [stats.activeInterpreters, stats.matchedRequests]
  );

  return (
    <div className="about-page">
      <div className="about-bg-glow" />

      <main className="about-shell">
        <button
          type="button"
          onClick={onBackClick}
          className="main-return-button about-back-button"
        >
          ← 메인으로
        </button>

        <section className="about-hero">
          <p className="about-pill">ABOUT ON-LI</p>
          <h1 className="about-hero-title">
            한국 기업의 일본 현장 운영을
            <br />
            <strong>더 쉽게</strong>
          </h1>
          <div className="about-hero-copy">
            <p>
              ON-LI는 일본 현장에서 활동 가능한 통역 인력과 한국 기업을
              연결하는 비즈니스 매칭 플랫폼입니다.
            </p>
            <p>
              전시회, 상담회, 출장 미팅 등 현장 조건에 맞는 인력을 찾고
              일정 조율부터 정산 과정까지 지원합니다.
            </p>
          </div>
          <div className="about-hero-actions">
            <button type="button" onClick={onRequestClick} className="about-primary-button">
              통역 의뢰하기
            </button>
            <button type="button" onClick={onListClick} className="about-secondary-button">
              통역 인력 보기
            </button>
          </div>
          <div className="about-stat-grid" aria-label="ON-LI 신뢰 지표">
            {heroStats.map((stat) => (
              <div className="about-stat-card" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <SectionHeader
          eyebrow="WHY ON-LI"
          title="해외 현장 통역 준비, 이런 어려움이 있습니다"
        />
        <section className="about-challenge-grid" aria-label="ON-LI 문제 해결 방식">
          {challengeCards.map((card) => (
            <article className="about-challenge-card" key={card.title}>
              <span className="about-feature-symbol">{card.number}</span>
              <h3>{card.title}</h3>
              <p className="about-problem-text">“{card.problem}”</p>
              <span className="about-solution-arrow" aria-hidden="true">↓</span>
              <div className="about-solution-box">
                <strong>ON-LI</strong>
                <p>{card.solution}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="about-business-section" aria-labelledby="about-business-title">
          <div>
            <p className="about-section-eyebrow">BUSINESS INTERPRETATION</p>
            <h2 id="about-business-title">한일 비즈니스 현장을 위한 전문 통역 플랫폼</h2>
          </div>
          <div className="about-business-copy">
            <p>
              ON-LI는 한국과 일본을 연결하는 한일 통역 플랫폼입니다.
              일본 전시회, 바이어 상담회, 기업 미팅 등 다양한 비즈니스 현장에 맞는
              검증된 일본어 통역 인재를 연결합니다.
            </p>
            <p>
              전문 분야와 경험을 기반으로 한 통역사 매칭을 통해
              전시회 통역, 비즈니스 통역, 수행 통역, 일본 출장 통역까지
              목적에 맞는 통역 환경을 지원합니다.
            </p>
          </div>
        </section>

        <SectionHeader eyebrow="SERVICE" title="ON-LI가 제공하는 연결 경험" />
        <section className="about-feature-grid" aria-label="ON-LI 서비스 특징">
          {serviceFeatures.map((feature) => (
            <article className="about-feature-card" key={feature.title}>
              <span className="about-feature-symbol">{feature.number}</span>
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            </article>
          ))}
        </section>

        <SectionHeader
          eyebrow="FIELD"
          title="지원 가능한 통역 현장"
          description="ON-LI는 다양한 한일 비즈니스 상황에 맞는 통역 인재를 연결합니다."
        />
        <section className="about-field-grid" aria-label="지원 산업 분야">
          {fieldCards.map((field) => (
            <article className="about-field-card" key={field.label}>
              <span aria-hidden="true">{field.icon}</span>
              <strong>{field.label}</strong>
            </article>
          ))}
        </section>

        <section className="about-process-section">
          <SectionHeader
            eyebrow="PROCESS"
            title="진행 절차"
            description="의뢰 내용과 현장 조건을 확인한 뒤 적합한 통역사를 추천하고, 사전 자료 공유부터 현장 진행까지 안정적으로 지원합니다."
          />
          <div className="about-process-timeline">
            {processSteps.map((step) => (
              <article className="about-process-step" key={step.title}>
                <span className="about-step-number">{step.number}</span>
                <div className="about-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-trust-section">
          <div className="about-trust-copy">
            <SectionHeader eyebrow="TRUST" title="ON-LI는 어떻게 통역사를 연결하나요?" />
            <p>
              통역 경험과 현장 조건을 함께 확인해 기업의 목적에 맞는 통역 환경을 지원합니다.
            </p>
          </div>
          <div className="about-trust-list" aria-label="신뢰 지원 항목">
            {matchingMethodCards.map((item) => (
              <div className="about-trust-item" key={item.title}>
                <span>{item.number}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="about-interpreter-guide">
          <div className="about-interpreter-guide-copy">
            <p className="about-section-eyebrow">FOR INTERPRETERS</p>
            <h2>통역 경험을 ON-LI와 연결하세요</h2>
            <p>
              한국어와 일본어 능력을 가진 분이라면 일본 거주자와 한국 거주자 모두 등록 가능합니다.
              전문 분야, 통역 경험, 가능 일정을 등록하고 조건에 맞는 프로젝트와 연결될 수 있습니다.
            </p>
          </div>
          <div className="about-interpreter-point-list">
            {interpreterPoints.map((point, index) => (
              <div className="about-interpreter-point" key={point}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{point}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="about-final-cta">
          <p className="about-section-eyebrow">READY TO START</p>
          <h2>
            일본 비즈니스 현장,
            <br />
            필요한 통역 인력을 연결하세요.
          </h2>
          <div className="about-hero-actions">
            <button type="button" onClick={onRequestClick} className="about-primary-button">
              통역 의뢰하기
            </button>
            <button type="button" onClick={onListClick} className="about-secondary-button">
              등록 통역사 보기
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="about-section-head">
      <p className="about-section-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p className="about-section-description">{description}</p>}
    </div>
  );
}

export default About;
