export const MANAGEMENT_NUMBER_CONFIG = {
  requests: { column: "request_no", prefix: "ONLI-REQ", rpcName: "generate_request_no" },
  jobs: { column: "job_no", prefix: "ONLI-JOB", rpcName: "generate_job_no" },
  matchings: { column: "matching_no", prefix: "ONLI-MAT" },
  interpreters: { column: "interpreter_no", prefix: "ONLI-INT" },
  job_applications: { column: "application_no", prefix: "ONLI-APP" },
  applications: { column: "application_no", prefix: "ONLI-APP" },
};

export async function generateManagementNumber({ supabase, table, column, prefix, rpcName }) {
  if (rpcName) {
    try {
      const { data, error } = await supabase.rpc(rpcName);
      if (error) throw error;
      if (data) return data;
    } catch (error) {
      console.warn("management number rpc fallback", {
        rpcName,
        table,
        column,
        prefix,
        error,
      });
    }
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .select(column)
      .like(column, `${prefix}-%`)
      .range(0, 9999);

    if (error) throw error;

    const maxNumber = (data || []).reduce((max, row) => {
      const value = row?.[column];
      const match = String(value || "").match(new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`));
      if (!match) return max;
      return Math.max(max, Number(match[1]) || 0);
    }, 0);

    return `${prefix}-${String(maxNumber + 1).padStart(3, "0")}`;
  } catch (error) {
    console.error("management number generation failed", {
      table,
      column,
      prefix,
      error,
    });
    return "";
  }
}

export async function addManagementNumber({
  supabase,
  table,
  payload,
  column,
  prefix,
  rpcName,
}) {
  if (!payload || payload[column]) return payload;

  const managementNo = await generateManagementNumber({
    supabase,
    table,
    column,
    prefix,
    rpcName,
  });

  return managementNo ? { ...payload, [column]: managementNo } : payload;
}

export function isManagementNumberConflict(error, column) {
  return (
    error?.code === "23505" &&
    String(error?.message || error?.details || "").includes(column)
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
