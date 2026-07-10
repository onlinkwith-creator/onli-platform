const APPROVED_STATUS_VALUES = new Set([
  "active",
  "approved",
  "승인",
  "승인 완료",
  "승인완료",
  "활동중",
]);

export function isWithdrawnInterpreter(interpreter = {}) {
  const normalizedStatus = String(interpreter?.status || "").trim().toLowerCase();
  return normalizedStatus === "withdrawn" || Boolean(interpreter?.withdrawn_at);
}

export function isInterpreterApprovedForApplication(interpreter = {}) {
  if (!interpreter) return false;
  if (isWithdrawnInterpreter(interpreter)) return false;

  const normalizedStatus = String(interpreter.status || "").trim().toLowerCase();
  return APPROVED_STATUS_VALUES.has(normalizedStatus);
}

export function pickCurrentUserInterpreterProfile(profiles = [], user = {}) {
  const normalizedEmail = String(user?.email || "").toLowerCase().trim();
  const userId = String(user?.id || "");

  const matches = (profiles || []).filter((profile) => {
    const profileUserId = String(profile?.auth_user_id || "");
    const legacyProfileUserId = String(profile?.user_id || "");
    const profileEmail = String(profile?.email || "").toLowerCase().trim();

    return (
      (userId && profileUserId === userId) ||
      (userId && legacyProfileUserId === userId) ||
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

    const aLegacyUserMatch = String(a?.user_id || "") === userId ? 1 : 0;
    const bLegacyUserMatch = String(b?.user_id || "") === userId ? 1 : 0;
    if (aLegacyUserMatch !== bLegacyUserMatch) return bLegacyUserMatch - aLegacyUserMatch;

    return Number(b?.id || 0) - Number(a?.id || 0);
  })[0] || null;
}

export async function ensureInterpreterAuthLink(supabase, interpreter, user) {
  if (!supabase || !interpreter || !user?.id) return interpreter;

  const hasAuthUserColumn = Object.prototype.hasOwnProperty.call(
    interpreter,
    "auth_user_id"
  );

  if (!hasAuthUserColumn || interpreter.auth_user_id) return interpreter;

  const { data, error } = await supabase
    .from("interpreters")
    .update({ auth_user_id: user.id })
    .eq("id", interpreter.id)
    .select("*")
    .single();

  if (error) {
    console.warn("Interpreter auth_user_id link skipped", error);
    return interpreter;
  }

  return data || interpreter;
}
