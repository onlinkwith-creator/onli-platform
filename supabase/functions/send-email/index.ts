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
  designated_request_received_interpreter: "[ON-LI] 지정 통역 의뢰가 도착했습니다",
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
    messageId: typeof value.messageId === "string" ? value.messageId : undefined,
    accepted: Array.isArray(value.accepted)
      ? value.accepted.filter((item): item is string => typeof item === "string")
      : undefined,
    rejected: Array.isArray(value.rejected)
      ? value.rejected.filter((item): item is string => typeof item === "string")
      : undefined,
    response: typeof value.response === "string" ? value.response : undefined,
  };
}

function assertMailProviderMessageId(result: unknown, recipientEmail: string) {
  const provider = getMailProviderResult(result);
  const recipient = recipientEmail.trim().toLowerCase();
  const rejected = (provider.rejected || []).map((item) => item.trim().toLowerCase());
  const accepted = (provider.accepted || []).map((item) => item.trim().toLowerCase());

  if (rejected.length > 0 || rejected.includes(recipient)) {
    throw new Error(`Email provider rejected recipient: ${recipientEmail}`);
  }

  if (accepted.length === 0 || !accepted.includes(recipient)) {
    throw new Error(`SMTP server did not accept the recipient: ${recipientEmail}`);
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
  const value =
    payload.requestId ||
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

function layout(title: string, body: string) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f6f7f9; padding:24px;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
        <div style="padding:20px 24px; border-bottom:1px solid #e5e7eb;">
          <strong style="font-size:18px; color:#111827;">ON-LI</strong>
        </div>
        <div style="padding:24px;">
          <h1 style="font-size:20px; line-height:1.4; color:#111827; margin:0 0 16px;">${escapeHtml(title)}</h1>
          <div style="font-size:14px; line-height:1.8; color:#374151;">${body}</div>
        </div>
        <div style="padding:16px 24px; background:#f9fafb; color:#6b7280; font-size:12px;">
          본 메일은 ON-LI 플랫폼에서 자동 발송되었습니다.
        </div>
      </div>
    </div>
  `;
}

function infoTable(rows: Array<[string, string]>) {
  return `
    <table style="width:100%; border-collapse:collapse; margin-top:16px;">
      <tbody>
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <th style="width:34%; text-align:left; vertical-align:top; padding:10px 12px; background:#f9fafb; border:1px solid #e5e7eb; color:#4b5563; font-weight:600;">${escapeHtml(label)}</th>
                <td style="padding:10px 12px; border:1px solid #e5e7eb; color:#111827;">${value}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function appUrl(path = "/") {
  const baseUrl =
    Deno.env.get("APP_URL") ||
    Deno.env.get("PUBLIC_APP_URL") ||
    "https://onli-platform.vercel.app";
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function linkButton(label: string, href: string) {
  return `
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(href)}" style="display:inline-block; padding:12px 18px; background:#4f46e5; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:700;">${escapeHtml(label)}</a>
    </p>
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
        `
      );
    case "interpreter_registered_user":
      return layout(
        "통역사 등록이 접수되었습니다",
        `
          <p>${field(payload, "name", "지원자")}님, ON-LI 통역사 등록 신청이 정상 접수되었습니다.</p>
          <p>운영팀이 등록 정보를 검토한 뒤 필요한 경우 추가 연락을 드리겠습니다.</p>
          ${infoTable([
            ["이름", field(payload, "name")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["활동 가능 지역", field(payload, "availableRegions")],
            ["전문 분야", field(payload, "specialties")],
          ])}
        `
      );
    case "interpreter_registered_admin":
      return layout(
        "신규 통역사 등록 알림",
        `
          <p>ON-LI에 신규 통역사 등록이 접수되었습니다. 관리자 페이지에서 상세 정보를 확인해주세요.</p>
          ${infoTable([
            ["이름", field(payload, "name")],
            ["성별", field(payload, "gender")],
            ["나이", field(payload, "age")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["활동 가능 지역", fieldFrom(payload, ["availableRegions", "regions", "region"])],
            ["JLPT", field(payload, "jlpt")],
            ["통역 경험", fieldFrom(payload, ["experience", "hasExperience"])],
            ["전문 분야", field(payload, "specialties")],
            ["등록 시각", field(payload, "createdAt")],
          ])}
        `
      );
    case "job_applied_user":
      return layout(
        "통역 공고 지원이 접수되었습니다",
        `
          <p>${field(payload, "name", "지원자")}님, ON-LI 통역 공고 지원이 정상 접수되었습니다.</p>
          <p>운영팀이 지원 내용을 확인한 뒤 다음 절차를 안내드리겠습니다.</p>
          ${infoTable([
            ["공고명", field(payload, "jobTitle")],
            ["일정", field(payload, "date")],
            ["지원자 이메일", field(payload, "email")],
            ["지원자 연락처", field(payload, "phone")],
            ["레벨/경력", field(payload, "levelOrExperience")],
          ])}
        `
      );
    case "job_applied_admin":
      return layout(
        "신규 공고 지원 알림",
        `
          <p>ON-LI 공고에 신규 지원이 접수되었습니다. 관리자 페이지에서 지원자 정보를 확인해주세요.</p>
          ${infoTable([
            ["지원자", field(payload, "name")],
            ["공고명", field(payload, "jobTitle")],
            ["일정", field(payload, "date")],
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["레벨/경력", field(payload, "levelOrExperience")],
          ])}
        `
      );
    case "matching_confirmed_user":
    case "interpreter_matching_confirmed":
      return layout(
        "통역 배정이 확정되었습니다",
        `
          <p>${field(payload, "name", "통역사")}님, ON-LI 통역 배정이 확정되었습니다.</p>
          <p>세부 진행 내용은 운영팀 안내에 따라 확인해주세요.</p>
          ${infoTable([
            ["의뢰/공고명", field(payload, "jobTitle")],
            ["기업명", field(payload, "companyName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])}
        `
      );
    case "interpreter_approved":
      return layout(
        "통역사 등록이 승인되었습니다",
        `
          <p>${field(payload, "name", "통역사")}님, ON-LI 통역사 등록 검토가 완료되어 승인되었습니다.</p>
          <p>앞으로 적합한 통역 공고와 매칭 건이 있을 때 ON-LI 운영팀에서 안내드리겠습니다.</p>
          ${infoTable([
            ["이름", field(payload, "name")],
            ["이메일", field(payload, "email")],
            ["활동 지역", field(payload, "availableRegions")],
            ["전문 분야", field(payload, "specialties")],
          ])}
        `
      );
    case "resume_verified":
      return layout(
        "ON-LI 이력서 검증이 완료되었습니다",
        `
          <p>안녕하세요, ON-LI 운영팀입니다.</p>
          <p>제출해주신 이력서 확인이 완료되어, ON-LI 통역사 검증이 완료되었습니다.</p>
          <p>이제 ON-LI 플랫폼 내 통역 공고에 지원하실 수 있습니다.</p>
          <p>향후 통역 공고 지원 시, 등록하신 프로필과 이력서를 바탕으로 배정 검토가 진행됩니다.</p>
          <p style="margin:24px 0;">
            <a href="https://onli-platform.vercel.app" style="display:inline-block; padding:12px 18px; background:#5b5cf0; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:700;">통역 공고 확인하기</a>
          </p>
          <p>감사합니다.</p>
          <p>ON-LI 운영팀</p>
        `
      );
    case "company_request_received_user":
    case "company_request_received":
      return layout(
        "통역 의뢰가 접수되었습니다",
        `
          <p>${field(payload, "contactName", "담당자")}님, ON-LI 의뢰가 정상 접수되었습니다.</p>
          <p>담당자가 확인 후 연락드립니다.</p>
          ${infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["요청 인원", field(payload, "requestedPeopleCount")],
            ["희망 레벨", field(payload, "requestedLevel")],
          ])}
        `
      );
    case "company_request_received_admin":
    case "admin_new_request":
      return layout(
        "신규 기업 의뢰 알림",
        `
          <p>ON-LI에 신규 기업 의뢰가 접수되었습니다. 관리자 페이지에서 의뢰 정보를 확인해주세요.</p>
          ${infoTable([
            ["회사명", field(payload, "companyName")],
            ["담당자", field(payload, "contactName")],
            ["담당자 연락처", fieldFrom(payload, ["contactEmail", "email", "contact"])],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["요청 인원", field(payload, "requestedPeopleCount")],
          ])}
        `
      );
    case "company_estimate_issued":
      return layout(
        "견적서가 발급되었습니다",
        `
          <p>요청하신 통역 의뢰의 견적서가 발급되었습니다. 마이페이지에서 세부 내용을 확인해주세요.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_no", "request_code", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "company_estimate_approved":
      return layout(
        "견적 승인이 완료되었습니다",
        `
          <p>견적 승인 처리가 완료되었습니다. 다음 절차는 ON-LI 운영팀이 안내드립니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_no", "request_code", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "company_assignment_completed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>요청하신 통역 의뢰의 통역사 배정이 완료되었습니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_no", "request_code", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "company_completion_document_issued":
      return layout(
        "업무확인서가 발급되었습니다",
        `
          <p>완료된 통역 업무의 업무확인서가 발급되었습니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_no", "request_code", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "interpreter_application_received":
      return layout(
        "지원이 접수되었습니다",
        `
          <p>${fieldFrom(payload, ["name", "applicant_name"], "통역사")}님, 지원이 정상 접수되었습니다.</p>
          ${infoTable([
            ["공고명", fieldFrom(payload, ["jobTitle", "event_name", "title"])],
            ["일정", fieldFrom(payload, ["date", "start_date"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "interpreter_assignment_completed":
      return layout(
        "배정이 완료되었습니다",
        `
          <p>${fieldFrom(payload, ["interpreter_name", "name"], "통역사")}님, 통역 배정이 완료되었습니다.</p>
          ${infoTable([
            ["의뢰/공고명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "interpreter_payout_issued":
      return layout(
        "정산서가 발급되었습니다",
        `
          <p>배정 건의 정산서가 발급되었습니다. 마이페이지에서 확인해주세요.</p>
          ${infoTable([
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "interpreter_payout_completed":
      return layout(
        "정산이 완료되었습니다",
        `
          <p>배정 건의 정산 완료 처리가 되었습니다.</p>
          ${infoTable([
            ["배정번호", fieldFrom(payload, ["assignment_code", "matching_no", "assignment_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "admin_new_company":
      return layout(
        "신규 기업 등록 알림",
        `
          <p>신규 기업 계정이 등록되었습니다. 관리자 페이지에서 검토해주세요.</p>
          ${infoTable([
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["담당자", fieldFrom(payload, ["contact_name", "contactName"])],
          ])}
          ${linkButton("기업 관리 열기", appUrl("/admin/businesses"))}
        `
      );
    case "admin_estimate_approved":
      return layout(
        "견적 승인 완료 알림",
        `
          <p>기업이 견적을 승인했습니다. 후속 배정 절차를 확인해주세요.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_no", "request_code", "request_id"])],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])}
          ${linkButton("의뢰 관리 열기", appUrl("/admin/requests"))}
        `
      );
    case "company_request_under_review":
      return layout(
        "통역 의뢰 검토가 진행 중입니다",
        `
          <p>${field(payload, "contactName", "담당자")}님, 접수해주신 통역 의뢰를 ON-LI 운영팀이 검토 중입니다.</p>
          <p>일정, 요청 인원, 통역 분야를 확인한 뒤 다음 절차를 안내드리겠습니다.</p>
          ${infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
          ])}
        `
      );
    case "company_matching_confirmed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>${field(payload, "contactName", "담당자")}님, 요청하신 통역 의뢰의 통역사 배정이 완료되었습니다.</p>
          <p>세부 진행 사항은 ON-LI 운영팀 안내에 따라 확인해주세요.</p>
          ${infoTable([
            ["회사명", field(payload, "companyName")],
            ["행사명", fieldFrom(payload, ["eventName", "jobTitle"])],
            ["배정 통역사", field(payload, "interpreterName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])}
        `
      );
    case "interpreter_schedule_reminder":
      return layout(
        "통역 일정 안내드립니다",
        `
          <p>${field(payload, "name", "통역사")}님, 배정된 통역 일정 안내드립니다.</p>
          <p>현장 정보와 집합 시간은 운영팀의 최종 안내를 기준으로 확인해주세요.</p>
          ${infoTable([
            ["의뢰/공고명", field(payload, "jobTitle")],
            ["기업명", field(payload, "companyName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
          ])}
        `
      );
    case "designated_request_received_interpreter":
      return layout(
        "지정 통역 의뢰가 도착했습니다",
        `
          <p>안녕하세요, ${field(payload, "interpreterName", "통역사")}님.</p>
          <p>기업에서 회원님의 프로필을 확인 후 지정 통역 의뢰를 요청했습니다.</p>
          <p>아래 일정을 확인 후 가능 여부를 알려주세요.</p>
          ${infoTable([
            ["행사명", field(payload, "eventName")],
            ["일정", field(payload, "date")],
            ["장소", field(payload, "location")],
            ["통역 유형", field(payload, "interpretationTypes")],
            ["요청 내용", field(payload, "requestDetails")],
          ])}
          <p>가능 여부 확인 후 ON-LI 담당자가 최종 매칭을 진행합니다.</p>
          <p>감사합니다.<br/>ON-LI</p>
        `
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
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
            ["필요 언어", fieldFrom(payload, ["language", "language_pair"])],
            ["필요 인원", fieldFrom(payload, ["number_of_interpreters", "people_count", "requestedPeopleCount"])],
          ])}
          ${linkButton("관리자 페이지 열기", appUrl("/admin/new"))}
        `
      );
    case "new_interpreter":
    case "admin_new_company":
      return layout(
        event.event_type === "admin_new_company"
          ? "신규 기업이 등록되었습니다"
          : "신규 통역사가 등록되었습니다",
        `
          <p>${event.event_type === "admin_new_company" ? "신규 기업 등록 건" : "신규 통역사 등록 건"}을 검토해주세요.</p>
          ${infoTable([
            ["대상", fieldFrom(payload, ["company_name", "companyName", "name"])],
            ["담당자", fieldFrom(payload, ["contact_name", "contactName"])],
            ["언어/지역", fieldFrom(payload, ["language", "language_pair", "language_level", "region", "available_regions", "availableRegions"])],
            ["상태", fieldFrom(payload, ["status", "resume_submitted", "resumeSubmitted"])],
          ])}
          ${linkButton(event.event_type === "admin_new_company" ? "기업 관리 열기" : "통역사 검증 화면 열기", appUrl(event.event_type === "admin_new_company" ? "/admin/businesses" : "/admin/interpreters"))}
        `
      );
    case "application_created":
      return layout(
        "신규 지원자가 발생했습니다",
        `
          <p>공고에 신규 지원자가 접수되었습니다.</p>
          ${infoTable([
            ["지원번호", fieldFrom(payload, ["application_code", "application_no", "application_id"])],
            ["의뢰/공고번호", fieldFrom(payload, ["request_code", "job_id"])],
            ["통역사 이름", fieldFrom(payload, ["interpreter_name", "applicant_name", "name"])],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["일정", fieldFrom(payload, ["date", "work_date", "start_date"])],
          ])}
          ${linkButton("지원자 관리 열기", appUrl("/admin/applications"))}
        `
      );
    case "assignment_created":
    case "interpreter_assignment_completed":
      return layout(
        "통역 일정이 배정되었습니다",
        `
          <p>${fieldFrom(payload, ["interpreter_name", "name"], "통역사")}님, 통역 일정이 배정되었습니다.</p>
          ${infoTable([
            ["배정번호", fieldFrom(payload, ["assignment_code", "matching_no", "assignment_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["일정", fieldFrom(payload, ["date", "work_date", "start_date"])],
            ["장소", fieldFrom(payload, ["location", "event_location"])],
            ["통역 언어", fieldFrom(payload, ["language", "language_pair"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "application_status_changed":
    case "interpreter_application_received":
      return layout(
        event.event_type === "interpreter_application_received"
          ? "지원이 접수되었습니다"
          : "지원 상태가 변경되었습니다",
        `
          <p>${event.event_type === "interpreter_application_received" ? "지원이 정상 접수되었습니다." : "지원하신 공고의 상태가 변경되었습니다."}</p>
          ${infoTable([
            ["지원번호", fieldFrom(payload, ["application_code", "application_no", "application_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["변경된 상태", field(payload, "status")],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "settlement_status_changed":
    case "interpreter_payout_completed":
    case "interpreter_settlement_confirmed":
    case "interpreter_payout_paid":
    case "interpreter_settlement_withheld":
      return layout(
        event.event_type === "interpreter_settlement_confirmed"
          ? "정산 금액이 확정되었습니다"
          : event.event_type === "interpreter_payout_paid" || event.event_type === "interpreter_payout_completed"
            ? "지급이 완료되었습니다"
            : event.event_type === "interpreter_settlement_withheld"
              ? "정산이 보류되었습니다"
              : "정산 상태가 변경되었습니다",
        `
          <p>${event.event_type === "interpreter_settlement_confirmed"
            ? "배정 건의 지급 금액이 확정되었습니다."
            : event.event_type === "interpreter_payout_paid" || event.event_type === "interpreter_payout_completed"
              ? "배정 건의 지급 처리가 완료되었습니다."
              : event.event_type === "interpreter_settlement_withheld"
                ? "배정 건의 정산 처리가 보류되었습니다."
                : "배정 건의 정산 상태가 변경되었습니다."}</p>
          ${infoTable([
            ["배정번호", fieldFrom(payload, ["assignment_code", "matching_no", "assignment_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "jobTitle", "title"])],
            ["정산 상태", field(payload, "status")],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "request_created_client":
    case "company_request_received":
      return layout(
        "통역 의뢰가 접수되었습니다",
        `
          <p>ON-LI 통역 의뢰가 정상 접수되었습니다. 담당자가 확인 후 연락드릴 예정입니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["접수 상태", fieldFrom(payload, ["status"], "접수 완료")],
          ])}
        `
      );
    case "assignment_confirmed_client":
    case "company_assignment_completed":
      return layout(
        "통역사 배정이 완료되었습니다",
        `
          <p>요청하신 통역 의뢰의 배정이 완료되었습니다. 세부 사항은 ON-LI 담당자가 안내드립니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["배정 상태", fieldFrom(payload, ["status"], "배정 완료")],
          ])}
        `
      );
    case "client_review_started":
      return layout(
        "통역 의뢰 검토가 시작되었습니다",
        `
          <p>고객님의 의뢰 내용을 담당자가 확인하여 검토를 시작했습니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "검토중"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "client_estimate_ready":
    case "company_estimate_issued":
      return layout(
        "견적서가 발급되었습니다",
        `
          <p>요청하신 통역 의뢰의 견적이 확인되었습니다. 마이페이지에서 견적 세부 내역을 확인해 주세요.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "견적 안내"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "company_estimate_approved":
      return layout(
        "견적 승인이 완료되었습니다",
        `
          <p>견적 승인 처리가 완료되었습니다. ON-LI 운영팀이 다음 절차를 진행합니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "admin_estimate_approved":
      return layout(
        "견적 승인 완료 알림",
        `
          <p>기업이 견적을 승인했습니다. 배정 절차를 확인해주세요.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["기업명", fieldFrom(payload, ["company_name", "companyName"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
          ])}
          ${linkButton("의뢰 관리 열기", appUrl("/admin/requests"))}
        `
      );
    case "company_completion_document_issued":
      return layout(
        "업무확인서가 발급되었습니다",
        `
          <p>완료된 통역 업무의 업무확인서가 발급되었습니다. 마이페이지에서 확인해주세요.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "interpreter_payout_issued":
      return layout(
        "정산서가 발급되었습니다",
        `
          <p>정산서가 발급되었습니다. 마이페이지에서 내용을 확인해주세요.</p>
          ${infoTable([
            ["문서번호", fieldFrom(payload, ["document_no", "document_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "title"])],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/interpreter-mypage"))}
        `
      );
    case "client_recruiting_started":
      return layout(
        "통역사 모집이 시작되었습니다",
        `
          <p>고객님의 의뢰 일정에 적합한 최적의 통역사 모집을 시작했습니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "통역사 모집중"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "client_work_completed":
      return layout(
        "통역 업무가 완료되었습니다",
        `
          <p>배정된 통역사의 현장 업무 수행이 성공적으로 완료되었습니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "업무 완료"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "client_settlement_ready":
      return layout(
        "정산/결제 요청 안내",
        `
          <p>완료된 통역 업무의 정산/결제 정보가 준비되었습니다. 마이페이지에서 정산 세부 내용을 확인 및 정산 진행해 주시기 바랍니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["의뢰 상태", "정산/결제 안내 필요"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    case "client_work_preparing":
      return layout(
        "통역 업무 준비 시작",
        `
          <p>통역사 배정이 완료되어 업무 준비가 시작되었습니다. 기업 마이페이지에서 행사 자료를 업로드하시면 배정된 통역사에게 전달됩니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["현재 상태", "업무 준비중"],
          ])}
          ${linkButton("자료 업로드하기", appUrl("/business/mypage"))}
        `
      );
    case "client_work_ready":
      return layout(
        "통역 업무 진행 예정 안내",
        `
          <p>통역 업무 준비가 완료되어 진행 예정 상태로 변경되었습니다. 행사 당일 원활한 진행을 위해 담당 통역사와의 최종 확인을 부탁드립니다.</p>
          ${infoTable([
            ["의뢰번호", fieldFrom(payload, ["request_code", "request_no", "request_id"])],
            ["행사명", fieldFrom(payload, ["event_name", "eventName"])],
            ["일정", fieldFrom(payload, ["date", "event_date", "start_date"])],
            ["현재 상태", "진행 예정"],
          ])}
          ${linkButton("마이페이지 열기", appUrl("/business/mypage"))}
        `
      );
    default:
      return layout(
        event.title || "ON-LI 알림",
        `
          <p>${escapeHtml(event.message || "ON-LI 운영 알림이 도착했습니다.")}</p>
          ${infoTable([
            ["이벤트", escapeHtml(event.event_type)],
            ["대상", `${escapeHtml(event.target_type)} #${escapeHtml(event.target_id)}`],
            ["상태", fieldFrom(payload, ["status", "after_status"])],
          ])}
          ${event.recipient_type === "admin" ? linkButton("관리자 페이지 열기", appUrl("/admin/internal")) : ""}
        `
      );
  }
}

function pickPublicPayload(row: Record<string, unknown> | null | undefined, keys: string[]) {
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
  event: NotificationEvent
) {
  const payload: Payload = { ...(event.payload || {}) };

  try {
    if (event.target_type === "request" || event.event_type === "new_request") {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(payload, pickPublicPayload(data, [
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
      ]));
    }

    if (event.target_type === "interpreter" || event.event_type === "new_interpreter") {
      const { data } = await supabase
        .from("interpreters")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(payload, pickPublicPayload(data, [
        "name",
        "email",
        "region",
        "level",
        "language_level",
        "available_regions",
        "resume_url",
        "resume_file_url",
        "status",
      ]));
      payload.resume_submitted = Boolean(payload.resume_url || payload.resume_file_url) ? "제출" : "미제출";
    }

    if (event.target_type === "application" || event.event_type.includes("application")) {
      const { data: application } = await supabase
        .from("job_applications")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(payload, pickPublicPayload(application, [
        "application_no",
        "applicant_name",
        "name",
        "email",
        "status",
        "job_id",
      ]));

      const jobId = application?.job_id || payload.job_id;
      if (jobId) {
        const { data: job } = await supabase
          .from("jobs")
          .select("*")
          .eq("id", jobId)
          .maybeSingle();
        Object.assign(payload, pickPublicPayload(job, [
          "title",
          "event_name",
          "date",
          "start_date",
          "end_date",
          "location",
          "language",
        ]));
      }
    }

    if (event.target_type === "assignment" || event.event_type === "assignment_created") {
      const { data: assignment } = await supabase
        .from("request_interpreters")
        .select("*")
        .eq("id", event.target_id)
        .maybeSingle();
      Object.assign(payload, pickPublicPayload(assignment, [
        "matching_no",
        "request_id",
        "interpreter_id",
        "assigned_at",
      ]));

      if (assignment?.request_id || payload.request_id) {
        const { data: request } = await supabase
          .from("requests")
          .select("*")
          .eq("id", assignment?.request_id || payload.request_id)
          .maybeSingle();
        Object.assign(payload, pickPublicPayload(request, [
          "request_no",
          "event_name",
          "event_date",
          "start_date",
          "end_date",
          "event_location",
          "location",
          "language",
        ]));
      }

      if (assignment?.interpreter_id || payload.interpreter_id) {
        const { data: interpreter } = await supabase
          .from("interpreters")
          .select("name,email")
          .eq("id", assignment?.interpreter_id || payload.interpreter_id)
          .maybeSingle();
        if (!event.recipient_email && interpreter?.email) payload.recipient_email = interpreter.email;
        if (interpreter?.name) payload.interpreter_name = interpreter.name;
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
  serviceRoleKey: string
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

  if (adminError || !adminUser || !["owner", "admin", "staff"].includes(adminUser.role)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, user, adminUser };
}

async function updateNotificationStatus(
  supabase: SupabaseClient,
  id: string,
  changes: Record<string, unknown>
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
  const adminCheck = await assertAdminCaller(request, supabaseUrl, anonKey, serviceRoleKey);
  if (!adminCheck.ok) {
    return jsonResponse({ ok: false, error: adminCheck.error }, adminCheck.status);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  const emailFrom = Deno.env.get("EMAIL_FROM") || `"ON-LI" <${gmailUser.trim()}>`;
  const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || gmailUser.trim();
  const selectableStatuses = retryFailed ? ["pending", "failed"] : ["pending"];

  let query = supabase
    .from("notification_events")
    .select("id,event_type,target_type,target_id,recipient_type,recipient_email,payload,status,retry_count,created_at,channel,title,message");

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
    return jsonResponse({ ok: false, error: "database_error", message: error.message }, 500);
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
      .select("id,event_type,target_type,target_id,recipient_type,recipient_email,payload,status,retry_count,channel,title,message")
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
    const currentChannel = String(currentEvent.channel || "email").trim().toLowerCase() || "email";
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
        error_message: `${currentChannel} channel is queued but not implemented yet.`,
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
      String(currentEvent.recipient_email || payload.recipient_email || "").trim() ||
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
      const subject = notificationSubject(currentEvent.event_type);
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
      const message = sendError instanceof Error ? sendError.message : String(sendError);
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
    failedCount: results.filter((result) => !result.ok && !result.skipped).length,
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
  const adminCheck = await assertAdminCaller(request, supabaseUrl, anonKey, serviceRoleKey);
  if (!adminCheck.ok) {
    return jsonResponse({ ok: false, error: adminCheck.error }, adminCheck.status);
  }

  if (notificationIds.length === 0) {
    return jsonResponse({ ok: false, error: "No notification ids provided." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hasEmailSecrets = Boolean(gmailUser && gmailAppPassword);
  const transporter = hasEmailSecrets ? createGmailTransporter(gmailUser!, gmailAppPassword!) : null;
  const emailFrom = gmailUser
    ? Deno.env.get("EMAIL_FROM") || `"ON-LI" <${gmailUser.trim()}>`
    : Deno.env.get("EMAIL_FROM") || "ON-LI";

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id,recipient_type,recipient_id,recipient_email,notification_type,title,message,channel,status,error_message")
    .in("id", notificationIds);

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const results = [];

  for (const notification of (notifications || []) as NotificationRow[]) {
    const channel = String(notification.channel || "email").trim().toLowerCase() || "email";
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
      const errorMessage = `${channel} channel is queued but not implemented yet.`;
      await supabase
        .from("notifications")
        .update({ status: "failed", error_message: errorMessage, sent_at: null })
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
      const subject = notification.title || notificationSubject(notification.notification_type);
      const html = layout(
        notification.title || "ON-LI 알림",
        `
          <p>${escapeHtml(notification.message || "ON-LI 운영 알림이 도착했습니다.")}</p>
          ${infoTable([
            ["알림 종류", escapeHtml(notification.notification_type)],
            ["대상", escapeHtml(notification.recipient_type)],
          ])}
        `
      );

      const sendResult: any = await transporter.sendMail({
        from: emailFrom,
        to: recipientEmail,
        subject,
        html,
      });

      console.log("SMTP RESULT", JSON.stringify(sendResult, null, 2));

      const accepted = Array.isArray(sendResult.accepted) ? sendResult.accepted : [];
      const rejected = Array.isArray(sendResult.rejected) ? sendResult.rejected : [];
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
            messageId: messageId || null
          }
        });
      } else {
        const failureReason = JSON.stringify({
          accepted,
          rejected,
          response,
          messageId
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
            messageId: messageId || null
          }
        });
      }
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
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
          messageId: null
        }
      });
    }
  }

  const sentResults = results.filter((result) => result.ok);
  const failedResults = results.filter((result) => !result.ok);

  return jsonResponse({
    ok: true,
    success: results.length > 0 && failedResults.length === 0,
    messageId: sentResults.length === 1 ? sentResults[0].messageId || null : null,
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
  const adminCheck = await assertAdminCaller(request, supabaseUrl, anonKey, serviceRoleKey);
  if (!adminCheck.ok) {
    return jsonResponse({ success: false, error: adminCheck.error }, adminCheck.status);
  }

  const recipientEmail = String(to || "").trim();
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return jsonResponse({ success: false, error: "recipient_email is missing" }, 400);
  }

  const transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  const emailFrom = Deno.env.get("EMAIL_FROM") || `"ON-LI" <${gmailUser.trim()}>`;

  try {
    const sendResult = await transporter.sendMail({
      from: emailFrom,
      to: recipientEmail,
      subject: "[ON-LI] 이메일 발송 테스트",
      html: layout(
        "[ON-LI] 이메일 발송 테스트",
        `
          <p>ON-LI send-email Edge Function에서 발송한 테스트 메일입니다.</p>
          ${infoTable([
            ["수신자", escapeHtml(recipientEmail)],
            ["발송 시각", escapeHtml(new Date().toISOString())],
          ])}
        `
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

Deno.serve(async (request) => {
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
    const type = body?.type as EmailType;
    let to =
      typeof body?.to === "string"
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
    const emailProvider = (Deno.env.get("EMAIL_PROVIDER") || "gmail").toLowerCase();
    const gmailUser = Deno.env.get("GMAIL_USER") || Deno.env.get("EMAIL_USER");
    const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("EMAIL_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    console.log("REQUEST BODY", {
      type,
      to,
      payload,
    });
    console.log("TO:", to);
    console.log("HAS GMAIL USER", !!gmailUser);
    console.log("HAS GMAIL APP PASSWORD", !!gmailAppPassword);
    console.log("HAS SUPABASE URL", !!supabaseUrl);
    console.log("HAS SUPABASE SERVICE ROLE KEY", !!serviceRoleKey);

    if (!["gmail", "smtp"].includes(emailProvider)) {
      return jsonResponse({
        ok: false,
        error: `Unsupported EMAIL_PROVIDER: ${emailProvider}`,
      }, 500);
    }

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("SEND EMAIL FUNCTION ERROR", "Missing required Supabase secrets");
      return jsonResponse({
        ok: false,
        error: "Missing required Supabase secrets",
        missing: {
          SUPABASE_URL: !supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
        },
      }, 500);
    }

    if (action === "process_notification_events") {
      if (!anonKey) {
        return jsonResponse({ ok: false, error: "Missing SUPABASE_ANON_KEY" }, 500);
      }
      if (!gmailUser || !gmailAppPassword) {
        return jsonResponse({
          ok: false,
          source: "gmail",
          error: "Missing required email secrets",
          missing: {
            GMAIL_USER: !gmailUser,
            GMAIL_APP_PASSWORD: !gmailAppPassword,
          },
        }, 500);
      }

      return await processNotificationEvents({
        request,
        limit: Number(body?.limit || 10),
        eventIds: Array.isArray(body?.eventIds)
          ? body.eventIds.map((id: unknown) => String(id)).filter(Boolean)
          : [],
        retryFailed: Boolean(body?.retryFailed),
        supabaseUrl,
        serviceRoleKey,
        anonKey,
        gmailUser,
        gmailAppPassword,
      });
    }

    if (action === "process_notifications") {
      if (!anonKey) {
        return jsonResponse({ ok: false, error: "Missing SUPABASE_ANON_KEY" }, 500);
      }

      return await processNotifications({
        request,
        notificationIds: Array.isArray(body?.notificationIds)
          ? body.notificationIds.map((id: unknown) => String(id)).filter(Boolean)
          : [],
        supabaseUrl,
        serviceRoleKey,
        anonKey,
        gmailUser,
        gmailAppPassword,
      });
    }

    const notification_id = String(body?.notification_id || body?.notificationId || "");
    
    if (action === "send_notification" || (!action && notification_id)) {
      if (!anonKey) {
        return jsonResponse({ success: false, error: "Missing SUPABASE_ANON_KEY" }, 500);
      }
      
      if (!notification_id) {
        return jsonResponse({ success: false, error: "Missing notification_id" }, 400);
      }

      return await sendSingleNotification({
        request,
        notification_id,
        supabaseUrl,
        serviceRoleKey,
        anonKey,
        gmailUser,
        gmailAppPassword,
      });
    }

    if (action === "test_email") {
      if (!anonKey) {
        return jsonResponse({ success: false, error: "Missing SUPABASE_ANON_KEY" }, 500);
      }
      if (!gmailUser || !gmailAppPassword) {
        return jsonResponse({
          success: false,
          error: "Missing required email secrets",
          missing: {
            GMAIL_USER: !gmailUser,
            GMAIL_APP_PASSWORD: !gmailAppPassword,
          },
        }, 500);
      }

      return await sendTestEmail({
        request,
        to: typeof body?.to === "string" ? body.to : "",
        supabaseUrl,
        serviceRoleKey,
        anonKey,
        gmailUser,
        gmailAppPassword,
      });
    }

    // Fallback for default or missing action
    const fallback_notification_id = String(body?.notification_id || body?.notificationId || "");
    
    if (!fallback_notification_id) {
      return jsonResponse({
        success: false,
        error: "missing_notification_id",
        message: "notification_id가 없습니다.",
      }, 400);
    }

    return await sendSingleNotification({
      request,
      notification_id: fallback_notification_id,
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
      500
    );
  }
});

async function sendSingleNotification({
  request,
  notification_id,
  supabaseUrl,
  serviceRoleKey,
  anonKey,
  gmailUser,
  gmailAppPassword,
}: {
  request: Request;
  notification_id: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  gmailUser?: string;
  gmailAppPassword?: string;
}) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  if (!gmailUser || !gmailAppPassword) {
    return jsonResponse({ success: false, error: "Missing required email secrets" }, 500);
  }

  const { data: notification, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", notification_id)
    .single();

  if (error || !notification) {
    return jsonResponse({ success: false, error: "notification_not_found", message: "알림을 찾을 수 없습니다." }, 404);
  }

  const to = String(notification.recipient_email || "").trim();
  if (!to || !to.includes("@")) {
    return jsonResponse({ success: false, error: "recipient_email is missing or invalid" }, 400);
  }

  const type =
    notification.type ||
    notification.notification_type ||
    notification.event_type ||
    "general";

  const reasonMap: Record<string, string> = {
    status_changed: "의뢰 상태 변경 안내",
    assignment_completed: "배정 완료 안내",
    settlement_ready: "정산 대기 안내",
    client_recruiting_started: "통역사 모집 시작 안내",
    job_updated: "의뢰 수정 안내",
  };
  const reason = reasonMap[type] || "ON-LI 운영 안내";

  const metadata = notification.metadata || {};
  let realRequestNo = metadata.request_no || "";
  let realJobTitle = metadata.job_title || metadata.event_name || "";

  if (metadata.job_id) {
    const { data: jobData } = await supabase
      .from("jobs")
      .select("request_no, code, title, event_name")
      .eq("id", metadata.job_id)
      .single();
    if (jobData) {
      if (!realRequestNo) realRequestNo = jobData.request_no || jobData.code || "";
      if (!realJobTitle) realJobTitle = jobData.title || jobData.event_name || "";
    }
  }

  if ((!realRequestNo || !realJobTitle) && notification.related_request_id) {
    const { data: requestData } = await supabase
      .from("requests")
      .select("request_no, code, title, event_name")
      .eq("id", notification.related_request_id)
      .single();
    if (requestData) {
      if (!realRequestNo) realRequestNo = requestData.request_no || requestData.code || "";
      if (!realJobTitle) realJobTitle = requestData.title || requestData.event_name || "";
    }
  }

  if (!realJobTitle && notification.title && !reasonMap[notification.title]) {
    realJobTitle = notification.title;
  }

  const relatedNo = realRequestNo;
  const jobTitle = realJobTitle;
  const previousStatus = metadata.previous_status || "";
  const nextStatus = metadata.next_status || metadata.status || "";

  let statusText = nextStatus || "-";
  if (previousStatus && nextStatus) {
    statusText = `${previousStatus} → ${nextStatus}`;
  } else if (!nextStatus && previousStatus) {
    statusText = previousStatus;
  }

  const subject = `[ON-LI] ${reason}${relatedNo ? ` - ${relatedNo}` : ""}`;
  
  const originalMessage = String(notification.message || "");
  const fallbackMessage = "상세 내용은 ON-LI 사이트에서 확인해 주세요.";
  const displayMessage = originalMessage === "1" || !originalMessage.trim() ? fallbackMessage : originalMessage;

  const tableRows: [string, string][] = [
    ["발송 사유", reason],
  ];
  
  if (relatedNo) {
    tableRows.push(["관련 의뢰", relatedNo]);
  }
  if (jobTitle && jobTitle !== "1") {
    tableRows.push(["의뢰명", jobTitle]);
  }
  if (statusText && statusText !== "-") {
    tableRows.push(["상태", statusText]);
  }

  const html = layout(
    subject,
    `
      <p>안녕하세요.<br />ON-LI입니다.</p>
      <p>본 메일은 아래 사유로 발송되었습니다.</p>
      <br />
      ${infoTable(tableRows)}
      <br />
      <p><strong>■ 안내 내용</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(displayMessage)}</p>
      <br />
      <p>감사합니다.<br />ON-LI 운영팀</p>
    `
  );

  console.log("SEND EMAIL START", { notification_id, to, subject });

  let transporter;
  try {
    transporter = createGmailTransporter(gmailUser, gmailAppPassword);
  } catch (e) {
    return jsonResponse({ success: false, error: "SMTP config error" }, 500);
  }

  try {
    const result: any = await transporter.sendMail({
      from: `"ON-LI" <${gmailUser}>`,
      to,
      subject,
      html,
    });

    console.log("SMTP RESULT", JSON.stringify(result, null, 2));

    const accepted = Array.isArray(result.accepted) ? result.accepted : [];
    const rejected = Array.isArray(result.rejected) ? result.rejected : [];
    const response = result.response ?? null;
    const messageId = result.messageId ?? null;

    if (accepted.length === 0) {
      await supabase
        .from("notifications")
        .update({
          status: "failed",
          failure_reason: JSON.stringify({
            error: "smtp_no_accepted_recipients",
            accepted,
            rejected,
            response,
            messageId
          })
        })
        .eq("id", notification_id);

      return new Response(JSON.stringify({
        success: false,
        error: "smtp_no_accepted_recipients",
        message: "SMTP accepted 수신자가 없습니다.",
        smtp: {
          accepted,
          rejected,
          response: result?.response ?? null,
          messageId: result?.messageId ?? null
        }
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    await supabase
      .from("notifications")
      .update({
        status: "sent",
        email_sent_at: new Date().toISOString(),
        failure_reason: null,
        email_message_id: messageId
      })
      .eq("id", notification_id);

    return new Response(JSON.stringify({
      success: true,
      message: "이메일 발송 완료",
      smtp: {
        accepted,
        rejected,
        response: result?.response ?? null,
        messageId: result?.messageId ?? null
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    await supabase
      .from("notifications")
      .update({
        status: "failed",
        failure_reason: message
      })
      .eq("id", notification_id);

    return jsonResponse({
      success: false,
      error: "smtp_error",
      message,
      smtp: {
        accepted: [],
        rejected: [],
        response: null,
        messageId: null
      }
    }, 502);
  }
}
