import { normalizeAssignmentStatus, normalizeOperationStatus } from "./operationsStatus.js";
import { formatDateRange } from "./dateRange.js";

export function buildJobPayloadFromRequest(request) {
  const title = request.event_name ? `${request.event_name} 통역 모집` : "통역 모집";
  const peopleCount = request.requested_people_count || request.required_count;
  const level = request.requested_level || request.required_level || "";
  const field = request.interpretation_field || request.job_field || "";
  const startDate = request.start_date || request.event_date || request.date || "";
  const endDate = request.end_date || startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !(Number(peopleCount) >= 1)) {
    throw new Error("공고 공개 전 행사 일정과 필요 인원을 확인해주세요.");
  }
  return {
    title,
    event_name: request.event_name || title,
    date: formatDateRange(startDate, endDate, startDate),
    event_date: startDate,
    start_date: startDate,
    end_date: endDate,
    location: request.event_location || request.location || "",
    event_location: request.event_location || request.location || "",
    pay: request.interpreter_fee ? `${Number(request.interpreter_fee).toLocaleString()}원` : "협의",
    language: "한국어 ↔ 일본어",
    level,
    requested_level: level,
    preference: [field, request.preferred_gender].filter(Boolean).join(" · "),
    preferred_gender: request.preferred_gender || "",
    people: `${peopleCount}명`,
    people_count: Number(peopleCount),
    field,
    status: "recruiting",
    assignment_status: normalizeAssignmentStatus(request),
    operation_status: normalizeOperationStatus(request),
    visibility: "public",
  };
}
