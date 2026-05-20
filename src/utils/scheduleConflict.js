import { supabase as defaultSupabase } from "../supabase";
import { normalizeDateToISO } from "./date";

export const ACTIVE_MATCHING_STATUSES = ["assigned", "confirmed", "in_progress"];

export function normalizeScheduleDate(dateValue) {
  return normalizeDateToISO(dateValue);
}

export function getScheduleRange(source = {}, fallback = {}) {
  const startDate = normalizeScheduleDate(
    source.start_date ||
      source.event_start_date ||
      source.event_date ||
      source.work_date ||
      source.date ||
      fallback.start_date ||
      fallback.event_start_date ||
      fallback.event_date ||
      fallback.work_date ||
      fallback.date
  );
  const endDate =
    normalizeScheduleDate(
      source.end_date ||
        source.event_end_date ||
        source.event_date ||
        source.work_date ||
        source.date ||
        fallback.end_date ||
        fallback.event_end_date ||
        fallback.event_date ||
        fallback.work_date ||
        fallback.date
    ) || startDate;

  return { startDate, endDate };
}

export function isDateRangeOverlapping(startDate, endDate, targetStartDate, targetEndDate) {
  const start = normalizeScheduleDate(startDate);
  const end = normalizeScheduleDate(endDate) || start;
  const targetStart = normalizeScheduleDate(targetStartDate);
  const targetEnd = normalizeScheduleDate(targetEndDate) || targetStart;

  if (!start || !end || !targetStart || !targetEnd) return false;
  return start <= targetEnd && end >= targetStart;
}

export function findLocalScheduleConflicts({
  interpreterId,
  matchings = [],
  newStartDate,
  newEndDate,
  excludeMatchingId,
}) {
  const normalizedStart = normalizeScheduleDate(newStartDate);
  const normalizedEnd = normalizeScheduleDate(newEndDate) || normalizedStart;
  if (!interpreterId || !normalizedStart || !normalizedEnd) return [];

  return matchings.filter((matching) => {
    if (String(matching.interpreter_id) !== String(interpreterId)) return false;
    if (excludeMatchingId && String(matching.id) === String(excludeMatchingId)) {
      return false;
    }
    if (!ACTIVE_MATCHING_STATUSES.includes(String(matching.status || "").toLowerCase())) {
      return false;
    }
    if (!matching.start_date || !matching.end_date) {
      console.warn("matching schedule skipped: missing start_date/end_date", matching);
      return false;
    }
    return isDateRangeOverlapping(
      matching.start_date,
      matching.end_date,
      normalizedStart,
      normalizedEnd
    );
  });
}

export async function checkInterpreterScheduleConflict({
  interpreterId,
  newStartDate,
  newEndDate,
  excludeMatchingId,
  supabase = defaultSupabase,
}) {
  const startDate = normalizeScheduleDate(newStartDate);
  const endDate = normalizeScheduleDate(newEndDate) || startDate;

  if (!supabase || !interpreterId || !startDate || !endDate) {
    return { conflicts: [], error: null };
  }

  let query = supabase
    .from("matchings")
    .select(
      `
        id,
        job_id,
        interpreter_id,
        start_date,
        end_date,
        status,
        jobs (
          title,
          company_name,
          location
        )
      `
    )
    .eq("interpreter_id", interpreterId)
    .in("status", ACTIVE_MATCHING_STATUSES)
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (excludeMatchingId) {
    query = query.neq("id", excludeMatchingId);
  }

  let { data, error } = await query;
  if (error && /relationship|schema cache|jobs/i.test(error.message || "")) {
    let fallbackQuery = supabase
      .from("matchings")
      .select("id, job_id, interpreter_id, start_date, end_date, status")
      .eq("interpreter_id", interpreterId)
      .in("status", ACTIVE_MATCHING_STATUSES)
      .lte("start_date", endDate)
      .gte("end_date", startDate);
    if (excludeMatchingId) {
      fallbackQuery = fallbackQuery.neq("id", excludeMatchingId);
    }
    const fallbackResult = await fallbackQuery;

    data = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error) return { conflicts: [], error };

  const conflicts = (data || []).filter((matching) => {
    if (!matching.start_date || !matching.end_date) {
      console.warn("matching schedule skipped: missing start_date/end_date", matching);
      return false;
    }
    return true;
  });

  return { conflicts, error: null };
}
