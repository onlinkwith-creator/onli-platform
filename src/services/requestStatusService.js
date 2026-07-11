export async function updateRequestStatus({ supabase, requestId, changes }) {
  if (!supabase) throw new Error("Supabase client is required");
  if (requestId === null || requestId === undefined || requestId === "") {
    throw new Error("requestId is required");
  }

  const payload = Object.fromEntries(
    Object.entries(changes || {}).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(payload).length === 0) {
    throw new Error("Status changes are required");
  }

  const { data, error } = await supabase
    .from("requests")
    .update(payload)
    .eq("id", requestId)
    .select("*")
    .single();

  if (error) throw error;
  if (!data || String(data.id) !== String(requestId)) {
    throw new Error("Updated request row was not returned");
  }

  return data;
}
