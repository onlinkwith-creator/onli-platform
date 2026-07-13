export const ASSIGNMENT_STATUS = {
  WAITING: "assignment_pending",
  ASSIGNING: "assignment_in_progress",
  ASSIGNED: "assignment_completed",
  PREPARING: "assignment_completed",
  READY: "assignment_completed",
};

export const OPERATION_STATUS = {
  BEFORE_OPERATION: "operation_before",
  PREPARING: "operation_preparing",
  SCHEDULED: "operation_scheduled",
  IN_PROGRESS: "operation_in_progress",
  COMPLETED: "operation_completed",
};

export const SETTLEMENT_FLOW_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  ON_HOLD: "on_hold",
};

export const ASSIGNMENT_STATUS_OPTIONS = [
  { value: ASSIGNMENT_STATUS.WAITING, label: "배정대기" },
  { value: ASSIGNMENT_STATUS.ASSIGNING, label: "배정중" },
  { value: ASSIGNMENT_STATUS.ASSIGNED, label: "배정완료" },
];

export const OPERATION_STATUS_OPTIONS = [
  { value: OPERATION_STATUS.BEFORE_OPERATION, label: "운영전", companyLabel: "" },
  { value: OPERATION_STATUS.PREPARING, label: "운영 준비중", companyLabel: "업무 준비중" },
  { value: OPERATION_STATUS.SCHEDULED, label: "운영 예정", companyLabel: "진행 예정" },
  { value: OPERATION_STATUS.IN_PROGRESS, label: "운영중", companyLabel: "진행중" },
  { value: OPERATION_STATUS.COMPLETED, label: "업무완료", companyLabel: "업무완료" },
];

export const SETTLEMENT_FLOW_STATUS_OPTIONS = [
  { value: SETTLEMENT_FLOW_STATUS.NOT_REQUIRED, label: "정산없음" },
  { value: SETTLEMENT_FLOW_STATUS.PENDING, label: "정산대기" },
  { value: SETTLEMENT_FLOW_STATUS.CONFIRMED, label: "정산확정" },
  { value: SETTLEMENT_FLOW_STATUS.COMPLETED, label: "정산완료" },
  { value: SETTLEMENT_FLOW_STATUS.ON_HOLD, label: "정산보류" },
];

export function normalizeAssignmentStatus(item = {}) {
  const value = getStatusValue(item.assignment_status || item.status || item.matching_status);
  if (["assignment_completed", "assigned", "confirmed", "preparing", "ready", "배정완료", "배정", "매칭완료", "업무준비중", "업무 준비중", "진행예정", "진행 예정"].includes(value)) {
    return ASSIGNMENT_STATUS.ASSIGNED;
  }
  if (["assignment_in_progress", "assigning", "in_progress", "matching", "배정중", "매칭중", "통역사 확인중", "확인중", "지정 요청중"].includes(value)) {
    return ASSIGNMENT_STATUS.ASSIGNING;
  }
  return ASSIGNMENT_STATUS.WAITING;
}

export function normalizeOperationStatus(item = {}) {
  const value = getStatusValue(
    typeof item === "string"
      ? item
      : item.operation_status || item.status || item.matching_status
  );
  if (["operation_completed", "completed", "settled", "done", "finished", "운영완료", "업무완료", "완료", "정산완료"].includes(value)) {
    return OPERATION_STATUS.COMPLETED;
  }
  if (["operation_in_progress", "in_progress", "operating", "matching", "운영중", "진행중"].includes(value)) {
    return OPERATION_STATUS.IN_PROGRESS;
  }
  if (["operation_scheduled", "ready", "scheduled", "진행예정", "진행 예정", "운영예정", "운영 예정"].includes(value)) {
    return OPERATION_STATUS.SCHEDULED;
  }
  if (["operation_preparing", "preparing", "업무준비중", "업무 준비중", "운영준비중", "운영 준비중"].includes(value)) {
    return OPERATION_STATUS.PREPARING;
  }
  return OPERATION_STATUS.BEFORE_OPERATION;
}

export function normalizeSettlementFlowStatus(item = {}) {
  const value = getStatusValue(item.settlement_status || item.status || item.matching_status);
  if (["completed", "settled", "정산완료"].includes(value)) {
    return SETTLEMENT_FLOW_STATUS.COMPLETED;
  }
  if (["confirmed", "settlement_confirmed", "정산확정"].includes(value)) {
    return SETTLEMENT_FLOW_STATUS.CONFIRMED;
  }
  if (["on_hold", "hold", "settlement_on_hold", "보류", "정산보류"].includes(value)) {
    return SETTLEMENT_FLOW_STATUS.ON_HOLD;
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

export function getOperationCompanyStatusLabel(status) {
  const normalized = normalizeOperationStatus(status);
  return OPERATION_STATUS_OPTIONS.find((option) => option.value === normalized)?.companyLabel || "";
}

export function getSettlementFlowStatusLabel(status) {
  return getOptionLabel(SETTLEMENT_FLOW_STATUS_OPTIONS, status, "정산없음");
}

export function getAssignmentStatusBadgeClass(status) {
  return {
    [ASSIGNMENT_STATUS.WAITING]: "flow-badge-gray",
    [ASSIGNMENT_STATUS.ASSIGNING]: "flow-badge-blue",
    [ASSIGNMENT_STATUS.ASSIGNED]: "flow-badge-blue",
  }[status] || "flow-badge-gray";
}

export function getOperationStatusBadgeClass(status) {
  return {
    [OPERATION_STATUS.PREPARING]: "flow-badge-teal",
    [OPERATION_STATUS.SCHEDULED]: "flow-badge-cyan",
    [OPERATION_STATUS.BEFORE_OPERATION]: "flow-badge-gray",
    [OPERATION_STATUS.IN_PROGRESS]: "flow-badge-orange",
    [OPERATION_STATUS.COMPLETED]: "flow-badge-green",
  }[status] || "flow-badge-gray";
}

export function getSettlementFlowStatusBadgeClass(status) {
  return {
    [SETTLEMENT_FLOW_STATUS.NOT_REQUIRED]: "flow-badge-gray",
    [SETTLEMENT_FLOW_STATUS.PENDING]: "flow-badge-purple",
    [SETTLEMENT_FLOW_STATUS.CONFIRMED]: "flow-badge-blue",
    [SETTLEMENT_FLOW_STATUS.COMPLETED]: "flow-badge-emerald",
    [SETTLEMENT_FLOW_STATUS.ON_HOLD]: "flow-badge-orange",
  }[status] || "flow-badge-gray";
}

function getStatusValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getOptionLabel(options, value, fallback) {
  return options.find((option) => option.value === value)?.label || fallback;
}

export function getSettlementTabStatus(request, settlement) {
  const reqStatus = getStatusValue(request?.settlement_status);
  const stlStatus = getStatusValue(settlement?.status || settlement?.settlement_status);
  
  // 1순위: request.settlement_status
  let statusToEvaluate = reqStatus;

  // 2순위: settlement.status 또는 settlement.settlement_status
  if (!statusToEvaluate) {
    statusToEvaluate = stlStatus;
  }

  // 3순위: settlement row 없음 + 완료/배정완료 의뢰이면 pending
  if (!statusToEvaluate && !settlement) {
    const opStatus = getStatusValue(request?.operation_status || request?.status);
    const assignStatus = getStatusValue(request?.assignment_status || request?.matching_status);
    
    if (
      ["operation_completed", "completed", "운영완료", "업무완료", "완료"].includes(opStatus) ||
      ["assigned", "배정완료", "매칭완료"].includes(assignStatus)
    ) {
      statusToEvaluate = "pending";
    }
  }

  // 상태 매핑
  if (["pending", "settlement_pending", "정산대기", "waiting", "wait"].includes(statusToEvaluate) || statusToEvaluate === "") {
    return "pending";
  }
  if (["confirmed", "settlement_confirmed", "정산확정", "fixed", "finalized"].includes(statusToEvaluate)) {
    return "confirmed";
  }
  if (["completed", "paid", "settlement_completed", "정산완료", "지급완료", "settled"].includes(statusToEvaluate)) {
    return "completed";
  }
  if (["hold", "on_hold", "withheld", "settlement_hold", "settlement_on_hold", "정산보류", "보류"].includes(statusToEvaluate)) {
    return "hold";
  }

  // 4순위: 그 외 none
  return "none";
}
