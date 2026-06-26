export const DOCUMENT_BUCKET = "onli-documents";

export const DOCUMENT_TYPES = {
  estimate: {
    label: "견적서",
    prefix: "ONLI-EST",
    filePrefix: "estimate",
  },
  completion: {
    label: "업무 확인서",
    prefix: "ONLI-COM",
    filePrefix: "completion",
  },
  payout: {
    label: "정산 내역서",
    prefix: "ONLI-PAY",
    filePrefix: "payout",
  },
};

const A4 = { width: 1240, height: 1754 };

export function getDocumentTypeLabel(type) {
  return DOCUMENT_TYPES[type]?.label || "문서";
}

export function normalizeDocumentType(type) {
  if (type === "payment") return "payout";
  return Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, type) ? type : "estimate";
}

export function formatDocumentAmount(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

export function getWorkDays(item = {}) {
  const saved = Number(item.settlement_work_days || item.work_days);
  if (Number.isFinite(saved) && saved > 0) return Math.max(1, Math.round(saved));

  const start = item.start_date || item.event_date;
  const end = item.end_date || item.event_date || start;
  const startDate = start ? new Date(`${String(start).slice(0, 10)}T00:00:00`) : null;
  const endDate = end ? new Date(`${String(end).slice(0, 10)}T00:00:00`) : startDate;
  if (!startDate || Number.isNaN(startDate.getTime())) return 1;
  if (!endDate || Number.isNaN(endDate.getTime())) return 1;

  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
}

export function getPeopleCount(item = {}) {
  const value = Number(item.requested_people_count || item.required_count || item.people_count || 1);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

export function getRequestDateRange(item = {}) {
  const start = item.start_date || item.event_date || item.date || "";
  const end = item.end_date || "";
  if (start && end && String(start).slice(0, 10) !== String(end).slice(0, 10)) {
    return `${String(start).slice(0, 10)} ~ ${String(end).slice(0, 10)}`;
  }
  return start ? String(start).slice(0, 10) : "-";
}

export function buildEstimateDraft(request = {}) {
  const peopleCount = getPeopleCount(request);
  const workDays = getWorkDays(request);
  const currentAmount = Number(request.company_amount ?? request.client_price ?? 0);
  const unitPrice =
    currentAmount > 0
      ? Math.round(currentAmount / Math.max(1, peopleCount * workDays))
      : getDefaultCompanyUnitPrice(request.requested_level || request.required_level);
  const subtotal = unitPrice * peopleCount * workDays;

  return {
    documentType: "estimate",
    request,
    companyName: request.company_name || "",
    contactName: request.contact_name || request.manager_name || "",
    eventName: request.event_name || request.title || "",
    eventDate: getRequestDateRange(request),
    location: request.event_location || request.location || "",
    peopleCount,
    level: request.requested_level || request.required_level || "-",
    workDays,
    unitPrice,
    discountAmount: 0,
    extraAmount: 0,
    memo: request.estimate_memo || "",
    totalAmount: subtotal,
  };
}

export function buildCompletionDraft(request = {}, assignments = []) {
  return {
    documentType: "completion",
    request,
    companyName: request.company_name || "",
    eventName: request.event_name || request.title || "",
    eventDate: getRequestDateRange(request),
    location: request.event_location || request.location || "",
    interpreters: getAssignmentNames(assignments, request.assigned_interpreter_name),
    workTime: request.work_hours || formatTimeRange(request.event_start_time, request.event_end_time),
    confirmedAt: new Date().toISOString().slice(0, 10),
    memo: "",
    totalAmount: Number(request.company_amount ?? request.client_price ?? 0),
  };
}

export function buildPaymentDraft(request = {}, assignments = []) {
  const primaryAssignment = assignments[0] || {};
  const interpreter = primaryAssignment.interpreter || {};
  const workDays = getWorkDays(request);
  const dailyPay =
    Number(request.settlement_base_amount || 0) > 0
      ? Math.round(Number(request.settlement_base_amount) / Math.max(1, workDays))
      : Number(request.interpreter_payment ?? request.interpreter_price ?? request.settlement_final_amount ?? 0);
  const totalAmount = Number(request.settlement_final_amount ?? request.interpreter_payment ?? request.interpreter_price ?? 0);

  return {
    documentType: "payout",
    request,
    interpreterId: primaryAssignment.interpreter_id || request.assigned_interpreter_id || null,
    interpreterAuthUserId: interpreter.auth_user_id || null,
    interpreterName: interpreter.name || request.assigned_interpreter_name || request.matched_interpreter_name || "",
    eventName: request.event_name || request.title || "",
    eventDate: getRequestDateRange(request),
    level: request.settlement_level || request.requested_level || request.required_level || "-",
    dailyPay,
    workDays,
    totalAmount,
    memo: request.settlement_memo || "",
  };
}

export function recalculateEstimateDraft(draft) {
  const unitPrice = toMoney(draft.unitPrice);
  const peopleCount = Math.max(1, Number(draft.peopleCount || 1));
  const workDays = Math.max(1, Number(draft.workDays || 1));
  const discountAmount = toMoney(draft.discountAmount);
  const extraAmount = toMoney(draft.extraAmount);
  return {
    ...draft,
    unitPrice,
    peopleCount,
    workDays,
    discountAmount,
    extraAmount,
    totalAmount: Math.max(0, unitPrice * peopleCount * workDays - discountAmount + extraAmount),
  };
}

export function recalculatePaymentDraft(draft) {
  const dailyPay = toMoney(draft.dailyPay);
  const workDays = Math.max(1, Number(draft.workDays || 1));
  return {
    ...draft,
    dailyPay,
    workDays,
    totalAmount: toMoney(draft.totalAmount || dailyPay * workDays),
  };
}

export async function createOnliDocument({ supabase, draft, userId }) {
  const documentType = normalizeDocumentType(draft.documentType);
  const normalizedDraft =
    documentType === "estimate"
      ? recalculateEstimateDraft(draft)
      : documentType === "payout"
        ? recalculatePaymentDraft(draft)
        : draft;

  const { data: documentNo, error: numberError } = await supabase.rpc(
    "allocate_onli_document_number",
    { p_document_type: documentType }
  );
  if (numberError) throw numberError;

  const request = normalizedDraft.request || {};
  let companyId = null;
  if (request.company_auth_user_id) {
    const { data: bizData } = await supabase
      .from("businesses")
      .select("id")
      .eq("auth_user_id", request.company_auth_user_id)
      .maybeSingle();
    if (bizData) {
      companyId = bizData.id;
    }
  }

  const version = await getNextDocumentVersion(supabase, documentType, request.id);
  const fileName = `${documentNo}-v${version}.pdf`;
  const storagePath =
    documentType === "completion"
      ? `completions/${companyId || "no-company"}/${documentNo}-v${version}.pdf`
      : [
          documentType,
          request.id || "no-request",
          fileName,
        ].join("/");
  const pdfBlob = await renderDocumentPdf({
    documentNo,
    version,
    draft: normalizedDraft,
  });

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const metadata = buildDocumentMetadata(normalizedDraft);
  const insertPayload = {
    document_type: documentType,
    document_no: documentNo,
    status: "issued",
    version,
    request_id: request.id || null,
    company_id: companyId || null,
    company_auth_user_id: request.company_auth_user_id || null,
    interpreter_id: normalizedDraft.interpreterId || null,
    interpreter_auth_user_id: normalizedDraft.interpreterAuthUserId || null,
    title: DOCUMENT_TYPES[documentType].label,
    amount: Math.round(Number(normalizedDraft.totalAmount || 0)),
    storage_bucket: DOCUMENT_BUCKET,
    file_path: storagePath,
    metadata,
    created_by: userId || null,
  };

  const { data, error } = await supabase
    .from("documents")
    .insert([insertPayload])
    .select("*")
    .single();
  if (error) throw error;

  return { document: data, blob: pdfBlob, fileName };
}

export async function openDocumentSignedUrl(supabase, document, options = {}) {
  const { data, error } = await supabase.storage
    .from(document.storage_bucket || DOCUMENT_BUCKET)
    .createSignedUrl(document.file_path || document.storage_path, 600, {
      download: options.download ? `${document.document_no || "ONLI-DOC"}.pdf` : false,
    });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getNextDocumentVersion(supabase, documentType, requestId) {
  if (!requestId) return 1;
  const { data, error } = await supabase
    .from("documents")
    .select("version")
    .eq("document_type", documentType)
    .eq("request_id", requestId)
    .order("version", { ascending: false })
    .limit(1);
  if (error) return 1;
  return Number(data?.[0]?.version || 0) + 1;
}

function buildDocumentMetadata(draft) {
  const { request, ...rest } = draft;
  return {
    ...rest,
    request_no: request?.request_no || null,
    request_id: request?.id || null,
    generated_at: new Date().toISOString(),
  };
}

async function renderDocumentPdf({ documentNo, version, draft }) {
  const canvas = document.createElement("canvas");
  canvas.width = A4.width;
  canvas.height = A4.height;
  const ctx = canvas.getContext("2d");

  drawDocumentPage(ctx, { documentNo, version, draft });

  const imageData = canvas.toDataURL("image/jpeg", 0.92);
  return createSingleImagePdf(imageData, A4.width, A4.height);
}

function drawDocumentPage(ctx, { documentNo, version, draft }) {
  const documentType = normalizeDocumentType(draft.documentType);
  const title = DOCUMENT_TYPES[documentType].label;
  const generatedDate = new Date().toISOString().slice(0, 10);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, A4.width, A4.height);
  ctx.fillStyle = "#111827";
  ctx.font = "700 46px Arial, sans-serif";
  ctx.fillText("ON-LI", 92, 112);
  ctx.font = "700 40px Arial, sans-serif";
  ctx.fillText(title, 92, 192);

  ctx.font = "400 22px Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(`문서번호: ${documentNo}`, 92, 248);
  ctx.fillText(`버전: v${version}`, 92, 286);
  ctx.fillText(`생성일: ${generatedDate}`, 92, 324);

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(92, 370);
  ctx.lineTo(1148, 370);
  ctx.stroke();

  const rows = getDocumentRows(draft);
  drawRows(ctx, rows, 92, 430);

  if (draft.memo) {
    ctx.fillStyle = "#111827";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText("메모", 92, 1190);
    drawMultiline(ctx, String(draft.memo), 92, 1235, 980, 30);
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText(`최종 금액: ${formatDocumentAmount(draft.totalAmount)}`, 92, 1400);

  ctx.fillStyle = "#64748b";
  ctx.font = "400 20px Arial, sans-serif";
  drawMultiline(
    ctx,
    "본 문서는 ON-LI 운영 시스템에 저장된 의뢰 및 정산 데이터를 기반으로 생성되었습니다.",
    92,
    1510,
    980,
    28
  );
}

function getDocumentRows(draft) {
  if (draft.documentType === "estimate") {
    return [
      ["기업명", draft.companyName],
      ["담당자명", draft.contactName],
      ["행사명", draft.eventName],
      ["일정", draft.eventDate],
      ["장소", draft.location],
      ["필요 인원", `${draft.peopleCount}명`],
      ["통역 레벨", draft.level],
      ["업무 일수", `${draft.workDays}일`],
      ["단가", formatDocumentAmount(draft.unitPrice)],
      ["할인", formatDocumentAmount(draft.discountAmount)],
      ["추가 비용", formatDocumentAmount(draft.extraAmount)],
    ];
  }

  if (draft.documentType === "completion") {
    return [
      ["행사명", draft.eventName],
      ["진행 날짜", draft.eventDate],
      ["진행 장소", draft.location],
      ["기업명", draft.companyName],
      ["담당 통역사", draft.interpreters],
      ["업무 시간", draft.workTime || "-"],
      ["완료 확인일", draft.confirmedAt],
    ];
  }

  return [
    ["통역사명", draft.interpreterName],
    ["업무명", draft.eventName],
    ["업무 날짜", draft.eventDate],
    ["적용 레벨", draft.level],
    ["일당", formatDocumentAmount(draft.dailyPay)],
    ["근무 일수", `${draft.workDays}일`],
    ["최종 지급 금액", formatDocumentAmount(draft.totalAmount)],
  ];
}

function drawRows(ctx, rows, x, y) {
  const rowHeight = 58;
  const labelWidth = 250;
  ctx.font = "400 23px Arial, sans-serif";

  rows.forEach(([label, value], index) => {
    const top = y + index * rowHeight;
    ctx.fillStyle = index % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(x, top - 36, 1056, rowHeight);
    ctx.fillStyle = "#334155";
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText(label, x + 24, top);
    ctx.fillStyle = "#111827";
    ctx.font = "400 22px Arial, sans-serif";
    drawMultiline(ctx, String(value || "-"), x + labelWidth, top, 760, 26, 1);
  });
}

function drawMultiline(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || "-").split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => {
    ctx.fillText(item, x, y + index * lineHeight);
  });
}

async function createSingleImagePdf(imageDataUrl, width, height) {
  const imageBinary = atob(imageDataUrl.split(",")[1]);
  const imageBytes = new Uint8Array(imageBinary.length);
  for (let index = 0; index < imageBinary.length; index += 1) {
    imageBytes[index] = imageBinary.charCodeAt(index);
  }

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  const imageId = addObject({
    stream: imageBytes,
    header: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`,
  });
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`;
  const contentId = addObject({
    stream: new TextEncoder().encode(content),
    header: `<< /Length ${content.length} >>`,
  });

  void catalogId;
  void pageId;
  void imageId;
  void contentId;

  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  let currentOffset = byteLength(parts[0]);
  objects.forEach((object, index) => {
    offsets.push(currentOffset);
    const objectStart = `${index + 1} 0 obj\n`;
    parts.push(objectStart);
    currentOffset += byteLength(objectStart);
    if (typeof object === "string") {
      const objectText = `${object}\n`;
      parts.push(objectText);
      currentOffset += byteLength(objectText);
    } else {
      const streamStart = `${object.header}\nstream\n`;
      const streamEnd = "\nendstream\n";
      parts.push(streamStart);
      parts.push(object.stream);
      parts.push(streamEnd);
      currentOffset += byteLength(streamStart) + object.stream.byteLength + byteLength(streamEnd);
    }
    parts.push("endobj\n");
    currentOffset += byteLength("endobj\n");
  });

  const xrefOffset = currentOffset;
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });
}

function byteLength(value) {
  return new Blob([value]).size;
}

function getDefaultCompanyUnitPrice(level) {
  const normalized = String(level || "").toUpperCase();
  if (normalized.includes("4")) return 300000;
  if (normalized.includes("3")) return 280000;
  if (normalized.includes("2")) return 245000;
  return 220000;
}

function getAssignmentNames(assignments, fallback) {
  const names = assignments
    .map((assignment) => assignment?.interpreter?.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : fallback || "-";
}

function formatTimeRange(start, end) {
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "-";
}

function toMoney(value) {
  const numeric = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}
