import { useEffect, useMemo, useState } from "react";
import { publicSupabase, supabaseConfigError } from "../supabase";
import { getLevelBadgeStyle, normalizeLevel } from "../utils/levelBadge";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import {
  PUBLIC_INTERPRETER_SELECT,
  getPrimaryPublicInterpreterInfo,
} from "../utils/publicInterpreter";
import "./InterpreterList.css";

const initialFilters = {
  gender: "전체",
  region: "전체",
  field: "전체",
  level: "",
  ageGroup: "",
  keyword: "",
};

const regionOptions = [
  "전체",
  "도쿄",
  "카나가와",
  "치바",
  "사이타마",
  "오사카",
  "교토",
  "후쿠오카",
  "기타",
];

const fieldOptions = [
  "전체",
  "뷰티/코스메",
  "패션",
  "식품",
  "의료/헬스케어",
  "IT/스타트업",
  "관광/문화",
  "제조/기계",
  "일반 비즈니스",
  "기타",
];

const levelOptions = [
  { value: "", label: "전체" },
  { value: "LV1", label: "LV1" },
  { value: "LV2", label: "LV2" },
  { value: "LV3", label: "LV3" },
  { value: "LV4", label: "LV4" },
];

const ageOptions = [
  { value: "", label: "전체" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50plus", label: "50대 이상" },
];

function isApprovedPublicInterpreter(interpreter = {}) {
  const status = String(interpreter.status || "").trim().toLowerCase();
  const approved = interpreter.approved === true || String(interpreter.approved) === "true";
  return approved && ["active", "warning", "approved", ""].includes(status);
}

function InterpreterList({ onBackClick, onDetailClick, onRegisterClick }) {
  const [interpreters, setInterpreters] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchInterpreters = async () => {
      setLoading(true);
      setErrorMessage("");

      if (!publicSupabase) {
        setErrorMessage(supabaseConfigError.message);
        setLoading(false);
        return;
      }

      const { data, error } = await publicSupabase
        .from("interpreters")
        .select(PUBLIC_INTERPRETER_SELECT)
        .eq("approved", true)
        .in("status", ["active", "warning", "approved"]);

      if (error) {
        console.error("Supabase select error:", error);
        setErrorMessage("통역사 정보를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      const publicInterpreters = (data || []).filter(isApprovedPublicInterpreter);
      setInterpreters(publicInterpreters);
      setLoading(false);
    };

    fetchInterpreters();
  }, []);

  const filteredInterpreters = useMemo(
    () =>
      interpreters.filter((person) => {
        const keyword = filters.keyword.trim().toLowerCase();
        const genderMatches =
          filters.gender === "전체" || getGenderText(person.gender) === filters.gender;
        const regionMatches =
          filters.region === "전체" ||
          normalizeRegionText(getRegionText(person)).includes(
            normalizeRegionText(filters.region)
          );
        const fieldMatches = getFieldMatches(person, filters.field);
        const levelMatches = getLevelMatches(person, filters.level);
        const ageMatches = getAgeMatches(person, filters.ageGroup);
        const keywordMatches =
          !keyword || getSearchText(person).toLowerCase().includes(keyword);

        return (
          genderMatches &&
          regionMatches &&
          fieldMatches &&
          levelMatches &&
          ageMatches &&
          keywordMatches
        );
      }),
    [filters, interpreters]
  );

  const updateFilter = (name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  return (
    <div
      className="interpreter-list-page"
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
        padding: "48px 20px",
        boxSizing: "border-box",
        color: "#111827",
      }}
    >
      <div
        className="interpreter-list-shell"
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={onBackClick}
          className="main-return-button"
          style={{
            marginBottom: "24px",
            padding: "10px 16px",
            borderRadius: "12px",
            border: "1px solid #395597",
            backgroundColor: "#395597",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: "700",
          }}
        >
          ← 메인으로
        </button>

        <div className="interpreter-list-header" style={styles.header}>
          <div>
            <p style={styles.kicker}>ON-LI INTERPRETERS</p>
            <h1 style={styles.title}>통역사 리스트</h1>
            <p style={styles.description}>
              승인된 한일 비즈니스 통역사 정보를 확인할 수 있습니다.
            </p>
          </div>

          <button
            type="button"
            onClick={onRegisterClick}
            className="interpreter-list-register-button"
            style={styles.registerButton}
          >
            통역사 등록
          </button>
        </div>

        {loading ? (
          <MessageBox text="통역사 정보를 불러오는 중입니다..." />
        ) : errorMessage ? (
          <MessageBox text={errorMessage} />
        ) : interpreters.length === 0 ? (
          <MessageBox text="등록된 통역사가 없습니다" />
        ) : (
          <>
            <div className="interpreter-list-filter-card" style={styles.filterCard}>
              <div className="interpreter-list-filter-head" style={styles.filterHead}>
                <h2 style={styles.filterTitle}>통역사 검색 필터</h2>
                <button
                  type="button"
                  onClick={() => setFilters(initialFilters)}
                  style={styles.resetButton}
                  className="interpreter-list-reset-button"
                >
                  필터 초기화
                </button>
              </div>

              <FilterSelect
                label="성별"
                value={filters.gender}
                onChange={(value) => updateFilter("gender", value)}
                options={["전체", "남성", "여성"]}
              />
              <FilterSelect
                label="활동 가능 지역"
                value={filters.region}
                onChange={(value) => updateFilter("region", value)}
                options={regionOptions}
              />
              <FilterSelect
                label="통역 분야"
                value={filters.field}
                onChange={(value) => updateFilter("field", value)}
                options={fieldOptions}
              />
              <FilterSelect
                label="통역 레벨"
                value={filters.level}
                onChange={(value) => updateFilter("level", value)}
                options={levelOptions}
              />
              <FilterSelect
                label="나이"
                value={filters.ageGroup}
                onChange={(value) => updateFilter("ageGroup", value)}
                options={ageOptions}
                hint="나이는 만 나이 기준입니다."
              />
              <label className="interpreter-list-filter-field" style={styles.filterField}>
                <span style={styles.filterLabel}>키워드 검색</span>
                <input
                  value={filters.keyword}
                  onChange={(event) => updateFilter("keyword", event.target.value)}
                  placeholder="이름, 지역, 분야, 경력 검색"
                  style={styles.filterInput}
                  className="interpreter-list-filter-input"
                />
              </label>
            </div>

            <p style={styles.resultText}>
              총 {filteredInterpreters.length}명의 통역사가 표시됩니다
            </p>

            {filteredInterpreters.length === 0 ? (
              <MessageBox text="조건에 맞는 통역사가 없습니다." />
            ) : (
              <div className="interpreter-list-grid" style={styles.grid}>
                {filteredInterpreters.map((person) => (
              <div key={person.id} className="interpreter-list-card" style={styles.card}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                    gap: "12px",
                  }}
                  className="interpreter-list-card-head"
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "24px",
                      fontWeight: "800",
                      color: "#111827",
                    }}
                  >
                    {person.name || "이름 미입력"}
                  </h2>

                  <span style={getLevelBadgeStyle(person.level)}>
                    {normalizeLevel(person.level)}
                  </span>
                </div>

                <Info label="활동 상태" value={getInterpreterStatusLabel(person)} />
                <Info label="활동 가능 지역" value={formatList(person.available_regions)} />
                <Info label="전문 분야" value={formatList(person.specialties)} />
                <Info label="가능 언어" value={person.language_level || person.jlpt || "한국어 · 일본어"} />
                <Info
                  label="통역 경험"
                  value={getExperienceLabel(person)}
                />
                <Info
                  label={getPrimaryPublicInterpreterInfo(person).label}
                  value={getPrimaryPublicInterpreterInfo(person).value}
                />

                <button
  onClick={() => onDetailClick(person)}
  className="interpreter-list-card-button"
  style={styles.cardButton}
>
  상세 보기
</button>
              </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, hint }) {
  return (
    <label className="interpreter-list-filter-field" style={styles.filterField}>
      <span style={styles.filterLabel}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.filterInput}
        className="interpreter-list-filter-input"
      >
        {options.map((option) => {
          const optionValue =
            typeof option === "string" ? option : option.value;
          const optionLabel =
            typeof option === "string" ? option : option.label;

          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
      {hint && <span style={styles.filterHint}>{hint}</span>}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div
      className="interpreter-list-info-row"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "9px 0",
        borderBottom: "1px solid #f1f5f9",
        fontSize: "14px",
      }}
    >
      <span style={{ color: "#6b7280", fontWeight: "600" }}>{label}</span>
      <span style={{ color: "#111827", textAlign: "right" }}>
        {value || "-"}
      </span>
    </div>
  );
}

function MessageBox({ text }) {
  return (
    <div
      style={{
        background: "white",
        padding: "40px",
        borderRadius: "20px",
        textAlign: "center",
        color: "#6b7280",
      }}
    >
      {text}
    </div>
  );
}

function normalizeText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" ").toLowerCase();
  return String(value || "").toLowerCase();
}

function formatList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value || "-";
}

function getGenderText(value) {
  const gender = normalizeText(value);
  if (gender.includes("남")) return "남성";
  if (gender.includes("여")) return "여성";
  return "";
}

function getRegionText(person) {
  return [
    person.region,
    person.available_region,
    person.available_regions,
    person.available_area,
  ]
    .map(normalizeText)
    .join(" ");
}

function normalizeRegionText(value) {
  return normalizeText(value).replaceAll("카나가와", "가나가와");
}

function getFieldMatches(person, filter) {
  if (filter === "전체") return true;

  const fieldText = normalizeFieldText(
    [
      person.specialty,
      person.specialties,
      person.category,
      person.interpretation_field,
      person.available_tasks,
      person.intro,
      person.career,
    ]
      .map(normalizeText)
      .join(" ")
  );
  const selectedField = normalizeFieldText(filter);

  if (!fieldText) return true;
  if (selectedField === "기타") {
    return !fieldOptions
      .filter((option) => option !== "전체" && option !== "기타")
      .some((option) => fieldText.includes(normalizeFieldText(option)));
  }

  return fieldText.includes(selectedField);
}

function normalizeFieldText(value) {
  return normalizeText(value)
    .replaceAll("뷰티/코스메", "뷰티")
    .replaceAll("코스메", "뷰티")
    .replaceAll("화장품", "뷰티")
    .replaceAll("의료/헬스케어", "의료")
    .replaceAll("헬스케어", "의료")
    .replaceAll("it/스타트업", "it")
    .replaceAll("스타트업", "it")
    .replaceAll("관광/문화", "관광")
    .replaceAll("제조/기계", "제조")
    .replaceAll("기계", "제조")
    .replaceAll("일반 비즈니스", "비즈니스");
}

function getLevelMatches(person, filter) {
  if (!filter) return true;

  return normalizeLevelText(person.level) === filter;
}

function normalizeLevelText(value) {
  const matchedLevel = normalizeText(value).match(/lv\s*(\d)/i);
  return matchedLevel ? `LV${matchedLevel[1]}` : "";
}

function getAgeMatches(person, filter) {
  if (!filter) return true;

  const age = getAgeNumber(person.age);
  if (age === null) return false;

  if (filter === "20s") return age >= 20 && age <= 29;
  if (filter === "30s") return age >= 30 && age <= 39;
  if (filter === "40s") return age >= 40 && age <= 49;
  if (filter === "50plus") return age >= 50;

  return true;
}

function getAgeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const age = Number(value);
  return Number.isFinite(age) ? age : null;
}

function getSearchText(person) {
  return [
    person.name,
    person.major,
    person.region,
    person.available_region,
    person.available_regions,
    person.specialty,
    person.specialties,
    person.category,
    person.interpretation_field,
    person.experience,
    person.experience_count,
    getExperienceLabel(person),
    person.career,
    person.intro,
    person.available_tasks,
    person.specialties,
  ]
    .map(normalizeText)
    .join(" ");
}

function getExperienceLabel(person) {
  return person.has_experience ? "통역 경험 있음" : "통역 경험 없음";
}

function getInterpreterStatusLabel(person) {
  const status = String(person.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) {
    return getInterpreterActivityStatusLabel(status);
  }
  return getInterpreterActivityStatusLabel(INTERPRETER_ACTIVITY_STATUS.ACTIVE);
}

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "18px",
    flexWrap: "wrap",
    marginBottom: "26px",
  },
  kicker: {
    fontSize: "13px",
    letterSpacing: "5px",
    color: "#4f46e5",
    fontWeight: "700",
    margin: "0 0 8px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(30px, 5vw, 40px)",
    fontWeight: "900",
    color: "#111827",
  },
  description: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "15px",
    lineHeight: 1.6,
  },
  registerButton: {
    padding: "11px 16px",
    borderRadius: "12px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "14px",
  },
  filterCard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginBottom: "14px",
    padding: "20px",
    borderRadius: "16px",
    background: "#ffffff",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    border: "1px solid rgba(209, 213, 219, 0.72)",
  },
  filterHead: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  filterTitle: {
    margin: 0,
    color: "#111827",
    fontSize: "18px",
    fontWeight: "900",
  },
  filterField: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    textAlign: "left",
  },
  filterLabel: {
    color: "#374151",
    fontSize: "13px",
    fontWeight: "800",
  },
  filterHint: {
    color: "#9ca3af",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: 1.5,
    wordBreak: "keep-all",
    overflowWrap: "break-word",
  },
  filterInput: {
    width: "100%",
    minHeight: "44px",
    padding: "0 13px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  resetButton: {
    minHeight: "42px",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#1f2937",
    cursor: "pointer",
    fontWeight: "900",
  },
  resultText: {
    margin: "0 0 18px",
    color: "#4b5563",
    fontSize: "14px",
    fontWeight: "800",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    minHeight: "430px",
    background: "rgba(255, 255, 255, 0.94)",
    borderRadius: "18px",
    padding: "22px",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.09)",
    border: "1px solid #e5e7eb",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
  },
  cardButton: {
    marginTop: "auto",
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "900",
    cursor: "pointer",
    fontSize: "14px",
  },
};

export default InterpreterList;
