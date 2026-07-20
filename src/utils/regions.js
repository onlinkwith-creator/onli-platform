export const JAPAN_PREFECTURES = [
  "홋카이도", "아오모리", "이와테", "미야기", "아키타", "야마가타", "후쿠시마",
  "이바라키", "도치기", "군마", "사이타마", "치바", "도쿄", "가나가와",
  "니가타", "도야마", "이시카와", "후쿠이", "야마나시", "나가노", "기후",
  "시즈오카", "아이치", "미에", "시가", "교토", "오사카", "효고", "나라",
  "와카야마", "돗토리", "시마네", "오카야마", "히로시마", "야마구치",
  "도쿠시마", "가가와", "에히메", "고치", "후쿠오카", "사가", "나가사키",
  "구마모토", "오이타", "미야자키", "가고시마", "오키나와",
];

export function normalizeRegion(value) {
  return String(value || "").trim();
}

export function uniqueRegions(values = []) {
  return [...new Set(values.map(normalizeRegion).filter(Boolean))];
}

export function mergeRegions(selectedRegions = [], customRegions = []) {
  return uniqueRegions([...selectedRegions, ...customRegions]);
}
