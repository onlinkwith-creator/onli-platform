import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw, UserRound } from "lucide-react";
import { supabase } from "../supabase";
import "./CompanyApplicants.css";
import CompanyApplicantResume from "./CompanyApplicantResume";

const STATUS_LABELS = {
  pending: "지원 접수", reviewing: "검토 중", accepted: "매칭 확정",
  approved: "매칭 확정", rejected: "미선정", withdrawn: "지원 철회",
  cancelled: "지원 취소",
};

function listText(value) {
  return Array.isArray(value) ? value.filter(Boolean).join(" / ") : String(value || "-");
}

export default function CompanyApplicants({ requests, initialRequestId = "" }) {
  const [selectedId, setSelectedId] = useState(String(initialRequestId));
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ requestId: "", rows: [], loading: false, error: "" });
  const selected = requests.find((request) => String(request.id) === selectedId) || requests[0];
  const requestId = selected?.id;

  useEffect(() => {
    let current = true;
    const load = async () => {
      setResult({ requestId, rows: [], loading: true, error: "" });
      if (!requestId || !selected?.job_id) {
        if (current) setResult({ requestId, rows: [], loading: false, error: "" });
        return;
      }
      try {
        const { data, error } = await supabase.rpc("get_company_portal_applicants", {
          p_request_id: requestId,
        });
        if (error) throw error;
        if (current) setResult({ requestId, rows: data || [], loading: false, error: "" });
      } catch {
        if (current) setResult({ requestId, rows: [], loading: false,
          error: "지원자를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
    };
    queueMicrotask(load);
    return () => { current = false; };
  }, [requestId, selected?.job_id, refresh]);

  const loading = result.loading || result.requestId !== requestId;
  const rows = result.requestId === requestId ? result.rows : [];

  return (
    <section className="company-applicants" aria-labelledby="company-applicants-title">
      <div className="card-header-with-action">
        <h2 id="company-applicants-title">지원자</h2>
        <button type="button" className="btn-edit-trigger" aria-label="지원자 새로고침"
          title="지원자 새로고침" disabled={loading || !selected?.job_id}
          onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {requests.length === 0 ? <p className="loading-placeholder">등록된 의뢰가 없습니다.</p> : <>
        <label className="company-applicant-filter">
          <span>의뢰 선택</span>
          <div className="company-applicant-select-wrap">
          <select value={String(requestId)} onChange={(event) => setSelectedId(event.target.value)}>
            {requests.map((request) => <option key={request.id} value={request.id}>
              {request.request_no || `의뢰 ${request.id}`} · {request.event_name || request.title || "통역 의뢰"}
            </option>)}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
          </div>
        </label>
        {!selected?.job_id ? <p className="loading-placeholder">공고 공개 준비 중입니다.</p>
          : loading ? <p role="status" className="loading-placeholder">지원자를 불러오는 중입니다.</p>
          : result.error ? <p role="alert">{result.error}</p>
          : rows.length === 0 ? <p className="loading-placeholder">아직 지원자가 없습니다.</p>
          : <div className="company-applicant-list">
            <p className="data-count-label">총 {rows.length}명</p>
            {rows.map((application) => {
              const profile = application.profile;
              return <article key={application.id} className="company-applicant-row">
                <div className="company-applicant-heading">
                  <UserRound size={20} aria-hidden="true" />
                  <h3>{profile?.name || "비공개 프로필"}</h3>
                  {profile?.level && <span>{profile.level}</span>}
                  <span className="company-applicant-status">{STATUS_LABELS[application.status] || "상태 확인 중"}</span>
                </div>
                <p className="company-applicant-meta">{application.application_no || "-"} · {formatDate(application.created_at)}</p>
                {profile ? <details>
                  <summary>프로필 보기 <ChevronDown size={16} aria-hidden="true" /></summary>
                  <dl className="company-applicant-profile">
                    <div><dt>전문 분야</dt><dd>{listText(profile.specialties)}</dd></div>
                    <div><dt>활동 지역</dt><dd>{listText(profile.available_regions || profile.region)}</dd></div>
                    <div><dt>통역 경험</dt><dd>{profile.experience_count == null ? "-" : `${profile.experience_count}회`}</dd></div>
                    <div className="company-applicant-intro"><dt>자기소개</dt><dd>{profile.short_intro || "등록된 자기소개가 없습니다."}</dd></div>
                  </dl>
                  <CompanyApplicantResume applicationId={application.id} />
                </details> : <p>현재 공개되지 않은 프로필입니다.</p>}
              </article>;
            })}
          </div>}
      </>}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "접수일 미등록";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "접수일 미등록" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
