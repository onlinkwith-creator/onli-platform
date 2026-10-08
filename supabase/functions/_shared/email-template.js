function escapeHtml(value         ) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


                             
                
                  
                  
                                        
                      
                     
  

const STATUS_STYLES                                  = [
  ["배정", "#2563EB", "#EFF6FF"],
  ["정산 대기", "#B45309", "#FFFBEB"],
  ["정산 확정", "#7C3AED", "#F5F3FF"],
  ["정산 금액", "#7C3AED", "#F5F3FF"],
  ["지급", "#4F46E5", "#EEF2FF"],
  ["정산 완료", "#15803D", "#F0FDF4"],
  ["견적 승인", "#4B5563", "#F3F4F6"],
];

function statusPresentation(status        ) {
  const matched = STATUS_STYLES.find(([keyword]) => status.includes(keyword));
  return matched
    ? { color: matched[1], background: matched[2] }
    : { color: "#5B4CF0", background: "#F8F7FF" };
}

function inferredStatus(title        ) {
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

function statusMessage(status        ) {
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

function settlementProgress(status        ) {
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
}                      ) {
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
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin-top:32px; border-collapse:separate; border-radius:8px; background:#F8F7FF;"><tr><td style="padding:18px 20px; color:#4B5563; font-size:13px; line-height:1.7;"><strong style="display:block; margin-bottom:4px; color:#111827;">문의</strong>문의사항은 아래로 연락 부탁드립니다.<br><a href="mailto:onlinkwith@gmail.com" style="color:#5B4CF0; text-decoration:none;">onlinkwith@gmail.com</a><br>운영시간: 평일 09:00 ~ 18:00</td></tr></table>
</td></tr>
<tr><td style="padding:24px 40px; border-top:1px solid #E5E7EB; background:#F3F4F6; color:#6B7280; font-size:11px; line-height:1.7;"><strong style="color:#374151;">ON-LI</strong><br>ON-Link Interpretation Platform<br>Website: <a href="https://on-li.jp" style="color:#5B4CF0; text-decoration:none;">https://on-li.jp</a><br>E-mail: <a href="mailto:onlinkwith@gmail.com" style="color:#5B4CF0; text-decoration:none;">onlinkwith@gmail.com</a><br><br>본 메일은 시스템에 의해 자동 발송되었습니다.<br>문의는 회신하지 마시고 홈페이지를 이용해주시기 바랍니다.</td></tr>
</table></td></tr></table></body></html>`;
}


function infoTable(rows                         ) {
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


function linkButton(label        , href        ) {
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


export { createEmailTemplate, escapeHtml, inferredStatus, infoTable, linkButton };
