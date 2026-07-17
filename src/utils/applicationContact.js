export const DUPLICATE_APPLICATION_MESSAGE =
  "이미 지원한 공고입니다.";

const WITHDRAWABLE_APPLICATION_STATUSES = new Set([
  "pending",
  "reviewing",
  "지원완료",
  "검토중",
  "보류",
]);

const NON_BLOCKING_APPLICATION_STATUSES = ["cancelled"];

export function normalizeApplicationEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeApplicationPhone(value) {
  return String(value || "").replace(/[\s\-()]/g, "").trim();
}

export function getApplicationPhoneDisplay(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "미등록";
}

export function isDuplicateApplicationError(error) {
  return error?.code === "23505";
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
    return "이미 지원한 공고입니다.";
  }

  if (error?.code === "23503") {
    return "공고 또는 통역사 정보가 올바르지 않습니다.";
  }

  if (
    error?.code === "42501" ||
    /row-level security policy|violates row-level security|permission denied|401|403/i.test(
      error?.message || ""
    )
  ) {
    return "지원서를 저장할 권한이 없습니다. 다시 로그인해 주세요.";
  }

  if (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist|schema cache/i.test(error?.message || "")
  ) {
    return "지원 저장에 필요한 DB 컬럼이 존재하지 않습니다.";
  }

  if (error?.code === "22P02") {
    return "지원 정보의 데이터 형식이 올바르지 않습니다.";
  }

  return "지원서를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
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

export async function findExistingJobApplication(
  supabase,
  { jobId, interpreterId, email }
) {
  const normalizedEmail = normalizeApplicationEmail(email);

  if (interpreterId) {
    const { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .eq("interpreter_id", interpreterId)
      .not("status", "in", `(${NON_BLOCKING_APPLICATION_STATUSES.join(",")})`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("지원 중복 확인 실패:", error);
      throw new Error("지원 여부를 확인하지 못했습니다.");
    }
    return data || null;
  }

  if (!normalizedEmail) {
    throw new Error("로그인 이메일 정보를 확인할 수 없습니다.");
  }

  const { data, error } = await supabase
    .from("job_applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("email", normalizedEmail)
    .not("status", "in", `(${NON_BLOCKING_APPLICATION_STATUSES.join(",")})`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("지원 중복 확인 실패:", error);
    throw new Error("지원 여부를 확인하지 못했습니다.");
  }
  
  return data || null;
}
