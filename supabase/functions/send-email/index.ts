import nodemailer from "npm:nodemailer@8.0.7";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const subjects = {
  test: "[ON-LI] 메일 테스트",
  interpreter_registered_user: "[ON-LI] 통역사 등록이 접수되었습니다",
  interpreter_registered_admin: "[ON-LI 관리자 알림] 신규 통역사 등록",
  job_applied_user: "[ON-LI] 통역 공고 지원이 접수되었습니다",
  job_applied_admin: "[ON-LI 관리자 알림] 신규 공고 지원",
  matching_confirmed_user: "[ON-LI] 통역 배정이 확정되었습니다",
  company_request_received_user: "[ON-LI] 통역 의뢰가 접수되었습니다",
  company_request_received_admin: "[ON-LI 관리자 알림] 신규 기업 의뢰",
  company_request_under_review: "[ON-LI] 통역 의뢰 검토가 진행 중입니다",
  company_matching_confirmed: "[ON-LI] 통역사 배정이 완료되었습니다",
  interpreter_approved: "[ON-LI] 통역사 등록이 승인되었습니다",
  resume_verified: "ON-LI 이력서 검증이 완료되었습니다",
  interpreter_matching_confirmed: "[ON-LI] 통역 배정이 확정되었습니다",
  interpreter_schedule_reminder: "[ON-LI] 통역 일정 안내드립니다",
  designated_request_received_interpreter:
    "[ON-LI] 지정 통역 의뢰가 도착했습니다",
  client_review_started: "[ON-LI] 통역 의뢰 검토가 시작되었습니다",
  client_estimate_ready: "[ON-LI] 통역 의뢰 견적서 준비 완료 안내",
  client_recruiting_started: "[ON-LI] 통역사 모집이 시작되었습니다",
  client_work_completed: "[ON-LI] 통역 업무가 완료되었습니다",
  client_settlement_ready: "[ON-LI] 정산/결제 요청 안내",
  client_work_preparing: "[ON-LI] 통역 업무 준비가 시작되었습니다",
  client_work_ready: "[ON-LI] 통역 업무 진행 예정 안내",
  company_request_received: "[ON-LI] 통역 의뢰가 접수되었습니다",
  company_estimate_issued: "[ON-LI] 견적서가 발급되었습니다",
  company_estimate_approved: "[ON-LI] 견적 승인이 완료되었습니다",
  company_assignment_completed: "[ON-LI] 통역사 배정이 완료되었습니다",
  company_completion_document_issued: "[ON-LI] 업무확인서가 발급되었습니다",
  interpreter_application_received: "[ON-LI] 지원이 접수되었습니다",
  interpreter_assignment_completed: "[ON-LI] 배정이 완료되었습니다",
  interpreter_payout_issued: "[ON-LI] 정산서가 발급되었습니다",
  interpreter_payout_completed: "[ON-LI] 정산이 완료되었습니다",
  interpreter_settlement_confirmed: "[ON-LI] 정산 금액이 확정되었습니다",
  interpreter_payout_paid: "[ON-LI] 지급이 완료되었습니다",
  interpreter_settlement_withheld: "[ON-LI] 정산이 보류되었습니다",
  admin_new_request: "[ON-LI 관리자 알림] 신규 의뢰 접수",
  admin_new_company: "[ON-LI 관리자 알림] 신규 기업 등록",
  admin_estimate_approved: "[ON-LI 관리자 알림] 견적 승인 완료",
} as const;

type EmailType = keyof typeof subjects;
type Payload = Record<string, unknown>;

function isEmailType(value: unknown): value is EmailType {
  return typeof value === "string" && Object.hasOwn(subjects, value);
}

type MailOptions = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

type MailTransporter = {
  sendMail: (mailOptions: MailOptions) => Promise<unknown>;
};

type MailProviderResult = {
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
};

type NotificationEvent = {
  id: string;
  event_type: string;
  target_type: string;
  target_id: string;
  recipient_type: string;
  recipient_email?: string | null;
  payload?: Payload | null;
  status: string;
  retry_count?: number | null;
  channel?: string | null;
  title?: string | null;
  message?: string | null;
};

type NotificationRow = {
  id: string;
  recipient_type: string;
  recipient_id?: string | null;
  recipient_email?: string | null;
  notification_type: string;
  title?: string | null;
  message?: string | null;
  channel?: string | null;
  status: string;
  error_message?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getMailProviderResult(result: unknown): MailProviderResult {
  if (!result || typeof result !== "object") return {};
  const value = result as Record<string, unknown>;
  return {
    messageId: typeof value.messageId === "string"
      ? value.messageId
      : undefined,
    accepted: Array.isArray(value.accepted)
      ? value.accepted.filter((item): item is string =>
        typeof item === "string"
      )
      : undefined,
    rejected: Array.isArray(value.rejected)
      ? value.rejected.filter((item): item is string =>
        typeof item === "string"
      )
      : undefined,
    response: typeof value.response === "string" ? value.response : undefined,
  };
}

function assertMailProviderMessageId(result: unknown, recipientEmail: string) {
  const provider = getMailProviderResult(result);
  const recipient = recipientEmail.trim().toLowerCase();
  const rejected = (provider.rejected || []).map((item) =>
    item.trim().toLowerCase()
  );
  const accepted = (provider.accepted || []).map((item) =>
    item.trim().toLowerCase()
  );

  if (rejected.length > 0 || rejected.includes(recipient)) {
    throw new Error(`Email provider rejected recipient: ${recipientEmail}`);
  }

  if (accepted.length === 0 || !accepted.includes(recipient)) {
    throw new Error(
      `SMTP server did not accept the recipient: ${recipientEmail}`,
    );
  }

  if (provider.messageId) {
    return {
      ok: true,
      messageId: provider.messageId,
      accepted: provider.accepted || [],
      rejected: provider.rejected || [],
      response: provider.response || "",
    };
  }

  throw new Error("Email provider did not return messageId.");
}

function getPayloadRequestId(payload: Payload) {
  const value = payload.requestId ||
    payload.request_id ||
    payload.applicationId ||
    payload.application_id ||
    payload.interpreterId ||
    payload.interpreter_id ||
    payload.jobId ||
    payload.job_id ||
    payload.dedupeKey;

  return value === undefined || value === null || value === ""
    ? ""
    : String(value);
}

async function sendMailOnce({
  supabase,
  transporter,
  mailType,
  relatedId,
  recipientEmail,
  mailOptions,
}: {
  supabase: SupabaseClient;
  transporter: MailTransporter;
  mailType: EmailType;
  relatedId: string;
  recipientEmail: string;
  mailOptions: MailOptions;
}) {
  const recipient = recipientEmail.trim().toLowerCase();
  const dedupeKey = `${mailType}:${relatedId}:${recipient}`;

  const { error } = await supabase
    .from("mail_logs")
    .insert({
      dedupe_key: dedupeKey,
      mail_type: mailType,
      recipient,
      related_id: relatedId || null,
    });

  if (error) {
    if (error.code === "23505") {
      console.log("[MAIL_DUPLICATE_BLOCKED]", dedupeKey);
      return { skipped: true, dedupeKey };
    }

    throw error;
  }

  console.log("[MAIL_SEND_ONCE]", dedupeKey);

  const result = await transporter.sendMail(mailOptions);
  const provider = assertMailProviderMessageId(result, recipientEmail);
  console.log("[MAIL_SEND_SUCCESS]", {
    dedupeKey,
    recipient,
    messageId: provider.messageId,
    accepted: provider.accepted,
    response: provider.response,
  });
  return { sent: true, dedupeKey, result, provider };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function field(payload: Payload, key: string, fallback = "-") {
  const value = payload[key];
  return value === undefined || value === null || value === ""
    ? fallback
    : escapeHtml(value);
}

function fieldFrom(payload: Payload, keys: string[], fallback = "-") {
  const key = keys.find((item) => {
    const value = payload[item];
    return value !== undefined && value !== null && value !== "";
  });
  return key ? field(payload, key, fallback) : fallback;
}

function formatKrw(value: unknown) {
  if (value === null || value === undefined || value === "") return "미확인";
  const amount = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(amount)
    ? `₩${amount.toLocaleString("ko-KR")}`
    : "미확인";
}

function normalizeSubject(value: unknown) {
  const cleanSubject = String(value || "운영 안내")
    .replace(/^\[ON-LI\]\s*/i, "")
    .replace(/^ON-LI\s*/i, "")
    .trim();
  return `[ON-LI] ${cleanSubject || "운영 안내"}`;
}

type EmailTemplateOptions = {
  title: string;
  status?: string;
  message: string;
  requestInfo?: Array<[string, string]>;
  buttonText?: string;
  buttonUrl?: string;
};

const STATUS_STYLES: Array<[string, string, string]> = [
  ["배정", "#2563EB", "#EFF6FF"],
  ["정산 대기", "#B45309", "#FFFBEB"],
  ["정산 확정", "#7C3AED", "#F5F3FF"],
  ["정산 금액", "#7C3AED", "#F5F3FF"],
  ["지급", "#4F46E5", "#EEF2FF"],
  ["정산 완료", "#15803D", "#F0FDF4"],
  ["견적 승인", "#4B5563", "#F3F4F6"],
];

function statusPresentation(status: string) {
  const matched = STATUS_STYLES.find(([keyword]) => status.includes(keyword));
  return matched
    ? { color: matched[1], background: matched[2] }
    : { color: "#5B4CF0", background: "#F8F7FF" };
}

function inferredStatus(title: string) {
  if (
    title.includes("배정") && (title.includes("완료") || title.includes("확정"))
  ) return "배정 완료";
  if (title.includes("정산 금액") || title.includes("정산 확정")) {
    return "정산 확정";
  }
  if (
    title.includes("정산") && (title.includes("대기") || title.includes("확인"))
  ) return "정산 대기";
  if (title.includes("지급") && !title.includes("완료")) return "통역사 지급";
  if (
    (title.includes("정산") || title.includes("지급")) && title.includes("완료")
  ) return "정산 완료";
  if (title.includes("견적 승인")) return "견적 승인 완료";
  if (title.includes("완료")) return "완료";
  if (title.includes("접수")) return "접수 완료";
  if (title.includes("변경")) return "상태 변경";
  return title;
}

function statusMessage(status: string) {
  if (status.includes("정산 대기")) {
    return "통역 업무가 완료되어 정산 절차가 시작되었습니다.";
  }
  if (status.includes("정산 확정")) return "관리자가 정산을 확정하였습니다.";
  if (status.includes("통역사 지급")) return "지급 절차가 진행 중입니다.";
  if (status.includes("정산 완료")) return "정산이 모두 완료되었습니다.";
  if (status.includes("배정 완료")) return "통역사 배정이 완료되었습니다.";
  if (status.includes("견적 승인")) return "기업이 견적을 승인했습니다.";
  return "회원님의 통역 의뢰와 관련된 현재 진행 상태입니다.";
}

function settlementProgress(status: string) {
  const steps = ["정산 대기", "정산 확정", "통역사 지급", "정산 완료"];
  if (!steps.includes(status)) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin:24px 0; border-collapse:collapse;">
      <tr>
        ${
    steps.map((step) => {
      const active = step === status;
      return `<td width="25%" align="center" valign="top" style="padding:0 3px; color:${
        active ? "#5B4CF0" : "#9CA3AF"
      }; font-size:11px; font-weight:${
        active ? "700" : "400"
      }; line-height:1.4;"><span style="display:block; height:6px; margin-bottom:8px; border-radius:999px; background:${
        active ? "#5B4CF0" : "#E5E7EB"
      };"></span>${step}</td>`;
    }).join("")
  }
      </tr>
    </table>`;
}

function createEmailTemplate({
  title,
  status = inferredStatus(title),
  message,
  requestInfo,
  buttonText,
  buttonUrl,
}: EmailTemplateOptions) {
  const badge = statusPresentation(status);
  const information = requestInfo?.length ? infoTable(requestInfo) : "";
  const button = buttonText && buttonUrl
    ? linkButton(buttonText, buttonUrl)
    : "";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media only screen and (max-width:600px){.email-shell{padding:12px!important}.email-content{padding:28px 20px!important}.email-title{font-size:24px!important}.email-button{display:block!important;width:100%!important;box-sizing:border-box!important}.info-label,.info-value{display:block!important;width:100%!important;box-sizing:border-box!important}.info-label{padding-bottom:4px!important}.info-value{padding-top:0!important}}</style></head>
<body style="margin:0; padding:0; background:#F5F7FA; color:#1F2937; font-family:Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; background:#F5F7FA;"><tr><td class="email-shell" align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px; border-collapse:separate; background:#FFFFFF; border-radius:12px; overflow:hidden;">
<tr><td align="center" style="height:80px; padding:0 24px; background:#5B4CF0; color:#FFFFFF;"><div style="font-size:26px; line-height:1.2; font-weight:800; letter-spacing:1px;">ON-LI</div><div style="margin-top:5px; font-size:11px; line-height:1.3; font-weight:700;">ON-Link Interpretation Platform</div></td></tr>
<tr><td class="email-content" style="padding:40px;">
<h1 class="email-title" style="margin:0 0 24px; color:#111827; font-size:28px; line-height:1.35; font-weight:800;">${
    escapeHtml(title)
  }</h1>
<p style="margin:0 0 8px; font-size:15px; line-height:1.7; color:#374151;">안녕하세요.</p>
<p style="margin:0 0 4px; font-size:15px; line-height:1.7; color:#374151;">ON-LI 통역 플랫폼입니다.</p>
<p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:#374151;">회원님의 통역 의뢰와 관련하여<br>다음과 같이 안내드립니다.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:separate; border:1px solid #E5E2FF; border-radius:10px; background:${badge.background};"><tr><td style="padding:20px;"><div style="margin-bottom:10px; color:#6B7280; font-size:12px; font-weight:700;">현재 상태</div><span style="display:inline-block; padding:8px 14px; border-radius:999px; background:${badge.color}; color:#FFFFFF; font-size:15px; line-height:1.2; font-weight:700;">${
    escapeHtml(status)
  }</span><p style="margin:14px 0 0; color:#374151; font-size:14px; line-height:1.7;">${
    escapeHtml(statusMessage(status))
  }</p></td></tr></table>
${settlementProgress(status)}
<div style="margin-top:24px; font-size:14px; line-height:1.8; color:#374151;">${message}</div>${information}${button}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin-top:32px; border-collapse:separate; border-radius:8px; background:#F8F7FF;"><tr><td style="padding:18px 20px; color:#4B5563; font-size:13px; line-height:1.7;"><strong style="display:block; margin-bottom:4px; color:#111827;">문의</strong>문의사항은 아래로 연락 부탁드립니다.<br><a href="mailto:onlinkwith@gmail.com" style="color:#5B4CF0; text-decoration:none;">support@on-li.jp</a><br>운영시간: 평일 09:00 ~ 18:00</td></tr></table>
</td></tr>
<tr><td style="padding:24px 40px; border-top:1px solid #E5E7EB; background:#F3F4F6; color:#6B7280; font-size:11px; line-height:1.7;"><strong style="color:#374151;">ON-LI</strong><br>ON-Link Interpretation Platform<br>Website: <a href="https://on-li.jp" style="color:#5B4CF0; text-decoration:none;">https://on-li.jp</a><br>E-mail: <a href="mailto:onlinkwith@gmail.com" style="color:#5B4CF0; text-decoration:none;">support@on-li.jp</a><br><br>본 메일은 시스템에 의해 자동 발송되었습니다.<br>문의는 회신하지 마시고 홈페이지를 이용해주시기 바랍니다.</td></tr>
</table></td></tr></table></body></html>`;
}

function layout(title: string, body: string, status?: string) {
  return createEmailTemplate({ title, message: body, status });
}

function settlementStatusLabel(value: unknown, fallbackTitle = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    ["waiting", "pending", "settlement_waiting", "settlement_pending", "ready"]
      .includes(normalized)
  ) return "정산 대기";
  if (["confirmed", "settlement_confirmed"].includes(normalized)) {
    return "정산 확정";
  }
  if (
    ["paying", "payment_processing", "payout_processing"].includes(normalized)
  ) return "통역사 지급";
  if (
    ["completed", "paid", "settlement_completed", "payout_completed"].includes(
      normalized,
    )
  ) return "정산 완료";
  return inferredStatus(fallbackTitle);
}

function infoTable(rows: Array<[string, string]>) {
  const visibleRows = rows.filter(([, value]) => value && value !== "-");
  if (visibleRows.length === 0) return "";
  return `
    <table role="presentation" style="width:100%; border:1px solid #EEEEEE; border-radius:10px; border-collapse:separate; border-spacing:0; margin-top:24px;">
      <tbody>
        ${
    visibleRows
      .map(
        ([label, value]) => `
              <tr>
                <th class="info-label" style="width:34%; text-align:left; vertical-align:top; padding:13px 16px; border-bottom:1px solid #EEEEEE; color:#6B7280; font-size:13px; font-weight:600;">${
          escapeHtml(label)
        }</th>
                <td class="info-value" style="padding:13px 16px; border-bottom:1px solid #EEEEEE; color:#111827; font-size:14px; font-weight:600; word-break:break-word;">${value}</td>
              </tr>
            `,
      )
      .join("")
  }
      </tbody>
    </table>
  `;
}

function appUrl(path = "/") {
  const baseUrl = Deno.env.get("APP_URL") ||
    Deno.env.get("PUBLIC_APP_URL") ||
    "https://onli-platform.vercel.app";
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function linkButton(label: string, href: string) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin-top:28px; border-collapse:collapse;"><tr><td align="center">
      <a class="email-button" href="${
    escapeHtml(href)
  }" style="display:inline-block; padding:14px 32px; background:#5B4CF0; color:#FFFFFF; text-align:center; text-decoration:none; border-radius:8px; font-size:14px; font-weight:700;">${
    escapeHtml(label)
  }</a>
    </td></tr></table>
  `;
}

function buildHtml(type: EmailType, payload: Payload) {
  switch (type) {
    case "test":
      return layout(
        "자동 메일 테스트",
        `
          <p>${field(payload, "name", "ON-LI TEST")}</p>
          <p>메일 시스템 정상 동작 테스트입니다.</p>
        `,
      );
    case "interpreter_registered_user":
      return layout(
        "통역사 등록이 접수되었습니다",
        `
          <p>${
          field(payload, "name", "지원자")
        }님, ON-LI 통역사 등록 신청이 정상 접수되었습니다.</p>
          <p>운영팀이 등록 정보를 검토한 뒤 필요한 경우 추가 연락을 드리겠습니다.</p>
          ${
          infoTable([
            ["이름", field(payload, "name")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["활동 가능 지역", field(payload, "availableRegions")],
            ["전문 분야", field(payload, "specialties")],
          ])
        }
        `,
      );
    case "interpreter_registered_admin":
      return layout(
        "신규 통역사 등록 알림",
        `
          <p>ON-LI에 신규 통역사 등록이 접수되었습니다. 관리자 페이지에서 상세 정보를 확인해주세요.</p>
          ${
          infoTable([
            ["이름", field(payload, "name")],
            ["성별", field(payload, "gender")],
            ["나이", field(payload, "age")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            [
              "활동 가능 지역",
              fieldFrom(payload, ["availableRegions", "regions", "region"]),
            ],
            ["JLPT", field(payload, "jlpt")],
            ["통역 경험", fieldFrom(payload, ["experience", "hasExperience"])],
            ["전문 분야", field(payload, "specialties")],
            ["등록 시각", field(payload, "createdAt")],
          ])
        }
        `,
      );
    case "job_applied_user":
      return layout(
        "통역 공고 지원이 접수되었습니다",
        `
          <p>${
          field(payload, "name", "지원자")
        }님, ON-LI 통역 공고 지원이 정상 접수되었습니다.</p>
          <p>운영팀이 지원 내용을 확인한 뒤 다음 절차를 안내드리겠습니다.</p>
          ${
          infoTable([
            ["공고명", field(payload, "jobTitle")],
            ["일정", field(payload, "date")],
            ["지원자 이메일", field(payload, "email")],
            ["지원자 연락처", field(payload, "phone")],
            ["레벨/경력", field(payload, "levelOrExperience")],
          ])
        }
        `,
      );
    case "job_applied_admin":
      return layout(
        "신규 공고 지원 알림",
        `
          <p>ON-LI 공고에 신규 지원이 접수되었습니다. 관리자 페이지에서 지원자 정보를 확인해주세요.</p>
          ${
          infoTable([
            ["지원자", field(payload, "name")],
            ["공고명", field(payload, "jobTitle")],
            ["일정", field(payload, "date")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["레벨/경력", field(payload, "levelOrExperience")],
          ])
        }
        `,
      );
    case "matching_confirmed_user":
    case "interpreter_matching_confirmed":
      return layout(
        "통역 배정이 확정되었습니다",
        `
          <p>${
          field(payload, "name", "통역사")
        }님, ON-LI 통역 배정이 확정되었습니다.</p>
          <p>세부 진행 내용은 운영팀 안내에 따라 확인해주세요.</p>
          ${
          infoTable([
            ["의뢰/공고명", field(payload, "jobTitle")],
            ["기업명", field(payload, "companyName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])
        }
        `,
      );
    case "interpreter_approved":
      return layout(
        "통역사 등록이 승인되었습니다",
        `
          <p>${
          field(payload, "name", "통역사")
        }님, ON-LI 통역사 등록 검토가 완료되어 승인되었습니다.</p>
          <p>앞으로 적합한 통역 공고와 매칭 건이 있을 때 ON-LI 운영팀에서 안내드리겠습니다.</p>
          ${
          infoTable([
            ["이름", field(payload, "name")],
            ["이메일", field(payload, "email")],
            ["활동 지역", field(payload, "availableRegions")],
            ["전문 분야", field(payload, "specialties")],
          ])
        }
        `,
      );
    case "resume_verified":
      return layout(
        "ON-LI 이력서 검증이 완료되었습니다",
        `
          <p>안녕하세요, ON-LI 운영팀입니다.</p>
          <p>제출해주신 이력서 확인이 완료되어, ON-LI 통역사 검증이 완료되었습니다.</p>
          <p>이제 ON-LI 플랫폼 내 통역 공고에 지원하실 수 있습니다.</p>
          <p>향후 통역 공고 지원 시, 등록하신 프로필과 이력서를 바탕으로 배정 검토가 진행됩니다.</p>
          ${linkButton("통역 공고 확인하기", appUrl("/jobs"))}
          <p>감사합니다.</p>
          <p>ON-LI 운영팀</p>
        `,
      );
    case "company_request_received_user":
    case "company_request_received":
      return layout(
        "통역 의뢰가 접수되었습니다",
        `
          <p>${
          field(payload, "contactName", "담당자")
        }님, ON-LI 의뢰가 정상 접수되었습니다.</p>
          <p>담당자가 확인 후 연락드립니다.</p>
          ${
          infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["요청 인원", field(payload, "requestedPeopleCount")],
            ["희망 레벨", field(payload, "requestedLevel")],
          ])
        }
        `,
      );
    case "company_request_received_admin":
    case "admin_new_request":
      return layout(
        "신규 기업 의뢰 알림",
        `
          <p>ON-LI에 신규 기업 의뢰가 접수되었습니다. 관리자 페이지에서 의뢰 정보를 확인해주세요.</p>
          ${
          infoTable([
            ["회사명", field(payload, "companyName")],
            ["담당자", field(payload, "contactName")],
            [
              "담당자 연락처",
              fieldFrom(payload, ["contactEmail", "email", "contact"]),
            ],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["요청 인원", field(payload, "requestedPeopleCount")],
          ])
        }
        `,
      );
    case "company_estimate_issued":
      return layout(
        "견적서가 발급되었습니다",
        `
          <p>요청하신 통역 의뢰의 견적서가 발급되었습니다. 마이페이지에서 세부 내용을 확인해주세요.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_no", "request_code", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "company_estimate_approved":
      return layout(
        "견적 승인이 완료되었습니다",
        `
          <p>견적 승인 처리가 완료되었습니다. 다음 절차는 ON-LI 운영팀이 안내드립니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_no", "request_code", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "company_assignment_completed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>요청하신 통역 의뢰의 통역사 배정이 완료되었습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_no", "request_code", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "company_completion_document_issued":
      return layout(
        "업무확인서가 발급되었습니다",
        `
          <p>완료된 통역 업무의 업무확인서가 발급되었습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_no", "request_code", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "interpreter_application_received":
      return layout(
        "지원이 접수되었습니다",
        `
          <p>${
          fieldFrom(payload, ["name", "applicant_name"], "통역사")
        }님, 지원이 정상 접수되었습니다.</p>
          ${
          infoTable([
            ["공고명", fieldFrom(payload, ["jobTitle", "event_name", "title"])],
            ["일정", fieldFrom(payload, ["date", "start_date"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "interpreter_assignment_completed":
      return layout(
        "배정이 완료되었습니다",
        `
          <p>${
          fieldFrom(payload, ["interpreter_name", "name"], "통역사")
        }님, 통역 배정이 완료되었습니다.</p>
          ${
          infoTable([
            [
              "의뢰/공고명",
              fieldFrom(payload, ["event_name", "jobTitle", "title"]),
            ],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "interpreter_payout_issued":
      return layout(
        "정산서가 발급되었습니다",
        `
          <p>배정 건의 정산서가 발급되었습니다. 마이페이지에서 확인해주세요.</p>
          ${
          infoTable([
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "interpreter_payout_completed":
      return layout(
        "정산이 완료되었습니다",
        `
          <p>배정 건의 정산 완료 처리가 되었습니다.</p>
          ${
          infoTable([
            [
              "배정번호",
              fieldFrom(payload, [
                "assignment_code",
                "matching_no",
                "assignment_id",
              ]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "admin_new_company":
      return layout(
        "신규 기업 등록 알림",
        `
          <p>신규 기업 계정이 등록되었습니다. 관리자 페이지에서 검토해주세요.</p>
          ${
          infoTable([
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["담당자", fieldFrom(payload, ["contact_name", "contactName"])],
          ])
        }
          ${linkButton("기업 관리 열기", appUrl("/admin/businesses"))}
        `,
      );
    case "admin_estimate_approved":
      return layout(
        "견적 승인 완료 알림",
        `
          <p>기업이 견적을 승인했습니다. 후속 배정 절차를 확인해주세요.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_no", "request_code", "request_id"]),
            ],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])
        }
          ${linkButton("의뢰 관리 열기", appUrl("/admin/requests"))}
        `,
      );
    case "company_request_under_review":
      return layout(
        "통역 의뢰 검토가 진행 중입니다",
        `
          <p>${
          field(payload, "contactName", "담당자")
        }님, 접수해주신 통역 의뢰를 ON-LI 운영팀이 검토 중입니다.</p>
          <p>일정, 요청 인원, 통역 분야를 확인한 뒤 다음 절차를 안내드리겠습니다.</p>
          ${
          infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
          ])
        }
        `,
      );
    case "company_matching_confirmed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>${
          field(payload, "contactName", "담당자")
        }님, 요청하신 통역 의뢰의 통역사 배정이 완료되었습니다.</p>
          <p>세부 진행 사항은 ON-LI 운영팀 안내에 따라 확인해주세요.</p>
          ${
          infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", fieldFrom(payload, ["eventName", "jobTitle"])],
            ["배정 통역사", field(payload, "interpreterName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])
        }
        `,
      );
    case "interpreter_schedule_reminder":
      return layout(
        "통역 일정 안내드립니다",
        `
          <p>${
          field(payload, "name", "통역사")
        }님, 배정된 통역 일정 안내드립니다.</p>
          <p>현장 정보와 집합 시간은 운영팀의 최종 안내를 기준으로 확인해주세요.</p>
          ${
          infoTable([
            ["의뢰/공고명", field(payload, "jobTitle")],
            ["기업명", field(payload, "companyName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])
        }
        `,
      );
    case "designated_request_received_interpreter":
      return layout(
        "지정 통역 의뢰가 도착했습니다",
        `
          <p>안녕하세요, ${field(payload, "interpreterName", "통역사")}님.</p>
          <p>기업에서 회원님의 프로필을 확인 후 지정 통역 의뢰를 요청했습니다.</p>
          <p>아래 일정을 확인 후 가능 여부를 알려주세요.</p>
          ${
          infoTable([
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["통역 유형", field(payload, "interpretationTypes")],
            ["요청 내용", field(payload, "requestDetails")],
          ])
        }
          <p>가능 여부 확인 후 ON-LI 담당자가 최종 매칭을 진행합니다.</p>
          <p>감사합니다.<br/>ON-LI</p>
        `,
      );
  }
}

function notificationSubject(eventType: string) {
  const subjectsByEvent: Record<string, string> = {
    new_request: "[ON-LI] 신규 통역 의뢰가 접수되었습니다",
    new_interpreter: "[ON-LI] 신규 통역사가 등록되었습니다",
    application_created: "[ON-LI] 신규 지원자가 발생했습니다",
    assignment_created: "[ON-LI] 통역 일정이 배정되었습니다",
    application_status_changed: "[ON-LI] 지원 상태가 변경되었습니다",
    settlement_status_changed: "[ON-LI] 정산 상태가 변경되었습니다",
    request_created_client: "[ON-LI] 통역 의뢰가 접수되었습니다",
    assignment_confirmed_client: "[ON-LI] 통역사 배정이 완료되었습니다",
    status_changed: "[ON-LI] 운영 상태가 변경되었습니다",
    settlement_ready: "[ON-LI] 정산 확인이 필요합니다",
    memo_created: "[ON-LI] 관리자 메모가 추가되었습니다",
    client_review_started: "[ON-LI] 통역 의뢰 검토가 시작되었습니다",
    client_estimate_ready: "[ON-LI] 통역 의뢰 견적서 준비 완료 안내",
    client_recruiting_started: "[ON-LI] 통역사 모집이 시작되었습니다",
    client_work_completed: "[ON-LI] 통역 업무가 완료되었습니다",
    client_settlement_ready: "[ON-LI] 정산/결제 요청 안내",
    company_estimate_issued: "[ON-LI] 견적서가 발급되었습니다",
    company_estimate_approved: "[ON-LI] 견적 승인이 완료되었습니다",
    company_assignment_completed: "[ON-LI] 통역사 배정이 완료되었습니다",
    company_completion_document_issued: "[ON-LI] 업무확인서가 발급되었습니다",
    interpreter_application_received: "[ON-LI] 지원이 접수되었습니다",
    interpreter_assignment_completed: "[ON-LI] 배정이 완료되었습니다",
    interpreter_payout_issued: "[ON-LI] 정산서가 발급되었습니다",
    interpreter_payout_completed: "[ON-LI] 정산이 완료되었습니다",
    interpreter_settlement_confirmed: "[ON-LI] 정산 금액이 확정되었습니다",
    interpreter_payout_paid: "[ON-LI] 지급이 완료되었습니다",
    interpreter_settlement_withheld: "[ON-LI] 정산이 보류되었습니다",
    admin_new_request: "[ON-LI 관리자 알림] 신규 의뢰 접수",
    admin_new_company: "[ON-LI 관리자 알림] 신규 기업 등록",
    admin_estimate_approved: "[ON-LI 관리자 알림] 견적 승인 완료",
    company_payment_invoice_sent: "[ON-LI] 입금 안내드립니다",
    company_payment_paid: "[ON-LI] 입금이 확인되었습니다",
    company_payment_overdue: "[ON-LI] 입금 기한 초과 안내",
    admin_payment_overdue: "[ON-LI 관리자 알림] 결제 연체 확인 필요",
  };
  return subjectsByEvent[eventType] || "[ON-LI] 알림이 도착했습니다";
}

function buildNotificationHtml(event: NotificationEvent, payload: Payload) {
  switch (event.event_type) {
    case "new_request":
    case "admin_new_request":
      return layout(
        "신규 통역 의뢰가 접수되었습니다",
        `
          <p>관리자 확인이 필요한 신규 의뢰가 접수되었습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
            ["필요 언어", fieldFrom(payload, ["language", "language_pair"])],
            [
              "필요 인원",
              fieldFrom(payload, [
                "number_of_interpreters",
                "people_count",
                "requestedPeopleCount",
              ]),
            ],
          ])
        }
          ${linkButton("관리자 페이지 열기", appUrl("/admin/new"))}
        `,
      );
    case "new_interpreter":
    case "admin_new_company":
      return layout(
        event.event_type === "admin_new_company"
          ? "신규 기업이 등록되었습니다"
          : "신규 통역사가 등록되었습니다",
        `
          <p>${
          event.event_type === "admin_new_company"
            ? "신규 기업 등록 건"
            : "신규 통역사 등록 건"
        }을 검토해주세요.</p>
          ${
          infoTable([
            [
              "대상",
              fieldFrom(payload, ["company_name", "companyName", "name"]),
            ],
            ["담당자", fieldFrom(payload, ["contact_name", "contactName"])],
            [
              "언어/지역",
              fieldFrom(payload, [
                "language",
                "language_pair",
                "language_level",
                "region",
                "available_regions",
                "availableRegions",
              ]),
            ],
            [
              "상태",
              fieldFrom(payload, [
                "status",
                "resume_submitted",
                "resumeSubmitted",
              ]),
            ],
          ])
        }
          ${
          linkButton(
            event.event_type === "admin_new_company"
              ? "기업 관리 열기"
              : "통역사 검증 화면 열기",
            appUrl(
              event.event_type === "admin_new_company"
                ? "/admin/businesses"
                : "/admin/interpreters",
            ),
          )
        }
        `,
      );
    case "application_created":
      return layout(
        "신규 지원자가 발생했습니다",
        `
          <p>공고에 신규 지원자가 접수되었습니다.</p>
          ${
          infoTable([
            [
              "지원번호",
              fieldFrom(payload, [
                "application_code",
                "application_no",
                "application_id",
              ]),
            ],
            ["의뢰/공고번호", fieldFrom(payload, ["request_code", "job_id"])],
            [
              "통역사 이름",
              fieldFrom(payload, [
                "interpreter_name",
                "applicant_name",
                "name",
              ]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["일정", fieldFrom(payload, ["date", "work_date", "start_date"])],
          ])
        }
          ${linkButton("지원자 관리 열기", appUrl("/admin/applications"))}
        `,
      );
    case "assignment_created":
    case "interpreter_assignment_completed":
      return layout(
        "통역 일정이 배정되었습니다",
        `
          <p>${
          fieldFrom(payload, ["interpreter_name", "name"], "통역사")
        }님, 통역 일정이 배정되었습니다.</p>
          ${
          infoTable([
            [
              "배정번호",
              fieldFrom(payload, [
                "assignment_code",
                "matching_no",
                "assignment_id",
              ]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["일정", fieldFrom(payload, ["date", "work_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
            ["통역 언어", fieldFrom(payload, ["language", "language_pair"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "application_status_changed":
    case "interpreter_application_received":
      return layout(
        event.event_type === "interpreter_application_received"
          ? "지원이 접수되었습니다"
          : "지원 상태가 변경되었습니다",
        `
          <p>${
          event.event_type === "interpreter_application_received"
            ? "지원이 정상 접수되었습니다."
            : "지원하신 공고의 상태가 변경되었습니다."
        }</p>
          ${
          infoTable([
            [
              "지원번호",
              fieldFrom(payload, [
                "application_code",
                "application_no",
                "application_id",
              ]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["변경된 상태", field(payload, "status")],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "settlement_status_changed":
    case "interpreter_payout_completed":
    case "interpreter_settlement_confirmed":
    case "interpreter_payout_paid":
    case "interpreter_settlement_withheld": {
      const settlementTitle =
        event.event_type === "interpreter_settlement_confirmed"
          ? "정산 금액이 확정되었습니다"
          : event.event_type === "interpreter_payout_paid" ||
              event.event_type === "interpreter_payout_completed"
          ? "지급이 완료되었습니다"
          : event.event_type === "interpreter_settlement_withheld"
          ? "정산이 보류되었습니다"
          : "정산 상태가 변경되었습니다";
      return layout(
        settlementTitle,
        `
          <p>${
          event.event_type === "interpreter_settlement_confirmed"
            ? "배정 건의 지급 금액이 확정되었습니다."
            : event.event_type === "interpreter_payout_paid" ||
                event.event_type === "interpreter_payout_completed"
            ? "배정 건의 지급 처리가 완료되었습니다."
            : event.event_type === "interpreter_settlement_withheld"
            ? "배정 건의 정산 처리가 보류되었습니다."
            : "배정 건의 정산 상태가 변경되었습니다."
        }</p>
          ${
          infoTable([
            [
              "배정번호",
              fieldFrom(payload, [
                "assignment_code",
                "matching_no",
                "assignment_id",
              ]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            event.event_type === "interpreter_settlement_confirmed"
              ? [
                "정산 확정 금액",
                escapeHtml(
                  formatKrw(
                    payload.amount ?? payload.final_payment_amount ??
                      payload.finalAmount ?? payload.settlementAmount,
                  ),
                ),
              ]
              : ["정산 상태", field(payload, "status")],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
        settlementStatusLabel(
          payload.status || payload.after_status,
          settlementTitle,
        ),
      );
    }
    case "request_created_client":
    case "company_request_received":
      return layout(
        "통역 의뢰가 접수되었습니다",
        `
          <p>ON-LI 통역 의뢰가 정상 접수되었습니다. 담당자가 확인 후 연락드릴 예정입니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["접수 상태", fieldFrom(payload, ["status"], "접수 완료")],
          ])
        }
        `,
      );
    case "assignment_confirmed_client":
    case "company_assignment_completed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>요청하신 통역 의뢰의 배정이 완료되었습니다. 세부 사항은 ON-LI 담당자가 안내드립니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["배정 상태", fieldFrom(payload, ["status"], "배정 완료")],
          ])
        }
        `,
      );
    case "client_review_started":
      return layout(
        "통역 의뢰 검토가 시작되었습니다",
        `
          <p>고객님의 의뢰 내용을 담당자가 확인하여 검토를 시작했습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "검토중"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "client_estimate_ready":
    case "company_estimate_issued":
      return layout(
        "견적서가 발급되었습니다",
        `
          <p>요청하신 통역 의뢰의 견적이 확인되었습니다. 마이페이지에서 견적 세부 내역을 확인해 주세요.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "견적 안내"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "company_estimate_approved":
      return layout(
        "견적 승인이 완료되었습니다",
        `
          <p>견적 승인 처리가 완료되었습니다. ON-LI 운영팀이 다음 절차를 진행합니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "admin_estimate_approved":
      return layout(
        "견적 승인 완료 알림",
        `
          <p>기업이 견적을 승인했습니다. 배정 절차를 확인해주세요.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])
        }
          ${linkButton("의뢰 관리 열기", appUrl("/admin/requests"))}
        `,
      );
    case "company_completion_document_issued":
      return layout(
        "업무확인서가 발급되었습니다",
        `
          <p>완료된 통역 업무의 업무확인서가 발급되었습니다. 마이페이지에서 확인해주세요.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "interpreter_payout_issued":
      return layout(
        "정산서가 발급되었습니다",
        `
          <p>정산서가 발급되었습니다. 마이페이지에서 내용을 확인해주세요.</p>
          ${
          infoTable([
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `,
      );
    case "client_recruiting_started":
      return layout(
        "통역사 모집이 시작되었습니다",
        `
          <p>고객님의 의뢰 일정에 적합한 최적의 통역사 모집을 시작했습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "통역사 모집중"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "client_work_completed":
      return layout(
        "통역 업무가 완료되었습니다",
        `
          <p>배정된 통역사의 현장 업무 수행이 성공적으로 완료되었습니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "업무 완료"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "client_settlement_ready":
      return layout(
        "정산/결제 요청 안내",
        `
          <p>완료된 통역 업무의 정산/결제 정보가 준비되었습니다. 마이페이지에서 정산 세부 내용을 확인 및 정산 진행해 주시기 바랍니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "정산/결제 안내 필요"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    case "client_work_preparing":
      return layout(
        "통역 업무 준비 시작",
        `
          <p>통역사 배정이 완료되어 업무 준비가 시작되었습니다. 기업 마이페이지에서 행사 자료를 업로드하시면 배정된 통역사에게 전달됩니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["현재 상태", "업무 준비중"],
          ])
        }
          ${linkButton("자료 업로드하기", appUrl("/business/mypage"))}
        `,
      );
    case "client_work_ready":
      return layout(
        "통역 업무 진행 예정 안내",
        `
          <p>통역 업무 준비가 완료되어 진행 예정 상태로 변경되었습니다. 행사 당일 원활한 진행을 위해 담당 통역사와의 최종 확인을 부탁드립니다.</p>
          ${
          infoTable([
            [
              "의뢰번호",
              fieldFrom(payload, ["request_code", "request_no", "request_id"]),
            ],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["현재 상태", "진행 예정"],
          ])
        }
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `,
      );
    default:
      return layout(
        event.title || "ON-LI 알림",
        `
          <p>${
          escapeHtml(event.message || "ON-LI 운영 알림이 도착했습니다.")
        }</p>
          ${
          infoTable([
            ["이벤트", escapeHtml(event.event_type)],
            [
              "대상",
              `${escapeHtml(event.target_type)} #${
                escapeHtml(event.target_id)
              }`,
            ],
            ["상태", fieldFrom(payload, ["status", "after_status"])],
          ])
        }
          ${
          event.recipient_type === "admin"
            ? linkButton("관리자 페이지 열기", appUrl("/admin/internal"))
            : ""
        }
        `,
      );
  }
}

function pickPublicPayload(
  row: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  const result: Payload = {};
  if (!row) return result;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

async function enrichNotificationPayload(
  supabase: SupabaseClient,
  event: NotificationEvent,
) {
  const payload: Payload = { ...(event.payload || {}) };

  try {
    if (event.target_type === "request" || event.event_type === "new_request") {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(
        payload,
        pickPublicPayload(data, [
          "request_no",
          "company_name",
          "event_name",
          "event_date",
          "start_date",
          "end_date",
          "event_location",
          "location",
          "language",
          "people_count",
          "requested_people_count",
          "status",
          "settlement_status",
        ]),
      );

      const requestId = data?.id || event.target_id;
      if (requestId) {
        const { data: assignment } = await supabase
          .from("request_interpreters")
          .select("interpreter_id,matching_no,assigned_at")
          .eq("request_id", requestId)
          .order("assigned_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        Object.assign(
          payload,
          pickPublicPayload(assignment, [
            "interpreter_id",
            "matching_no",
            "assigned_at",
          ]),
        );
        if (assignment?.interpreter_id) {
          const { data: interpreter } = await supabase
            .from("interpreters")
            .select("name")
            .eq("id", assignment.interpreter_id)
            .maybeSingle();
          if (interpreter?.name) payload.interpreter_name = interpreter.name;
        }
      }
    }

    if (
      event.target_type === "interpreter" ||
      event.event_type === "new_interpreter"
    ) {
      const { data } = await supabase
        .from("interpreters")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(
        payload,
        pickPublicPayload(data, [
          "name",
          "email",
          "region",
          "level",
          "language_level",
          "available_regions",
          "resume_url",
          "resume_file_url",
          "status",
        ]),
      );
      payload.resume_submitted =
        Boolean(payload.resume_url || payload.resume_file_url)
          ? "제출"
          : "미제출";
    }

    if (
      event.target_type === "application" ||
      event.event_type.includes("application")
    ) {
      const { data: application } = await supabase
        .from("job_applications")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(
        payload,
        pickPublicPayload(application, [
          "application_no",
          "applicant_name",
          "name",
          "email",
          "status",
          "job_id",
        ]),
      );

      const jobId = application?.job_id || payload.job_id;
      if (jobId) {
        const { data: job } = await supabase
          .from("jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();
        Object.assign(
          payload,
          pickPublicPayload(job, [
            "title",
            "event_name",
            "date",
            "start_date",
            "end_date",
            "location",
            "language",
          ]),
        );
      }
    }

    if (
      event.target_type === "assignment" ||
      event.event_type === "assignment_created"
    ) {
      const { data: assignment } = await supabase
        .from("request_interpreters")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(
        payload,
        pickPublicPayload(assignment, [
          "matching_no",
          "request_id",
          "interpreter_id",
          "assigned_at",
        ]),
      );

      if (assignment?.request_id || payload.request_id) {
        const { data: request } = await supabase
          .from("requests")
          .select("*")
          .eq("id", assignment?.request_id || payload.request_id)
          .maybeSingle();
        Object.assign(
          payload,
          pickPublicPayload(request, [
            "request_no",
            "company_name",
            "event_name",
            "event_date",
            "start_date",
            "end_date",
            "event_location",
            "location",
            "language",
            "status",
            "settlement_status",
          ]),
        );
      }

      if (assignment?.interpreter_id || payload.interpreter_id) {
        const { data: interpreter } = await supabase
          .from("interpreters")
          .select("name,email")
          .eq("id", assignment?.interpreter_id || payload.interpreter_id)
          .maybeSingle();
        if (!event.recipient_email && interpreter?.email) {
          payload.recipient_email = interpreter.email;
        }
        if (interpreter?.name) payload.interpreter_name = interpreter.name;
      }
    }

    if (
      event.target_type === "settlement" ||
      event.event_type.includes("settlement") ||
      event.event_type.includes("payout")
    ) {
      const { data: settlement } = await supabase
        .from("settlements")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(
        payload,
        pickPublicPayload(settlement, [
          "amount",
          "request_id",
          "interpreter_id",
          "interpreter_auth_user_id",
          "settlement_status",
          "payout_status",
        ]),
      );

      if (settlement?.request_id || payload.request_id) {
        const { data: request } = await supabase
          .from("requests")
          .select("*")
          .eq("id", settlement?.request_id || payload.request_id)
          .maybeSingle();
        Object.assign(
          payload,
          pickPublicPayload(request, [
            "request_no",
            "company_name",
            "event_name",
            "start_date",
            "end_date",
            "event_location",
            "location",
            "language",
          ]),
        );
      }
    }
  } catch (error) {
    console.error("NOTIFICATION_PAYLOAD_ENRICH_FAILED", event.id, error);
  }

  return payload;
}

function createGmailTransporter(gmailUser: string, gmailAppPassword: string) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser.trim(),
      pass: gmailAppPassword.replace(/\s+/g, ""),
    },
  });
}

async function assertAdminCaller(
  request: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
) {
  const authHeader = request.headers.get("Authorization") || "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !user?.email) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  const { data: adminUser, error: adminError } = await adminClient
    .from("admin_users")
    .select("id, role, status")
    .or(`auth_user_id.eq.${user.id},email.ilike.${user.email}`)
    .eq("status", "active")
    .single();

  if (
    adminError || !adminUser ||
    !["owner", "admin", "staff"].includes(adminUser.role)
  ) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user, adminUser };
}

async function updateNotificationStatus(
  supabase: SupabaseClient,
  id: string,
  changes: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("notification_events")
    .update({
      ...changes,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("NOTIFICATION_STATUS_UPDATE_FAILED", id, error);
  }
}

async function processNotificationEvents({
  request,
  limit,
  eventIds,
  retryFailed,
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  gmailUser,
  gmailAppPassword,
}: {
  request: Request;
  limit: number;
  eventIds: string[];
  retryFailed: boolean;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  gmailUser: string;
  gmailAppPassword: string;
}) {
  const adminCheck = await assertAdminCaller(
    request,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  );
  if (!adminCheck.ok) {
    return jsonResponse(
      { ok: false, error: adminCheck.error },
      adminCheck.status,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  const emailFrom = Deno.env.get("EMAIL_FROM") ||
    `"ON-LI" <${gmailUser.trim()}>`;
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ||
    gmailUser.trim();
  const selectableStatuses = retryFailed ? ["pending", "failed"] : ["pending"];

  let query = supabase
    .from("notification_events")
    .select(
      "id,event_type,target_type,target_id,recipient_type,recipient_email,payload,status,retry_count,created_at,channel,title,message",
    );

  if (eventIds.length > 0) {
    query = query.in("id", eventIds);
  } else {
    query = query.in("status", selectableStatuses);
  }

  query = query
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit || 10, 50)));

  const { data: events, error } = await query;
  if (error) {
    return jsonResponse({
      ok: false,
      error: "database_error",
      message: error.message,
    }, 500);
  }

  const results = [];

  for (const event of (events || []) as NotificationEvent[]) {
    let updateQuery = supabase
      .from("notification_events")
      .update({
        retry_count: Number(event.retry_count || 0) + 1,
        error_message: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    if (eventIds.length === 0) {
      updateQuery = updateQuery.in("status", selectableStatuses);
    }

    const { data: lockedEvent, error: lockError } = await updateQuery
      .select(
        "id,event_type,target_type,target_id,recipient_type,recipient_email,payload,status,retry_count,channel,title,message",
      )
      .single();

    if (lockError || !lockedEvent) {
      results.push({
        id: event.id,
        ok: false,
        skipped: true,
        error: lockError?.message || "Event is already being processed.",
      });
      continue;
    }

    const currentEvent = lockedEvent as NotificationEvent;
    const currentChannel =
      String(currentEvent.channel || "email").trim().toLowerCase() || "email";
    if (currentChannel === "internal") {
      await updateNotificationStatus(supabase, currentEvent.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      });
      results.push({
        id: currentEvent.id,
        ok: true,
        channel: currentChannel,
        internal: true,
      });
      continue;
    }

    if (currentChannel !== "email") {
      await updateNotificationStatus(supabase, currentEvent.id, {
        status: "failed",
        error_message:
          `${currentChannel} channel is queued but not implemented yet.`,
      });
      results.push({
        id: currentEvent.id,
        ok: false,
        error: `${currentChannel} channel is not implemented.`,
      });
      continue;
    }

    const payload = await enrichNotificationPayload(supabase, currentEvent);
    const recipientEmail =
      String(currentEvent.recipient_email || payload.recipient_email || "")
        .trim() ||
      (currentEvent.recipient_type === "admin" ? adminEmail : "");

    if (!recipientEmail || !recipientEmail.includes("@")) {
      await updateNotificationStatus(supabase, currentEvent.id, {
        status: "failed",
        error_message: "Recipient email is empty.",
      });
      results.push({
        id: currentEvent.id,
        ok: false,
        error: "Recipient email is empty.",
      });
      continue;
    }

    try {
      const subject = normalizeSubject(
        notificationSubject(currentEvent.event_type),
      );
      const html = buildNotificationHtml(currentEvent, payload);
      const sendResult = await transporter.sendMail({
        from: emailFrom,
        to: recipientEmail,
        subject,
        html,
      });
      const provider = assertMailProviderMessageId(sendResult, recipientEmail);

      await updateNotificationStatus(supabase, currentEvent.id, {
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      });
      results.push({
        id: currentEvent.id,
        ok: true,
        recipient: recipientEmail,
        messageId: provider.messageId,
        accepted: provider.accepted,
        response: provider.response,
      });
    } catch (sendError) {
      const message = sendError instanceof Error
        ? sendError.message
        : String(sendError);
      await updateNotificationStatus(supabase, currentEvent.id, {
        status: "failed",
        error_message: message,
      });
      results.push({
        id: currentEvent.id,
        ok: false,
        recipient: recipientEmail,
        error: message,
      });
    }
  }

  return jsonResponse({
    ok: true,
    processedCount: results.length,
    sentCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) =>
      !result.ok && !result.skipped
    ).length,
    skippedCount: results.filter((result) => result.skipped).length,
    results,
  });
}

async function processNotifications({
  request,
  notificationIds,
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  gmailUser,
  gmailAppPassword,
}: {
  request: Request;
  notificationIds: string[];
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  gmailUser?: string | null;
  gmailAppPassword?: string | null;
}) {
  const adminCheck = await assertAdminCaller(
    request,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  );
  if (!adminCheck.ok) {
    return jsonResponse(
      { ok: false, error: adminCheck.error },
      adminCheck.status,
    );
  }

  if (notificationIds.length === 0) {
    return jsonResponse(
      { ok: false, error: "No notification ids provided." },
      400,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hasEmailSecrets = Boolean(gmailUser && gmailAppPassword);
  const transporter = hasEmailSecrets
    ? createGmailTransporter(gmailUser!, gmailAppPassword!)
    : null;
  const emailFrom = gmailUser
    ? Deno.env.get("EMAIL_FROM") || `"ON-LI" <${gmailUser.trim()}>`
    : Deno.env.get("EMAIL_FROM") || "ON-LI";

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select(
      "id,recipient_type,recipient_id,recipient_email,notification_type,title,message,channel,status,error_message",
    )
    .in("id", notificationIds);

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const results = [];

  for (const notification of (notifications || []) as NotificationRow[]) {
    const channel =
      String(notification.channel || "email").trim().toLowerCase() || "email";
    if (channel === "internal") {
      await supabase
        .from("notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", notification.id);
      results.push({ id: notification.id, ok: true, channel });
      continue;
    }

    if (channel !== "email") {
      const errorMessage =
        `${channel} channel is queued but not implemented yet.`;
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          error_message: errorMessage,
          sent_at: null,
        })
        .eq("id", notification.id);
      results.push({ id: notification.id, ok: false, error: errorMessage });
      continue;
    }

    if (!transporter) {
      const errorMessage = "Missing required email secrets";
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          sent_at: null,
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq("id", notification.id);
      results.push({
        id: notification.id,
        ok: false,
        error: errorMessage,
      });
      continue;
    }

    const recipientEmail = String(notification.recipient_email || "").trim();
    if (!recipientEmail || !recipientEmail.includes("@")) {
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          error_message: "recipient_email is missing",
          sent_at: null,
        })
        .eq("id", notification.id);
      results.push({
        id: notification.id,
        ok: false,
        error: "recipient_email is missing",
      });
      continue;
    }

    try {
      const subject = normalizeSubject(
        notification.title ||
          notificationSubject(notification.notification_type),
      );
      const html = layout(
        notification.title || "ON-LI 알림",
        `
          <p>${
          escapeHtml(notification.message || "ON-LI 운영 알림이 도착했습니다.")
        }</p>
          ${
          infoTable([
            ["알림 종류", escapeHtml(notification.notification_type)],
            ["대상", escapeHtml(notification.recipient_type)],
          ])
        }
        `,
      );

      const sendResult: any = await transporter.sendMail({
        from: emailFrom,
        to: recipientEmail,
        subject,
        html,
      });

      console.log("SMTP RESULT", JSON.stringify(sendResult, null, 2));

      const accepted = Array.isArray(sendResult.accepted)
        ? sendResult.accepted
        : [];
      const rejected = Array.isArray(sendResult.rejected)
        ? sendResult.rejected
        : [];
      const response = sendResult.response || "";
      const messageId = sendResult.messageId || "";

      console.log("accepted:", accepted);
      console.log("rejected:", rejected);
      console.log("response:", response);
      console.log("messageId:", messageId);

      if (accepted.length > 0) {
        await supabase
          .from("notifications")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
            provider_message_id: messageId || null,
          })
          .eq("id", notification.id);

        results.push({
          id: notification.id,
          ok: true,
          recipient: recipientEmail,
          messageId,
          smtp: {
            accepted,
            rejected,
            response,
            messageId: messageId || null,
          },
        });
      } else {
        const failureReason = JSON.stringify({
          accepted,
          rejected,
          response,
          messageId,
        });

        await supabase
          .from("notifications")
          .update({
            status: "failed",
            sent_at: null,
            error_message: failureReason,
            provider_message_id: null,
          })
          .eq("id", notification.id);

        results.push({
          id: notification.id,
          ok: false,
          recipient: recipientEmail,
          error: "smtp_send_failed",
          message: "SMTP 서버가 수신자를 accepted 처리하지 않았습니다.",
          smtp: {
            accepted,
            rejected,
            response: response || null,
            messageId: messageId || null,
          },
        });
      }
    } catch (sendError) {
      const message = sendError instanceof Error
        ? sendError.message
        : String(sendError);
      console.error("[NOTIFICATION_EMAIL_FAILED]", {
        notificationId: notification.id,
        recipientEmail,
        error: message,
      });
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          sent_at: null,
          error_message: message,
          provider_message_id: null,
        })
        .eq("id", notification.id);
      results.push({
        id: notification.id,
        ok: false,
        recipient: recipientEmail,
        error: "smtp_error",
        message: message,
        smtp: {
          accepted: [],
          rejected: [],
          response: null,
          messageId: null,
        },
      });
    }
  }

  const sentResults = results.filter((result) => result.ok);
  const failedResults = results.filter((result) => !result.ok);

  return jsonResponse({
    ok: true,
    success: results.length > 0 && failedResults.length === 0,
    messageId: sentResults.length === 1
      ? sentResults[0].messageId || null
      : null,
    processedCount: results.length,
    sentCount: sentResults.length,
    failedCount: failedResults.length,
    results,
  });
}

async function sendTestEmail({
  request,
  to,
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  gmailUser,
  gmailAppPassword,
}: {
  request: Request;
  to: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  gmailUser: string;
  gmailAppPassword: string;
}) {
  const adminCheck = await assertAdminCaller(
    request,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  );
  if (!adminCheck.ok) {
    return jsonResponse(
      { success: false, error: adminCheck.error },
      adminCheck.status,
    );
  }

  const recipientEmail = String(to || "").trim();
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return jsonResponse(
      { success: false, error: "recipient_email is missing" },
      400,
    );
  }

  const transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  const emailFrom = Deno.env.get("EMAIL_FROM") ||
    `"ON-LI" <${gmailUser.trim()}>`;

  try {
    const sendResult = await transporter.sendMail({
      from: emailFrom,
      to: recipientEmail,
      subject: "[ON-LI] 이메일 발송 테스트",
      html: layout(
        "[ON-LI] 이메일 발송 테스트",
        `
          <p>ON-LI send-email Edge Function에서 발송한 테스트 메일입니다.</p>
          ${
          infoTable([
            ["수신자", escapeHtml(recipientEmail)],
            ["발송 시각", escapeHtml(new Date().toISOString())],
          ])
        }
        `,
      ),
    });
    const provider = assertMailProviderMessageId(sendResult, recipientEmail);
    console.log("[TEST_EMAIL_SENT]", {
      recipientEmail,
      messageId: provider.messageId,
      accepted: provider.accepted,
      response: provider.response,
    });
    return jsonResponse({
      success: true,
      messageId: provider.messageId,
      accepted: provider.accepted,
      response: provider.response,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TEST_EMAIL_FAILED]", {
      recipientEmail,
      error: message,
    });
    return jsonResponse({ success: false, error: message }, 500);
  }
}

Deno.serve(async (request: Request) => {
  console.log("FUNCTION START");

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    const type = isEmailType(body?.type) ? body.type : undefined;
    let to = typeof body?.to === "string"
      ? body.to.trim()
      : Array.isArray(body?.to)
      ? body.to
        .filter((recipient: unknown) => typeof recipient === "string")
        .map((recipient: unknown) => String(recipient).trim())
        .filter(Boolean)
      : "";
    const payload = body?.payload && typeof body.payload === "object"
      ? (body.payload as Payload)
      : {};
    const emailProvider = (Deno.env.get("EMAIL_PROVIDER") || "gmail")
      .toLowerCase();
    const gmailUser = Deno.env.get("GMAIL_USER") || Deno.env.get("EMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD") ||
      Deno.env.get("EMAIL_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    console.log("[send-email] request received", {
      notificationId: body?.notification_id || body?.notificationId || null,
    });

    if (!["gmail", "smtp"].includes(emailProvider)) {
      return jsonResponse({
        ok: false,
        error: `Unsupported EMAIL_PROVIDER: ${emailProvider}`,
      }, 500);
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "SEND EMAIL FUNCTION ERROR",
        "Missing required Supabase secrets",
      );
      return jsonResponse({
        ok: false,
        error: "Missing required Supabase secrets",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
        },
      }, 500);
    }

    const notification_id = String(
      body?.notification_id || body?.notificationId || "",
    );
    const force_resend = body?.force_resend === true;
    if (!notification_id) {
      return jsonResponse({
        success: false,
        error: "missing_notification_id",
        message: "notification_id가 없습니다.",
      }, 400);
    }

    return await sendSingleNotification({
      request,
      notification_id,
      force_resend,
      supabaseUrl,
      serviceRoleKey,
      anonKey,
      gmailUser,
      gmailAppPassword,
    });
  } catch (error) {
    console.error("FUNCTION ERROR", error);
    console.error("SEND EMAIL FUNCTION ERROR", error);
    return jsonResponse(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

async function sendSingleNotification({
  request,
  notification_id,
  force_resend,
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  gmailUser,
  gmailAppPassword,
}: {
  request: Request;
  notification_id: string;
  force_resend: boolean;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  gmailUser?: string;
  gmailAppPassword?: string;
}) {
  const adminCheck = await assertAdminCaller(
    request,
    supabaseUrl,
    anonKey,
    serviceRoleKey,
  );
  if (!adminCheck.ok) {
    return jsonResponse(
      { success: false, error: adminCheck.error },
      adminCheck.status,
    );
  }
  console.log("[send-email] admin authenticated", {
    notificationId: notification_id,
  });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: notification, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", notification_id)
    .single();

  if (error || !notification) {
    return jsonResponse({
      ok: false,
      code: "NOTIFICATION_NOT_FOUND",
      message: "알림을 찾을 수 없습니다.",
      notification_id,
    }, 404);
  }
  console.log("[send-email] notification loaded", {
    notificationId: notification_id,
    status: notification.status,
  });

  if (
    (notification.status === "sent" || notification.sent_at) && !force_resend
  ) {
    return jsonResponse({
      ok: true,
      success: true,
      already_sent: true,
      status: "sent",
      message: "이미 발송 완료된 알림입니다.",
      notification_id,
    }, 200);
  }
  if (notification.status === "sending") {
    const lastAttempt = notification.last_attempt_at
      ? new Date(notification.last_attempt_at).getTime()
      : 0;
    if (Date.now() - lastAttempt < 5 * 60 * 1000) {
      return jsonResponse({
        ok: true,
        success: true,
        already_processing: true,
        status: "sending",
        message: "이미 발송 처리 중입니다.",
        notification_id,
      }, 200);
    }
  }
  if (!gmailUser || !gmailAppPassword) {
    await supabase.from("notifications").update({
      status: "failed",
      sent_at: null,
      error_message: "이메일 서버 인증 설정 누락",
    }).eq("id", notification_id);
    return jsonResponse({
      ok: false,
      code: "SMTP_AUTH_FAILED",
      message: "이메일 발송 설정을 확인할 수 없습니다.",
      notification_id,
    }, 500);
  }

  const to = String(notification.recipient_email || "").trim();
  const channel = String(notification.channel || "").trim().toLowerCase();
  if (channel !== "email") {
    return jsonResponse({
      ok: false,
      code: "INVALID_CHANNEL",
      message: "email 채널 알림만 메일 발송할 수 있습니다.",
      notification_id,
    }, 400);
  }

  if (!to || !to.includes("@")) {
    return jsonResponse({
      ok: false,
      code: "INVALID_RECIPIENT",
      message: "수신자 이메일 주소가 올바르지 않습니다.",
      notification_id,
    }, 400);
  }

  const { data: lockedNotification, error: lockError } = await supabase
    .from("notifications")
    .update({
      status: "sending",
      error_message: null,
      failed_at: null,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attempt_count: Number(notification.attempt_count || 0) + 1,
    })
    .eq("id", notification_id)
    .eq("status", notification.status)
    .select("id")
    .maybeSingle();
  if (lockError) {
    console.error("[send-email] failed", {
      notificationId: notification_id,
      errorCode: lockError.code,
      errorMessage: lockError.message,
    });
    return jsonResponse({
      ok: false,
      code: "DATABASE_UPDATE_FAILED",
      message: "발송 상태를 갱신하지 못했습니다.",
      notification_id,
    }, 500);
  }
  if (!lockedNotification) {
    return jsonResponse({
      ok: true,
      success: true,
      already_processing: true,
      status: "sending",
      message: "이미 발송 처리 중입니다.",
      notification_id,
    }, 200);
  }

  const type = notification.type ||
    notification.notification_type ||
    notification.event_type ||
    "general";

  const reasonMap: Record<string, string> = {
    status_changed: "의뢰 상태 변경 안내",
    assignment_completed: "배정 완료 안내",
    settlement_ready: "정산 대기 안내",
    interpreter_settlement_confirmed: "정산 확정 안내",
    client_recruiting_started: "통역사 모집 시작 안내",
    job_updated: "의뢰 수정 안내",
  };
  const reason = reasonMap[type] || "운영 안내";

  const metadata = notification.metadata || {};
  let realRequestNo = metadata.request_no || "";
  let realJobTitle = metadata.job_title || metadata.event_name || "";
  let relatedRequest: Record<string, unknown> | null = null;

  if (metadata.job_id) {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("request_no, code, title, event_name")
      .eq("id", metadata.job_id)
      .single();
    if (jobData) {
      if (!realRequestNo) {
        realRequestNo = jobData.request_no || jobData.code || "";
      }
      if (!realJobTitle) {
        realJobTitle = jobData.title || jobData.event_name || "";
      }
    }
  }

  if (notification.related_request_id) {
    const { data: requestData } = await supabase
      .from("requests")
      .select("*")
      .eq("id", notification.related_request_id)
      .single();
    if (requestData) {
      relatedRequest = requestData;
      if (!realRequestNo) {
        realRequestNo = requestData.request_no || requestData.code || "";
      }
      if (!realJobTitle) {
        realJobTitle = requestData.title || requestData.event_name || "";
      }
    }
  }

  if (!realJobTitle && notification.title && !reasonMap[notification.title]) {
    realJobTitle = notification.title;
  }

  const relatedNo = realRequestNo;
  const jobTitle = realJobTitle;
  const previousStatus = metadata.previous_status || "";
  const nextStatus = metadata.next_status || metadata.status || "";
  const recipientType = String(notification.recipient_type || "admin").trim()
    .toLowerCase();
  const isSettlementConfirmedEmail =
    type === "interpreter_settlement_confirmed" ||
    (recipientType === "interpreter" &&
      String(notification.title || "").includes("정산") &&
      settlementStatusLabel(nextStatus, String(notification.title || "")) ===
        "정산 확정");

  let confirmedSettlementAmount: unknown;
  if (isSettlementConfirmedEmail && notification.related_request_id) {
    let settlementQuery = supabase
      .from("settlements")
      .select("amount,updated_at")
      .eq("request_id", notification.related_request_id);
    if (notification.recipient_id) {
      settlementQuery = settlementQuery.eq(
        "interpreter_auth_user_id",
        notification.recipient_id,
      );
    }
    const { data: settlementData, error: settlementError } =
      await settlementQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (settlementError) {
      console.error("[send-email] settlement amount lookup failed", {
        notificationId: notification_id,
        errorCode: settlementError.code,
        errorMessage: settlementError.message,
      });
    } else {
      confirmedSettlementAmount = settlementData?.amount;
    }
  }
  if (
    confirmedSettlementAmount === undefined ||
    confirmedSettlementAmount === null
  ) {
    confirmedSettlementAmount = metadata.final_payment_amount ??
      metadata.finalAmount ?? metadata.settlementAmount;
  }

  let statusText = nextStatus || "-";
  if (previousStatus && nextStatus) {
    statusText = `${previousStatus} → ${nextStatus}`;
  } else if (!nextStatus && previousStatus) {
    statusText = previousStatus;
  }

  const applicationTemplateType: EmailType | null =
    type === "job_applied_user" || type === "job_applied_admin" ? type : null;
  const subject = normalizeSubject(
    applicationTemplateType
      ? subjects[applicationTemplateType]
      : `${reason}${relatedNo ? ` - ${relatedNo}` : ""}`,
  );

  const originalMessage = String(notification.message || "");
  const fallbackMessage = "상세 내용은 ON-LI 사이트에서 확인해 주세요.";
  const displayMessage = originalMessage === "1" || !originalMessage.trim()
    ? fallbackMessage
    : originalMessage;

  const requestStartDate = relatedRequest?.start_date ||
    relatedRequest?.event_date || metadata.start_date || metadata.event_date;
  const requestEndDate = relatedRequest?.end_date || metadata.end_date;
  const eventPeriod = requestStartDate && requestEndDate
    ? `${requestStartDate} ~ ${requestEndDate}`
    : requestStartDate || requestEndDate || "";
  const requestInfo: Array<[string, string]> = [
    ["행사명", escapeHtml(jobTitle && jobTitle !== "1" ? jobTitle : "")],
    ["의뢰번호", escapeHtml(relatedNo)],
    [
      "기업명",
      escapeHtml(relatedRequest?.company_name || metadata.company_name || ""),
    ],
    [
      "통역사",
      escapeHtml(metadata.interpreter_name || metadata.recipient_name || ""),
    ],
    ["행사기간", escapeHtml(eventPeriod)],
    [
      "장소",
      escapeHtml(
        relatedRequest?.location || relatedRequest?.event_location ||
          metadata.location || "",
      ),
    ],
    [
      "언어",
      escapeHtml(
        relatedRequest?.language || relatedRequest?.language_direction ||
          metadata.language || "",
      ),
    ],
    isSettlementConfirmedEmail
      ? ["정산 확정 금액", escapeHtml(formatKrw(confirmedSettlementAmount))]
      : [
        "현재 상태",
        escapeHtml(statusText && statusText !== "-" ? statusText : reason),
      ],
  ];

  const buttonText = recipientType === "admin"
    ? "관리자 페이지 열기"
    : recipientType === "interpreter"
    ? "마이페이지에서 확인하기"
    : "의뢰 확인하기";
  const buttonUrl = recipientType === "admin"
    ? appUrl("/admin/internal")
    : recipientType === "interpreter"
    ? appUrl("/interpreter-mypage")
    : appUrl("/business/mypage");
  const templateTitle = reason === "운영 안내" ? "운영 안내" : reason;
  const templateStatus = type === "general" || templateTitle === "운영 안내"
    ? "운영 알림"
    : templateTitle.includes("정산")
    ? settlementStatusLabel(nextStatus, templateTitle)
    : inferredStatus(templateTitle);

  const html = applicationTemplateType
    ? buildHtml(applicationTemplateType, metadata)
    : createEmailTemplate({
      title: templateTitle,
      status: templateStatus,
      message: `<p style="margin:0; white-space:pre-wrap;">${
        escapeHtml(displayMessage)
      }</p>`,
      requestInfo,
      buttonText,
      buttonUrl,
    });

  console.log("[send-email] send attempt started", {
    notificationId: notification_id,
  });

  let transporter;
  try {
    transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  } catch (e) {
    await supabase.from("notifications").update({
      status: "failed",
      error_message: "SMTP 설정 오류",
    }).eq("id", notification_id);
    return jsonResponse({
      ok: false,
      code: "SMTP_AUTH_FAILED",
      message: "이메일 발송 설정을 확인해 주세요.",
      notification_id,
    }, 500);
  }

  try {
    const result: any = await transporter.sendMail({
      from: `"ON-LI" <${gmailUser}>`,
      to,
      subject,
      html,
    });

    const accepted = Array.isArray(result.accepted) ? result.accepted : [];
    const rejected = Array.isArray(result.rejected) ? result.rejected : [];
    const response = result.response ?? null;
    const messageId = result.messageId ?? null;
    console.log("[send-email] provider response received", {
      notificationId: notification_id,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      hasMessageId: Boolean(messageId),
    });

    if (accepted.length === 0) {
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          sent_at: null,
          error_message: JSON.stringify({
            error: "smtp_no_accepted_recipients",
            accepted,
            rejected,
            response,
            messageId,
          }),
        })
        .eq("id", notification_id);
      return new Response(
        JSON.stringify({
          ok: false,
          code: "PROVIDER_REJECTED",
          message: "SMTP accepted 수신자가 없습니다.",
          smtp: {
            accepted,
            rejected,
            response: result?.response ?? null,
            messageId: result?.messageId ?? null,
          },
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const { error: sentUpdateError } = await supabase
      .from("notifications")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
        provider_message_id: messageId,
        failed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", notification_id);
    if (sentUpdateError) {
      console.error("[send-email] failed", {
        notificationId: notification_id,
        errorCode: sentUpdateError.code,
        errorMessage: sentUpdateError.message,
      });
      return jsonResponse({
        ok: false,
        code: "DATABASE_UPDATE_FAILED",
        message: "이메일은 발송됐지만 상태 반영에 실패했습니다.",
        notification_id,
        provider_message_id: messageId,
      }, 500);
    }
    console.log("[send-email] database status updated", {
      notificationId: notification_id,
      status: "sent",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        success: true,
        status: "sent",
        notification_id,
        message: "이메일 발송 완료",
        sent_at: new Date().toISOString(),
        smtp: {
          accepted,
          rejected,
          response: result?.response ?? null,
          messageId: result?.messageId ?? null,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (sendError) {
    const message = sendError instanceof Error
      ? sendError.message
      : String(sendError);
    await supabase
      .from("notifications")
      .update({
        status: "failed",
        sent_at: null,
        error_message: message,
        failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", notification_id);
    console.error("[send-email] failed", {
      notificationId: notification_id,
      errorCode: (sendError as any)?.code,
      errorMessage: message,
      providerStatus: (sendError as any)?.response?.status,
    });
    return jsonResponse({
      ok: false,
      code: "PROVIDER_REJECTED",
      message: "이메일 제공자가 발송을 거부했습니다.",
      notification_id,
      smtp: {
        accepted: [],
        rejected: [],
        response: null,
        messageId: null,
      },
    }, 502);
  }
}
