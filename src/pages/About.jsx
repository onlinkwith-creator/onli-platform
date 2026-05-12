const features = [
  {
    title: "한일 비즈니스 통역 특화",
    text: "한국 기업의 일본 전시회, 상담회, 비즈니스 미팅 현장에 맞춘 통역 인력을 연결합니다.",
  },
  {
    title: "운영팀 검토 후 매칭",
    text: "의뢰 접수 후 일정, 업종, 필요 인원, 통역 난이도를 확인하고 적합한 통역사를 찾습니다.",
  },
  {
    title: "전시회·상담회 현장 대응 가능",
    text: "단순 전달을 넘어 부스 응대, 바이어 상담, 제품 설명 등 현장 커뮤니케이션을 지원합니다.",
  },
  {
    title: "레벨 기준을 통한 품질 관리",
    text: "LV1~LV4 기준으로 현장 난이도와 통역사의 경험을 함께 고려해 안정적인 배정을 돕습니다.",
  },
];

function About({ onBackClick, onRequestClick, onListClick }) {
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <button
          type="button"
          onClick={onBackClick}
          className="main-return-button"
          style={styles.backButton}
        >
          ← 메인으로
        </button>

        <section style={styles.hero}>
          <p style={styles.kicker}>ABOUT ON-LI</p>
          <h1 style={styles.title}>ON-LI 소개</h1>
          <div style={styles.body}>
            <p>
              ON-LI는 한국 기업과 일본 현장을 연결하는 한일 비즈니스 통역
              매칭 서비스입니다. 전시회, 상담회, 비즈니스 미팅 등 다양한
              현장에서 필요한 통역 인력을 보다 빠르고 안정적으로 연결합니다.
            </p>
            <p>
              전시회·상담회·비즈니스 미팅에 최적화된 검증 통역사를 직접 매칭합니다.
            </p>
          </div>
          <div style={styles.actions}>
            <button type="button" onClick={onRequestClick} style={styles.primary}>
              통역 의뢰하기
            </button>
            <button type="button" onClick={onListClick} style={styles.secondary}>
              통역사 보기
            </button>
          </div>
        </section>

        <section style={styles.featureSection}>
          <div style={styles.sectionHead}>
            <p style={styles.kicker}>SERVICE</p>
            <h2 style={styles.sectionTitle}>서비스 특징</h2>
          </div>

          <div style={styles.featureGrid}>
            {features.map((feature, index) => (
              <article key={feature.title} style={styles.featureCard}>
                <span style={styles.featureNumber}>{index + 1}</span>
                <h3 style={styles.featureTitle}>{feature.title}</h3>
                <p style={styles.featureText}>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    boxSizing: "border-box",
    padding: "48px 24px",
    background:
      "radial-gradient(circle at 80% 18%, rgba(99, 102, 241, 0.1), transparent 30%), linear-gradient(135deg, #f8fafc, #eef2ff)",
    color: "#111827",
  },
  shell: {
    maxWidth: "1120px",
    margin: "0 auto",
  },
  backButton: {
    marginBottom: "30px",
    padding: "12px 18px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: "700",
  },
  hero: {
    background: "rgba(255, 255, 255, 0.94)",
    border: "1px solid rgba(255, 255, 255, 0.85)",
    borderRadius: "18px",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.09)",
    padding: "34px",
  },
  kicker: {
    margin: "0 0 8px",
    fontSize: "12px",
    letterSpacing: "4px",
    color: "#4f46e5",
    fontWeight: "900",
  },
  title: {
    margin: 0,
    color: "#111827",
    fontSize: "56px",
    fontWeight: "800",
    marginBottom: "28px",
  },
  body: {
    maxWidth: "720px",
    margin: "0 auto",
    textAlign: "center",
    lineHeight: 1.9,
    fontSize: "16px",
    color: "#4b5563",
    wordBreak: "keep-all",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "28px",
  },
  primary: {
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "#4f46e5",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: "900",
  },
  secondary: {
    padding: "14px 18px",
    borderRadius: "14px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#374151",
    cursor: "pointer",
    fontWeight: "900",
  },
  featureSection: {
    marginTop: "30px",
  },
  sectionHead: {
    marginBottom: "18px",
  },
  sectionTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "30px",
    fontWeight: "900",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "18px",
  },
  featureCard: {
    background: "rgba(255, 255, 255, 0.94)",
    border: "1px solid rgba(255, 255, 255, 0.85)",
    borderRadius: "18px",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.09)",
    padding: "24px",
  },
  featureNumber: {
    display: "inline-flex",
    width: "30px",
    height: "30px",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: "900",
  },
  featureTitle: {
    margin: "16px 0 8px",
    color: "#111827",
    fontSize: "18px",
    fontWeight: "900",
  },
  featureText: {
    margin: 0,
    color: "#4b5563",
    fontSize: "14px",
    lineHeight: 1.7,
  },
};

export default About;
