export async function fetchInterpreterSettlements(client, interpreterId) {
  if (!client || !interpreterId) return [];

  const { data: assignments, error: assignmentError } = await client
    .from("request_interpreters")
    .select("id,request_id,interpreter_id,status,assigned_at")
    .eq("interpreter_id", interpreterId)
    .eq("status", "assigned")
    .order("assigned_at", { ascending: false });
  if (assignmentError) throw assignmentError;

  const assignmentsByRequest = new Map();
  for (const assignment of assignments || []) {
    if (assignment.status !== "assigned" || String(assignment.interpreter_id) !== String(interpreterId)) continue;
    const key = String(assignment.request_id);
    if (assignment.request_id && !assignmentsByRequest.has(key)) assignmentsByRequest.set(key, assignment);
  }
  const requestIds = [...assignmentsByRequest.values()].map((row) => row.request_id);
  if (!requestIds.length) return [];

  const [requestResult, settlementResult] = await Promise.all([
    client.rpc("get_portal_requests", { p_request_ids: requestIds }),
    client.from("settlements").select("*")
      .eq("interpreter_id", interpreterId).in("request_id", requestIds)
      .order("updated_at", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (settlementResult.error) throw settlementResult.error;

  const requests = new Map((requestResult.data || []).map((row) => [String(row.id), row]));
  const settlements = new Map();
  for (const row of settlementResult.data || []) {
    if (String(row.interpreter_id) !== String(interpreterId)) continue;
    const key = String(row.request_id);
    if (assignmentsByRequest.has(key) && !settlements.has(key)) settlements.set(key, row);
  }

  return [...assignmentsByRequest.entries()].flatMap(([key, assignment]) => {
    const request = requests.get(key);
    const settlement = settlements.get(key);
    // An owned settlement remains visible even if its optional request metadata is absent.
    if (!request && !settlement) return [];
    return [{
      id: settlement?.id || `request-interpreter-${assignment.id}`,
      requestId: assignment.request_id,
      publicJobCode: request?.request_no || request?.request_code,
      title: request?.event_name || request?.title || "배정된 통역",
      eventName: request?.event_name,
      startDate: request?.start_date || request?.event_date,
      endDate: request?.end_date || request?.event_date,
      amount: settlement?.amount ?? 0,
      settlementStatus: settlement?.settlement_status || settlement?.payout_status || request?.settlement_status,
      completedAt: settlement?.settlement_completed_at || settlement?.paid_at || request?.settlement_completed_at,
      workDays: settlement?.work_days,
    }];
  });
}
