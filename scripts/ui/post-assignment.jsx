import { createRoot } from "react-dom/client";
import RequestChanges from "../../src/components/RequestChanges";
import MaterialAcknowledgements from "../../src/components/MaterialAcknowledgements";
import WorkflowExceptions from "../../src/components/WorkflowExceptions";
import { supabase } from "../../src/supabase";

// Local-only fixture; it cannot send production requests or email.
const role = new URLSearchParams(location.search).get("role") || "company";
const terms = { start_date: "2026-11-10", end_date: "2026-11-10", event_date: "2026-11-10", event_location: "도쿄 국제 전시장", event_start_time: "09:00", event_end_time: "17:00", work_hours: "점심 휴식 포함" };
const change = { id: "demo", status: "pending", current: true, before: terms, after: { ...terms, event_location: "도쿄 국제 전시장 동관 비즈니스 상담실" }, note: "상담 장소가 변경되어 확인을 요청드립니다.", accepted: 0, total: 2, my_status: "pending", expires_at: "2026-11-09T00:00:00Z" };
const rows = [{ request_id: "16", request_no: "ONLI-REQ-016", event_name: "한일 기업 교류 행사", company: role === "company", current_terms: terms, can_propose: true, changes: [change] }];
let acknowledged = null;
supabase.rpc = async (name) => {
  if (name === "get_my_request_changes") return { data: rows };
  if (name === "get_material_acknowledgements") return { data: [{ material_id: "1", assignment_id: "1", interpreter_name: "테스트 통역사", mine: role === "interpreter", version: "demo", acknowledged_at: acknowledged }] };
  if (name === "acknowledge_request_material") { acknowledged = new Date().toISOString(); return {}; }
  if (name === "respond_request_change") { change.my_status = "accepted"; change.accepted = 1; return { data: "pending" }; }
  if (name === "cancel_request_change") { change.status = "cancelled"; return {}; }
  if (name === "propose_request_change") { change.status = "pending"; return { data: "demo" }; }
  if (name === "get_workflow_exceptions") return { data: [{request_id:16,request_no:"ONLI-REQ-016",event_name:"한일 기업 교류 행사",type:"change_overdue",label:"조건 변경 응답 지연"},{type:"email_failed",event_name:"업무 조건 변경 안내",alert_id:"demo-alert",label:"이메일 발송 실패"}] };
  return { error: { message: "Unknown fixture RPC" } };
};
document.body.style.cssText="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;padding:16px;color:#14263a;";
createRoot(document.getElementById("root")).render(<main style={{maxWidth:900,margin:"0 auto"}}>
  <RequestChanges role={role} /><MaterialAcknowledgements requestId="16" materials={[{id:1,file_name:"행사 상담 참고자료.pdf"}]} role={role} />
  <WorkflowExceptions onOpenRequest={() => {}} />
</main>);
