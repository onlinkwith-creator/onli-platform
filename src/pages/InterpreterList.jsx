import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import { getLevelBadgeStyle, normalizeLevel } from "../utils/levelBadge";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import {
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

function InterpreterList({ onBackClick, onDetailClick, onRegisterClick }) {
  const [interpreters, setInterpreters] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchInterpreters = async () => {
      setLoading(true);
      setErrorMessage("");

      if (!supabase) {
        setErrorMessage(supabaseConfigError.message);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("interpreters")
        .select("*");

      if (error) {
        console.error("Interpreters fetch error:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
        setErrorMessage(`데이터를 불러오지 못했습니다. (${error.message})`);
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
    <div className="interpreter-list-page">
      <div className="home-bg-glow" />
      <div className="interpreter-list-shell">
        <button onClick={onBackClick} className="main-return-button">
          ← 메인으로
        </button>

        <div className="interpreter-list-header">
          <div>
            <p className="interpreter-list-kicker">ON-LI INTERPRETERS</p>
            <h1 className="interpreter-list-title">등록 통역사</h1>
            <p className="interpreter-list-description">
              검증된 한일 비즈니스 통역 인력을 확인하세요.
            </p>
          </div>

          <button
            type="button"
            onClick={onRegisterClick}
            className="interpreter-list-register-button"
          >
            통역사 등록
          </button>
        </div>

        {loading ? (
          <InterpreterSkeletonGrid />
        ) : errorMessage ? (
          <div className="interpreter-list-empty-card error">
            <p>{errorMessage}</p>
          </div>
        ) : interpreters.length === 0 ? (
          <div className="interpreter-list-empty-card empty">
            <div className="empty-icon">📂</div>
            <p>현재 표시할 데이터가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="interpreter-list-filter-card">
              <div className="interpreter-list-filter-head">
                <h2 className="interpreter-list-filter-title">통역사 검색 필터</h2>
                <button
                  type="button"
                  onClick={() => setFilters(initialFilters)}
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
              <label className="interpreter-list-filter-field">
                <span className="interpreter-list-filter-label">키워드 검색</span>
                <input
                  value={filters.keyword}
                  onChange={(event) => updateFilter("keyword", event.target.value)}
                  placeholder="이름, 지역, 분야, 경력 검색"
                  className="interpreter-list-filter-input"
                />
              </label>
            </div>

            <p className="interpreter-list-result-text">
              총 {filteredInterpreters.length}명의 통역사가 표시됩니다
            </p>

            {filteredInterpreters.length === 0 ? (
              <div className="interpreter-list-empty-card empty">
                <div className="empty-icon">📂</div>
                <p>현재 표시할 데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="interpreter-list-grid">
                {filteredInterpreters.map((person) => (
                  <div key={person.id} className="interpreter-list-card">
                    <div className="interpreter-list-card-head">
                      <h2>{person.name || "이름 미입력"}</h2>

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
    <label className="interpreter-list-filter-field">
      <span className="interpreter-list-filter-label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
      {hint && <span className="interpreter-list-filter-hint">{hint}</span>}
    </label>
  );
}

function Info({ label, value }) {
  return (
    <div className="interpreter-list-info-row">
      <span>{label}</span>
      <span>{value || "-"}</span>
    </div>
  );
}

function InterpreterSkeletonGrid() {
  return (
    <div className="interpreter-list-grid">
      {[1, 2, 3].map((n) => (
        <div key={n} className="interpreter-skeleton-card">
          <div className="skeleton-header">
            <div className="skeleton-name"></div>
            <div className="skeleton-level"></div>
          </div>
          <div className="skeleton-info-row" style={{ width: "80%" }}></div>
          <div className="skeleton-info-row" style={{ width: "95%" }}></div>
          <div className="skeleton-info-row" style={{ width: "70%" }}></div>
          <div className="skeleton-info-row" style={{ width: "85%" }}></div>
          <div className="skeleton-info-row" style={{ width: "90%" }}></div>
          <div className="skeleton-button"></div>
        </div>
      ))}
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

export default InterpreterList;
