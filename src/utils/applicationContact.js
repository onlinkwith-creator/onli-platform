export const DUPLICATE_APPLICATION_MESSAGE =
  "이미 해당 공고에 지원한 내역이 있습니다.";

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

  if (/row-level security policy/i.test(error?.message || "")) {
    return "권한 설정 문제로 제출이 완료되지 않았습니다. 관리자에게 문의해주세요.";
  }

  if (/column .* does not exist|relation .* does not exist|schema cache/i.test(error?.message || "")) {
    return "제출 중 시스템 오류가 발생했습니다. 관리자에게 문의해주세요.";
  }

  return "제출에 실패했습니다. 잠시 후 다시 시도해주세요.";
}

export async function findExistingJobApplication(supabase, { jobId, email, phone }) {
  const normalizedEmail = normalizeApplicationEmail(email);
  const normalizedPhone = normalizeApplicationPhone(phone);

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
