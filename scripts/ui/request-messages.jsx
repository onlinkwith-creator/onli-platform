import { createRoot } from "react-dom/client";
import RequestMessages from "../../src/components/RequestMessages";
import { supabase } from "../../src/supabase";

// Local-only visual fixture. No auth, production records or emails are used.
const threads = [
  { id: "demo-1", request_no: "ONLI-REQ-016", assignment_no: "ONLI-REQ-016-1-ASG-001", event_name: "한일 기업 교류 행사", peer_name: "ON-LI 테스트 기업", can_send: true, unread_count: 2 },
  { id: "demo-2", request_no: "ONLI-REQ-017", assignment_no: "ONLI-REQ-017-1-ASG-001", event_name: "긴 행사명과 기업명이 들어간 모바일 화면 검증용 의뢰", peer_name: "모바일 화면 검증용 테스트 기업", can_send: false, unread_count: 0 },
];
let sequence = 4;
const messages = [
  { id: "1", body: "안녕하세요. 행사 집합 장소 확인 부탁드립니다.", mine: true, peer_read: true, created_at: "2026-10-08T00:00:00Z" },
  { id: "2", body: "안녕하세요. 행사장 정문에서 오전 9시에 뵙겠습니다.\n자료는 자료 관리에 올려두었습니다.", mine: false, created_at: "2026-10-08T00:01:00Z" },
  { id: "3", body: "<img src=x onerror=alert(1)>\n긴문자열표시검증".repeat(5), mine: false, created_at: "2026-10-08T00:02:00Z" },
  { id: "4", body: "확인했습니다. 감사합니다.", mine: true, peer_read: false, created_at: "2026-10-08T00:03:00Z" },
];
const historyByConversation = { "demo-1": messages, "demo-2": [
  { id: "100", body: "일정 취소 내용을 확인했습니다.", mine: false, created_at: "2026-10-08T00:10:00Z" },
] };
supabase.rpc = async (name, args) => {
  if (name === "get_my_request_conversations") return { data: threads };
  if (name === "get_request_messages") return { data: args.p_before_id ? [] : [...historyByConversation[args.p_conversation_id]].reverse() };
  if (name === "read_request_messages") { threads[0].unread_count = 0; return { data: null }; }
  if (name === "send_request_message") {
    historyByConversation[args.p_conversation_id].push({ id: String(++sequence), body: args.p_body, mine: true, peer_read: false, created_at: new Date().toISOString() });
    return { data: { id: String(sequence) } };
  }
  return { error: { message: "Unknown fixture RPC" } };
};
document.body.style.cssText = "margin:0;background:#f4f6f9;font-family:Arial,sans-serif;padding:16px;";
createRoot(document.getElementById("root")).render(<div style={{maxWidth:900,margin:"0 auto"}}><RequestMessages /></div>);
