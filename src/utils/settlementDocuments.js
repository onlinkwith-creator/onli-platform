export const SETTLEMENT_DOCUMENT_TYPES = {
  settlement_statement: { label: "기업용 정산서", prefix: "ONLI-STM" },
  payout_statement: { label: "통역사용 지급명세서", prefix: "ONLI-PAY" },
};

export async function generateSettlementDocument(supabase, payload) {
  const { data, error } = await supabase.functions.invoke("generate-settlement-document", {
    body: payload,
  });
  if (error) {
    let details = null;
    try {
      const response = error.context;
      if (response?.clone) {
        const text = await response.clone().text();
        try {
          details = JSON.parse(text);
        } catch {
          details = text;
        }
      }
    } catch {
      details = null;
    }
    console.error("Settlement document generation failed", { error, details, payload });
    throw new Error(
      details?.error || details?.message || (typeof details === "string" && details)
        || error.message || "정산서 생성에 실패했습니다."
    );
  }
  if (!data?.document) throw new Error(data?.error || "문서 생성 결과가 없습니다.");
  return data.document;
}

export function latestStatement(documents, type, requestId, interpreterId = null) {
  return documents
    .filter((doc) => doc.document_type === type && String(doc.request_id) === String(requestId)
      && (type !== "payout_statement" || String(doc.interpreter_id) === String(interpreterId)))
    .sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || String(b.issued_at || b.created_at).localeCompare(String(a.issued_at || a.created_at)))[0] || null;
}
