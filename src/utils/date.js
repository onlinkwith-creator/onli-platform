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

export function isDateRangeOverlappingMonth(startDate, endDate, monthValue) {
  const { monthStart, monthEnd } = getMonthRange(monthValue);
  if (!monthStart || !monthEnd) return true;

  const start = normalizeDateToISO(startDate);
  const end = normalizeDateToISO(endDate) || start;
  if (!start) return false;

  return start <= monthEnd && end >= monthStart;
}
