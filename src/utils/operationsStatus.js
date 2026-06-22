export const ASSIGNMENT_STATUS = {
  WAITING: "waiting",
  ASSIGNING: "assigning",
  ASSIGNED: "assigned",
};

export const OPERATION_STATUS = {
  BEFORE_OPERATION: "before_operation",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

export const SETTLEMENT_FLOW_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  COMPLETED: "completed",
};

export const ASSIGNMENT_STATUS_OPTIONS = [
  { value: ASSIGNMENT_STATUS.WAITING, label: "배정대기" },
  { value: ASSIGNMENT_STATUS.ASSIGNING, label: "배정중" },
  { value: ASSIGNMENT_STATUS.ASSIGNED, label: "배정완료" },
];

export const OPERATION_STATUS_OPTIONS = [
  { value: OPERATION_STATUS.BEFORE_OPERATION, label: "운영전" },
  { value: OPERATION_STATUS.IN_PROGRESS, label: "운영중" },
  { value: OPERATION_STATUS.COMPLETED, label: "운영완료" },
];

export const SETTLEMENT_FLOW_STATUS_OPTIONS = [
  { value: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED, label: "정산없음" },
  { value: SETTLEMENT_FLOW_STATUS.PENDING, label: "정산대기" },
  { value: SETTLEMENT_FLOW_STATUS.COMPLETED, label: "정산완료" },
];

export function normalizeAssignmentStatus(item = {}) {
  const value = getStatusValue(item.assignment_status || item.status || item.matching_status);
  if (["assigned", "confirmed", "배정완료", "배정", "매칭완료"].includes(value)) {
    return ASSIGNMENT_STATUS.ASSIGNED;
  }
  if (["assigning", "in_progress", "matching", "배정중", "매칭중", "진행중", "통역사 확인중", "확인중", "지정 요청중"].includes(value)) {
    return ASSIGNMENT_STATUS.ASSIGNING;
  }
  return ASSIGNMENT_STATUS.WAITING;
}

export function normalizeOperationStatus(item = {}) {
  const value = getStatusValue(item.operation_status || item.status || item.matching_status);
  if (["completed", "settled", "운영완료", "완료", "정산완료"].includes(value)) {
    return OPERATION_STATUS.COMPLETED;
  }
  if (["in_progress", "matching", "운영중", "진행중"].includes(value)) {
    return OPERATION_STATUS.IN_PROGRESS;
  }
  return OPERATION_STATUS.BEFORE_OPERATION;
}

export function normalizeSettlementFlowStatus(item = {}) {
  const value = getStatusValue(item.settlement_status || item.status || item.matching_status);
  if (["completed", "settled", "정산완료"].includes(value)) {
    return SETTLEMENT_FLOW_STATUS.COMPLETED;
  }
  if (["pending", "settlement_pending", "unsettled", "정산대기", "미정산"].includes(value)) {
    return SETTLEMENT_FLOW_STATUS.PENDING;
  }
  return SETTLEMENT_FLOW_STATUS.NOT_REQUIRED;
}

export function getAssignmentStatusLabel(status) {
  return getOptionLabel(ASSIGNMENT_STATUS_OPTIONS, status, "배정대기");
}

export function getOperationStatusLabel(status) {
  return getOptionLabel(OPERATION_STATUS_OPTIONS, status, "운영전");
}

export function getSettlementFlowStatusLabel(status) {
  return getOptionLabel(SETTLEMENT_FLOW_STATUS_OPTIONS, status, "정산없음");
}

export function getAssignmentStatusBadgeClass(status) {
  return {
    [ASSIGNMENT_STATUS.WAITING]: "flow-badge-gray",
    [ASSIGNMENT_STATUS.ASSIGNING]: "flow-badge-blue",
    [ASSIGNMENT_STATUS.ASSIGNED]: "flow-badge-indigo",
  }[status] || "flow-badge-gray";
}

export function getOperationStatusBadgeClass(status) {
  return {
    [OPERATION_STATUS.BEFORE_OPERATION]: "flow-badge-gray",
    [OPERATION_STATUS.IN_PROGRESS]: "flow-badge-orange",
    [OPERATION_STATUS.COMPLETED]: "flow-badge-green",
  }[status] || "flow-badge-gray";
}

export function getSettlementFlowStatusBadgeClass(status) {
  return {
    [SETTLEMENT_FLOW_STATUS.NOT_REQUIRED]: "flow-badge-gray",
    [SETTLEMENT_FLOW_STATUS.PENDING]: "flow-badge-purple",
    [SETTLEMENT_FLOW_STATUS.COMPLETED]: "flow-badge-emerald",
  }[status] || "flow-badge-gray";
}

function getStatusValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getOptionLabel(options, value, fallback) {
  return options.find((option) => option.value === value)?.label || fallback;
}
