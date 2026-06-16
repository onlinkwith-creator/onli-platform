export const WITHDRAWN_STATUS = "withdrawn";
export const WITHDRAWN_ACCOUNT_MESSAGE =
  "탈퇴 처리된 계정입니다. 재가입 또는 복구가 필요하신 경우 ON-LI 운영팀에 문의해주세요.";

export function isWithdrawnInterpreter(interpreter = {}) {
  const status = String(interpreter?.status || "").trim().toLowerCase();
  return status === WITHDRAWN_STATUS || Boolean(interpreter?.withdrawn_at);
}

export function isPublicInterpreterVisible(interpreter = {}) {
  if (!interpreter || isWithdrawnInterpreter(interpreter)) return false;
  if (interpreter.is_public === false) return false;
  return true;
}

export function getPublicInterpreterDisplayName(interpreter = {}) {
  return isWithdrawnInterpreter(interpreter)
    ? "탈퇴한 사용자"
    : interpreter.name || "이름 미입력";
}
