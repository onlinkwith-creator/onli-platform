import assert from "node:assert/strict";
import { loadPolicyBundle } from "./lib/loadPolicyBundle.mjs";

const policies = await loadPolicyBundle();
for (const [key, policy] of Object.entries(policies.POLICY_PAGES)) {
  const ids = policy.sections.map((section) => section.id || section.title);
  assert.equal(new Set(ids).size, ids.length, `${key}: duplicate anchor`);
  const html = policies.renderPolicy(key);
  assert.ok(html.includes(policy.title), `${key}: missing title`);
  assert.ok(html.includes("2026.10.09"), `${key}: missing update date`);
  assert.ok(html.includes(policies.POLICY_VERSION), `${key}: missing document version`);
  for (const section of policy.sections) {
    assert.ok(section.items.length > 0, `${key}: empty section`);
    assert.ok(html.includes(section.title), `${key}: missing section`);
  }
}
const common = policies.POLICY_PAGES.commonTerms.sections.flatMap((section) => section.items).join("\n");
assert.ok(common.includes("시스템에 배정 확정으로 정상 기록된 때"));
assert.ok(common.includes("미수락 요청의 거절·철회·기한 만료"));
assert.ok(common.includes("입금·지급은 ON-LI 관리자가 별도로"));
assert.ok(common.includes("사업자등록번호: 141-15-02905"));
assert.ok(common.includes("대표자: 손운하 외 1명 / 공동사업자: 강상인"));
assert.ok(common.includes("기업과 통역사 사이의 행사별 업무 계약"));
assert.ok(common.includes("학생 신분, 단기 일정, 아르바이트"));
assert.ok(common.includes("신고·등록·허가를 대체하지 않습니다"));
assert.ok(common.includes("징계·보수 삭감·해고를 일방적으로 결정"));
assert.ok(!common.includes("독립적으로 수행하는 용역"));
assert.ok(!/최대 (30|50|80|100)% 위약금/.test(common));
assert.ok(common.includes("일률적인 비율의 위약금 또는 손해배상 예정액을 부과하지 않습니다"));
for (const key of ["commonTerms", "interpreterPolicy", "clientPolicy"]) {
  const text = policies.POLICY_PAGES[key].sections.flatMap((section) => section.items).join("\n");
  assert.ok(text.includes("실제 업무 8시간"), `${key}: missing day-rate basis`);
  assert.ok(text.includes("식비·교통비"), `${key}: missing included expenses`);
  assert.ok(text.includes("일급을 8로 나눈"), `${key}: incorrect overtime calculation`);
  assert.ok(text.includes("시간외·야간·휴일 가산"), `${key}: statutory supplements must prevail`);
}
const interpreterText = policies.POLICY_PAGES.interpreterPolicy.sections.flatMap((section) => section.items).join("\n");
assert.ok(interpreterText.includes("다른 아르바이트를 합산하여 주 28시간"));
assert.ok(interpreterText.includes("1일 8시간 이내"));
assert.ok(interpreterText.includes("자격외활동 허가"));
assert.ok(!interpreterText.includes("독립적인 통역 활동자"));
for (const key of ["commonTerms", "interpreterPolicy"]) {
  const text = policies.POLICY_PAGES[key].sections.flatMap((section) => section.items).join("\n");
  assert.ok(text.includes("마지막 수행일 다음 날부터 계산하여 30일 이내"), `${key}: missing payment deadline`);
  assert.ok(text.includes("영업일이 아닌 달력일"), `${key}: ambiguous day count`);
  assert.ok(text.includes("지급 기한을 연장하지 않습니다"), `${key}: customer nonpayment must not extend deadline`);
  assert.ok(text.includes("법령상 더 이른 지급 기한"), `${key}: statutory payment deadline must prevail`);
  assert.ok(text.includes("자체 자금으로 위 지급보장 의무"), `${key}: missing funded payment guarantee`);
}
const privacy = policies.POLICY_PAGES.privacy.sections.flatMap((section) => section.items).join("\n");
assert.ok(privacy.includes("개인정보처리자: 온리(ON-LI)"));
assert.ok(!common.includes("운영팀의 최종 매칭 안내를 받은 시점"));
assert.ok(policies.POLICY_PAGES.commonTerms.sections.some((section) => section.id === "cancel-policy"));
const refund = policies.POLICY_PAGES.refundPolicy.sections.flatMap((section) => section.items).join("\n");
assert.ok(!refund.includes("원금 환불이 사실상 불가"));
assert.ok(!refund.includes("전액 소멸 처리"));
assert.ok(!refund.includes("비용의 일부가 취소 수수료로 격리"));
assert.ok(refund.includes("통역사의 취소·노쇼 또는 ON-LI의 귀책사유"));
assert.ok(refund.includes("배정·일정별로 수행 여부를 구분"));
assert.ok(refund.includes("사전에 합의되지 않은 비용"));
assert.ok(refund.includes("외부 분쟁 해결 절차를 제한하지"));
const client = policies.renderAgreement("client");
const interpreter = policies.renderAgreement("interpreter");
assert.ok(client.includes('href="/refund-policy"'));
assert.ok(!client.includes('href="/terms#cancel-policy"'));
assert.ok(interpreter.includes('href="/terms#cancel-policy"'));
assert.ok(!interpreter.includes('href="/refund-policy"'));
assert.ok(client.includes("별도 동의가 필요한 개인정보"));
assert.equal(policies.areTermsAgreed(policies.initialTermsAgreement), false);
const agreed = { agreedPolicy: true, agreedTerms: true, agreedCancelPolicy: false };
assert.equal(policies.areTermsAgreed(agreed), true);
assert.equal(policies.areTermsAgreed(agreed, { requireCancelPolicy: true }), false);
assert.equal(policies.areTermsAgreed({ ...agreed, agreedCancelPolicy: true }, { requireCancelPolicy: true }), true);
console.log("Policy rendering, anchors, role-specific links and agreement validation passed.");
