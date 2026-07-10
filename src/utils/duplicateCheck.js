const EMPTY_TEXT_VALUES = new Set(["", "-", "미입력", "없음", "null", "undefined"]);

export function normalizeText(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return EMPTY_TEXT_VALUES.has(normalized) ? "" : normalized;
}

export function normalizeEmail(value) {
  return normalizeText(value);
}

export function normalizePhone(value) {
  const normalized = String(value ?? "").replace(/\D/g, "");
  return normalized.length >= 8 ? normalized : "";
}

export function normalizeMessengerId(value) {
  const normalized = normalizeText(value).replace(/^@+/, "");
  return EMPTY_TEXT_VALUES.has(normalized) ? "" : normalized;
}

export function getDuplicateApplicationIdSet(applications = []) {
  const groups = new Map();
  const duplicateIds = new Set();
  const reasonMap = new Map();

  applications.forEach((application) => {
    const id = application?.id;
    const jobId = application?.job_id;
    if (!id || !jobId) return;

    addGroup(groups, `${jobId}:name:${getApplicationName(application)}`, id, "이름 중복");
    addGroup(groups, `${jobId}:email:${getApplicationEmail(application)}`, id, "이메일 중복");
    addGroup(groups, `${jobId}:phone:${getApplicationPhone(application)}`, id, "전화번호 중복");
  });

  collectDuplicateReasons(groups, duplicateIds, reasonMap);
  return { duplicateIds, reasonMap };
}

export function getDuplicateInterpreterIdSet(interpreters = []) {
  const groups = new Map();
  const duplicateIds = new Set();
  const reasonMap = new Map();

  interpreters.forEach((interpreter) => {
    const id = interpreter?.id;
    if (!id) return;

    const name = getInterpreterName(interpreter);
    const phone = getInterpreterPhone(interpreter);
    const lineId = getInterpreterLineId(interpreter);
    const kakaoId = getInterpreterKakaoId(interpreter);
    const messengerId = getInterpreterMessengerId(interpreter);

    addGroup(groups, `email:${getInterpreterEmail(interpreter)}`, id, "이메일 중복");
    addGroup(groups, `phone:${phone}`, id, "전화번호 중복");
    addGroup(groups, `line:${lineId}`, id, "LINE ID 중복");
    addGroup(groups, `kakao:${kakaoId}`, id, "KakaoTalk ID 중복");
    addGroup(groups, `messenger:${messengerId}`, id, "Kakao/LINE ID 중복");

    if (name && phone) {
      addGroup(groups, `name-phone:${name}:${phone}`, id, "이름+전화번호 중복");
    }
  });

  collectDuplicateReasons(groups, duplicateIds, reasonMap);
  return { duplicateIds, reasonMap };
}

function addGroup(groups, key, id, reason) {
  const normalizedKey = normalizeText(key);
  if (!normalizedKey || normalizedKey.endsWith(":")) return;

  const group = groups.get(normalizedKey) || { ids: [], reason };
  group.ids.push(id);
  groups.set(normalizedKey, group);
}

function collectDuplicateReasons(groups, duplicateIds, reasonMap) {
  groups.forEach(({ ids, reason }) => {
    if (ids.length < 2) return;

    ids.forEach((id) => {
      duplicateIds.add(id);
      const reasons = reasonMap.get(id) || [];
      if (!reasons.includes(reason)) reasons.push(reason);
      reasonMap.set(id, reasons);
    });
  });
}

function getApplicationName(application = {}) {
  return normalizeText(application.applicant_name || application.name);
}

function getApplicationEmail(application = {}) {
  return normalizeEmail(application.email);
}

function getApplicationPhone(application = {}) {
  return normalizePhone(
    application.applicant_phone || application.phone || application.phone_number
  );
}

function getInterpreterName(interpreter = {}) {
  return normalizeText(interpreter.name);
}

function getInterpreterEmail(interpreter = {}) {
  return normalizeEmail(interpreter.email);
}

function getInterpreterPhone(interpreter = {}) {
  return normalizePhone(interpreter.phone || interpreter.phone_number || interpreter.contact);
}

function getInterpreterLineId(interpreter = {}) {
  return normalizeMessengerId(interpreter.line_id);
}

function getInterpreterKakaoId(interpreter = {}) {
  return normalizeMessengerId(interpreter.kakao_id || interpreter.kakao);
}

function getInterpreterMessengerId(interpreter = {}) {
  return normalizeMessengerId(interpreter.kakao_or_line);
}
