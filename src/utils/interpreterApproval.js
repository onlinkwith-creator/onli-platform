const APPROVED_STATUS_VALUES = new Set([
  "active",
  "approved",
  "승인",
  "승인 완료",
  "승인완료",
  "활동중",
]);

export function isInterpreterApprovedForApplication(interpreter = {}) {
  if (!interpreter) return false;
  if (interpreter.approved === true || interpreter.approved === "true") return true;

  const normalizedStatus = String(interpreter.status || "").trim().toLowerCase();
  return APPROVED_STATUS_VALUES.has(normalizedStatus);
}

export function pickCurrentUserInterpreterProfile(profiles = [], user = {}) {
  const normalizedEmail = String(user?.email || "").toLowerCase().trim();
  const userId = String(user?.id || "");

  const matches = (profiles || []).filter((profile) => {
    const profileUserId = String(profile?.auth_user_id || "");
    const profileEmail = String(profile?.email || "").toLowerCase().trim();

    return (
      (userId && profileUserId === userId) ||
      (normalizedEmail && profileEmail === normalizedEmail)
    );
  });

  return matches.sort((a, b) => {
    const aApproved = isInterpreterApprovedForApplication(a) ? 1 : 0;
    const bApproved = isInterpreterApprovedForApplication(b) ? 1 : 0;
    if (aApproved !== bApproved) return bApproved - aApproved;

    const aAuthMatch = String(a?.auth_user_id || "") === userId ? 1 : 0;
    const bAuthMatch = String(b?.auth_user_id || "") === userId ? 1 : 0;
    if (aAuthMatch !== bAuthMatch) return bAuthMatch - aAuthMatch;

    return Number(b?.id || 0) - Number(a?.id || 0);
  })[0] || null;
}
