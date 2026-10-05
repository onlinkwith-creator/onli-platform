import { normalizeOperationStatus, OPERATION_STATUS } from "./operationsStatus.js";

export function getWorkTimeDisplay(job = {}) {
  const start = job.event_start_time || job.start_time;
  const end = job.event_end_time || job.end_time;
  if (start && end) return `${String(start).slice(0, 5)} ~ ${String(end).slice(0, 5)}`;
  return job.work_hours || "별도 안내";
}

export function isPreparationAssignment(item = {}) {
  const operation = normalizeOperationStatus(item);
  return ![OPERATION_STATUS.COMPLETED, OPERATION_STATUS.IN_PROGRESS].includes(operation);
}
