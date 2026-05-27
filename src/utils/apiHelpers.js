export function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

export function logSupabaseRequest(table, action, payload) {
  console.log(`Supabase request`, {
    table,
    action,
    payload,
  });
}

export function logSupabaseError({ table, action, payload, error, context }) {
  console.error("Supabase request failed", {
    table,
    action,
    payload,
    error: {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    },
    context,
  });
}
