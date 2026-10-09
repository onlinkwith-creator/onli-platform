import { POLICY_VERSION } from "../utils/policyVersion.js";

export const POLICY_ACCEPTANCE_ERROR = "약관 확인 기록을 저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.";

// This receipt records acknowledgement, not a completed registration or application.
export async function recordPolicyAcceptance(client, { action, agreements, subjectId = null }) {
  try {
    const { data, error } = await client.rpc("record_policy_acceptance", {
      p_version: POLICY_VERSION,
      p_action: action,
      p_nonce: crypto.randomUUID(),
      p_subject_id: subjectId,
      p_agreements: {
        common_terms: agreements.agreedPolicy === true,
        role_terms: agreements.agreedTerms === true,
        privacy_notice: agreements.agreedPolicy === true,
        cancel_policy: agreements.agreedCancelPolicy === true,
      },
    });
    return !error && data?.receipt_id ? { ok: true, receiptId: data.receipt_id } : { ok: false };
  } catch {
    return { ok: false };
  }
}
