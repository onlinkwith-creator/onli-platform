import { useEffect, useState } from "react";
import { publicSupabase } from "../supabase";

const initialDebugState = {
  interpretersRaw: null,
  interpretersRawError: "",
  interpretersActive: null,
  interpretersActiveError: "",
  jobsRaw: null,
  jobsRawError: "",
  jobsActive: null,
  jobsActiveError: "",
  applicationsRaw: null,
  applicationsRawError: "",
  jobApplicationsRaw: null,
  jobApplicationsRawError: "",
};

function getCount(data) {
  return Array.isArray(data) ? data.length : 0;
}

function getErrorMessage(error) {
  return error?.message || "";
}

function SupabaseDebugBox({ label = "" }) {
  const [debug, setDebug] = useState(initialDebugState);

  useEffect(() => {
    let mounted = true;

    const loadDebugData = async () => {
      if (!publicSupabase) {
        if (mounted) {
          setDebug((current) => ({
            ...current,
            interpretersRawError: "Supabase client is not configured",
          }));
        }
        return;
      }

      const [
        interpretersRaw,
        interpretersActive,
        jobsRaw,
        jobsActive,
        applicationsRaw,
        jobApplicationsRaw,
      ] = await Promise.all([
        publicSupabase.from("public_interpreters").select("*"),
        publicSupabase.from("public_interpreters").select("*").eq("status", "active"),
        publicSupabase.from("public_jobs").select("*"),
        publicSupabase.from("public_jobs").select("*").eq("public_status", "open"),
        publicSupabase.from("applications").select("*"),
        publicSupabase.from("job_applications").select("*"),
      ]);

      if (!mounted) return;

      setDebug({
        interpretersRaw: getCount(interpretersRaw.data),
        interpretersRawError: getErrorMessage(interpretersRaw.error),
        interpretersActive: getCount(interpretersActive.data),
        interpretersActiveError: getErrorMessage(interpretersActive.error),
        jobsRaw: getCount(jobsRaw.data),
        jobsRawError: getErrorMessage(jobsRaw.error),
        jobsActive: getCount(jobsActive.data),
        jobsActiveError: getErrorMessage(jobsActive.error),
        applicationsRaw: getCount(applicationsRaw.data),
        applicationsRawError: getErrorMessage(applicationsRaw.error),
        jobApplicationsRaw: getCount(jobApplicationsRaw.data),
        jobApplicationsRawError: getErrorMessage(jobApplicationsRaw.error),
      });
    };

    queueMicrotask(loadDebugData);

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section style={styles.box} aria-label="Supabase debug">
      <strong style={styles.title}>DEBUG{label ? ` - ${label}` : ""}</strong>
      <DebugLine label="Supabase URL" value={import.meta.env.VITE_SUPABASE_URL || "missing"} />
      <DebugLine
        label="interpreters raw"
        value={`${debug.interpretersRaw ?? "loading"}개 / error: ${debug.interpretersRawError || "-"}`}
      />
      <DebugLine
        label="interpreters active"
        value={`${debug.interpretersActive ?? "loading"}개 / error: ${debug.interpretersActiveError || "-"}`}
      />
      <DebugLine
        label="jobs raw"
        value={`${debug.jobsRaw ?? "loading"}개 / error: ${debug.jobsRawError || "-"}`}
      />
      <DebugLine
        label="jobs active"
        value={`${debug.jobsActive ?? "loading"}개 / error: ${debug.jobsActiveError || "-"}`}
      />
      <DebugLine
        label="applications raw"
        value={`${debug.applicationsRaw ?? "loading"}개 / error: ${debug.applicationsRawError || "-"}`}
      />
      <DebugLine
        label="job_applications raw"
        value={`${debug.jobApplicationsRaw ?? "loading"}개 / error: ${debug.jobApplicationsRawError || "-"}`}
      />
    </section>
  );
}

function DebugLine({ label, value }) {
  return (
    <p style={styles.line}>
      <span style={styles.label}>{label}:</span> {value}
    </p>
  );
}

const styles = {
  box: {
    position: "relative",
    zIndex: 20,
    width: "min(100%, 1100px)",
    margin: "24px auto 0",
    padding: "14px 16px",
    border: "1px solid #f59e0b",
    borderRadius: "12px",
    background: "#fffbeb",
    color: "#111827",
    fontSize: "12px",
    lineHeight: 1.5,
    textAlign: "left",
    boxSizing: "border-box",
    wordBreak: "break-word",
  },
  title: {
    display: "block",
    marginBottom: "8px",
    color: "#92400e",
    fontWeight: 900,
  },
  line: {
    margin: "4px 0",
  },
  label: {
    fontWeight: 900,
  },
};

export default SupabaseDebugBox;
