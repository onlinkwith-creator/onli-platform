export const PUBLIC_INTERPRETER_SELECT = [
  "id",
  "name",
  "gender",
  "age",
  "region",
  "school",
  "jlpt",
  "stay_period",
  "has_experience",
  "specialties",
  "available_regions",
  "available_tasks",
  "level",
  "approved",
  "status",
  "activity_status",
].join(", ");

const FALLBACK_TEXT = "정보 확인 중";

export function getPublicInterpreterInfos(interpreter = {}) {
  return [
    {
      label: "통역 횟수",
      value: formatExperienceCount(interpreter),
    },
    {
      label: "가능 업무 분야",
      value: formatTaskFields(interpreter),
    },
    {
      label: "JLPT 등급",
      value: formatJlpt(interpreter.jlpt),
    },
    {
      label: "일본 거주 기간",
      value: formatStayPeriod(interpreter.stay_period),
    },
    {
      label: "활동 가능 지역",
      value: formatAvailableRegions(interpreter),
    },
  ].map((item) => ({
    ...item,
    value: item.value || FALLBACK_TEXT,
  }));
}

export function getPrimaryPublicInterpreterInfo(interpreter = {}) {
  return (
    getPublicInterpreterInfos(interpreter).find(
      (item) => item.value !== FALLBACK_TEXT
    ) || { label: "프로필 정보", value: "상담 후 안내" }
  );
}

function formatExperienceCount(interpreter) {
  const count = interpreter.experience_count;
  if (count !== null && count !== undefined && count !== "") {
    const numericCount = Number(count);
    if (Number.isFinite(numericCount)) return `통역 ${numericCount}회`;
    return `통역 ${count}`;
  }

  const experience = String(interpreter.experience || "").trim();
  if (experience) return experience;

  if (interpreter.has_experience) return "통역 경험 있음";

  return "";
}

function formatTaskFields(interpreter) {
  const tasks = getList(interpreter.available_tasks);
  if (tasks.length > 0) return tasks.join(" / ");

  const specialties = getList(interpreter.specialties || interpreter.specialty);
  if (specialties.length > 0) return specialties.join(" / ");

  const field = String(
    interpreter.interpretation_field || interpreter.category || ""
  ).trim();
  return field;
}

function formatJlpt(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^jlpt/i.test(text)) return text;
  if (/^n[1-5]/i.test(text)) return `JLPT ${text.toUpperCase()}`;
  return text;
}

function formatStayPeriod(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.includes("일본 거주") ? text : `일본 거주 ${text}`;
}

function formatAvailableRegions(interpreter) {
  const regions = getList(
    interpreter.available_regions ||
      interpreter.available_region ||
      interpreter.available_area ||
      interpreter.region
  );
  return regions.length > 0 ? `활동 가능 지역: ${regions.join(" / ")}` : "";
}

function getList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
