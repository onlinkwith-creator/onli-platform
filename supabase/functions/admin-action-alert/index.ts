import nodemailer from "npm:nodemailer@8.0.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const adminRecipient = "onlinkwith@gmail.com";
const allowedTypes = new Set([
  "admin_action_interpreter", "admin_action_resume", "admin_action_documents",
  "admin_action_company", "admin_action_request", "admin_action_estimate",
  "admin_action_application", "admin_action_test",
]);
const workflowTypes = new Set([
  "workflow_offer_received", "workflow_offer_accepted", "workflow_offer_declined",
  "workflow_offer_cancelled", "workflow_offer_expired", "workflow_completion_submitted",
  "workflow_completion_revision", "workflow_completion_confirmed",
  "workflow_application_received", "workflow_job_published",
]);
const workflowPaths = new Set([
  "/interpreter-mypage?tab=assignments", "/business/mypage?tab=applicants", "/business/mypage?tab=work",
]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (Number(request.headers.get("content-length")) > 2048) return json({ error: "Too large" }, 413);
  const body = await request.json().catch(() => null);
  if (body?.scope !== undefined && body.scope !== "workflow") return json({ error: "Invalid scope" }, 400);
  const workflow = body?.scope === "workflow";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(body?.id || "") || !uuid.test(body?.nonce || "")) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const user = Deno.env.get("GMAIL_USER") || Deno.env.get("EMAIL_USER");
  const password = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("EMAIL_API_KEY");
  if (!url || !key || !user || !password) return json({ error: "Mail configuration missing" }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // The DB issues a private per-attempt nonce. Claiming consumes it atomically.
  // The caller cannot supply the recipient, message, link, or SMTP credentials.
  const claimed = await db.rpc(workflow ? "claim_workflow_action_alert" : "claim_admin_action_alert", { p_id: body.id, p_nonce: body.nonce });
  if (claimed.error) return json({ error: "Claim unavailable" }, 503);
  const alert = claimed.data?.[0];
  if (!alert) return json({ error: "Unauthorized or already processed" }, 401);
  const finish = (status, messageId = null, error = null) => db.rpc(workflow ? "finish_workflow_action_alert" : "finish_admin_action_alert", {
    p_id: alert.id, p_status: status, p_message_id: messageId, p_error: error,
  });
  const path = workflow ? alert.portal_path : alert.admin_path;
  const recipient = workflow ? String(alert.recipient_email || "").trim().toLowerCase() : adminRecipient;
  const valid = workflow
    ? workflowTypes.has(alert.event_type) && workflowPaths.has(path) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
    : allowedTypes.has(alert.event_type) && /^\/admin\?subTab=[a-z_]+$/.test(path);
  if (!valid) {
    await finish("uncertain", null, "Invalid server alert");
    return json({ error: "Invalid alert" }, 400);
  }
  const link = `https://onli-platform.vercel.app${path}`;
  const message = workflow ? alert.message : "새로운 항목의 승인 또는 확인이 필요합니다.";
  const button = workflow ? "마이페이지에서 확인하기" : "관리자 페이지에서 확인하기";
  const transporter = nodemailer.createTransport({
    service: "gmail", auth: { user: user.trim(), pass: password.replace(/\s/g, "") },
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000,
  });
  let result;
  try {
    result = await transporter.sendMail({
      from: Deno.env.get("EMAIL_FROM") || `"ON-LI" <${user.trim()}>`, to: recipient,
      subject: `[ON-LI${workflow ? "" : " 확인 필요"}] ${alert.title}`,
      text: `${alert.title}\n\n${message}\n${button}: ${link}\n\n상세 내용과 제출 파일은 로그인 후 확인해주세요.`,
      html: `<h2>${escape(alert.title)}</h2><p>${escape(message)}</p><p><a href="${escape(link)}">${button}</a></p><p>상세 내용과 제출 파일은 로그인 후 확인해주세요.</p>`,
    });
  } catch (error) {
    const retryable = ["EAUTH", "ECONNECTION", "EDNS"].includes(error?.code);
    await finish(retryable ? "failed" : "uncertain", null,
      retryable ? "메일 서버 연결 또는 인증 실패" : "메일 발송 결과 불명확: 자동 재발송 중지");
    return json({ error: "Mail delivery failed", retryable }, 502);
  } finally {
    transporter.close();
  }
  const accepted = (result.accepted || []).map((value) => String(value).toLowerCase());
  const rejected = (result.rejected || []).map((value) => String(value).toLowerCase());
  if (!result.messageId || !accepted.includes(recipient) || rejected.includes(recipient)) {
    await finish("uncertain", null, "메일 서버 수신 확인 없음: 자동 재발송 중지");
    return json({ error: "Provider confirmation missing" }, 502);
  }
  const saved = await finish("sent", result.messageId);
  // If persistence fails after SMTP accepted, the sending lease remains non-retryable.
  if (saved.error) return json({ error: "Sent; delivery log needs verification" }, 500);
  return json({ success: true, messageId: result.messageId });
});
