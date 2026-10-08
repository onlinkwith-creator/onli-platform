import { FileText } from "lucide-react";
import "./AdminCompanyResume.css";

export default function AdminCompanyResume({ interpreter }) {
  return <section className="admin-company-resume" aria-label="지원자 이력서">
    <h4><FileText size={18} aria-hidden="true" /> 지원자 이력서</h4>
    <p className="admin-company-resume-status">
      {interpreter.resume_file_url ? "지원한 의뢰의 기업에서 조회 가능" : "등록된 이력서 없음"}
    </p>
  </section>;
}
