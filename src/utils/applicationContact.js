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
