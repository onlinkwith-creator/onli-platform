import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import { getLevelBadgeClass, normalizeLevel } from "../utils/levelBadge";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import { Briefcase, Languages, MapPin, Star } from "lucide-react";
import { isPublicInterpreterVisible } from "../utils/accountStatus";
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

function InterpreterList({ onBackClick, onDetailClick }) {
  const [interpreters, setInterpreters] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

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
        .select("*")
        .neq("status", "withdrawn");

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

      setInterpreters((data || []).filter(isPublicInterpreterVisible));
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

  const sortedInterpreters = useMemo(() => {
    let result = [...filteredInterpreters];
    if (sortBy === "experience") {
      result.sort((a, b) => {
        const aCount = Number(a.experience_count || 0);
        const bCount = Number(b.experience_count || 0);
        if (bCount !== aCount) return bCount - aCount;
        const aExp = a.has_experience ? 1 : 0;
        const bExp = b.has_experience ? 1 : 0;
        return bExp - aExp;
      });
    } else if (sortBy === "level") {
      result.sort((a, b) => {
        const parseLv = (lvl) => {
          const m = String(lvl || "").match(/lv\s*(\d)/i);
          return m ? Number(m[1]) : 0;
        };
        return parseLv(b.level) - parseLv(a.level);
      });
    } else {
      // latest (default)
      result.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        return Number(b.id || 0) - Number(a.id || 0);
      });
    }
    return result;
  }, [filteredInterpreters, sortBy]);

  // Reset pagination on filter or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortBy]);

  // Paginate items (9 items per page)
  const paginatedInterpreters = useMemo(() => {
    const start = (currentPage - 1) * 9;
    return sortedInterpreters.slice(start, start + 9);
  }, [sortedInterpreters, currentPage]);

  const totalPages = Math.ceil(sortedInterpreters.length / 9);

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
        {/* Premium Recruiter Hero Section */}
        <div className="interpreter-list-hero-content interpreter-hero">
          <div className="interpreter-list-hero-text">
            <button onClick={onBackClick} className="main-return-button">
              ← 메인으로
            </button>
            <span className="interpreter-list-hero-label">검증된 전문가와 함께하세요</span>
            <h1 className="interpreter-list-hero-title">등록 통역사</h1>
            <p className="interpreter-list-hero-subtitle">
              전문성과 경험을 갖춘 검증된 통역사들을 확인하고,<br />
              귀사의 비즈니스에 최적의 파트너를 찾아보세요.
            </p>
            <p className="interpreter-list-hero-mobile-subtitle">
              검증된 통역사를 조건에 맞게 찾아보세요.
            </p>
          </div>
          <div className="interpreter-list-hero-illustration interpreter-hero-visual">
            <div className="illustration-glow-circle-1" />
            <div className="illustration-glow-circle-2" />
            <div className="illustration-card-mockup verified-system-card">
              <span className="mockup-badge">ON-LI VERIFIED</span>
              <h3 className="mockup-card-title">실무형 통역사 검증 시스템</h3>
              <div className="mockup-bullets">
                <span>✓ 전시회</span>
                <span>✓ 상담회</span>
                <span>✓ 비즈니스 미팅 대응</span>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <InterpreterSkeletonGrid />
        ) : errorMessage ? (
          <div className="interpreter-list-empty-card error">
            <p>{errorMessage}</p>
          </div>
        ) : (
          <>
            {/* Glassmorphic Filters */}
            <div
              id="interpreter-list-filter-panel"
              className={`interpreter-list-filter-card ${
                isMobileFilterOpen ? "is-open" : "is-collapsed"
              }`}
            >
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

            {/* Grid stats & sorting select */}
            <div className="interpreter-list-toolbar">
              <p className="interpreter-list-result-text">
                총 {sortedInterpreters.length}명의 통역사가 표시됩니다
              </p>

              <div className="interpreter-list-actions">
                <button
                  type="button"
                  className="interpreter-list-filter-toggle"
                  onClick={() => setIsMobileFilterOpen((current) => !current)}
                  aria-expanded={isMobileFilterOpen}
                  aria-controls="interpreter-list-filter-panel"
                >
                  필터
                </button>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="interpreter-list-sort-select"
                >
                  <option value="latest">최신 등록순</option>
                  <option value="experience">경험 많은순</option>
                  <option value="level">Lv 높은순</option>
                </select>
              </div>
            </div>

            {sortedInterpreters.length === 0 ? (
              <div className="interpreter-list-empty-card empty">
                <div className="empty-icon">📂</div>
                <p>현재 표시할 데이터가 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="interpreter-list-grid">
                  {paginatedInterpreters.map((person) => {
                    const specialties = Array.isArray(person.specialties)
                      ? person.specialties
                      : typeof person.specialties === "string"
                      ? person.specialties.split(",").map(s => s.trim())
                      : [];
                    const tagBadges = specialties.length > 0 ? specialties.slice(0, 3) : ["일반 비즈니스", "전시회", "B2B"];
                    const summaryParts = [
                      formatList(person.available_regions),
                      tagBadges[0],
                      person.language_level || person.jlpt || "한국어 · 일본어",
                    ].filter((value) => value && value !== "-");
                    const experienceCount = person.experience_count ? Number(person.experience_count) : 0;
                    const openDetail = () => {
                      if (onDetailClick) {
                        onDetailClick(person);
                        return;
                      }

                      if (person?.id) {
                        window.history.pushState({}, "", `/interpreters/${person.id}`);
                        window.location.reload();
                      }
                    };
                    const handleCardKeyDown = (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDetail();
                      }
                    };

                    return (
                      <div
                        key={person.id}
                        className="interpreter-list-card"
                        role="button"
                        tabIndex={0}
                        onClick={openDetail}
                        onKeyDown={handleCardKeyDown}
                        aria-label={`${person.name || "통역사"} 상세 보기`}
                      >
                        <div className="interpreter-list-card-head">
                          <div className="interpreter-list-card-meta-left">
                            <h2>{person.name || "이름 미입력"}</h2>
                            <div className="interpreter-list-compact-badges">
                              <span className="interpreter-list-activity-badge">
                                <span className="dot" />
                                {getInterpreterStatusLabel(person)}
                              </span>
                              <span className={`interpreter-list-mobile-verification ${person.approved ? "verified" : "regular"}`}>
                                {person.approved ? "검증됨" : "일반 등록"}
                              </span>
                            </div>
                          </div>

                          <span className={`interpreter-list-card-level ${getLevelClass(person.level)}`}>
                            {normalizeLevel(person.level)}
                          </span>
                        </div>

                        <p className="interpreter-list-mobile-summary">
                          {summaryParts.join(" · ")}
                        </p>

                        <div className="interpreter-list-mobile-details">
                          <MobileInfoRow
                            icon={MapPin}
                            label="활동지역"
                            value={formatList(person.available_regions)}
                          />
                          <MobileInfoRow
                            icon={Briefcase}
                            label="전문분야"
                            value={formatList(person.specialties)}
                          />
                          <MobileInfoRow
                            icon={Languages}
                            label="언어수준"
                            value={person.language_level || person.jlpt || "한국어 · 일본어"}
                          />
                          {experienceCount > 0 && (
                            <div className="interpreter-list-mobile-experience">
                              <Star size={15} aria-hidden="true" />
                              <span>통역 경험 {experienceCount}회</span>
                            </div>
                          )}
                        </div>

                        <div className="interpreter-list-info-section">
                          <Info
                            label="검증 상태"
                            value={
                              person.approved ? (
                                <span className="interpreter-verification-badge verified">✔ 검증 완료</span>
                              ) : (
                                <span className="interpreter-verification-badge regular">○ 일반 등록</span>
                              )
                            }
                          />
                          <Info label="활동 가능 지역" value={formatList(person.available_regions)} />
                          <Info label="전문 분야" value={formatList(person.specialties)} />
                          <Info label="언어 수준" value={person.language_level || person.jlpt || "한국어 · 일본어"} />
                          <Info
                            label="통역 경험"
                            value={person.experience_count ? `${person.experience_count}회` : person.has_experience ? "경험 있음" : "경험 없음"}
                          />
                        </div>

                        {/* Skill tag lists */}
                        <div className="interpreter-list-tags">
                          {tagBadges.map((badge, idx) => (
                            <span key={idx} className="interpreter-list-tag">
                              #{badge}
                            </span>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail();
                          }}
                          className="interpreter-list-card-button"
                        >
                          <span className="interpreter-list-button-label-desktop">상세 보기</span>
                          <span className="interpreter-list-button-label-mobile">프로필 보기</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Circular Pagination indicator */}
                {totalPages > 1 && (
                  <div className="interpreter-list-pagination">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className="interpreter-list-page-btn"
                    >
                      &lt;
                    </button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`interpreter-list-page-btn ${currentPage === pageNum ? "active" : ""}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className="interpreter-list-page-btn"
                    >
                      &gt;
                    </button>
                  </div>
                )}
              </>
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

function MobileInfoRow({ icon: Icon, label, value }) {
  return (
    <div className="interpreter-list-mobile-info-row">
      <Icon size={15} aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value || "-"}</strong>
      </div>
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

function getLevelClass(level) {
  return getLevelBadgeClass(level);
}

export default InterpreterList;
