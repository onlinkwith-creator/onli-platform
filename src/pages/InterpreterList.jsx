import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

const initialFilters = {
  gender: "전체",
  region: "전체",
  field: "전체",
  experienceCount: "전체",
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

const experienceCountOptions = [
  "전체",
  "1회 이상",
  "3회 이상",
  "5회 이상",
  "10회 이상",
];

function InterpreterList({ onBackClick, onDetailClick, onRegisterClick }) {
  const [interpreters, setInterpreters] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchInterpreters = async () => {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .eq("approved", true)
        .in("status", ["active", "warning"])
        .order("id", { ascending: false });

      if (error) {
        console.error(error);
        setErrorMessage("통역사 정보를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      setInterpreters(data || []);
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
        const experienceCountMatches = getExperienceCountMatches(
          person,
          filters.experienceCount
        );
        const keywordMatches =
          !keyword || getSearchText(person).toLowerCase().includes(keyword);

        return (
          genderMatches &&
          regionMatches &&
          fieldMatches &&
          experienceCountMatches &&
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
      style={{
        minHeight: "100vh",
        width: "100vw",
        background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
        padding: "60px 24px",
        boxSizing: "border-box",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <button
          onClick={onBackClick}
          className="main-return-button"
          style={{
            marginBottom: "30px",
            padding: "12px 18px",
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

        <div style={styles.header}>
          <div>
            <p style={styles.kicker}>ON-LI INTERPRETERS</p>
            <h1 style={styles.title}>통역사 리스트</h1>
            <p style={styles.description}>
              승인된 한일 비즈니스 통역사 정보를 확인할 수 있습니다.
            </p>
          </div>

          <button type="button" onClick={onRegisterClick} style={styles.registerButton}>
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
            <div style={styles.filterCard}>
              <div style={styles.filterHead}>
                <h2 style={styles.filterTitle}>통역사 검색 필터</h2>
                <button
                  type="button"
                  onClick={() => setFilters(initialFilters)}
                  style={styles.resetButton}
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
                label="통역 경험 횟수"
                value={filters.experienceCount}
                onChange={(value) => updateFilter("experienceCount", value)}
                options={experienceCountOptions}
              />
              <label style={styles.filterField}>
                <span style={styles.filterLabel}>키워드 검색</span>
                <input
                  value={filters.keyword}
                  onChange={(event) => updateFilter("keyword", event.target.value)}
                  placeholder="이름, 지역, 분야, 경력 검색"
                  style={styles.filterInput}
                />
              </label>
            </div>

            <p style={styles.resultText}>
              총 {filteredInterpreters.length}명의 통역사가 표시됩니다
            </p>

            {filteredInterpreters.length === 0 ? (
              <MessageBox text="조건에 맞는 통역사가 없습니다." />
            ) : (
              <div style={styles.grid}>
                {filteredInterpreters.map((person) => (
              <div
                key={person.id}
                style={{
                  background: "rgba(255, 255, 255, 0.9)",
                  borderRadius: "24px",
                  padding: "26px",
                  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
                  border: "1px solid rgba(255,255,255,0.8)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                    gap: "12px",
                  }}
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

                  <span style={styles.levelBadge}>{person.level || "Lv 미정"}</span>
                </div>

                <Info label="성별" value={person.gender} />
                <Info label="나이" value={person.age} />
                <Info label="거주 지역" value={person.region} />
                <Info label="활동 가능 지역" value={formatList(person.available_regions)} />
                <Info label="학교/전공" value={person.school} />
                <Info label="일본 거주 기간" value={person.stay_period} />
                <Info
                  label="통역 경험"
                  value={
                    person.experience_count
                      ? `${person.experience_count}회`
                      : "-"
                  }
                />

                <button
  onClick={() => onDetailClick(person)}
  style={{
    marginTop: "20px",
    width: "100%",
    padding: "14px",
    borderRadius: "14px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    fontWeight: "800",
    cursor: "pointer",
    fontSize: "14px",
  }}
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

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={styles.filterField}>
      <span style={styles.filterLabel}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.filterInput}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div
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

function getExperienceCountMatches(person, filter) {
  if (filter === "전체") return true;

  const requiredCount = Number(filter.match(/\d+/)?.[0] || 0);
  const currentCount = getExperienceCount(person);

  return currentCount === null || currentCount >= requiredCount;
}

function getExperienceCount(person) {
  const values = [
    person.experience_count,
    person.interpretation_count,
    person.interpretation_experience,
    person.experience,
    person.career,
  ];

  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;

    const text = String(value || "");
    const matchedNumber = text.match(/\d+/);
    if (matchedNumber) return Number(matchedNumber[0]);
  }

  return null;
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
    person.interpretation_experience,
    person.career,
    person.intro,
    person.available_tasks,
    person.specialties,
  ]
    .map(normalizeText)
    .join(" ");
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
    fontSize: "42px",
    fontWeight: "800",
    color: "#111827",
  },
  description: {
    marginTop: "12px",
    color: "#6b7280",
    fontSize: "15px",
  },
  registerButton: {
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    background: "#4f46e5",
    color: "white",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "14px",
  },
  levelBadge: {
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#4f46e5",
    fontSize: "12px",
    fontWeight: "700",
    whiteSpace: "nowrap",
  },
  filterCard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginBottom: "14px",
    padding: "20px",
    borderRadius: "22px",
    background: "#ffffff",
    boxShadow: "0 18px 45px rgba(15, 23, 42, 0.1)",
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
  filterInput: {
    width: "100%",
    minHeight: "46px",
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
    gap: "22px",
  },
};

export default InterpreterList;
