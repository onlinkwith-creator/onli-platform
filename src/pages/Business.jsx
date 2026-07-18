import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  FileText,
  Handshake,
  Languages,
  MapPin,
  MessageSquareText,
  Plane,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import "./Business.css";

const useCases = [
  {
    icon: Building2,
    title: "전시회 통역",
    text: "부스 운영, 제품 설명, 방문객 응대, 현장 상담까지 전시 목적에 맞춰 지원합니다.",
    points: ["부스 상주", "제품 설명", "바이어 응대"],
  },
  {
    icon: Handshake,
    title: "상담회 통역",
    text: "가격, 납기, MOQ, 거래 조건처럼 상담 맥락을 이해하는 통역사를 연결합니다.",
    points: ["바이어 상담", "조건 협의", "후속 미팅"],
  },
  {
    icon: BriefcaseBusiness,
    title: "기업 미팅 통역",
    text: "임원 미팅, 파트너 협의, 계약 전 논의처럼 정확한 전달이 필요한 자리를 지원합니다.",
    points: ["임원 미팅", "파트너 협의", "출장 동행"],
  },
];

const flowSteps = [
  {
    icon: MessageSquareText,
    title: "의뢰 접수",
    text: "일정, 장소, 통역 목적, 필요 인원을 알려주세요.",
  },
  {
    icon: FileText,
    title: "조건 확인",
    text: "행사 성격과 업무 범위를 확인하고 견적을 안내합니다.",
  },
  {
    icon: Languages,
    title: "통역사 매칭",
    text: "분야와 일정에 맞는 한일 통역사를 검토해 배정합니다.",
  },
  {
    icon: CalendarCheck2,
    title: "현장 진행",
    text: "업무 전 자료와 일정 확인 후 현장 통역을 진행합니다.",
  },
];

const proofItems = [
  "전시회·상담회·기업 미팅 목적별 매칭",
  "일본 현장 조건과 비즈니스 매너 확인",
  "견적, 배정, 업무확인서까지 운영 관리",
];

const dashboardRows = [
  ["Beautyworld Japan", "도쿄", "배정 검토"],
  ["바이어 상담회", "오사카", "견적 안내"],
  ["파트너 미팅", "후쿠오카", "자료 확인"],
];

function Business({
  onBackClick,
  onRequestClick,
  onRegisterClick,
  onMypageClick,
  hasBusinessProfile,
}) {
  return (
    <div className="business-page">
      <header className="business-header">
        <button type="button" className="business-logo" onClick={onBackClick}>
          <img src="/logo.png" alt="ON-LI" />
          <span>ON-LI</span>
        </button>
        <nav className="business-nav" aria-label="기업 페이지 메뉴">
          <a href="#services">서비스</a>
          <a href="#flow">이용 흐름</a>
          <a href="#request">견적 요청</a>
        </nav>
        <button type="button" className="business-header-cta" onClick={onRequestClick}>
          견적 요청
        </button>
      </header>

      <main>
        <section className="business-hero">
          <div className="business-hero-copy">
            <p className="business-kicker">FOR COMPANIES</p>
            <h1>기업 일본 현장에 맞춘 한일 비즈니스 통역</h1>
            <p className="business-hero-lead">
              전시회, 상담회, 기업 미팅에 필요한 통역사를 조건에 맞춰 연결하고
              견적부터 배정, 현장 준비까지 운영 흐름을 관리합니다.
            </p>
            <div className="business-hero-actions">
              <button type="button" className="business-primary-button" onClick={onRequestClick}>
                견적 요청하기
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              {hasBusinessProfile ? (
                <button type="button" className="business-secondary-button" onClick={onMypageClick}>
                  기업 마이페이지
                </button>
              ) : (
                <button type="button" className="business-secondary-button" onClick={onRegisterClick}>
                  기업 등록
                </button>
              )}
            </div>
            <div className="business-proof-list" aria-label="서비스 특징">
              {proofItems.map((item) => (
                <span key={item}>
                  <BadgeCheck size={15} aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="business-hero-visual" aria-label="기업 통역 운영 미리보기">
            <div className="business-visual-top">
              <span>Corporate requests</span>
              <strong>3건 진행 중</strong>
            </div>
            <div className="business-visual-map">
              <div className="business-map-pin tokyo">
                <MapPin size={16} aria-hidden="true" />
                Tokyo
              </div>
              <div className="business-map-pin osaka">
                <MapPin size={16} aria-hidden="true" />
                Osaka
              </div>
              <div className="business-map-pin fukuoka">
                <MapPin size={16} aria-hidden="true" />
                Fukuoka
              </div>
            </div>
            <div className="business-dashboard-list">
              {dashboardRows.map(([eventName, region, status]) => (
                <div className="business-dashboard-row" key={eventName}>
                  <div>
                    <strong>{eventName}</strong>
                    <span>{region}</span>
                  </div>
                  <em>{status}</em>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="business-section" id="services">
          <div className="business-section-head">
            <p className="business-kicker">SERVICE</p>
            <h2>필요한 현장에 맞춰 통역 범위를 설계합니다.</h2>
          </div>
          <div className="business-usecase-grid">
            {useCases.map(({ icon: Icon, title, text, points }) => (
              <article className="business-usecase" key={title}>
                <Icon size={22} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
                <div>
                  {points.map((point) => (
                    <span key={point}>{point}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="business-section business-flow-section" id="flow">
          <div className="business-section-head">
            <p className="business-kicker">FLOW</p>
            <h2>의뢰부터 현장 진행까지 단순한 흐름으로 진행합니다.</h2>
          </div>
          <div className="business-flow">
            {flowSteps.map(({ icon: Icon, title, text }, index) => (
              <article className="business-flow-step" key={title}>
                <span className="business-step-number">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={21} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="business-section business-trust-section">
          <div className="business-section-head">
            <p className="business-kicker">WHY ON-LI</p>
            <h2>기업 담당자가 확인해야 할 운영 요소를 함께 관리합니다.</h2>
          </div>
          <div className="business-trust-grid">
            <div>
              <ShieldCheck size={22} aria-hidden="true" />
              <strong>검증된 통역사 기반</strong>
              <p>프로필, 경험, 가능 일정, 현장 대응력을 함께 검토합니다.</p>
            </div>
            <div>
              <Plane size={22} aria-hidden="true" />
              <strong>일본 현장 중심</strong>
              <p>도쿄, 오사카, 후쿠오카 등 주요 비즈니스 일정에 맞춰 준비합니다.</p>
            </div>
            <div>
              <Sparkles size={22} aria-hidden="true" />
              <strong>운영 문서 관리</strong>
              <p>견적서, 업무확인서 등 기업 내부 처리에 필요한 문서를 지원합니다.</p>
            </div>
          </div>
        </section>

        <section className="business-request-band" id="request">
          <div className="business-request-content">
            <div className="business-section-head">
              <p className="business-kicker">REQUEST</p>
              <h2>행사 일정과 장소를 알려주시면 견적을 준비합니다.</h2>
            </div>
            <p>
              기업명, 행사명, 진행 날짜, 장소, 필요한 통역 범위를 남겨주세요.
              운영팀이 확인 후 다음 절차를 안내합니다.
            </p>
          </div>
          <button type="button" className="business-primary-button" onClick={onRequestClick}>
            견적 요청하기
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      </main>
    </div>
  );
}

export default Business;
