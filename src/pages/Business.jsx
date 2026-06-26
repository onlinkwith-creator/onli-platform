import "./About.css";

const serviceCards = [
  {
    title: "전시회 통역",
    text: "부스 운영, 제품 설명, 방문객 응대, 현장 상담까지 전시 목적에 맞는 통역사를 연결합니다.",
  },
  {
    title: "바이어 상담회",
    text: "가격, MOQ, 납기, 거래 조건 등 상담 흐름을 이해하는 한일 비즈니스 통역사를 배정합니다.",
  },
  {
    title: "기업 미팅 통역",
    text: "임원 미팅, 파트너 협의, 계약 전 논의처럼 정확한 전달이 필요한 자리를 지원합니다.",
  },
  {
    title: "출장 동행 통역",
    text: "일본 출장 일정에 맞춰 이동, 방문, 미팅 현장에서 필요한 수행 통역을 준비합니다.",
  },
  {
    title: "현장 운영 보조",
    text: "전시 부스 안내, 상담 동선 정리, 자료 전달 등 현장 진행에 필요한 운영 보조를 함께 고려합니다.",
  },
];

const flowSteps = [
  "의뢰 접수",
  "조건 확인",
  "통역사 매칭",
  "현장 진행",
  "정산",
];

const trustItems = [
  "ON-LI 인증 통역사",
  "한일 비즈니스 현장 경험",
  "관리자 직접 매칭",
  "전시회/상담회 대응 가능",
];

function Business({
  onBackClick,
  onRequestClick,
  onRegisterClick,
  onMypageClick,
  hasBusinessProfile,
}) {
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
          <p className="about-pill">FOR BUSINESS</p>
          <h1 className="about-hero-title">
            한일 비즈니스 현장을 위한
            <br />
            <strong>전문 통역 매칭</strong>
          </h1>
          <div className="about-hero-copy">
            <p>
              전시회, 바이어 상담회, 기업 미팅, 출장 동행 등 일본 현장에 맞는
              한일 통역사를 연결합니다.
            </p>
          </div>
          <div className="about-hero-actions">
            {hasBusinessProfile ? (
              <button
                type="button"
                onClick={onMypageClick}
                className="about-secondary-button"
              >
                기업 마이페이지
              </button>
            ) : (
              <button
                type="button"
                onClick={onRegisterClick}
                className="about-secondary-button"
              >
                기업 등록하기
              </button>
            )}
            <button
              type="button"
              onClick={onRequestClick}
              className="about-primary-button"
            >
              통역 의뢰하기
            </button>
          </div>
        </section>

        <SectionHeader
          eyebrow="SERVICE"
          title="서비스 영역"
          description="행사 성격과 상담 목적에 맞춰 일본 현장 이해도가 있는 통역사를 연결합니다."
        />
        <section className="about-feature-grid" aria-label="기업 통역 서비스">
          {serviceCards.map((card, index) => (
            <article className="about-feature-card" key={card.title}>
              <span className="about-feature-symbol">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="about-trust-section">
          <div className="about-trust-copy">
            <SectionHeader eyebrow="TRUST" title="기업 의뢰에 필요한 신뢰 기준" />
            <p>
              ON-LI는 통역사의 경험과 현장 조건을 함께 확인해 기업 담당자가 바로 의뢰를 진행할 수 있도록 돕습니다.
            </p>
          </div>
          <div className="about-trust-list" aria-label="기업 고객 신뢰 요소">
            {trustItems.map((item, index) => (
              <div className="about-trust-item" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item}</strong>
                  <p>기업 현장 조건에 맞춰 확인합니다.</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="about-process-section">
          <SectionHeader
            eyebrow="FLOW"
            title="이용 흐름"
            description="의뢰 내용을 확인한 뒤 일정, 분야, 현장 조건에 맞춰 통역사 배정을 진행합니다."
          />
          <div className="about-process-timeline">
            {flowSteps.map((step, index) => (
              <article className="about-process-step" key={step}>
                <span className="about-step-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="about-step-copy">
                  <strong>{step}</strong>
                  <small>{index < flowSteps.length - 1 ? "다음 단계로 진행" : "진행 완료 후 정산"}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-final-cta">
          <p className="about-section-eyebrow">REQUEST</p>
          <h2>
            필요한 일정과 현장을 알려주시면
            <br />
            조건에 맞는 통역을 준비합니다.
          </h2>
          <div className="about-hero-actions">
            {hasBusinessProfile ? (
              <button
                type="button"
                onClick={onMypageClick}
                className="about-secondary-button"
              >
                기업 마이페이지
              </button>
            ) : (
              <button
                type="button"
                onClick={onRegisterClick}
                className="about-secondary-button"
              >
                기업 등록하기
              </button>
            )}
            <button
              type="button"
              onClick={onRequestClick}
              className="about-primary-button"
            >
              통역 의뢰하기
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

export default Business;
