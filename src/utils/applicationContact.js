export const DUPLICATE_APPLICATION_MESSAGE =
  "이미 지원한 공고입니다.";

const LEGACY_JOB_APPLICATION_COLUMNS = [
  "agreed_terms",
  "agreed_policy",
  "agreed_at",
  "application_no",
  "applicant_email",
  "applicant_phone",
];

export function normalizeApplicationEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeApplicationPhone(value) {
  return String(value || "").replace(/[\s\-()]/g, "").trim();
}

export function isDuplicateApplicationError(error) {
  return (
    error?.code === "23505" &&
    /job_applications.*(email|phone|interpreter)|applications.*(email|phone|interpreter)/i.test(
      error?.message || ""
    )
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
