import { useCallback, useEffect, useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import "./WorkflowExceptions.css";

export default function WorkflowExceptions({ onOpenRequest }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await supabase.rpc("get_workflow_exceptions");
      if (result.error) throw result.error;
      setError("");
      setItems(result.data || []);
    } catch { setError("운영 예외를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const start = setTimeout(load, 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [load]);
  return <details className="workflow-exceptions">
    <summary>운영 예외 <span>{items.length}건</span></summary>
    <button type="button" className="workflow-exception-refresh" title="운영 예외 새로고침" aria-label="운영 예외 새로고침" disabled={loading} onClick={load}><RefreshCw size={17} /></button>
    {error && <p role="alert">{error}</p>}
    <label>항목 <select value={filter} onChange={(event) => setFilter(event.target.value)}>
      <option value="all">전체</option><option value="unassigned">미배정</option><option value="conflict">일정 충돌</option>
      <option value="change_overdue">조건 변경</option><option value="review_overdue">완료 확인</option><option value="email_failed">이메일 발송</option>
    </select></label>
    {!error && items.length === 0 && <p>확인이 필요한 예외가 없습니다.</p>}
    <ul>{items.filter((item) => filter === "all" || item.type === filter).map((item, index) => <li key={`${item.alert_id || item.request_id}-${item.type}-${index}`}>
      <span>{item.label}</span><span>{item.request_no ? `${item.request_no} · ` : ""}{item.event_name}
        {item.alert_id && <small>알림 ID: {item.alert_id}</small>}</span>
      {item.request_id && <button type="button" title="의뢰 확인" aria-label={`${item.request_no} 의뢰 확인`} onClick={() => onOpenRequest(item.request_id)}><ChevronRight size={18} /></button>}
    </li>)}</ul>
  </details>;
}
