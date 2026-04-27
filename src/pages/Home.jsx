function Home({ onRegisterClick, onListClick }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f8fafc, #e5e7eb)",
        color: "#395597",
        padding: "40px 24px",
      }}
    >
      <header
  style={{
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 0",
  }}
>
  <div>
    {/* 서브 브랜드 */}
    <div
      style={{
        fontSize: "13px",
        letterSpacing: "6px",
        color: "#6b7280",
        fontWeight: "600",
        marginBottom: "6px",
      }}
    >
      ON-LI
    </div>

    {/* 메인 타이틀 */}
    <h2
      style={{
        margin: 0,
        fontSize: "46px",
        fontWeight: "800",
        color: "#111827",
        lineHeight: "1.15",
        letterSpacing: "-0.5px",
      }}
    >
      On-Link Interpretation
    </h2>

    {/* 강조 라인 */}
    <div
      style={{
        width: "60px",
        height: "4px",
        background: "linear-gradient(90deg, #4f46e5, #6366f1)",
        borderRadius: "999px",
        marginTop: "14px",
      }}
    />
  </div>
</header>

      <main
        style={{
          maxWidth: "1100px",
          margin: "80px auto 0",
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: "40px",
          alignItems: "center",
        }}
      >
        <section>
          <p
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "#38353c",
              color: "white",
              fontSize: "18px",
              fontWeight: "700",
              marginBottom: "22px",
            }}
          >
            한일 비지니스 통역 매칭 플랫폼
          </p>

          <h1
            style={{
              fontSize: "44px",
              lineHeight: "1.3",
              margin: "0 0 24px",
              letterSpacing: "-1px",
              fontWeight: "800",
            }}
          >
            <span style={{ color: "#374151" }}>
              한일 비즈니스 통역을
            </span>
            <br />
            <span
              style={{
                background: "linear-gradient(90deg, #1e3a8a, #6366f1)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontWeight: "900",
              }}
            >
              더 정확하고 빠르게.
            </span>
          </h1>

          <p
            style={{
              fontSize: "20px",
              lineHeight: "1.5",
              color: "#000000",
              maxWidth: "620px",
              marginBottom: "34px",
            }}
          >
            ON-LI는 전시회, 미팅, 상담회 현장에 맞는 통역 인재를 연결하는
            한일 통역 매칭 플랫폼입니다.
          </p>

          <button
  onClick={onRegisterClick}
  style={{
    padding: "16px 28px",
    borderRadius: "14px",
    border: "none",
    background: "#38353c",
    color: "white",
    fontSize: "16px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(17, 24, 39, 0.25)",
  }}
>
  통역사 등록하기
</button>

<button
  onClick={onListClick}
  style={{
    marginTop: "16px", // 👈 간격 정상
    padding: "14px 24px",
    borderRadius: "12px",
    border: "1px solid #111827",
    background: "white",
    color: "#111827",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
  }}
>
  통역사 리스트 보기
</button>
        </section>

        <section
          style={{
             marginTop: "20px",
            background: "white",
            borderRadius: "28px",
            padding: "34px",
            boxShadow: "0 24px 60px rgba(80, 17, 111, 0.12)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h3 style={{ fontSize: "22px", marginBottom: "24px" }}>
            ON-LI의 특징
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <Feature title="레벨제 운영" text="경험과 역량에 따른 Lv1~Lv4 매칭 구조" />
            <Feature title="현장 중심 매칭" text="전시회, 상담회, 미팅 목적에 맞춘 인재 연결" />
            <Feature title="한일 비즈니스 특화" text="한국 기업의 일본 진출 현장에 최적화" />
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div
      style={{
        padding: "18px",
        borderRadius: "18px",
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
      }}
    >
      <strong style={{ display: "block", marginBottom: "6px" }}>{title}</strong>
      <span style={{ color: "#6b7280", fontSize: "14px" }}>{text}</span>
    </div>
  );
}



export default Home;