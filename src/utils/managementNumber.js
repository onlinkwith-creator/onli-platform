export const MANAGEMENT_NUMBER_CONFIG = {
  requests: { column: "request_no", prefix: "ONLI-REQ" },
  jobs: { column: "job_no", prefix: "ONLI-JOB" },
  matchings: { column: "matching_no", prefix: "ONLI-MAT" },
  interpreters: { column: "interpreter_no", prefix: "ONLI-INT" },
  job_applications: { column: "application_no", prefix: "ONLI-APP" },
  applications: { column: "application_no", prefix: "ONLI-APP" },
};

export async function generateManagementNumber({ supabase, table, column, prefix }) {
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
}) {
  if (!payload || payload[column]) return payload;

  const managementNo = await generateManagementNumber({
    supabase,
    table,
    column,
    prefix,
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
