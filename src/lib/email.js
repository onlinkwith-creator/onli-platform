import { supabase } from "../supabase";

const FALLBACK_ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "onlinkcp@gmail.com",
];

export const ADMIN_EMAILS = parseAdminEmails(import.meta.env.VITE_ADMIN_EMAILS);

function parseAdminEmails(value) {
  const envEmails = normalizeRecipients(String(value || "").split(","));
  return envEmails.length > 0 ? envEmails : FALLBACK_ADMIN_EMAILS;
}

function normalizeRecipients(to) {
  const recipients = Array.isArray(to) ? to : [to];
  return recipients
    .filter((recipient) => typeof recipient === "string")
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.includes("@"));
}

export function getEmailRecipient(...values) {
  return normalizeRecipients(values).at(0) || "";
}

function getPayloadRequestId(payload) {
  return (
    payload.requestId ||
    payload.request_id ||
    payload.applicationId ||
    payload.application_id ||
    payload.interpreterId ||
    payload.interpreter_id ||
    payload.jobId ||
    payload.job_id ||
    payload.dedupeKey ||
    ""
  );
}

export async function sendAutoEmail(type, to, payload = {}) {
  console.log("EMAIL START", {
    type,
    to,
    payload,
  });
  console.log("EMAIL TARGET", to);

  const recipients = normalizeRecipients(to);
  if (!supabase) {
    const error = new Error("Supabase client is not configured.");
    console.error("EMAIL ERROR", error);
    return { ok: false, error };
  }

  const canResolveDesignatedInterpreter =
    type === "designated_request_received_interpreter" &&
    (payload.interpreterId ||
      payload.interpreter_id ||
      payload.selected_interpreter_id ||
      payload.designated_interpreter_id);

  if (recipients.length === 0 && !canResolveDesignatedInterpreter) {
    console.warn("EMAIL SKIPPED: NO TARGET");
    console.warn("EMAIL SKIP", { type, to, reason: "No valid email recipient." });
    return { ok: false, skipped: true };
  }

  try {
    console.log("[FRONT_MAIL_API_CALL]", getPayloadRequestId(payload));
    console.log("EMAIL INVOKE START");

    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        type,
        to: Array.isArray(to) ? recipients : recipients[0] || "",
        payload,
      },
    });

    console.log("EMAIL INVOKE RESULT RAW", { data, error });

    console.log("EMAIL INVOKE RESULT", {
      data,
      error,
    });

    console.log("EMAIL RESULT", {
      data,
      error,
    });

    if (error) {
      console.error("EMAIL ERROR DETAIL", JSON.stringify(error, null, 2));
      console.error("EMAIL INVOKE ERROR", error);
      throw error;
    }

    return { ok: true, data };
  } catch (error) {
    console.error("EMAIL ERROR", error);
    return { ok: false, error };
  }
}

export async function sendAdminAutoEmail(type, payload = {}) {
  if (ADMIN_EMAILS.length === 0) {
    console.error("관리자 이메일이 설정되지 않아 관리자 알림 메일을 건너뜁니다.");
    return { ok: false };
  }

  return sendAutoEmail(type, ADMIN_EMAILS, payload);
}
