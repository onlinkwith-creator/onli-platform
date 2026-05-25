import { supabase } from "../supabase";

// TODO: 추후 .env 또는 Supabase secrets 기반 관리로 이동해주세요.
export const ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "hyundle69@gmail.com",
  "onlinkcp@gmail.com",
];

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

  if (recipients.length === 0) {
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
        to: Array.isArray(to) ? recipients : recipients[0],
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
