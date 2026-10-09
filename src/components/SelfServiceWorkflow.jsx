import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Send, UserRoundCheck, X } from "lucide-react";
import { supabase } from "../supabase";
import { POLICY_ACCEPTANCE_ERROR, recordPolicyAcceptance } from "../services/policyAcceptance";
import "./SelfServiceWorkflow.css";

const LABELS = { pending: "수락 대기", accepted: "배정 확정", declined: "거절", expired: "만료", cancelled: "취소",
  not_submitted: "완료 제출 전", submitted: "기업 확인 대기", confirmed: "완료 확인", revision_requested: "수정 요청" };

export default function SelfServiceWorkflow({ role, onChange, embedded = false }) {
  const [offers, setOffers] = useState([]);
  const [work, setWork] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [reports, setReports] = useState({});
  const [notes, setNotes] = useState({});
  const [confirmation, setConfirmation] = useState("");
  const [checked, setChecked] = useState(false);
  const [history, setHistory] = useState(false);
  const [discovery, setDiscovery] = useState(false);
  const [preferenceBusy, setPreferenceBusy] = useState(false);

  useEffect(() => {
    if (role !== "interpreter") return;
    let active = true;
    supabase.rpc("get_my_discovery_alerts").then(({ data, error }) => {
      if (active && !error) setDiscovery(Boolean(data));
    });
    return () => { active = false; };
  }, [role]);

  const toggleDiscovery = async (enabled) => {
    setPreferenceBusy(true);
    try {
      const { error } = await supabase.rpc("set_my_discovery_alerts", { p_enabled: enabled });
      if (error) throw error;
      setDiscovery(enabled);
    } catch {
      setNotice({ error: true, text: "공고 알림 설정을 저장하지 못했습니다." });
    } finally { setPreferenceBusy(false); }
  };

  const load = useCallback(async () => {
    const [offerResult, workResult] = await Promise.all([
      supabase.rpc("get_my_assignment_offers"), supabase.rpc("get_my_work_completions"),
    ]);
    if (offerResult.error || workResult.error) throw new Error("load");
    setOffers(offerResult.data || []);
    setWork(workResult.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => load().catch(() => {
      if (active) { setLoading(false); setNotice({ error: true, text: "업무 상태를 불러오지 못했습니다. 다시 확인해 주세요." }); }
    });
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [load]);

  const action = async (key, rpc, args, success) => {
    if (busy) return;
    setBusy(key); setNotice(null);
    try {
      let actionArgs = args;
      if (rpc === "respond_assignment_offer" && args.p_accept === true) {
        if (!checked) throw new Error(POLICY_ACCEPTANCE_ERROR);
        const acceptance = await recordPolicyAcceptance(supabase, {
          action: "assignment_acceptance",
          subjectId: args.p_offer_id,
          agreements: { agreedPolicy: checked, agreedTerms: checked, agreedCancelPolicy: checked },
        });
        if (!acceptance.ok) throw new Error(POLICY_ACCEPTANCE_ERROR);
        actionArgs = { ...args, p_policy_receipt_id: acceptance.receiptId };
      }
      const { data, error } = await supabase.rpc(rpc, actionArgs);
      if (error) throw error;
      setNotice({ error: false, text: data?.status === "expired" ? "수락 기한이 지나 요청이 만료되었습니다." : success });
      setConfirmation(""); setChecked(false);
      await load();
      await onChange?.();
    } catch (error) {
      const messages = {
        WORKFLOW_FORBIDDEN: "이 업무를 처리할 권한이 없습니다.",
        WORKFLOW_OFFER_CLOSED: "이미 처리되거나 만료된 요청입니다.",
        WORKFLOW_TERMS_CHANGED: "업무 조건이 변경되었습니다. 기업에 요청 취소 후 재전송을 요청해 주세요.",
        ASSIGNMENT_SCHEDULE_CONFLICT: "기존 배정 일정과 겹쳐 수락할 수 없습니다.",
        ASSIGNMENT_CAPACITY_FULL: "필요 인원이 모두 배정되었습니다.",
        ASSIGNMENT_APPLICATION_UNAVAILABLE: "지원 상태가 변경되어 배정할 수 없습니다.",
        ASSIGNMENT_INTERPRETER_UNAVAILABLE: "현재 활동 상태로는 배정할 수 없습니다.",
        ASSIGNMENT_REQUEST_CLOSED: "취소되거나 시작·종료된 의뢰입니다.",
        WORKFLOW_EVENT_NOT_FINISHED: "행사 종료 이후 완료를 제출할 수 있습니다.",
        WORKFLOW_REPORT_REQUIRED: "업무 완료 내용을 입력해 주세요.",
        WORKFLOW_REVIEW_NOTE_REQUIRED: "수정이 필요한 내용을 입력해 주세요.",
      };
      const code = Object.keys(messages).find((value) => error.message?.includes(value));
      setNotice({ error: true, text: messages[code] || (error.message === POLICY_ACCEPTANCE_ERROR ? POLICY_ACCEPTANCE_ERROR : "처리 결과를 확인하지 못했습니다. 새로고침으로 상태를 확인한 후 다시 시도해 주세요.") });
      await load().catch(() => {});
    } finally { setBusy(""); }
  };

  const pendingOffers = offers.filter((offer) => history || offer.status === "pending");
  return <section className={`self-service-workflow${embedded ? " is-embedded" : ""}`} aria-label="업무 진행 확인">
    <div className="self-service-heading">
      <h2>{role === "interpreter" ? "배정 요청 · 업무 완료" : "업무 완료 확인"}</h2>
      <button type="button" className="self-service-icon" aria-label="업무 상태 새로고침" title="업무 상태 새로고침" disabled={Boolean(busy)}
        onClick={() => load().catch(() => setNotice({ error: true, text: "상태를 불러오지 못했습니다." }))}><RefreshCw size={17} /></button>
    </div>
    {notice && <p role={notice.error ? "alert" : "status"} className={`self-service-notice${notice.error ? " is-error" : ""}`}>{notice.text}</p>}
    {loading ? <p role="status">업무 상태를 불러오는 중입니다.</p> : <>
      {role === "interpreter" && <div className="self-service-offers">
        <label className="self-service-check"><input type="checkbox" checked={discovery} disabled={preferenceBusy}
          onChange={(event) => toggleDiscovery(event.target.checked)} />새 공고 · 재모집 이메일 알림</label>
        <div className="self-service-heading"><h3>배정 요청</h3>
          <label className="self-service-history"><input type="checkbox" checked={history} onChange={(event) => setHistory(event.target.checked)} />지난 요청</label>
        </div>
        {pendingOffers.length === 0 && <p className="self-service-muted">대기 중인 배정 요청이 없습니다.</p>}
        {pendingOffers.map((offer) => <article key={offer.id} className="self-service-item">
          <div className="self-service-heading"><h4>{offer.terms.event_name}</h4><span>{LABELS[offer.status]}</span></div>
          <p>{offer.company_name} · {offer.terms.start_date} ~ {offer.terms.end_date}</p>
          <dl className="self-service-terms">
            <div><dt>장소</dt><dd>{offer.terms.location || "미등록"}</dd></div>
            <div><dt>근무 시간</dt><dd>{offer.terms.start_time && offer.terms.end_time ? `${offer.terms.start_time} ~ ${offer.terms.end_time}` : offer.terms.work_hours || "별도 협의"}</dd></div>
            <div><dt>전체 일정 세전 보수</dt><dd>{Number(offer.amount).toLocaleString("ko-KR")}원</dd></div>
            <div><dt>수락 기한</dt><dd>{formatTime(offer.expires_at)}</dd></div>
          </dl>
          {offer.status === "pending" && <div className="self-service-actions">
            {confirmation === offer.id ? <>
              <label className="self-service-check"><input type="checkbox" checked={checked} disabled={Boolean(busy)} onChange={(event) => setChecked(event.target.checked)} /><span>일정·업무 조건·세전 보수를 확인하고 <a href="/terms" target="_blank" rel="noreferrer">이용약관</a>·<a href="/interpreter-policy" target="_blank" rel="noreferrer">통역사 약관</a>·<a href="/terms#cancel-policy" target="_blank" rel="noreferrer">취소 규정</a>에 동의하며, <a href="/privacy" target="_blank" rel="noreferrer">개인정보처리방침</a>을 확인했습니다.</span></label>
              <button type="button" disabled={Boolean(busy) || !checked} onClick={() => action(offer.id,"respond_assignment_offer",{p_offer_id:offer.id,p_accept:true},"배정이 확정되었습니다.")}><Check size={16} />수락하여 배정 확정</button>
              <button type="button" className="is-secondary" disabled={Boolean(busy)} onClick={() => { setConfirmation(""); setChecked(false); }}>닫기</button>
            </> : <>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setConfirmation(offer.id); setChecked(false); }}><UserRoundCheck size={16} />수락</button>
              <button type="button" className="is-secondary" disabled={Boolean(busy)} onClick={() => action(offer.id,"respond_assignment_offer",{p_offer_id:offer.id,p_accept:false},"배정 요청을 거절했습니다.")}><X size={16} />거절</button>
            </>}
          </div>}
        </article>)}
      </div>}
      <h3>{role === "interpreter" ? "업무 완료 제출" : "배정 업무"}</h3>
      {work.length === 0 && <p className="self-service-muted">배정된 업무가 없습니다.</p>}
      {work.map((item) => <details key={item.assignment_id} className="self-service-item">
        <summary><span>{item.event_name} · {item.interpreter_name}</span><span>{LABELS[item.status]}</span></summary>
        <p>{item.assignment_no || item.request_no} · {item.start_date} ~ {item.end_date}</p>
        {item.agreed_total_amount != null && <p>전체 일정 세전 보수: {Number(item.agreed_total_amount).toLocaleString("ko-KR")}원</p>}
        {item.report && <p className="self-service-report">{item.report}</p>}
        {item.review_note && <p className="self-service-notice is-error">수정 요청: {item.review_note}</p>}
        {role === "interpreter" && ["not_submitted","revision_requested"].includes(item.status) && <>
          <label className="self-service-field">업무 완료 내용<textarea maxLength={2000} rows={3} value={reports[item.assignment_id] || ""}
            disabled={Boolean(busy) || !item.can_submit} onChange={(event) => setReports((current) => ({...current,[item.assignment_id]:event.target.value}))} /></label>
          <button type="button" disabled={Boolean(busy) || !item.can_submit || !reports[item.assignment_id]?.trim()}
            onClick={() => action(String(item.assignment_id),"submit_assignment_completion",{p_assignment_id:item.assignment_id,p_report:reports[item.assignment_id]},"완료 내용을 제출했습니다. 기업 확인 대기 중입니다.")}><Send size={16} />{item.can_submit ? "완료 제출" : "행사 종료 후 제출 가능"}</button>
        </>}
        {role === "company" && item.status === "submitted" && <>
          <label className="self-service-field">수정 요청 내용<textarea maxLength={2000} rows={2} value={notes[item.assignment_id] || ""}
            disabled={Boolean(busy)} onChange={(event) => setNotes((current) => ({...current,[item.assignment_id]:event.target.value}))} /></label>
          <div className="self-service-actions">
            {confirmation === `work-${item.assignment_id}` ? <>
              <p>이 통역사의 업무 완료를 확인할까요?</p>
              <button type="button" disabled={Boolean(busy)} onClick={() => action(String(item.assignment_id),"review_assignment_completion",{p_assignment_id:item.assignment_id,p_confirm:true,p_note:""},"업무 완료를 확인했습니다.")}><Check size={16} />완료 확정</button>
              <button type="button" className="is-secondary" disabled={Boolean(busy)} onClick={() => setConfirmation("")}>닫기</button>
            </> : <button type="button" disabled={Boolean(busy)} onClick={() => setConfirmation(`work-${item.assignment_id}`)}><Check size={16} />완료 확인</button>}
            <button type="button" className="is-secondary" disabled={Boolean(busy) || !notes[item.assignment_id]?.trim()}
              onClick={() => action(String(item.assignment_id),"review_assignment_completion",{p_assignment_id:item.assignment_id,p_confirm:false,p_note:notes[item.assignment_id]},"수정을 요청했습니다.")}>수정 요청</button>
          </div>
        </>}
      </details>)}
    </>}
  </section>;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",dateStyle:"short",timeStyle:"short"}).format(date);
}
