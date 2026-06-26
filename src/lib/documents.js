import { supabase as defaultSupabase } from "../supabase";

export const DOCUMENT_BUCKET = "onli-documents";

export const DOCUMENT_TYPE_LABELS = {
  estimate: "견적서",
  completion: "업무확인서",
  payout: "정산서",
};

export async function getNextDocumentNo(documentType, supabase = defaultSupabase) {
  const { data, error } = await supabase.rpc("get_next_document_no", {
    p_document_type: documentType,
  });

  if (error) {
    throw new Error(`문서 번호 생성에 실패했습니다. ${error.message}`);
  }

  return data;
}

export async function uploadDocumentPdf(fileBlob, filePath, supabase = defaultSupabase) {
  const { error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(filePath, fileBlob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    const bucketHint = /bucket|not found/i.test(error.message || "")
      ? " Storage bucket onli-documents가 없습니다."
      : "";
    throw new Error(`Storage 업로드에 실패했습니다.${bucketHint} ${error.message}`);
  }
}

export async function createDocumentRecord(payload, supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("documents")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    const tableHint = /schema cache|relation|does not exist/i.test(error.message || "")
      ? " documents 테이블이 없습니다."
      : "";
    throw new Error(`문서 저장에 실패했습니다.${tableHint} ${error.message}`);
  }

  return data;
}

export async function getSignedDocumentUrl(filePath, supabase = defaultSupabase) {
  if (!filePath) throw new Error("문서 파일 경로가 없습니다.");

  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(filePath, 60 * 5);

  if (error) {
    throw new Error(`PDF 보기 링크 생성에 실패했습니다. ${error.message}`);
  }

  return data.signedUrl;
}

export async function getLatestDocumentByRequest(
  requestId,
  documentType,
  supabase = defaultSupabase
) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("request_id", requestId)
    .eq("document_type", documentType)
    .eq("status", "issued")
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`문서 조회에 실패했습니다. ${error.message}`);
  }

  return data || null;
}

export async function getLatestDocumentByRequestAndInterpreter(
  requestId,
  interpreterId,
  documentType,
  supabase = defaultSupabase
) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("request_id", requestId)
    .eq("interpreter_id", interpreterId)
    .eq("document_type", documentType)
    .eq("status", "issued")
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`문서 조회에 실패했습니다. ${error.message}`);
  }

  return data || null;
}

export async function getDocumentsByRequest(requestId, supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("request_id", requestId)
    .order("document_type", { ascending: true })
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    const tableHint = /schema cache|relation|does not exist/i.test(error.message || "")
      ? " documents 테이블이 없습니다."
      : "";
    throw new Error(`문서 목록 조회에 실패했습니다.${tableHint} ${error.message}`);
  }

  return data || [];
}

export async function getAllDocuments(supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false })
    .order("version", { ascending: false });

  if (error) {
    const tableHint = /schema cache|relation|does not exist/i.test(error.message || "")
      ? " documents 테이블이 없습니다."
      : "";
    throw new Error(`문서 목록 조회에 실패했습니다.${tableHint} ${error.message}`);
  }

  return data || [];
}

export async function getDocumentVersions(documentNo, supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("document_no", documentNo)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`버전 기록 조회에 실패했습니다. ${error.message}`);
  }

  return data || [];
}

export async function voidDocument(documentId, userId, supabase = defaultSupabase) {
  const voidedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("documents")
    .update({
      status: "voided",
      voided_at: voidedAt,
      voided_by: userId || null,
    })
    .eq("id", documentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`폐기 처리에 실패했습니다. ${error.message}`);
  }

  return data;
}

export async function getLatestDocumentsByRequest(requestId, supabase = defaultSupabase) {
  const documents = await getDocumentsByRequest(requestId, supabase);
  const latest = {};
  documents
    .filter((document) => document.status === "issued")
    .forEach((document) => {
      if (!latest[document.document_type]) latest[document.document_type] = document;
    });
  return latest;
}

export async function getLatestPayoutDocumentsByInterpreter(
  interpreterId,
  supabase = defaultSupabase
) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("interpreter_id", interpreterId)
    .eq("document_type", "payout")
    .eq("status", "issued")
    .order("created_at", { ascending: false })
    .order("version", { ascending: false });

  if (error) {
    throw new Error(`정산서 목록 조회에 실패했습니다. ${error.message}`);
  }

  const latestByRequest = new Map();
  (data || []).forEach((document) => {
    const key = document.request_id || document.settlement_id || document.id;
    if (!latestByRequest.has(key)) latestByRequest.set(key, document);
  });

  return [...latestByRequest.values()];
}

export async function getLatestCompanyDocuments(companyId, supabase = defaultSupabase) {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("company_id", companyId)
    .in("document_type", ["estimate", "completion"])
    .eq("status", "issued")
    .order("created_at", { ascending: false })
    .order("version", { ascending: false });

  if (error) {
    throw new Error(`기업 문서함 조회에 실패했습니다. ${error.message}`);
  }

  const latestByRequestAndType = new Map();
  (data || []).forEach((document) => {
    const key = `${document.request_id || document.id}-${document.document_type}`;
    if (!latestByRequestAndType.has(key)) latestByRequestAndType.set(key, document);
  });

  return [...latestByRequestAndType.values()];
}

export async function approveEstimateForRequest({
  document,
  requestId,
  userId,
  supabase = defaultSupabase,
}) {
  const approvedAt = new Date().toISOString();
  const { error: requestError } = await supabase
    .from("requests")
    .update({
      estimate_status: "estimate_approved",
      estimate_approved_at: approvedAt,
      estimate_approved_by: userId || null,
      updated_at: approvedAt,
    })
    .eq("id", requestId);

  if (requestError) {
    throw new Error(`견적 승인 처리에 실패했습니다. ${requestError.message}`);
  }

  if (document?.id) {
    const metadata = {
      ...(document.metadata || {}),
      approved_at: approvedAt,
      approved_by: userId || null,
    };
    const { error: documentError } = await supabase
      .from("documents")
      .update({ metadata })
      .eq("id", document.id);

    if (documentError) {
      throw new Error(`견적 승인 문서 기록에 실패했습니다. ${documentError.message}`);
    }
  }
}

export function getDocumentStoragePath(documentType, ownerId, documentNo, version = 1) {
  const folderMap = {
    estimate: "estimates",
    completion: "completions",
    payout: "payouts",
  };
  const folder = folderMap[documentType] || "documents";
  const safeOwnerId = ownerId || "unassigned";
  return `${folder}/${safeOwnerId}/${documentNo}-v${version}.pdf`;
}

export async function createSimplePdfBlob({ title, subtitle = "", sections = [] }) {
  const pageWidth = 1240;
  const pageHeight = 1754;
  const margin = 80;
  const lineHeight = 36;
  const canvas = document.createElement("canvas");
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const context = canvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, pageWidth, pageHeight);
  context.fillStyle = "#111827";
  context.font = "700 48px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
  context.fillText(title, margin, 120);

  context.font = "400 24px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
  context.fillStyle = "#4b5563";
  if (subtitle) context.fillText(subtitle, margin, 162);

  context.strokeStyle = "#111827";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(margin, 195);
  context.lineTo(pageWidth - margin, 195);
  context.stroke();

  let y = 260;
  sections.forEach((section) => {
    if (y > pageHeight - 180) return;
    context.fillStyle = "#111827";
    context.font = "700 28px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
    context.fillText(section.heading, margin, y);
    y += 46;

    context.font = "400 24px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
    (section.rows || []).forEach(([label, value]) => {
      if (y > pageHeight - 110) return;
      const text = `${label}: ${value || "-"}`;
      wrapCanvasText(context, text, margin, y, pageWidth - margin * 2, lineHeight);
      y += Math.max(lineHeight, measureWrappedLineCount(context, text, pageWidth - margin * 2) * lineHeight);
    });
    y += 30;
  });

  context.fillStyle = "#6b7280";
  context.font = "400 18px system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif";
  context.fillText("ON-LI", margin, pageHeight - 70);

  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const jpegBytes = dataUrlToBytes(jpegDataUrl);
  return buildSingleImagePdf(jpegBytes, pageWidth, pageHeight);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let lineY = y;

  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
      return;
    }
    line = testLine;
  });

  if (line) context.fillText(line, x, lineY);
}

function measureWrappedLineCount(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let count = 1;
  words.forEach((word) => {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      count += 1;
      line = word;
      return;
    }
    line = testLine;
  });
  return count;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildSingleImagePdf(imageBytes, width, height) {
  const pdfParts = [];
  const offsets = [];
  const encoder = new TextEncoder();
  let position = 0;

  const append = (part) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    pdfParts.push(bytes);
    position += bytes.length;
  };

  const object = (id, contentParts) => {
    offsets[id] = position;
    append(`${id} 0 obj\n`);
    contentParts.forEach(append);
    append("\nendobj\n");
  };

  append("%PDF-1.4\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(3, [
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] `,
    "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
  ]);
  object(4, [
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} `,
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
    imageBytes,
    "\nendstream",
  ]);

  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, [`<< /Length ${content.length} >>\nstream\n${content}endstream`]);

  const xrefStart = position;
  append(`xref\n0 6\n0000000000 65535 f \n`);
  for (let id = 1; id <= 5; id += 1) {
    append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(pdfParts, { type: "application/pdf" });
}
