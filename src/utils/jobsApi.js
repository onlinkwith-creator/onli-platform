import { publicSupabase as defaultSupabase } from "../supabase";
import { isPublicJob, sortJobsByDisplayPriority } from "./jobStatus";
import { supabaseConfigError } from "../supabase";

export async function fetchPublicJobs(supabase, { limit } = {}) {
  if (!supabase) {
    return { data: null, error: supabaseConfigError };
  }

  let query = supabase
    .from("public_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (limit) query = query.limit(Math.max(limit * 3, limit));

  const result = await query;

  if (!result.error) {
    const jobs = sortJobsByDisplayPriority((result.data || []).filter(isPublicJob));
    const visibleJobs = limit
      ? jobs.filter((_, index) => index < limit)
      : jobs;

    return {
      data: await attachPublicJobCounts(supabase, visibleJobs),
      error: null,
    };
  }

  console.error("public jobs fetch error:", result.error);
  return result;
}

export async function attachPublicJobCounts(supabase, jobs) {
  return jobs.map((job) => {
    const applicationCount = Number(
      job.application_count ??
        job.applicant_count ??
        job.active_application_count ??
        job.assigned_count ??
        job.matched_count ??
        0
    );

    return {
      ...job,
      application_count: applicationCount,
      applicant_count: applicationCount,
      assigned_count: applicationCount,
      matched_count: applicationCount,
    };
  });
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
