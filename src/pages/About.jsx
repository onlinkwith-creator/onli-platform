import "./About.css";

const serviceFeatures = [
  {
    number: "01",
    title: "한일 비즈니스 특화",
    text: "전시회, 상담회, 미팅 등 한일 비즈니스 현장에 필요한 통역 인력을 연결합니다.",
  },
  {
    number: "02",
    title: "조건 기반 매칭 지원",
    text: "일정, 분야, 경험 정보를 기반으로 기업 조건에 맞는 인력 확인을 지원합니다.",
  },
  {
    number: "03",
    title: "다양한 현장 경험",
    text: "부스 운영, 제품 설명, 상담 지원 등 다양한 경험을 가진 통역 인력을 확인할 수 있습니다.",
  },
  {
    number: "04",
    title: "레벨 정보 제공",
    text: "LV1~LV4 기준을 통해 가능 업무 범위와 경험 정보를 쉽게 확인할 수 있습니다.",
  },
];

const processSteps = [
  {
    number: "01",
    title: "기업 의뢰 등록",
    text: "필요 일정과 조건을 입력합니다.",
  },
  {
    number: "02",
    title: "통역 인력 확인",
    text: "조건에 맞는 지원자를 확인합니다.",
  },
  {
    number: "03",
    title: "매칭 진행",
    text: "기업과 통역사의 일정 및 조건을 조율합니다.",
  },
  {
    number: "04",
    title: "현장 진행",
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
            한국 기업과 일본 통역 인력을 연결하는
            <br />
            <strong>비즈니스 통역 매칭 플랫폼</strong>
          </h1>
          <div className="about-hero-copy">
            <p>
              ON-LI는 전시회, 상담회, 비즈니스 미팅 등 다양한 현장에서
              필요한 통역 인력 연결을 지원합니다.
            </p>
            <p>
              기업과 통역사가 더 쉽고 안전하게 연결될 수 있도록 정보 제공,
              일정 조율, 매칭 진행을 지원합니다.
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
