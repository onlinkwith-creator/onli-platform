import { supabase } from "../supabase";

// TODO: 추후 .env 또는 Supabase secrets 기반 관리로 이동해주세요.
export const ADMIN_EMAILS = [
  "onlinkwith@gmail.com",
  "Onlinkcp@gmail.com",
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

export async function sendAutoEmail(type, to, payload = {}) {
  const recipients = normalizeRecipients(to);
  if (!supabase || recipients.length === 0) return { ok: false };

  console.log("sendAutoEmail called", { type, to: recipients, payload });

  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        type,
        to: Array.isArray(to) ? recipients : recipients[0],
        payload,
      },
    });

    console.log("email result", { data, error });

    if (error) throw error;
    return { ok: true, data };
  } catch (error) {
    console.error("자동 메일 발송 실패:", { type, to, error });
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
