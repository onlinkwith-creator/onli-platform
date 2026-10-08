import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import "./SelfServiceWorkflow.css";

export default function MaterialAcknowledgements({ requestId, materials, role }) {
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const currentRequest = useRef(requestId);
  const materialIds = materials.map((item) => String(item.id)).join(",");
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_material_acknowledgements", { p_request_id: requestId });
    if (currentRequest.current !== requestId) return;
    if (error) throw error;
    setReceipts(data || []); setError("");
  }, [requestId]);
  useEffect(() => {
    currentRequest.current = requestId;
    const start = setTimeout(() => load().catch(() => setError("자료 확인 상태를 불러오지 못했습니다.")), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load().catch(() => {}); }, 60000);
    return () => { currentRequest.current = null; clearTimeout(start); clearInterval(timer); };
  }, [load, materialIds, requestId]);
  const confirm = async (receipt) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("acknowledge_request_material", { p_material_id: receipt.material_id, p_version: receipt.version });
      if (error) throw error;
      await load();
    } catch { setError("자료가 변경되었거나 확인을 저장하지 못했습니다. 새로고침 후 최신 자료를 확인해 주세요."); }
    finally { setBusy(false); }
  };
  return <section className="self-service-workflow is-embedded" aria-label="자료 확인 상태">
    <div className="self-service-heading"><h3>자료 확인 상태</h3><button className="self-service-icon" type="button" disabled={busy} aria-label="자료 확인 새로고침" title="자료 확인 새로고침"
      onClick={() => load().catch(() => setError("상태를 불러오지 못했습니다."))}><RefreshCw size={17} /></button></div>
    {error && <p role="alert" className="self-service-notice is-error">{error}</p>}
    {receipts.length === 0 && <p className="self-service-muted">확인할 배정 자료가 없습니다.</p>}
    {receipts.filter((receipt) => materials.some((item) => String(item.id) === receipt.material_id)).map((receipt) => {
      const material = materials.find((item) => String(item.id) === receipt.material_id);
      return <div className="self-service-item" key={`${receipt.material_id}-${receipt.assignment_id}`}>
        <p>{material.original_file_name || material.file_name || "행사 자료"} · {receipt.interpreter_name}</p>
        {receipt.acknowledged_at ? <span>확인 완료 · {new Date(receipt.acknowledged_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
          : role === "interpreter" && receipt.mine ? <button type="button" disabled={busy} onClick={() => confirm(receipt)}><Check size={16} />자료 확인 완료</button>
            : <span>확인 대기</span>}
      </div>;
    })}
  </section>;
}
