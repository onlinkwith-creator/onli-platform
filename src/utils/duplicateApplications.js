function normalizeText(value) {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  return ["", "-", "미입력"].includes(normalized) ? "" : normalized;
}

function normalizePhone(value) {
  if (!value) return "";
  const normalized = String(value).replace(/\D/g, "");
  return normalized || "";
}

function getApplicationName(application = {}) {
  return application.applicant_name || application.name || "";
}

function getApplicationEmail(application = {}) {
  return application.applicant_email || application.email || "";
}

function getApplicationPhone(application = {}) {
  return (
    application.applicant_phone ||
    application.phone ||
    application.phone_number ||
    ""
  );
}

export function getDuplicateApplicationIdSet(applications = []) {
  const groups = new Map();
  const duplicateIds = new Set();

  applications.forEach((application) => {
    const { id, job_id: jobId } = application || {};
    if (!id || !jobId) return;

    const name = normalizeText(getApplicationName(application));
    const email = normalizeText(getApplicationEmail(application));
    const phone = normalizePhone(getApplicationPhone(application));

    [
      name ? `name:${name}` : "",
      email ? `email:${email}` : "",
      phone ? `phone:${phone}` : "",
    ]
      .filter(Boolean)
      .forEach((key) => {
        const groupKey = `${jobId}:${key}`;
        const ids = groups.get(groupKey) || [];
        ids.push(id);
        groups.set(groupKey, ids);
      });
  });

  groups.forEach((ids) => {
    if (ids.length >= 2) {
      ids.forEach((id) => duplicateIds.add(id));
    }
  });

  return duplicateIds;
}
