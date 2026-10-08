import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Send, X } from "lucide-react";
import { supabase } from "../supabase";
import "./SelfServiceWorkflow.css";
import "./RequestChanges.css";

const labels = { pending: "전원 동의 대기", applied: "변경 반영 완료", declined: "거절 · 기존 조건 유지", cancelled: "취소 · 기존 조건 유지", expired: "만료 · 기존 조건 유지" };
const fields = [
  ["start_date", "시작일", "date"], ["end_date", "종료일", "date"],
  ["event_location", "장소", "text"], ["event_start_time", "시작 시간", "time"],
  ["event_end_time", "종료 시간", "time"], ["work_hours", "근무 시간 상세", "text"],
];
const failures = {
  CHANGE_FORBIDDEN: "이 조건 변경을 처리할 권한이 없습니다.",
  CHANGE_INVALID_TERMS: "변경할 일정·장소와 사유를 확인해 주세요. 금액은 이 화면에서 변경할 수 없습니다.",
  CHANGE_ALREADY_PENDING: "기존 변경 요청을 먼저 처리하거나 취소해 주세요.",
  CHANGE_ALREADY_RESPONDED: "이미 응답한 요청입니다. 새로고침으로 진행 상태를 확인해 주세요.",
  CHANGE_REQUEST_CLOSED: "이미 시작·종료·취소된 업무는 변경을 요청할 수 없습니다.",
  CHANGE_ADMIN_REQUIRED: "배정 계정 확인이 필요합니다. 운영팀에 문의해 주세요.",
  CHANGE_STALE: "배정이나 기존 조건이 달라졌습니다. 기업이 요청을 취소한 후 다시 보내야 합니다.",
  CHANGE_SCHEDULE_CONFLICT: "변경 일정이 통역사의 다른 확정 업무와 겹칩니다. 기존 조건은 유지됩니다.",
  CHANGE_NONCE_MISMATCH: "이전 전송 결과를 새로고침으로 확인한 뒤 다시 요청해 주세요.",
};

export default function RequestChanges({ role, onChange }) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [agreeId, setAgreeId] = useState("");
  const [checked, setChecked] = useState(false);
  const nonce = useRef(null);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_request_changes");
    if (error) throw error;
    if (mounted.current) { setRows(data || []); setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => load().catch(() => {
      if (mounted.current) { setLoading(false); setNotice({ error: true, text: "조건 변경 내역을 불러오지 못했습니다." }); }
    });
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [load]);
  const request = rows.find((row) => row.request_id === selected) || rows[0];
  const pending = request?.changes.find((change) => change.status === "pending");
  const action = async (rpc, args, text) => {
    if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const { data, error } = await supabase.rpc(rpc, args);
      if (error) throw error;
      setNotice({ error: false, text: data === "expired" ? "기한이 지나 요청이 만료되었습니다. 기존 조건은 유지됩니다." : text });
      setDraft(null); setNote(""); nonce.current = null; setAgreeId(""); setChecked(false);
      await load(); await onChange?.();
    } catch (error) {
      const code = Object.keys(failures).find((key) => error.message?.includes(key));
      setNotice({ error: true, text: failures[code] || "처리 결과를 확인하지 못했습니다. 새로고침으로 상태를 확인해 주세요." });
      await load().catch(() => {});
    } finally { if (mounted.current) setBusy(false); }
  };
  const propose = (event) => {
    event.preventDefault();
    nonce.current ||= crypto.randomUUID();
    const terms = Object.fromEntries(fields.map(([key]) => [key, draft[key]?.trim() || null]));
    terms.event_date = terms.start_date;
    void action("propose_request_change", { p_request_id: request.request_id, p_terms: terms, p_note: note.trim(), p_nonce: nonce.current }, "조건 변경 요청을 보냈습니다. 전원 동의 전에는 기존 조건이 유지됩니다.");
  };
  return <section className="self-service-workflow request-changes" aria-label="업무 조건 변경">
    <div className="self-service-heading"><h2>업무 조건 변경</h2>
      <button type="button" className="self-service-icon" title="조건 변경 새로고침" aria-label="조건 변경 새로고침" disabled={busy}
        onClick={() => load().catch(() => setNotice({ error: true, text: "내역을 불러오지 못했습니다." }))}><RefreshCw size={17} /></button>
    </div>
    {notice && <p role={notice.error ? "alert" : "status"} className={`self-service-notice${notice.error ? " is-error" : ""}`}>{notice.text}</p>}
    {loading ? <p role="status">내역을 불러오는 중입니다.</p> : !request ? <p>배정된 의뢰가 없습니다.</p> : <>
      <label className="self-service-field">의뢰 선택<select value={request.request_id} disabled={busy} onChange={(event) => {
        setSelected(event.target.value); setDraft(null); setNote(""); nonce.current = null; setAgreeId(""); setChecked(false); setNotice(null);
      }}>{rows.map((row) => <option key={row.request_id} value={row.request_id}>{row.request_no} · {row.event_name}</option>)}</select></label>
      {role === "company" && request.company && request.can_propose && !pending && (draft ? <form onSubmit={propose}>
        <div className="request-change-fields">{fields.map(([key, label, type]) => <label key={key} className="self-service-field">{label}
          <input type={type} required={["start_date", "end_date", "event_location"].includes(key)} maxLength={300} value={draft[key] || ""} disabled={busy}
            min={key === "end_date" ? draft.start_date : undefined} onChange={(event) => {
              setDraft((current) => ({ ...current, [key]: event.target.value })); nonce.current = null;
            }} /></label>)}</div>
        <label className="self-service-field">변경 사유<textarea required maxLength={1000} rows={2} value={note} disabled={busy} onChange={(event) => { setNote(event.target.value); nonce.current = null; }} /></label>
        <div className="self-service-actions"><button disabled={busy} type="submit"><Send size={16} />변경 동의 요청</button>
          <button type="button" className="is-secondary" disabled={busy} onClick={() => setDraft(null)}>닫기</button></div>
      </form> : <button type="button" onClick={() => { setDraft(request.current_terms); setNote(""); nonce.current = null; }}><Send size={16} />조건 변경 요청</button>)}
      {request.changes.length === 0 && <p className="self-service-muted">조건 변경 요청이 없습니다.</p>}
      {request.changes.map((change) => <details key={change.id} className="self-service-item" open={change.status === "pending" ? true : undefined}>
        <summary><span>{labels[change.status]}</span><span>동의 {change.accepted}/{change.total}명</span></summary>
        <p>응답 기한: {new Date(change.expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
        <div className="request-change-comparison"><div className="request-change-comparison-header"><span>항목</span><span>기존</span><span>변경 요청</span></div>
          {fields.map(([key, label]) => <div key={key}><strong>{label}</strong><span>{change.before[key] || "미등록"}</span><span>{change.after[key] || "미등록"}</span></div>)}
        </div><p className="self-service-report">변경 사유: {change.note}</p>
        {change.status === "pending" && !change.current && <p role="alert">기존 조건이나 배정이 달라져 재검토가 필요합니다. 기업이 취소한 후 다시 요청해 주세요.</p>}
        {role === "company" && change.status === "pending" && <button type="button" className="is-secondary" disabled={busy}
          onClick={() => action("cancel_request_change", { p_change_id: change.id }, "변경 요청을 취소했습니다. 기존 조건은 유지됩니다.")}><X size={16} />변경 요청 취소</button>}
        {role === "interpreter" && change.status === "pending" && change.my_status === "pending" && change.current && <div className="self-service-actions">
          {agreeId === change.id ? <><label className="self-service-check"><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => setChecked(event.target.checked)} />변경 전후 조건을 확인했습니다.</label>
            <button type="button" disabled={busy || !checked} onClick={() => action("respond_request_change", { p_change_id: change.id, p_accept: true }, "동의를 기록했습니다. 전원 동의 시 변경이 반영됩니다.")}><Check size={16} />변경 동의</button>
            <button type="button" className="is-secondary" disabled={busy} onClick={() => { setAgreeId(""); setChecked(false); }}>닫기</button></>
            : <button type="button" disabled={busy} onClick={() => { setAgreeId(change.id); setChecked(false); }}><Check size={16} />변경 내용 확인</button>}
          <button type="button" className="is-secondary" disabled={busy} onClick={() => action("respond_request_change", { p_change_id: change.id, p_accept: false }, "변경을 거절했습니다. 기존 조건은 유지됩니다.")}><X size={16} />거절</button>
        </div>}
        {change.status === "pending" && change.my_status === "accepted" && <p>동의 완료 · 다른 통역사의 응답을 기다리고 있습니다.</p>}
      </details>)}
    </>}
  </section>;
}
