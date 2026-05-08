function InterpreterDetail({ interpreter, onBackClick, onRequestClick }) {
  if (!interpreter) {
    return (
      <div style={styles.page}>
        <MessageBox text="통역사 정보를 찾을 수 없습니다." />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button onClick={onBackClick} style={styles.backButton}>
          ← 리스트로 돌아가기
        </button>

        <div style={styles.card}>
          <div style={styles.header}>
            <div>
              <p style={styles.label}>ON-LI INTERPRETER PROFILE</p>
              <h1 style={styles.name}>{interpreter.name || "이름 미입력"}</h1>
              <p style={styles.region}>{interpreter.region || "지역 미입력"}</p>
            </div>

            <span style={styles.badge}>
              {interpreter.jlpt || "JLPT 미입력"}
            </span>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>기본 정보</h2>
            <Info label="성별" value={interpreter.gender} />
            <Info label="나이" value={interpreter.age} />
            <Info label="거주 지역" value={interpreter.region} />
            <Info label="학교/전공" value={interpreter.school} />
            <Info label="일본 거주 기간" value={interpreter.stay_period} />
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>통역 역량</h2>
            <Info label="JLPT" value={interpreter.jlpt} />
            <Info
              label="통역 경험"
              value={
                interpreter.experience_count
                  ? `${interpreter.experience_count}회`
                  : "-"
              }
            />
            <Info label="레벨" value={interpreter.level || "Lv 미정"} />
          </div>

          <div style={styles.priceBox}>
            <p style={styles.priceTitle}>예상 의뢰 금액</p>
            <p style={styles.priceText}>₩200,000 ~ ₩300,000 / day</p>
            <p style={styles.priceNotice}>
              최종 금액은 일정, 근무 시간, 긴급도, 업무 난이도에 따라 안내됩니다.
            </p>
          </div>

          <div style={styles.noticeBox}>
            연락처는 의뢰 내용 확인 및 매칭 확정 전 공개되지 않습니다.
          </div>

          <button
            onClick={() => onRequestClick(interpreter)}
            style={styles.requestButton}
          >
            이 통역사로 의뢰 문의하기
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value || "-"}</span>
    </div>
  );
}

function MessageBox({ text }) {
  return <div style={styles.messageBox}>{text}</div>;
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    padding: "60px 24px",
    boxSizing: "border-box",
    color: "#111827",
  },
  container: {
    maxWidth: "900px",
    margin: "0 auto",
  },
  backButton: {
    marginBottom: "30px",
    padding: "12px 18px",
    borderRadius: "999px",
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontWeight: "600",
  },
  card: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: "28px",
    padding: "36px",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(255,255,255,0.8)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "34px",
  },
  label: {
    fontSize: "12px",
    letterSpacing: "4px",
    color: "#4f46e5",
    fontWeight: "800",
    marginBottom: "10px",
  },
  name: {
    margin: 0,
    fontSize: "40px",
    fontWeight: "900",
    color: "#111827",
  },
  region: {
    marginTop: "10px",
    color: "#6b7280",
    fontSize: "15px",
  },
  badge: {
    padding: "8px 14px",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#4f46e5",
    fontSize: "13px",
    fontWeight: "800",
    whiteSpace: "nowrap",
  },
  section: {
    marginTop: "28px",
  },
  sectionTitle: {
    fontSize: "20px",
    fontWeight: "800",
    marginBottom: "14px",
    color: "#111827",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    padding: "13px 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "15px",
  },
  infoLabel: {
    color: "#6b7280",
    fontWeight: "700",
  },
  infoValue: {
    color: "#111827",
    textAlign: "right",
    fontWeight: "600",
  },
  priceBox: {
    marginTop: "30px",
    padding: "20px",
    borderRadius: "18px",
    background: "#eef2ff",
  },
  priceTitle: {
    margin: "0 0 8px",
    fontSize: "14px",
    fontWeight: "800",
    color: "#4f46e5",
  },
  priceText: {
    margin: 0,
    fontSize: "24px",
    fontWeight: "900",
    color: "#111827",
  },
  priceNotice: {
    margin: "8px 0 0",
    fontSize: "13px",
    color: "#6b7280",
    lineHeight: "1.6",
  },
  noticeBox: {
    marginTop: "24px",
    padding: "18px",
    borderRadius: "18px",
    background: "#f8fafc",
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: "1.7",
  },
  requestButton: {
    marginTop: "24px",
    width: "100%",
    padding: "16px",
    borderRadius: "16px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "900",
    cursor: "pointer",
    fontSize: "15px",
  },
  messageBox: {
    maxWidth: "900px",
    margin: "0 auto",
    background: "white",
    padding: "40px",
    borderRadius: "20px",
    textAlign: "center",
    color: "#6b7280",
  },
};

export default InterpreterDetail;