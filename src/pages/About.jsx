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
  { icon: "💄", label: "뷰티 / 코스메" },
  { icon: "🍱", label: "식품" },
  { icon: "👗", label: "패션" },
  { icon: "💻", label: "IT / 스타트업" },
  { icon: "🏥", label: "의료 / 헬스케어" },
  { icon: "⚙️", label: "제조 / 기계" },
  { icon: "🗺️", label: "관광 / 문화" },
  { icon: "💼", label: "일반 비즈니스" },
];

const processSteps = [
  {
    number: "01",
    title: "기업 의뢰 등록",
    text: "필요 일정과 업무 조건 입력",
  },
  {
    number: "02",
    title: "통역 인력 확인",
    text: "조건에 맞는 지원자 정보 확인",
  },
  {
    number: "03",
    title: "매칭 진행",
    text: "일정 및 업무 조건 조율",
  },
  {
    number: "04",
    title: "현장 활동",
    text: "매칭된 통역사가 현장에서 활동합니다.",
  },
];

const trustItems = [
  "통역사 프로필 관리",
  "이력 및 경험 정보 확인",
  "일정 관리 지원",
  "정산 프로세스 지원",
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

        <SectionHeader eyebrow="FIELD" title="다양한 산업 현장 지원" />
        <section className="about-field-grid" aria-label="지원 산업 분야">
          {fieldCards.map((field) => (
            <article className="about-field-card" key={field.label}>
              <span aria-hidden="true">{field.icon}</span>
              <strong>{field.label}</strong>
            </article>
          ))}
        </section>

        <section className="about-process-section">
          <SectionHeader eyebrow="PROCESS" title="간편한 매칭 과정" />
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
            <SectionHeader eyebrow="TRUST" title="더 안정적인 연결을 위해" />
            <p>
              ON-LI는 기업과 통역 인력이 필요한 정보를 확인하고 일정과 정산
              흐름을 더 편하게 이어갈 수 있도록 운영 지원을 제공합니다.
            </p>
          </div>
          <div className="about-trust-list" aria-label="신뢰 지원 항목">
            {trustItems.map((item, index) => (
              <div className="about-trust-item" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
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

function SectionHeader({ eyebrow, title }) {
  return (
    <div className="about-section-head">
      <p className="about-section-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

export default About;
