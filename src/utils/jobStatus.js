export const JOB_STATUS_OPTIONS = [
  { value: "open", label: "모집중" },
  { value: "closing_soon", label: "마감임박" },
  { value: "closed", label: "모집마감" },
  { value: "assigned", label: "배정완료" },
  { value: "hidden", label: "숨김" },
];

export function normalizeJobStatus(job = {}) {
  if (job.status === "마감" || job.status === "closed") return "closed";
  if (job.status === "마감임박" || job.status === "closing_soon") return "closing_soon";
  if (job.status === "배정완료" || job.status === "assigned") return "assigned";
  if (job.status === "숨김" || job.status === "hidden") return "hidden";
  if (job.is_urgent) return "closing_soon";
  return "open";
}

export function getJobStatusLabel(job = {}) {
  const status = normalizeJobStatus(job);
  return JOB_STATUS_OPTIONS.find((option) => option.value === status)?.label || "모집중";
}

export function isPublicJob(job = {}) {
  return !["assigned", "hidden"].includes(normalizeJobStatus(job));
}

export function canApplyToJob(job = {}) {
  return ["open", "closing_soon"].includes(normalizeJobStatus(job));
}
