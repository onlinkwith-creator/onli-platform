import { publicSupabase as defaultSupabase } from "../supabase";
import { isPublicJob } from "./jobStatus";
import { supabaseConfigError } from "../supabase";
import { APPLICATION_STATUS } from "./status";

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
    .order("created_at", { ascending: false });

  if (limit) query = query.limit(Math.max(limit * 3, limit));

  const result = await query;

  if (!result.error) {
    const jobs = (result.data || []).filter(isPublicJob).slice(0, limit || undefined);

    return {
      data: await attachPublicJobCounts(supabase, jobs),
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

  const jobs = (fallbackResult.data || []).filter(isPublicJob).slice(0, limit || undefined);

  return {
    data: await attachPublicJobCounts(supabase, jobs),
    error: null,
  };
}

export async function attachPublicJobCounts(supabase, jobs) {
  if (!jobs.length) return jobs;

  const jobIds = jobs.map((job) => job.id).filter(Boolean);
  if (!jobIds.length) return jobs;

  const applicationCounts = await fetchMatchedApplicationCounts(supabase, jobIds);
  const assignmentCounts = await fetchRequestAssignmentCounts(supabase, jobIds);

  return jobs.map((job) => {
    const jobId = String(job.id);
    const assignedCount = assignmentCounts.get(jobId) || applicationCounts.get(jobId) || 0;

    return {
      ...job,
      assigned_count: assignedCount,
      matched_count: assignedCount,
    };
  });
}

async function fetchMatchedApplicationCounts(supabase, jobIds) {
  const { data, error } = await supabase
    .from("job_applications")
    .select("job_id")
    .in("job_id", jobIds)
    .eq("status", APPLICATION_STATUS.ACCEPTED);

  if (error) {
    console.error("matched applications fetch error:", error);
    return new Map();
  }

  return (data || []).reduce((counts, application) => {
    const jobId = String(application.job_id || "");
    counts.set(jobId, (counts.get(jobId) || 0) + 1);
    return counts;
  }, new Map());
}

async function fetchRequestAssignmentCounts(supabase, jobIds) {
  const requestResult = await supabase
    .from("requests")
    .select("id, job_id, assigned_interpreter_id, matched_interpreter_id")
    .in("job_id", jobIds);

  if (requestResult.error) {
    console.error("request assignment source fetch error:", requestResult.error);
    if (!isMissingColumnError(requestResult.error)) return new Map();

    const fallbackResult = await supabase
      .from("requests")
      .select("id, job_id")
      .in("job_id", jobIds);

    if (fallbackResult.error) {
      console.error("request assignment fallback fetch error:", fallbackResult.error);
      return new Map();
    }

    return fetchCountsFromRequestInterpreters(supabase, fallbackResult.data || []);
  }

  const requests = requestResult.data || [];
  const counts = await fetchCountsFromRequestInterpreters(supabase, requests);

  requests.forEach((request) => {
    const jobId = String(request.job_id || "");
    if (!jobId || counts.has(jobId)) return;
    if (request.assigned_interpreter_id || request.matched_interpreter_id) {
      counts.set(jobId, 1);
    }
  });

  return counts;
}

async function fetchCountsFromRequestInterpreters(supabase, requests) {
  const requestIds = requests.map((request) => request.id).filter(Boolean);
  if (!requestIds.length) return new Map();

  const { data, error } = await supabase
    .from("request_interpreters")
    .select("request_id, interpreter_id")
    .in("request_id", requestIds);

  if (error) {
    console.error("request_interpreters count fetch error:", error);
    return new Map();
  }

  const jobIdByRequestId = new Map(
    requests.map((request) => [String(request.id), String(request.job_id || "")])
  );

  return (data || []).reduce((counts, assignment) => {
    const jobId = jobIdByRequestId.get(String(assignment.request_id));
    if (!jobId) return counts;
    counts.set(jobId, (counts.get(jobId) || 0) + 1);
    return counts;
  }, new Map());
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
