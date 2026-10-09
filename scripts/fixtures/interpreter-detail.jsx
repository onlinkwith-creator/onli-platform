import React from "react";
import { createRoot } from "react-dom/client";
import { InterpreterModal } from "../../src/pages/Admin";
import "../../src/index.css";

const interpreter = {
  id: "fixture-only", name: "테스트 통역사", level: "Lv3", status: "active",
  approved: true, activity_status: "active", certification_mode: "manual_approved",
  email: "fixture@example.invalid", available_regions: ["도쿄", "오사카"],
  specialties: ["비즈니스", "전시회"], resume_file_url: "fixture-only.pdf",
  resume_file_name: "통역사_이력서_최신_버전_긴_파일명_모바일_줄바꿈_검증.pdf",
  resume_submitted_at: "2026-10-07T07:33:00+09:00",
};
const record = (...args) => { window.fixtureActions ||= []; window.fixtureActions.push(args); };

createRoot(document.getElementById("root")).render(
  <InterpreterModal interpreter={interpreter} modalType="detail" draft={{}}
    updateInterpreter={record} deleteInterpreter={record} onClose={record}
    onOpenModal={record} onChangeDraft={record} onChangeNoteDraft={record}
    onCreateNote={record} onSave={record} />
);
