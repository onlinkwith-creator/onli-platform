import {
  BriefcaseBusiness,
  Building2,
  Check,
  Factory,
  Handshake,
  MonitorPlay,
  Plane,
} from "lucide-react";
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
    title: "일정과 진행 관리",
    problem: "행사 일정과 통역 가능 여부 확인 과정이 복잡합니다.",
    solution: "일정 확인과 매칭 진행 과정을 온라인으로 관리합니다.",
  },
  {
    number: "03",
    title: "정산 지원",
    problem: "해외 인력 비용 처리와 관리가 번거롭습니다.",
    solution: "업무 완료 후 정산 진행까지 안정적으로 확인할 수 있습니다.",
  },
];

const fieldCards = [
  { icon: Building2, label: "일본 전시회 통역" },
  { icon: Handshake, label: "바이어 상담회 통역" },
  { icon: BriefcaseBusiness, label: "한일 비즈니스 미팅" },
  { icon: Factory, label: "공장 및 현장 방문" },
  { icon: Plane, label: "일본 출장 수행 통역" },
  { icon: MonitorPlay, label: "온라인 화상회의 통역" },
];

const processSteps = [
  { number: "01", title: "의뢰 접수", text: "필요 일정과 조건을 전달합니다." },
  { number: "02", title: "조건 확인", text: "현장 조건과 통역 범위를 확인합니다." },
  { number: "03", title: "통역사 추천", text: "목적에 맞는 통역사를 추천합니다." },
  { number: "04", title: "자료 공유", text: "사전 자료와 진행 정보를 공유합니다." },
  { number: "05", title: "현장/온라인 진행", text: "행사 현장 또는 온라인 미팅을 지원합니다." },
  { number: "06", title: "피드백", text: "진행 후 필요한 피드백을 확인합니다." },
];

const matchingMethodCards = [
  {
    number: "01",
    title: "ON-LI 인증 통역사",
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
    title: "운영 지원",
    text: "일정 확인과 자료 공유, 현장 진행부터 피드백까지 안정적으로 지원합니다.",
  },
];

const businessPoints = [
  "분야·경험·일정 기반 매칭",
  "사전 자료 공유와 현장 진행 지원",
  "배정부터 정산까지 한 번에 관리",
];

const interpreterPoints = [
  "분야별 경력과 활동 지역 등록",
  "프로젝트 단위 매칭",
  "비즈니스 현장 경험과 레벨 성장",
];

function About({ onBackClick, onRequestClick, onListClick }) {
  return (
    <div className="about-page">
      <main className="about-shell">
        <section className="about-hero" aria-labelledby="about-page-title">
          <div className="about-hero-heading">
            <nav className="about-breadcrumb" aria-label="현재 위치">
              <button type="button" onClick={onBackClick}>홈</button>
              <span aria-hidden="true">/</span>
              <span>ON-LI 소개</span>
            </nav>
            <p className="about-pill">ABOUT ON-LI</p>
            <h1 className="about-hero-title" id="about-page-title">
              한국 기업의 일본 현장 운영을 <strong>더 쉽게</strong>
            </h1>
          </div>
          <div className="about-hero-side">
            <div className="about-hero-mark" aria-hidden="true" />
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
            <div className="about-actions">
              <button type="button" onClick={onRequestClick} className="about-button primary">
                통역 의뢰하기
              </button>
              <button type="button" onClick={onListClick} className="about-button">
                통역 인력 보기
              </button>
            </div>
          </div>
        </section>

        <SectionHeader
          eyebrow="WHY ON-LI"
          title={<>현장 준비의 복잡함을<br />하나의 흐름으로</>}
          description="현지 인력 탐색, 일정 확인, 정산 관리까지 각각 진행하던 과정을 ON-LI에서 목적과 조건에 맞게 연결합니다."
        />
        <section className="about-challenge-grid" aria-label="ON-LI 문제 해결 방식">
          {challengeCards.map((card) => (
            <article className="about-challenge-card" key={card.title}>
              <span className="about-number">{card.number}</span>
              <h3>{card.title}</h3>
              <p className="about-problem-text">{card.problem}</p>
              <p className="about-solution-text">{card.solution}</p>
            </article>
          ))}
        </section>

        <SectionHeader
          eyebrow="ONE PLATFORM, TWO SIDES"
          title={<>기업과 통역사를<br />함께 연결합니다</>}
          description="기업에는 목적에 맞는 통역 환경을, 통역사에게는 전문성과 경험에 맞는 프로젝트 기회를 제공합니다."
        />
        <section className="about-audience-grid">
          <AudienceCard
            label="FOR BUSINESS"
            title="일본 비즈니스 현장에 맞는 통역 연결"
            text="전시회, 상담회, 기업 미팅과 출장 현장의 조건을 확인하고 목적에 맞는 통역사를 연결합니다."
            points={businessPoints}
          />
          <AudienceCard
            label="FOR INTERPRETERS"
            title="통역 경험을 ON-LI와 연결하세요"
            text="전문 분야와 통역 경험, 가능 일정을 등록하고 조건에 맞는 프로젝트와 연결될 수 있습니다."
            points={interpreterPoints}
            variant="interpreter"
          />
        </section>

        <SectionHeader
          eyebrow="TRUST"
          title="ON-LI는 어떻게 통역사를 연결하나요?"
          description="통역 경험과 현장 조건을 함께 확인해 기업의 목적에 맞는 통역 환경을 지원합니다."
        />
        <section className="about-trust-list" aria-label="신뢰 지원 항목">
          {matchingMethodCards.map((item) => (
            <article className="about-trust-item" key={item.title}>
              <span className="about-number">{item.number}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        <SectionHeader
          eyebrow="SERVICE"
          title={<>ON-LI가 제공하는<br />연결 경험</>}
          description="한일 비즈니스 환경과 실제 현장 운영에 필요한 정보를 중심으로 연결 과정을 설계합니다."
        />
        <section className="about-feature-grid" aria-label="ON-LI 서비스 특징">
          {serviceFeatures.map((feature) => (
            <article className="about-feature-card" key={feature.title}>
              <span className="about-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </section>

        <SectionHeader
          eyebrow="FIELD"
          title={<>다양한 한일 비즈니스<br />현장을 지원합니다</>}
          description="오프라인 현장부터 온라인 회의까지 목적과 운영 방식에 맞는 통역 환경을 지원합니다."
        />
        <section className="about-field-grid" aria-label="지원 가능한 통역 현장">
          {fieldCards.map(({ icon: Icon, label }) => (
            <article className="about-field-card" key={label}>
              <Icon aria-hidden="true" />
              <strong>{label}</strong>
            </article>
          ))}
        </section>

        <SectionHeader
          eyebrow="PROCESS"
          title="진행 절차"
          description="의뢰 내용을 확인한 뒤 적합한 통역사를 추천하고, 사전 자료 공유부터 현장 진행까지 지원합니다."
        />
        <section className="about-process" aria-label="통역 의뢰 진행 절차">
          <div className="about-process-timeline">
            {processSteps.map((step) => (
              <article className="about-process-step" key={step.title}>
                <span className="about-number">{step.number}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-final-cta">
          <div>
            <p className="about-section-eyebrow">READY TO START</p>
            <h2>일본 비즈니스 현장에 필요한<br />통역 인력을 연결하세요.</h2>
          </div>
          <div className="about-actions">
            <button type="button" onClick={onRequestClick} className="about-button primary">
              통역 의뢰하기
            </button>
            <button type="button" onClick={onListClick} className="about-button">
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
    <header className="about-section-head">
      <div>
        <p className="about-section-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {description && <p className="about-section-description">{description}</p>}
    </header>
  );
}

function AudienceCard({ label, title, text, points, variant = "" }) {
  return (
    <article className={`about-audience-card ${variant}`}>
      <span className="about-audience-label">{label}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <ul>
        {points.map((point) => (
          <li key={point}>
            <span className="about-check"><Check aria-hidden="true" /></span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default About;
