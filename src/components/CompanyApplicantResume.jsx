import { useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "../supabase";

export default function CompanyApplicantResume({ applicationId }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const viewResume = async () => {
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("get_company_applicant_resume", {
        p_application_id: applicationId,
      });
      if (error) throw error;
      if (!data?.file_path) {
        preview?.close();
        setMessage("기업용 이력서를 준비 중입니다.");
        return;
      }
      const { data: signed, error: signingError } = await supabase.storage
        .from("company-resumes").createSignedUrl(data.file_path, 60);
      if (signingError || !signed?.signedUrl) throw signingError || new Error("Missing URL");
      if (preview) preview.location.replace(signed.signedUrl);
      else setMessage("팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.");
    } catch {
      preview?.close();
      setMessage("이력서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };
  return <div className="company-applicant-resume">
    <button type="button" className="btn-edit-trigger" disabled={busy} onClick={viewResume}>
      <FileText size={17} aria-hidden="true" /> {busy ? "확인 중" : "이력서 보기"}
    </button>
    {message && <p role="status">{message}</p>}
  </div>;
}
