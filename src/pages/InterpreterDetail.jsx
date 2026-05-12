import { getLevelBadgeStyle, normalizeLevel } from "../utils/levelBadge";

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
        <section style={styles.profileCard}>
          <div style={styles.profileHeader}>
            <div>
              <p style={styles.label}>ON-LI INTERPRETER PROFILE</p>
              <h1 style={styles.name}>{interpreter.name || "이름 미입력"}</h1>
              <p style={styles.summary}>
                {interpreter.gender || "성별 미입력"} · 나이(만){" "}
                {interpreter.age || "-"} · {interpreter.region || "지역 미입력"}
              </p>
            </div>
            <span style={getLevelBadgeStyle(interpreter.level)}>
              {normalizeLevel(interpreter.level)}
            </span>
          </div>

          <div style={styles.infoGrid}>
            <Info label="활동 가능 지역" value={formatList(interpreter.available_regions)} />
            <Info label="언어 수준" value={interpreter.language_level || interpreter.level} />
            <Info label="JLPT N1 여부" value={interpreter.jlpt || "N1 미입력"} />
            <Info label="일본 체류 기간" value={interpreter.stay_period} />
            <Info label="학교/전공" value={interpreter.school} />
            <Info label="가능 업무" value={interpreter.available_tasks} />
          </div>
        </section>

        <div style={styles.contentGrid}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>Experience</h2>
            <Info
              label="통역 경험 여부"
              value={getExperienceLabel(interpreter)}
            />
            <div style={styles.badgeList}>
              {getList(interpreter.specialties).length === 0 ? (
                <span style={styles.emptyBadge}>전문 분야 미입력</span>
              ) : (
                getList(interpreter.specialties).map((item) => (
                  <span key={item} style={styles.fieldBadge}>
                    {item}
                  </span>
                ))
              )}
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>About Interpreter</h2>
            <Info
              label="소개"
              value={
                interpreter.intro ||
                interpreter.profile_intro ||
                interpreter.description ||
                "자세한 내용은 상담 후 안내드리겠습니다."
              }
            />
          </section>
        </div>

        <div style={styles.actions}>
          <button onClick={() => onRequestClick(interpreter)} style={styles.requestButton}>
            이 통역사 지정해서 의뢰하기
          </button>
          <button onClick={onBackClick} style={styles.backButton}>
            ← 메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

function getExperienceLabel(interpreter) {
  return interpreter.has_experience ? "통역 경험 있음" : "통역 경험 없음";
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

function getList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatList(value) {
  const list = getList(value);
  return list.length ? list.join(", ") : "-";
}

const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
    padding: "44px 16px",
    boxSizing: "border-box",
    color: "#111827",
  },
  container: {
    maxWidth: "980px",
    margin: "0 auto",
  },
  profileCard: {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "28px",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.1)",
    border: "1px solid #e5e7eb",
  },
  profileHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "22px",
  },
  label: {
    fontSize: "12px",
    letterSpacing: "3px",
    color: "#4f46e5",
    fontWeight: "900",
    margin: "0 0 8px",
  },
  name: {
    margin: 0,
    fontSize: "clamp(30px, 5vw, 44px)",
    fontWeight: "900",
    color: "#111827",
  },
  summary: {
    margin: "10px 0 0",
    color: "#4b5563",
    fontSize: "15px",
    lineHeight: 1.6,
    overflowWrap: "anywhere",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0 18px",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "14px",
    marginTop: "14px",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "22px",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
  },
  sectionTitle: {
    margin: "0 0 12px",
    color: "#111827",
    fontSize: "18px",
    fontWeight: "900",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "14px",
  },
  infoLabel: {
    color: "#6b7280",
    fontWeight: "800",
    whiteSpace: "nowrap",
  },
  infoValue: {
    color: "#111827",
    textAlign: "right",
    fontWeight: "700",
    overflowWrap: "anywhere",
  },
  badgeList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "7px",
    marginTop: "14px",
  },
  fieldBadge: {
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#f3f4f6",
    color: "#374151",
    fontSize: "12px",
    fontWeight: "900",
  },
  emptyBadge: {
    padding: "5px 9px",
    borderRadius: "999px",
    background: "#f8fafc",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: "900",
  },
  notice: {
    margin: "14px 0 0",
    padding: "12px",
    borderRadius: "12px",
    background: "#f8fafc",
    color: "#4b5563",
    fontSize: "13px",
    lineHeight: 1.6,
  },
  actions: {
    display: "flex",
    gap: "10px",
    marginTop: "14px",
    flexWrap: "wrap",
  },
  requestButton: {
    flex: "1 1 260px",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "900",
    cursor: "pointer",
    fontSize: "15px",
  },
  backButton: {
    flex: "0 1 160px",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontWeight: "900",
    cursor: "pointer",
    fontSize: "14px",
  },
  messageBox: {
    maxWidth: "900px",
    margin: "0 auto",
    background: "white",
    padding: "32px",
    borderRadius: "16px",
    textAlign: "center",
    color: "#6b7280",
  },
};

export default InterpreterDetail;
