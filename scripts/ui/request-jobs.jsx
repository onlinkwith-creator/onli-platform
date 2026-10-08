import { useState } from "react";
import { createRoot } from "react-dom/client";
import RequestJobManagement from "../../src/components/RequestJobManagement";
import { supabase } from "../../src/supabase";

// Development-only fixture. All writes stay in memory.
const request = { id: 16, job_id: "job-a", request_no: "ONLI-REQ-016", company_name: "테스트 기업", event_name: "한일 비즈니스 상담회" };
const job = { id: "job-a", request_id: 16, job_no: "ONLI-REQ-016-1", title: request.event_name, company_name: request.company_name, location: "도쿄", start_date: "2026-11-10", end_date: "2026-11-10", people: 2, level: 3, visibility: "private", status: "recruiting" };
supabase.auth.getUser = async () => ({ data: { user: { id: "fixture" } } });
supabase.from = (table) => ({
  update: (changes) => ({ eq: async () => { if (table === "jobs") Object.assign(job, changes); return {}; } }),
  insert: async () => ({}),
});
export default function Fixture() {
  const [tab, setTab] = useState("jobs");
  const [, refresh] = useState(0);
  const mode = new URLSearchParams(location.search).get("mode");
  return <div className="admin-page"><div className="admin-modal-overlay"><section className="admin-modal-card admin-request-detail-modal" role="dialog" aria-label="의뢰 상세" onKeyDown={(event) => { if (event.key === "Escape") setTab("closed"); }}>
    <div className="admin-modal-head"><div><span className="admin-card-meta">REQUEST DETAIL</span><h2>{request.event_name}</h2><p>{request.request_no}</p></div></div>
    <div className="admin-modal-body"><div className="admin-detail-tabs" role="tablist">
      {[['basic','기본 정보'],['jobs','공고 관리'],['operation','운영 정보'],['documents','문서'],['memo','메모 · 이력']].map(([id,label]) => <button key={id} role="tab" aria-selected={tab===id} className={`admin-detail-tab-btn${tab===id?' is-active':''}`} onClick={()=>setTab(id)}>{label}</button>)}
    </div><div className="admin-detail-tab-content admin-request-job-tab">
      {tab === "jobs" ? <RequestJobManagement request={mode === "empty" ? {...request,job_id:null}:request} jobs={mode === "empty" ? [] : [job,{id:'other',request_id:99,title:'다른 의뢰'}]} requests={mode === "conflict" ? [request,{id:99,job_id:'job-a'}]:[request]}
        applications={[{id:'app-a',job_id:'job-a',applicant_name:'테스트 통역사',status:'pending',created_at:'2026-10-08'}, {id:'app-other',job_id:'other',applicant_name:'다른 의뢰 지원자'}]}
        onDataChanged={() => refresh((value)=>value+1)} onPublish={()=>{}} updateApplicationStatus={()=>{}} /> : <p>{tab === "closed" ? "상세 닫힘" : "다른 탭"}</p>}
    </div></div>
  </section></div></div>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
