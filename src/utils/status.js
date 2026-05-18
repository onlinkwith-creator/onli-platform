export const JOB_STATUS = {
  OPEN: "open",
  CLOSING_SOON: "closing_soon",
  CLOSED: "closed",
  ASSIGNED: "assigned",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const APPLICATION_STATUS = {
  PENDING: "pending",
  REVIEWING: "reviewing",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

export const MATCHING_STATUS = {
  DRAFT: "draft",
  ASSIGNED: "assigned",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  SETTLEMENT_PENDING: "settlement_pending",
  SETTLED: "settled",
  CANCELLED: "cancelled",
};

export const JOB_STATUS_OPTIONS = [
  { value: JOB_STATUS.OPEN, label: "모집중" },
  { value: JOB_STATUS.CLOSING_SOON, label: "마감임박" },
  { value: JOB_STATUS.CLOSED, label: "모집마감" },
  { value: JOB_STATUS.ASSIGNED, label: "배정완료" },
  { value: JOB_STATUS.COMPLETED, label: "운영완료" },
  { value: JOB_STATUS.CANCELLED, label: "취소" },
];

export const APPLICATION_STATUS_OPTIONS = [
  { value: APPLICATION_STATUS.PENDING, label: "지원접수" },
  { value: APPLICATION_STATUS.REVIEWING, label: "검토중" },
  { value: APPLICATION_STATUS.ACCEPTED, label: "합격" },
  { value: APPLICATION_STATUS.REJECTED, label: "불합격" },
  { value: APPLICATION_STATUS.CANCELLED, label: "취소" },
];

export const MATCHING_STATUS_OPTIONS = [
  { value: MATCHING_STATUS.DRAFT, label: "임시배정" },
  { value: MATCHING_STATUS.ASSIGNED, label: "배정완료" },
  { value: MATCHING_STATUS.CONFIRMED, label: "확정" },
  { value: MATCHING_STATUS.IN_PROGRESS, label: "운영중" },
  { value: MATCHING_STATUS.COMPLETED, label: "운영완료" },
  { value: MATCHING_STATUS.SETTLEMENT_PENDING, label: "정산대기" },
  { value: MATCHING_STATUS.SETTLED, label: "정산완료" },
  { value: MATCHING_STATUS.CANCELLED, label: "취소" },
];

const JOB_STATUS_LABELS = Object.fromEntries(
  JOB_STATUS_OPTIONS.map((option) => [option.value, option.label])
);
const APPLICATION_STATUS_LABELS = Object.fromEntries(
  APPLICATION_STATUS_OPTIONS.map((option) => [option.value, option.label])
);
const MATCHING_STATUS_LABELS = Object.fromEntries(
  MATCHING_STATUS_OPTIONS.map((option) => [option.value, option.label])
);

export function normalizeJobStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["모집중", "open"].includes(normalized)) return JOB_STATUS.OPEN;
  if (["마감임박", "closing_soon"].includes(normalized)) return JOB_STATUS.CLOSING_SOON;
  if (["마감", "모집마감", "closed"].includes(normalized)) return JOB_STATUS.CLOSED;
  if (["배정", "배정완료", "assigned"].includes(normalized)) return JOB_STATUS.ASSIGNED;
  if (["완료", "운영완료", "completed"].includes(normalized)) return JOB_STATUS.COMPLETED;
  if (["취소", "cancelled", "canceled"].includes(normalized)) return JOB_STATUS.CANCELLED;
  return JOB_STATUS.OPEN;
}

export function normalizeApplicationStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["지원접수", "지원완료", "대기", "pending"].includes(normalized)) {
    return APPLICATION_STATUS.PENDING;
  }
  if (["검토중", "보류", "reviewing"].includes(normalized)) {
    return APPLICATION_STATUS.REVIEWING;
  }
  if (["합격", "승인", "매칭완료", "accepted", "approved"].includes(normalized)) {
    return APPLICATION_STATUS.ACCEPTED;
  }
  if (["불합격", "거절", "rejected"].includes(normalized)) {
    return APPLICATION_STATUS.REJECTED;
  }
  if (["취소", "cancelled", "canceled"].includes(normalized)) {
    return APPLICATION_STATUS.CANCELLED;
  }
  return APPLICATION_STATUS.PENDING;
}

export function normalizeMatchingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["임시배정", "대기", "pending", "draft"].includes(normalized)) {
    return MATCHING_STATUS.DRAFT;
  }
  if (["배정", "배정완료", "매칭완료", "matched", "assigned"].includes(normalized)) {
    return MATCHING_STATUS.ASSIGNED;
  }
  if (["확정", "confirmed"].includes(normalized)) return MATCHING_STATUS.CONFIRMED;
  if (["운영중", "진행중", "matching", "in_progress", "in progress"].includes(normalized)) {
    return MATCHING_STATUS.IN_PROGRESS;
  }
  if (["완료", "운영완료", "completed"].includes(normalized)) {
    return MATCHING_STATUS.COMPLETED;
  }
  if (["정산대기", "settlement_pending"].includes(normalized)) {
    return MATCHING_STATUS.SETTLEMENT_PENDING;
  }
  if (["정산완료", "settled"].includes(normalized)) return MATCHING_STATUS.SETTLED;
  if (["취소", "cancelled", "canceled"].includes(normalized)) {
    return MATCHING_STATUS.CANCELLED;
  }
  return MATCHING_STATUS.DRAFT;
}

export function getJobStatusLabel(status) {
  return JOB_STATUS_LABELS[normalizeJobStatus(status)] || "상태미정";
}

export function getApplicationStatusLabel(status) {
  return APPLICATION_STATUS_LABELS[normalizeApplicationStatus(status)] || "상태미정";
}

export function getMatchingStatusLabel(status) {
  return MATCHING_STATUS_LABELS[normalizeMatchingStatus(status)] || "상태미정";
}

export function getStatusBadgeClass(status) {
  const normalized = String(status || "").trim();
  const lower = normalized.toLowerCase();
  const jobLike = [
    "모집중",
    "open",
    "마감임박",
    "closing_soon",
    "마감",
    "모집마감",
    "closed",
    "배정",
    "배정완료",
    "assigned",
    "완료",
    "운영완료",
    "completed",
    "취소",
    "cancelled",
    "canceled",
  ].includes(lower);
  const applicationLike = [
    "지원접수",
    "지원완료",
    "대기",
    "pending",
    "검토중",
    "보류",
    "reviewing",
    "합격",
    "승인",
    "매칭완료",
    "accepted",
    "approved",
    "불합격",
    "거절",
    "rejected",
    "취소",
    "cancelled",
    "canceled",
  ].includes(lower);
  const matchingLike = [
    "임시배정",
    "대기",
    "pending",
    "draft",
    "배정",
    "배정완료",
    "매칭완료",
    "matched",
    "assigned",
    "확정",
    "confirmed",
    "운영중",
    "진행중",
    "matching",
    "in_progress",
    "in progress",
    "완료",
    "운영완료",
    "completed",
    "정산대기",
    "settlement_pending",
    "정산완료",
    "settled",
    "취소",
    "cancelled",
    "canceled",
  ].includes(lower);
  const jobStatus = jobLike ? normalizeJobStatus(normalized) : "";
  const applicationStatus = applicationLike ? normalizeApplicationStatus(normalized) : "";
  const matchingStatus = matchingLike ? normalizeMatchingStatus(normalized) : "";

  if (
    jobStatus === JOB_STATUS.OPEN ||
    applicationStatus === APPLICATION_STATUS.ACCEPTED ||
    matchingStatus === MATCHING_STATUS.COMPLETED ||
    matchingStatus === MATCHING_STATUS.SETTLED ||
    normalized === "public" ||
    normalized === "공개" ||
    normalized === "승인 완료"
  ) {
    return "badge-green";
  }
  if (
    jobStatus === JOB_STATUS.ASSIGNED ||
    applicationStatus === APPLICATION_STATUS.PENDING ||
    matchingStatus === MATCHING_STATUS.ASSIGNED ||
    matchingStatus === MATCHING_STATUS.CONFIRMED
  ) {
    return "badge-blue";
  }
  if (
    jobStatus === JOB_STATUS.CLOSED ||
    matchingStatus === MATCHING_STATUS.DRAFT ||
    normalized === "private" ||
    normalized === "비공개" ||
    normalized === "일반의뢰"
  ) {
    return "badge-gray";
  }
  if (
    jobStatus === JOB_STATUS.CLOSING_SOON ||
    applicationStatus === APPLICATION_STATUS.REVIEWING ||
    matchingStatus === MATCHING_STATUS.IN_PROGRESS ||
    normalized === "승인 대기"
  ) {
    return "badge-yellow";
  }
  if (matchingStatus === MATCHING_STATUS.SETTLEMENT_PENDING) return "badge-orange";
  if (
    jobStatus === JOB_STATUS.CANCELLED ||
    applicationStatus === APPLICATION_STATUS.REJECTED ||
    applicationStatus === APPLICATION_STATUS.CANCELLED ||
    matchingStatus === MATCHING_STATUS.CANCELLED ||
    normalized === "suspended" ||
    normalized === "반려"
  ) {
    return "badge-red";
  }
  if (normalized === "지정의뢰") return "badge-purple";
  return "badge-blue";
}
