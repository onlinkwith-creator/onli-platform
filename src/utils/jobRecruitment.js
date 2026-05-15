export function getAssignedCount(job = {}) {
  return getPositiveInteger(
    job.assigned_count ??
      job.assignment_count ??
      job.matched_count ??
      job.matchedCount ??
      job.matched_applications_count,
    0
  );
}

export function getTotalPeopleCount(job = {}) {
  return getPositiveInteger(
    job.people_count ?? job.required_count ?? job.requested_people_count ?? job.people,
    1
  );
}

export function getRecruitmentCountDisplay(job = {}) {
  return `${getAssignedCount(job)}/${getTotalPeopleCount(job)}`;
}

export function isJobFullyAssigned(job = {}) {
  return getAssignedCount(job) >= getTotalPeopleCount(job);
}

export function getPositiveInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value)) || fallback;
  }

  const parsed = String(value ?? "").match(/\d+/)?.[0];
  if (!parsed) return fallback;

  return Math.max(0, Number.parseInt(parsed, 10)) || fallback;
}
