export function formatDateRange(startDate, endDate, fallbackDate) {
  const format = (date) => {
    if (!date) return "";
    return String(date).slice(0, 10).replaceAll("-", ".");
  };

  const fallbackRange = splitFallbackDate(fallbackDate);
  const start = startDate || fallbackRange[0];
  const end = endDate || fallbackRange[1];

  if (!start) return "일정 미정";
  if (!end || start === end) return format(start);

  return `${format(start)} ~ ${format(end)}`;
}

export function getDateRangeStart(startDate, fallbackDate) {
  return normalizeDateInput(startDate || splitFallbackDate(fallbackDate)[0]);
}

export function getDateRangeEnd(endDate, fallbackDate) {
  return normalizeDateInput(endDate || splitFallbackDate(fallbackDate)[1]);
}

function splitFallbackDate(fallbackDate) {
  if (!fallbackDate) return ["", ""];
  const parts = String(fallbackDate).split("~").map((part) => part.trim());
  return [parts[0] || "", parts[1] || parts[0] || ""];
}

function normalizeDateInput(date) {
  if (!date) return "";
  return String(date).slice(0, 10).replaceAll(".", "-");
}
