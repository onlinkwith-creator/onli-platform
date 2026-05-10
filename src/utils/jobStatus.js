export const JOB_STATUS_OPTIONS = [
  { value: "open", label: "모집중" },
  { value: "closing_soon", label: "마감임박" },
  { value: "closed", label: "모집마감" },
  { value: "assigned", label: "배정완료" },
];

export const JOB_VISIBILITY_OPTIONS = [
  { value: "public", label: "공개" },
  { value: "private", label: "비공개" },
];

export function normalizeJobStatus(job = {}) {
  if (job.status === "마감" || job.status === "모집마감" || job.status === "closed") {
    return "closed";
  }
  if (job.status === "마감임박" || job.status === "closing_soon") return "closing_soon";
  if (job.status === "배정완료" || job.status === "assigned") return "assigned";
  if (job.is_urgent) return "closing_soon";
  return "open";
}

export function getJobStatusLabel(job = {}) {
  const status = normalizeJobStatus(job);
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label || "모집중";
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
  return normalizeJobVisibility(job) === "public" && normalizeJobStatus(job) !== "assigned";
}

export function canApplyToJob(job = {}) {
  return isPublicJob(job) && ["open", "closing_soon"].includes(normalizeJobStatus(job));
}
