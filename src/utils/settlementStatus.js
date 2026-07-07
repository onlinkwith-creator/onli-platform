export const ADMIN_SETTLEMENT_STATUS = {
  WAITING: "settlement_waiting",
  CONFIRMED: "settlement_confirmed",
  PAYING: "settlement_paying",
  COMPLETED: "settlement_completed",
};

export const SETTLEMENT_STATUS_OPTIONS = [
  { value: ADMIN_SETTLEMENT_STATUS.WAITING, label: "정산 대기" },
  { value: ADMIN_SETTLEMENT_STATUS.CONFIRMED, label: "정산 확정" },
  { value: ADMIN_SETTLEMENT_STATUS.PAYING, label: "통역사 지급" },
  { value: ADMIN_SETTLEMENT_STATUS.COMPLETED, label: "정산 완료" },
];

export const SETTLEMENT_STATUS_ALIASES = {
  settlement_waiting: ADMIN_SETTLEMENT_STATUS.WAITING,
  settlement_pending: ADMIN_SETTLEMENT_STATUS.WAITING,
  pending: ADMIN_SETTLEMENT_STATUS.WAITING,
  waiting: ADMIN_SETTLEMENT_STATUS.WAITING,
  payment_pending: ADMIN_SETTLEMENT_STATUS.WAITING,
  payout_pending: ADMIN_SETTLEMENT_STATUS.WAITING,
  "정산_대기": ADMIN_SETTLEMENT_STATUS.WAITING,
  "정산대기": ADMIN_SETTLEMENT_STATUS.WAITING,
  "정산대상": ADMIN_SETTLEMENT_STATUS.WAITING,
  "지급대기": ADMIN_SETTLEMENT_STATUS.WAITING,

  settlement_confirmed: ADMIN_SETTLEMENT_STATUS.CONFIRMED,
  confirmed: ADMIN_SETTLEMENT_STATUS.CONFIRMED,
  "정산_확정": ADMIN_SETTLEMENT_STATUS.CONFIRMED,
  "정산확정": ADMIN_SETTLEMENT_STATUS.CONFIRMED,

  settlement_paying: ADMIN_SETTLEMENT_STATUS.PAYING,
  payment_started: ADMIN_SETTLEMENT_STATUS.PAYING,
  payment_in_progress: ADMIN_SETTLEMENT_STATUS.PAYING,
  payout_started: ADMIN_SETTLEMENT_STATUS.PAYING,
  paying: ADMIN_SETTLEMENT_STATUS.PAYING,
  "통역사_지급": ADMIN_SETTLEMENT_STATUS.PAYING,
  "통역사지급": ADMIN_SETTLEMENT_STATUS.PAYING,
  "지급중": ADMIN_SETTLEMENT_STATUS.PAYING,

  settlement_completed: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  settlement_done: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  payment_completed: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  payout_completed: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  completed: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  paid: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  done: ADMIN_SETTLEMENT_STATUS.COMPLETED,
  "정산_완료": ADMIN_SETTLEMENT_STATUS.COMPLETED,
  "정산완료": ADMIN_SETTLEMENT_STATUS.COMPLETED,
  "지급완료": ADMIN_SETTLEMENT_STATUS.COMPLETED,
};

export function normalizeAdminSettlementStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return SETTLEMENT_STATUS_ALIASES[value] || ADMIN_SETTLEMENT_STATUS.WAITING;
}

export function getSettlementStatusLabel(status) {
  const normalized = normalizeAdminSettlementStatus(status);
  return SETTLEMENT_STATUS_OPTIONS.find((option) => option.value === normalized)?.label || "정산 대기";
}

export function getSettlementStatusBadgeClass(status) {
  const classes = {
    [ADMIN_SETTLEMENT_STATUS.WAITING]: "badge-yellow",
    [ADMIN_SETTLEMENT_STATUS.CONFIRMED]: "badge-blue",
    [ADMIN_SETTLEMENT_STATUS.PAYING]: "badge-purple",
    [ADMIN_SETTLEMENT_STATUS.COMPLETED]: "badge-green",
  };
  return classes[normalizeAdminSettlementStatus(status)] || "badge-yellow";
}
