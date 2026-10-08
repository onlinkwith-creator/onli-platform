const levelValue = (value) => Number(String(value || "").match(/\d+/)?.[0] || 0);

export function applicantFit(application, request) {
  const profile = application.profile;
  if (!profile || ["withdrawn", "cancelled", "rejected"].includes(application.status)) return -1;
  const requiredLevel = levelValue(request?.requested_level || request?.required_level);
  const meetsLevel = requiredLevel > 0 && levelValue(profile.level) >= requiredLevel;
  const location = String(request?.event_location || request?.location || "").toLowerCase();
  const regions = [...(Array.isArray(profile.available_regions) ? profile.available_regions : []),
    ...(Array.isArray(profile.custom_regions) ? profile.custom_regions : []), profile.region].filter(Boolean);
  const meetsRegion = regions.some((region) => String(region).length >= 2 && location.includes(String(region).toLowerCase()));
  return Number(meetsLevel) + Number(meetsRegion);
}

export function rankApplicants(rows, request) {
  return [...rows].sort((left, right) => applicantFit(right, request) - applicantFit(left, request)
    || String(left.created_at || "").localeCompare(String(right.created_at || ""))
    || String(left.id).localeCompare(String(right.id)));
}
