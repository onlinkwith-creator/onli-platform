import {
  JOB_STATUS,
  JOB_STATUS_OPTIONS,
  getJobStatusLabel as getStandardJobStatusLabel,
  normalizeJobStatus as normalizeStandardJobStatus,
} from "./status";
import { getAssignedCount, getTotalPeopleCount } from "./jobRecruitment";
import {
  ASSIGNMENT_STATUS,
  OPERATION_STATUS,
  getAssignmentStatusLabel,
  getOperationStatusLabel,
  normalizeAssignmentStatus,
  normalizeOperationStatus,
} from "./operationsStatus";

export { JOB_STATUS, JOB_STATUS_OPTIONS };

export const JOB_VISIBILITY_OPTIONS = [
  { value: "public", label: "공개" },
  { value: "private", label: "비공개" },
];

export function normalizeJobStatus(job = {}) {
  return normalizeStandardJobStatus(job.status);
}

export function getJobStatusLabel(job = {}) {
  return getStandardJobStatusLabel(normalizeJobStatus(job));
}

export function normalizeJobVisibility(job = {}) {
  if (
    job.visibility === "private" ||
    job.visibility === "비공개" ||
    job.status === "숨김" ||
    job.status === "hidden"
  ) {
    return "private";
  }
  return "public";
}

export function getJobVisibilityLabel(job = {}) {
  const visibility = normalizeJobVisibility(job);
  return (
    JOB_VISIBILITY_OPTIONS.find((option) => option.value === visibility)?.label || "공개"
  );
}

export function isPublicJob(job = {}) {
  const status = normalizeStandardJobStatus(job.status);
  return normalizeJobVisibility(job) === "public" && status !== JOB_STATUS.CANCELLED;
}

export function canApplyToJob(job = {}) {
  return getApplicationAvailability(job).allowed;
}

export function getApplicationAvailability(job = {}, { now = new Date() } = {}) {
  if (!job?.id) return { allowed: false, reason: "closed_status" };
  if (!isPublicJob(job)) {
    return { allowed: false, reason: "closed_status", label: getJobStatusLabel(job) };
  }

  const jobStatus = normalizeJobStatus(job);
  if (
    [JOB_STATUS.CLOSED, JOB_STATUS.ASSIGNED, JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED].includes(
      jobStatus
    )
  ) {
    return { allowed: false, reason: "closed_status", label: getJobStatusLabel(job) };
  }

  const operationStatus = normalizeOperationStatus(job);
  if (operationStatus !== OPERATION_STATUS.BEFORE_OPERATION) {
    return {
      allowed: false,
      reason: "closed_status",
      label: getOperationStatusLabel(operationStatus),
    };
  }

  const assignmentStatus = normalizeAssignmentStatus(job);
  if (assignmentStatus !== ASSIGNMENT_STATUS.WAITING) {
    return {
      allowed: false,
      reason: "closed_status",
      label: getAssignmentStatusLabel(assignmentStatus),
    };
  }

  const requiredCount = getTotalPeopleCount(job);
  const assignedCount = getAssignedCount(job);
  if (requiredCount > 0 && assignedCount >= requiredCount) {
    return { allowed: false, reason: "capacity_full" };
  }

  const deadlineValue = job.application_deadline ?? job.deadline ?? null;
  if (deadlineValue) {
    const deadline = parseApplicationDeadline(deadlineValue);
    const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
    if (!Number.isNaN(deadline.getTime()) && !Number.isNaN(currentTime) && deadline.getTime() < currentTime) {
      return { allowed: false, reason: "deadline_passed" };
    }
  }

  return { allowed: true, reason: null };
}

export function getApplicationAvailabilityLabel(availability = {}) {
  if (availability.reason === "capacity_full") return "모집 마감";
  if (availability.reason === "deadline_passed") return "지원 마감";
  return availability.allowed ? "지원하기" : availability.label || "지원 불가";
}

function parseApplicationDeadline(value) {
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(`${year}-${month}-${day}T23:59:59.999+09:00`);
  }
  return new Date(value);
}

export function getJobDisplayStatusOrder(job = {}) {
  const status = normalizeJobStatus(job);

  if (status === JOB_STATUS.RECRUITING) return 1;
  if (status === JOB_STATUS.ASSIGNED) return 2;
  if (status === JOB_STATUS.COMPLETED) return 3;
  return 4;
}

export function compareJobsByLatest(a = {}, b = {}) {
  const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (bTime !== aTime) return bTime - aTime;
  return Number(b.id || 0) - Number(a.id || 0);
}

export function compareJobsByDisplayPriority(a = {}, b = {}) {
  const statusDiff = getJobDisplayStatusOrder(a) - getJobDisplayStatusOrder(b);
  if (statusDiff !== 0) return statusDiff;
  return compareJobsByLatest(a, b);
}

export function sortJobsByDisplayPriority(jobs = []) {
  return [...jobs].sort(compareJobsByDisplayPriority);
}
