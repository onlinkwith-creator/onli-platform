import { CheckCircle2, Download, ExternalLink, FileText } from "lucide-react";

export default function AdminInterpreterVerification({ interpreter, count, saving, onDownload, onUpdate, formatDateTime }) {
  const mode = interpreter.certification_mode || "auto";
  const modeLabel = mode === "manual_approved" ? "수동 인증" : mode === "manual_rejected" ? "수동 해제" : "자동";
  const updateCertification = async () => {
    const message = interpreter.approved
      ? "이 통역사의 ON-LI 인증을 해제하시겠습니까?"
      : "이 통역사에게 ON-LI 인증을 부여하시겠습니까?";
    if (window.confirm(message)) {
      await onUpdate(interpreter.id, {
        certification_mode: interpreter.approved ? "manual_rejected" : "manual_approved",
      }, { showSuccess: true });
    }
  };

  return <section className="admin-interpreter-verification-card" aria-label="이력서 및 인증 관리">
    <section className="admin-interpreter-resume-section" aria-labelledby="interpreter-resume-title">
      <h3 id="interpreter-resume-title"><FileText size={18} aria-hidden="true" /> 지원자 이력서</h3>
      <p className="interpreter-verification-muted">
        {interpreter.resume_file_url ? "지원한 의뢰의 기업에서 조회 가능" : "등록된 이력서 없음"}
      </p>
      <div className="interpreter-resume-file">
        <div>
          <strong>{interpreter.resume_file_name || (interpreter.resume_file_url ? "이력서 파일" : "제출된 이력서가 없습니다.")}</strong>
          {interpreter.resume_submitted_at && <p className="interpreter-verification-muted">제출 일시: {formatDateTime(interpreter.resume_submitted_at)}</p>}
        </div>
        {interpreter.resume_file_url && <button type="button" className="admin-small-button" onClick={() => onDownload(interpreter.resume_file_url)}>
          <Download size={16} aria-hidden="true" /> 다운로드
        </button>}
      </div>
      {interpreter.resume_url && <a className="interpreter-portfolio-link" href={interpreter.resume_url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" /> 포트폴리오 보기
      </a>}
    </section>
    <section className="admin-interpreter-certification-section" aria-labelledby="interpreter-certification-title">
      <div className="interpreter-certification-heading">
        <h3 id="interpreter-certification-title"><CheckCircle2 size={18} aria-hidden="true" /> ON-LI 인증 관리</h3>
        <span className={`status-badge ${interpreter.approved ? "verified" : "unsubmitted"}`}>
          {interpreter.approved ? "ON-LI 인증 완료" : "일반 등록"}
        </span>
      </div>
      <dl className="interpreter-certification-facts">
        <div><dt>완료한 업무</dt><dd>{count}<span> / 5회</span></dd></div>
        <div><dt>인증 조건</dt><dd>{count >= 5 ? "충족" : "미충족"}</dd></div>
        <div><dt>인증 방식</dt><dd>{modeLabel}</dd></div>
      </dl>
      <p className="interpreter-verification-muted">실제 업무 5회 완료 시 자동 인증됩니다. 테스트·취소·노쇼와 동일 의뢰의 중복 수행은 제외됩니다.</p>
      <p className="interpreter-verification-muted">정산대기는 수행 횟수에 포함되지 않으며, 수동 해제는 자동 인증보다 우선합니다.</p>
      <div className="interpreter-certification-controls">
        <button type="button" className={`admin-small-button ${interpreter.approved ? "interpreter-certification-revoke" : "interpreter-certification-grant"}`} disabled={saving} onClick={updateCertification}>
          {interpreter.approved ? "인증 해제" : "수동 인증"}
        </button>
        {mode !== "auto" && <button type="button" className="admin-small-button" disabled={saving} onClick={() => onUpdate(interpreter.id, { certification_mode: "auto" })}>자동으로 복귀</button>}
      </div>
    </section>
  </section>;
}
