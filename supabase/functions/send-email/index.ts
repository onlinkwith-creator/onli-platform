const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "ON-LI <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const subjects = {
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
  interpreter_matching_confirmed: "[ON-LI] 통역 배정이 확정되었습니다",
  interpreter_schedule_reminder: "[ON-LI] 통역 일정 안내드립니다",
} as const;

type EmailType = keyof typeof subjects;
type Payload = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

function buildHtml(type: EmailType, payload: Payload) {
  switch (type) {
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
            ["이메일", field(payload, "email")],
            ["연락처", field(payload, "phone")],
            ["거주 지역", field(payload, "region")],
            ["JLPT", field(payload, "jlpt")],
            ["통역 경험", field(payload, "hasExperience")],
            ["전문 분야", field(payload, "specialties")],
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
    case "company_request_received_user":
      return layout(
        "통역 의뢰가 접수되었습니다",
        `
          <p>${field(payload, "contactName", "담당자")}님, ON-LI 통역 의뢰가 정상 접수되었습니다.</p>
          <p>운영팀이 의뢰 내용을 확인한 뒤 적합한 진행 방향을 안내드리겠습니다.</p>
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
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return jsonResponse({ error: "RESEND_API_KEY is not configured" }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const type = body?.type as EmailType;
    const to =
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

    if (!type || !(type in subjects)) {
      return jsonResponse({ error: "Invalid email type" }, 400);
    }

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return jsonResponse({ error: "Recipient email is required" }, 400);
    }

    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: subjects[type],
        html: buildHtml(type, payload),
      }),
    });

    const resendBody = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      return jsonResponse(
        { error: resendBody?.message || "Failed to send email" },
        500
      );
    }

    return jsonResponse({ id: resendBody?.id });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
