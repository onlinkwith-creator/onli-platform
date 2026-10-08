import { useEffect, useState } from "react";
import { Bell, Mail, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import "./AdminAlertPreferences.css";

const alertTypes = [
  ["admin_action_interpreter", "신규 통역사 등록"],
  ["admin_action_company", "신규 기업 등록"],
  ["admin_action_request", "신규 기업 의뢰"],
  ["admin_action_workflow", "미배정 · 완료 지연 · 일정 충돌"],
  ["admin_action_application", "신규 공고 지원자"],
  ["admin_action_resume", "이력서 제출·교체"],
  ["admin_action_documents", "정산 서류 변경"],
  ["admin_action_estimate", "기업 견적 승인"],
];

export default function AdminAlertPreferences() {
  const [preferences, setPreferences] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => {
    let active = true;
    supabase.rpc("get_admin_alert_preferences").then(({ data, error: loadError }) => {
      if (!active) return;
      if (loadError) setError("알림 설정을 불러오지 못했습니다.");
      else setPreferences(data);
    }).catch(() => { if (active) setError("알림 설정을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, []);

  async function change(next) {
    if (busy) return;
    setBusy(true); setError(""); setResult("");
    try {
      const { data, error: saveError } = await supabase.rpc("set_admin_alert_preferences", {
        p_enabled: next.enabled, p_event_types: next.event_types,
      });
      if (saveError) throw saveError;
      setPreferences(data);
      setResult("저장됨");
    } catch { setError("변경 내용을 저장하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  return (
    <section className="admin-alert-preferences" aria-label="관리자 이메일 알림">
      <div className="admin-alert-preferences-heading">
        <h3><Bell size={18} aria-hidden="true" /> 이메일 알림</h3>
        <span role="status" className="admin-alert-save-state">{busy ? "저장 중" : result}</span>
      </div>
      {preferences ? <>
        <p className="admin-alert-recipient"><Mail size={16} aria-hidden="true" />{preferences.recipient_email}</p>
        <label className="admin-alert-setting admin-alert-master">
          <span>자동 알림 전체</span>
          <input type="checkbox" role="switch" aria-label="자동 알림 전체"
            checked={preferences.enabled} disabled={busy}
            onChange={(event) => change({ ...preferences, enabled: event.target.checked })} />
          <span className="admin-alert-switch" aria-hidden="true" />
          <span className="admin-alert-toggle-label">{preferences.enabled ? "켜짐" : "꺼짐"}</span>
        </label>
        <div className="admin-alert-type-settings">
          {alertTypes.map(([key, label]) => (
            <label key={key} className="admin-alert-setting">
              <span>{label}</span>
              <input type="checkbox" role="switch" aria-label={`${label} 알림`}
                checked={preferences.event_types[key]} disabled={busy || !preferences.enabled}
                onChange={(event) => change({ ...preferences,
                  event_types: { ...preferences.event_types, [key]: event.target.checked } })} />
              <span className="admin-alert-switch" aria-hidden="true" />
            </label>
          ))}
        </div>
      </> : !error && <p className="admin-alert-loading"><RefreshCw size={16} aria-hidden="true" /> 불러오는 중</p>}
      {error && <p className="admin-alert-error" role="alert">{error}</p>}
    </section>
  );
}
