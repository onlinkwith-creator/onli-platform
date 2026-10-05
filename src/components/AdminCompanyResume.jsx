import { useEffect, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { supabase } from "../supabase";
import "./AdminCompanyResume.css";

export default function AdminCompanyResume({ interpreter }) {
  const [file, setFile] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const sourcePath = interpreter.resume_file_url;
  const sourceTime = interpreter.resume_uploaded_at || null;
  const isCurrent = record?.source_resume_file_url === sourcePath
    && (record?.source_resume_uploaded_at || null) === sourceTime;
  useEffect(() => {
    let active = true;
    supabase.from("company_reviewed_resumes").select("*")
      .eq("interpreter_id", interpreter.id).maybeSingle().then(({ data, error }) => {
        if (!active) return;
        setReady(!error);
        setRecord(data);
        if (error) setMessage("기업용 이력서 기능을 준비 중입니다.");
      });
    return () => { active = false; };
  }, [interpreter.id]);

  const publish = async (event) => {
    event.preventDefault();
    if (!file || !confirmed || !sourcePath || busy || !ready) return;
    setBusy(true);
    setMessage("");
    try {
      if (file.size > 10 * 1024 * 1024 || file.size < 5
        || !file.name.toLowerCase().endsWith(".pdf")
        || new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-") {
        throw new Error("10MB 이하의 PDF 파일을 선택해 주세요.");
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("관리자 로그인을 확인해 주세요.");
      const filePath = `${interpreter.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("company-resumes")
        .upload(filePath, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error("파일을 업로드하지 못했습니다.");
      const next = {
        interpreter_id: interpreter.id,
        file_path: filePath,
        source_resume_file_url: sourcePath,
        source_resume_uploaded_at: sourceTime,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      };
      const { error: saveError } = await supabase.from("company_reviewed_resumes")
        .upsert(next, { onConflict: "interpreter_id" });
      if (saveError) throw new Error("파일은 업로드되었지만 공개 승인이 저장되지 않았습니다. 다시 시도해 주세요.");
      setRecord(next);
      setFile(null);
      setConfirmed(false);
      event.target.reset();
      setMessage("검수된 기업용 이력서를 등록했습니다.");
    } catch (error) { setMessage(error.message || "등록하지 못했습니다."); }
    finally { setBusy(false); }
  };
  return <section className="admin-company-resume" aria-label="기업용 이력서">
    <h4><FileText size={18} aria-hidden="true" /> 기업용 이력서</h4>
    <p className="admin-company-resume-status">
      {record ? isCurrent ? "공개본 등록 완료" : "원본 변경됨 · 공개 중지" : "공개본 미등록"}
    </p>
    <form onSubmit={publish}>
      <label>연락처 삭제본 PDF
        <input type="file" accept="application/pdf,.pdf" disabled={!ready || busy || !sourcePath}
          onChange={(event) => { setFile(event.target.files?.[0] || null); setConfirmed(false); }} />
      </label>
      <label className="admin-company-resume-confirm">
        <input type="checkbox" checked={confirmed} disabled={busy || !file}
          onChange={(event) => setConfirmed(event.target.checked)} />
        전화·이메일·주소·SNS·QR 및 숨겨진 연락처 정보가 삭제된 파일임을 검수했습니다.
      </label>
      <button type="submit" disabled={!ready || busy || !file || !confirmed || !sourcePath}>
        <Upload size={16} aria-hidden="true" /> {busy ? "등록 중" : "검수 완료 · 기업용 등록"}
      </button>
    </form>
    {!sourcePath && <p>먼저 통역사의 원본 PDF 제출이 필요합니다.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
