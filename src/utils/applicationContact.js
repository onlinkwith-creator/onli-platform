export const DUPLICATE_APPLICATION_MESSAGE =
  "이미 지원한 통역공고입니다.";

const WITHDRAWABLE_APPLICATION_STATUSES = new Set([
  "pending",
  "reviewing",
  "지원완료",
  "검토중",
  "보류",
]);

const LEGACY_JOB_APPLICATION_COLUMNS = [
  "agreed_terms",
  "agreed_policy",
  "agreed_cancel_policy",
  "agreed_at",
  "cancel_policy_agreed_at",
  "application_no",
  "applicant_email",
  "applicant_phone",
];

const LEGACY_JOB_APPLICATION_COLUMN_GROUPS = [
  ["agreed_cancel_policy", "cancel_policy_agreed_at"],
  ["agreed_terms", "agreed_policy", "agreed_at"],
];

export function normalizeApplicationEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeApplicationPhone(value) {
  return String(value || "").replace(/[\s\-()]/g, "").trim();
}

export function isDuplicateApplicationError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    error?.code === "23505" &&
    /job_applications.*(email|phone|interpreter)|applications.*(email|phone|interpreter)|job_interpreter|applicant_email|applicant_phone|duplicate key/i.test(message)
  );
}

export function getSupabaseErrorDetails(error) {
  return {
    message: error?.message || "",
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || "",
  };
}

export function isAgreementColumnError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /agreed_|cancel_policy_agreed_at|column|schema cache/i.test(message)
  );
}

export function isStatusValueError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    error?.code === "23514" ||
    error?.code === "42501" ||
    /job_applications_status_check|status|row-level security policy|violates row-level security/i.test(message)
  );
}

export function getJobApplicationSubmitErrorMessage(error) {
  if (!error) {
    return "제출에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  if (isDuplicateApplicationError(error)) {
    return DUPLICATE_APPLICATION_MESSAGE;
  }

  if (
    error?.code === "42501" ||
    /row-level security policy|violates row-level security|permission denied|401|403/i.test(
      error?.message || ""
    )
  ) {
    return "지원 처리 권한이 없습니다. 로그인 상태와 통역사 승인 상태를 확인해주세요.";
  }

  if (/column .* does not exist|relation .* does not exist|schema cache/i.test(error?.message || "")) {
    return "제출 중 시스템 오류가 발생했습니다. 관리자에게 문의해주세요.";
  }

  return "제출에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

export function canWithdrawJobApplication(status) {
  return WITHDRAWABLE_APPLICATION_STATUSES.has(
    String(status || "").trim().toLowerCase()
  );
}

export function isJobApplicationWithdrawalPermissionError(error) {
  return (
    error?.code === "42501" ||
    /row-level security policy|violates row-level security|permission denied|401|403/i.test(
      error?.message || ""
    )
  );
}

export async function withdrawOwnJobApplication(
  supabase,
  { applicationId, interpreterId }
) {
  if (!supabase || !applicationId || !interpreterId) {
    throw new Error("지원 철회 대상 정보가 올바르지 않습니다.");
  }

  const { data, error } = await supabase
    .from("job_applications")
    .delete()
    .eq("id", applicationId)
    .eq("interpreter_id", interpreterId)
    .in("status", [...WITHDRAWABLE_APPLICATION_STATUSES])
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function buildLegacyJobApplicationPayload(error, payload) {
  if (!payload) return payload;

  const message = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ");

  const missingColumns = LEGACY_JOB_APPLICATION_COLUMNS.filter((column) =>
    new RegExp(`\\b${column}\\b`, "i").test(message)
  );

  const columnsToRemove = missingColumns.length
    ? missingColumns
    : LEGACY_JOB_APPLICATION_COLUMNS;

  LEGACY_JOB_APPLICATION_COLUMN_GROUPS.forEach((group) => {
    if (group.some((column) => columnsToRemove.includes(column))) {
      group.forEach((column) => {
        if (!columnsToRemove.includes(column)) {
          columnsToRemove.push(column);
        }
      });
    }
  });

  const nextPayload = { ...payload };
  columnsToRemove.forEach((column) => {
    delete nextPayload[column];
  });

  return nextPayload;
}

export async function findExistingJobApplication(
  supabase,
  { jobId, interpreterId, email, phone }
) {
  const normalizedEmail = normalizeApplicationEmail(email);
  const normalizedPhone = normalizeApplicationPhone(phone);

  if (interpreterId) {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .eq("interpreter_id", interpreterId)
      .limit(1);

    if (error) throw error;
    if (data?.length) return data[0];
  }

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .or(`email.eq.${normalizedEmail},applicant_email.eq.${normalizedEmail}`)
      .limit(1);

    if (error) throw error;
    if (data?.length) return data[0];
  }

  if (normalizedPhone) {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .or(`phone.eq.${normalizedPhone},applicant_phone.eq.${normalizedPhone}`)
      .limit(1);

    if (error) throw error;
    if (data?.length) return data[0];
  }

  return null;
}
