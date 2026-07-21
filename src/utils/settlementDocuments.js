export const SETTLEMENT_DOCUMENT_TYPES = {
  settlement_statement: { label: "기업용 정산서", prefix: "ONLI-STM" },
  payout_statement: { label: "통역사용 지급명세서", prefix: "ONLI-PAY" },
};

export async function generateSettlementDocument(supabase, payload) {
  const { data, error } = await supabase.functions.invoke("generate-settlement-document", {
    body: payload,
  });
  if (error) throw new Error(error.message || "문서 생성 서버를 호출하지 못했습니다.");
  if (!data?.document) throw new Error(data?.error || "문서 생성 결과가 없습니다.");
  return data.document;
}

export function latestStatement(documents, type, requestId, interpreterId = null) {
  return documents
    .filter((doc) => doc.document_type === type && String(doc.request_id) === String(requestId)
      && (type !== "payout_statement" || String(doc.interpreter_id) === String(interpreterId)))
    .sort((a, b) => Number(b.version || 1) - Number(a.version || 1) || String(b.issued_at || b.created_at).localeCompare(String(a.issued_at || a.created_at)))[0] || null;
}
