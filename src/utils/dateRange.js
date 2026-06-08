import { formatDisplayDate, formatDisplayDateRange, normalizeDateToISO } from "./date";

export function formatDateRange(startDate, endDate, fallbackDate) {
  const fallbackRange = splitFallbackDate(fallbackDate);
  const start = startDate || fallbackRange[0];
  const end = endDate || fallbackRange[1];

  if (!start) return "일정 미정";
  if (!end || normalizeDateInput(start) === normalizeDateInput(end)) {
    return formatDisplayDate(start);
  }

  return formatDisplayDateRange(start, end);
}

export function formatCompactJobDateRange(startDate, endDate, fallbackDate) {
  const fallbackRange = splitFallbackDate(fallbackDate);
  const start = normalizeDateInput(startDate || fallbackRange[0]);
  const end = normalizeDateInput(endDate || fallbackRange[1]);

  if (!start) return "일정 미정";
  if (!end || start === end) {
    return formatDisplayDate(start);
  }

  const [startYear, startMonth] = start.split("-");
  const [endYear, endMonth, endDay] = end.split("-");

  if (startYear === endYear && startMonth === endMonth) {
    return `${formatDisplayDate(start)} ~ ${endDay}`;
  }

  return formatDisplayDateRange(start, end);
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
  return normalizeDateToISO(date);
}
