import { supabase as defaultSupabase } from "../supabase";
import { isPublicJob } from "./jobStatus";
import { supabaseConfigError } from "../supabase";

const PUBLIC_JOB_STATUSES = [
  "open",
  "closing_soon",
  "closed",
  "모집중",
  "마감임박",
  "마감",
  "모집마감",
];

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column|schema cache/i.test(error?.message || "")
  );
}

export async function fetchPublicJobs(supabase, { limit } = {}) {
  if (!supabase) {
    return { data: null, error: supabaseConfigError };
  }

  let query = supabase
    .from("jobs")
    .select("*")
    .eq("visibility", "public")
    .in("status", PUBLIC_JOB_STATUSES)
    .order("created_at", { ascending: false });

  if (limit) query = query.limit(Math.max(limit * 3, limit));

  const result = await query;

  if (!result.error) {
    return {
      data: (result.data || []).filter(isPublicJob).slice(0, limit || undefined),
      error: null,
    };
  }

  console.error("jobs fetch error:", result.error);
  if (!isMissingColumnError(result.error)) return result;

  let fallbackQuery = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (limit) fallbackQuery = fallbackQuery.limit(Math.max(limit * 5, limit));

  const fallbackResult = await fallbackQuery;
  if (fallbackResult.error) {
    console.error("jobs fallback fetch error:", fallbackResult.error);
    return fallbackResult;
  }

  return {
    data: (fallbackResult.data || []).filter(isPublicJob).slice(0, limit || undefined),
    error: null,
  };
}

export async function fetchJobApplications(supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("지원자 조회 실패:", error);
    return [];
  }

  return data || [];
}
