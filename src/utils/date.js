export function getMonthRange(monthValue) {
  const month = String(monthValue || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { monthStart: "", monthEnd: "" };
  }

  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const monthEndDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const monthEndDay = String(monthEndDate.getUTCDate()).padStart(2, "0");

  return {
    monthStart: `${month}-01`,
    monthEnd: `${month}-${monthEndDay}`,
  };
}

export function normalizeDateToISO(dateValue) {
  const text = String(dateValue || "").trim();
  if (!text) return "";

  const normalizedText = text.replaceAll(".", "-").replaceAll("/", "-");
  const match = normalizedText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function formatDisplayDate(dateValue) {
  const isoDate = normalizeDateToISO(dateValue);
  if (!isoDate) return dateValue ? String(dateValue) : "날짜 미입력";
  return isoDate.replaceAll("-", ".");
}

export function formatDisplayDateRange(startDate, endDate) {
  const start = normalizeDateToISO(startDate);
  const end = normalizeDateToISO(endDate) || start;

  if (!start) return "날짜 미입력";
  if (!end || start === end) return formatDisplayDate(start);
  return `${formatDisplayDate(start)} ~ ${formatDisplayDate(end)}`;
}

export function formatDisplayMonth(monthValue) {
  const month = String(monthValue || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return "";

  const [year, monthText] = month.split("-");
  return `${year}년 ${Number(monthText)}월`;
}

export function addDays(dateValue, days) {
  const isoDate = normalizeDateToISO(dateValue);
  if (!isoDate) return "";

  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function isDateRangeOverlappingMonth(startDate, endDate, monthValue) {
  const { monthStart, monthEnd } = getMonthRange(monthValue);
  if (!monthStart || !monthEnd) return true;

  const start = normalizeDateToISO(startDate);
  const end = normalizeDateToISO(endDate) || start;
  if (!start) return false;

  return start <= monthEnd && end >= monthStart;
}
