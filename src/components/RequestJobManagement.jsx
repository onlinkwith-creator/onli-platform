import { Plus, RefreshCw } from "lucide-react";
import AdminJobs from "../pages/AdminJobs";
import { getRequestJobScope } from "../utils/requestJobScope";
import "./RequestJobManagement.css";

export default function RequestJobManagement({ request, jobs, requests, onPublish, saving, onDataChanged, ...props }) {
  const scope = getRequestJobScope(request, jobs, requests);
  return <section className="request-job-management" aria-label="의뢰 공고 관리">
    <div className="request-job-heading">
      <h3>공고 관리</h3>
      <button type="button" className="admin-link-button" title="공고 새로고침" aria-label="공고 새로고침" disabled={saving}
        onClick={onDataChanged}><RefreshCw size={17} /></button>
    </div>
    {scope.error ? <p role="alert" className="admin-empty-text is-error">{scope.error}</p>
      : scope.jobs.length === 0 ? <div className="request-job-empty">
        <p>등록된 공고가 없습니다.</p>
        <button type="button" className="admin-save" disabled={saving} onClick={() => {
          if (window.confirm("이 의뢰 내용으로 공고를 등록하고 공개하시겠습니까?")) void onPublish(request, true);
        }}><Plus size={17} />공고 등록 · 공개</button>
      </div> : <AdminJobs key={request.id} embedded requestScoped jobs={scope.jobs} requests={[request]}
        onDataChanged={onDataChanged} {...props} />}
  </section>;
}
