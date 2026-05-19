import {
  JOB_STATUS,
  JOB_STATUS_OPTIONS,
  getJobStatusLabel as getStandardJobStatusLabel,
  normalizeJobStatus as normalizeStandardJobStatus,
} from "./status";

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
  return isPublicJob(job) && normalizeJobStatus(job) === JOB_STATUS.RECRUITING;
}
