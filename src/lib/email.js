import { supabase } from "../supabase";

// TODO: 운영 관리자 수신 이메일을 Vercel 환경변수 VITE_ADMIN_EMAIL에 설정해주세요.
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "";

export async function sendAutoEmail(type, to, payload = {}) {
  if (!supabase || !to) return { ok: false };

  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { type, to, payload },
    });

    if (error) throw error;
    return { ok: true, data };
  } catch (error) {
    console.error("자동 메일 발송 실패:", { type, to, error });
    return { ok: false, error };
  }
}

export async function sendAdminAutoEmail(type, payload = {}) {
  if (!ADMIN_EMAIL) {
    console.error("관리자 이메일이 설정되지 않아 관리자 알림 메일을 건너뜁니다.");
    return { ok: false };
  }

  return sendAutoEmail(type, ADMIN_EMAIL, payload);
}
