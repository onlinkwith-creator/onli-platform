import { useEffect, useState } from "react";
import { Check, ChevronDown, RefreshCw, UserRound, UserRoundCheck } from "lucide-react";
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

export default function CompanyApplicants({ requests, initialRequestId = "", onAssigned }) {
  const [selectedId, setSelectedId] = useState(String(initialRequestId));
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ requestId: "", rows: [], loading: false, error: "" });
  const [confirmId, setConfirmId] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
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
  const assignedCount = Number(rows[0]?.assigned_count || 0);
  const requiredCount = Number(rows[0]?.required_count || selected?.requested_people_count || selected?.required_count || 1);
  const full = assignedCount >= requiredCount;

  const assign = async (application) => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("assign_company_applicant", {
        p_request_id: requestId, p_application_id: application.id,
      });
      if (error) throw error;
      setConfirmId("");
      setNotice({ requestId, text: `${application.profile.name} 통역사가 배정되었습니다.`, error: false });
      setRefresh((value) => value + 1);
      onAssigned?.();
    } catch (error) {
      const messages = {
        ASSIGNMENT_CAPACITY_FULL: "필요 인원이 모두 배정되었습니다.",
        ASSIGNMENT_SCHEDULE_CONFLICT: "통역사의 다른 배정 일정과 겹칩니다. 관리자에게 문의해 주세요.",
        ASSIGNMENT_REQUEST_CLOSED: "이미 시작했거나 종료·취소된 의뢰에는 배정할 수 없습니다.",
        ASSIGNMENT_APPLICATION_UNAVAILABLE: "철회·취소·미선정된 지원자는 배정할 수 없습니다.",
        ASSIGNMENT_INTERPRETER_UNAVAILABLE: "현재 배정할 수 없는 통역사입니다.",
        ASSIGNMENT_SCHEDULE_MISSING: "행사 일정 확인이 필요합니다. 관리자에게 문의해 주세요.",
        ASSIGNMENT_ADMIN_REQUIRED: "이전 배정 기록이 있어 관리자 확인이 필요합니다.",
        ASSIGNMENT_FORBIDDEN: "이 의뢰를 배정할 권한이 없습니다.",
      };
      const key = Object.keys(messages).find((code) => error.message?.includes(code));
      setNotice({ requestId, error: true, text: messages[key] || "배정을 확인하지 못했습니다. 새로고침으로 배정 상태를 확인한 후 다시 시도해 주세요." });
      setConfirmId("");
      setRefresh((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="company-applicants" aria-labelledby="company-applicants-title">
      <div className="card-header-with-action">
        <h2 id="company-applicants-title">지원자</h2>
        <button type="button" className="btn-edit-trigger" aria-label="지원자 새로고침"
          title="지원자 새로고침" disabled={saving || loading || !selected?.job_id}
          onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </div>
      {requests.length === 0 ? <p className="loading-placeholder">등록된 의뢰가 없습니다.</p> : <>
        <label className="company-applicant-filter">
          <span>의뢰 선택</span>
          <div className="company-applicant-select-wrap">
          <select disabled={saving} value={String(requestId)} onChange={(event) => {
            setSelectedId(event.target.value); setConfirmId(""); setNotice(null);
          }}>
            {requests.map((request) => <option key={request.id} value={request.id}>
              {request.request_no || `의뢰 ${request.id}`} · {request.event_name || request.title || "통역 의뢰"}
            </option>)}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
          </div>
        </label>
        {notice?.requestId === requestId && <p className={`company-assignment-notice${notice.error ? " is-error" : ""}`}
          role={notice.error ? "alert" : "status"}>{notice.text}</p>}
        {!selected?.job_id ? <p className="loading-placeholder">공고 공개 준비 중입니다.</p>
          : loading ? <p role="status" className="loading-placeholder">지원자를 불러오는 중입니다.</p>
          : result.error ? <p role="alert">{result.error}</p>
          : rows.length === 0 ? <p className="loading-placeholder">아직 지원자가 없습니다.</p>
          : <div className="company-applicant-list">
            <p className="data-count-label">지원자 {rows.length}명 · 배정 {assignedCount}/{requiredCount}명</p>
            {rows.map((application) => {
              const profile = application.profile;
              return <article key={application.id} className="company-applicant-row">
                <div className="company-applicant-heading">
                  <UserRound size={20} aria-hidden="true" />
                  <h3>{profile?.name || "비공개 프로필"}</h3>
                  {profile?.level && <span>{profile.level}</span>}
                  <span className="company-applicant-status">{application.assigned ? "배정 완료" : STATUS_LABELS[application.status] || "상태 확인 중"}</span>
                </div>
                <p className="company-applicant-meta">{application.application_no || "-"} · {formatDate(application.created_at)}</p>
                <div className="company-applicant-actions">
                  {application.assigned ? <span className="company-applicant-assigned"><Check size={16} aria-hidden="true" />배정 완료</span>
                    : profile && ["pending", "reviewing", "accepted", "approved"].includes(application.status) && (
                      confirmId === application.id ? <div className="company-assignment-confirm">
                        <p>{profile.name} 통역사를 이 의뢰에 배정할까요?</p>
                        <div>
                          <button type="button" className="company-assign-button" disabled={saving || full || !application.assignment_open} onClick={() => assign(application)}>
                            <UserRoundCheck size={16} aria-hidden="true" />{saving ? "배정 중…" : "배정 확정"}
                          </button>
                          <button type="button" className="company-assign-cancel" disabled={saving} onClick={() => setConfirmId("")}>취소</button>
                        </div>
                      </div> : <button type="button" className="company-assign-button" disabled={saving || loading || full || !application.assignment_open}
                        onClick={() => { setConfirmId(application.id); setNotice(null); }}>
                        <UserRoundCheck size={16} aria-hidden="true" />{!application.assignment_open ? "배정 불가" : full ? "배정 정원 마감" : "배정하기"}
                      </button>
                    )}
                </div>
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
