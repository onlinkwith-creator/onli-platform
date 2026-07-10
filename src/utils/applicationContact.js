import {
  MANAGEMENT_NUMBER_CONFIG,
  addManagementNumber,
  isManagementNumberConflict,
} from "./managementNumber";

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

function isMissingJobApplicationColumnError(error, columnName) {
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
    (columnName && new RegExp(`\\b${columnName}\\b`, "i").test(message)) ||
    /column .* does not exist|schema cache/i.test(message)
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
    let { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .or(`email.eq.${normalizedEmail},applicant_email.eq.${normalizedEmail}`)
      .limit(1);

    if (error && isMissingJobApplicationColumnError(error, "applicant_email")) {
      const fallbackResult = await supabase
        .from("job_applications")
        .select("id")
        .eq("job_id", jobId)
        .eq("email", normalizedEmail)
        .limit(1);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    if (data?.length) return data[0];
  }

  if (normalizedPhone) {
    let { data, error } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_id", jobId)
      .or(`phone.eq.${normalizedPhone},applicant_phone.eq.${normalizedPhone}`)
      .limit(1);

    if (error && isMissingJobApplicationColumnError(error, "applicant_phone")) {
      const fallbackResult = await supabase
        .from("job_applications")
        .select("id")
        .eq("job_id", jobId)
        .eq("phone", normalizedPhone)
        .limit(1);
      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;
    if (data?.length) return data[0];
  }

  return null;
}

export async function createJobApplicationRecord(supabase, payload) {
  if (!supabase) throw new Error("Supabase client is not configured.");
  if (!payload?.job_id) throw new Error("지원할 공고 정보가 올바르지 않습니다.");
  if (!payload?.interpreter_id) throw new Error("통역사 등록 정보를 확인할 수 없습니다.");

  const managementConfig = MANAGEMENT_NUMBER_CONFIG.job_applications;
  let insertPayload = await addManagementNumber({
    supabase,
    table: "job_applications",
    payload,
    ...managementConfig,
  });

  let result = await insertJobApplicationPayload(supabase, insertPayload);

  if (isManagementNumberConflict(result.error, managementConfig.column)) {
    insertPayload = await addManagementNumber({
      supabase,
      table: "job_applications",
      payload,
      ...managementConfig,
    });
    result = await insertJobApplicationPayload(supabase, insertPayload);
  }

  if (result.error && isAgreementColumnError(result.error)) {
    insertPayload = buildLegacyJobApplicationPayload(result.error, insertPayload);
    result = await insertJobApplicationPayload(supabase, insertPayload);
  }

  if (result.error) {
    console.error("[job_applications:insert]", {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      jobId: payload.job_id,
      interpreterId: payload.interpreter_id,
    });
    throw result.error;
  }
  if (!result.data?.id) {
    throw new Error("지원 저장 결과를 확인할 수 없습니다.");
  }

  const verified = await findExistingJobApplication(supabase, {
    jobId: payload.job_id,
    interpreterId: payload.interpreter_id,
    email: payload.applicant_email || payload.email,
    phone: payload.applicant_phone || payload.phone,
  });

  if (!verified?.id) {
    throw new Error("지원 저장 후 생성된 지원서를 확인할 수 없습니다.");
  }

  return result.data;
}

async function insertJobApplicationPayload(supabase, payload) {
  return supabase
    .from("job_applications")
    .insert([payload])
    .select("*")
    .single();
}
