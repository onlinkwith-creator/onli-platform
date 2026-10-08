import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronUp, MessageSquare, RefreshCw, Send } from "lucide-react";
import { supabase } from "../supabase";
import { MESSAGE_LIMIT, mergeRequestMessages, messageError } from "../utils/requestMessages";
import "./RequestMessages.css";

const formatTime = (value) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

export default function RequestMessages() {
  const [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [notice, setNotice] = useState(null);
  const [available, setAvailable] = useState(true);
  const [newBelow, setNewBelow] = useState(false);
  const active = useRef(true);
  const selectedRef = useRef("");
  const generation = useRef(0);
  const panel = useRef(null);
  const scrollLatest = useRef(false);
  const retries = useRef({});
  const reading = useRef("");
  const sendLock = useRef(false);
  const thread = threads.find((item) => item.id === selected);
  const draft = drafts[selected] || "";
  const length = Array.from(draft.trim()).length;

  const chooseConversation = useCallback((id) => {
    selectedRef.current = id; generation.current += 1; reading.current = "";
    setSelected(id); setMessages([]); setHasOlder(false); setNewBelow(false); setNotice(null);
    setThreadLoading(Boolean(id));
  }, []);

  const loadThreads = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_request_conversations");
    if (!active.current) return;
    if (error) { setAvailable(false); setLoading(false); throw error; }
    setThreads(data || []); setAvailable(true); setLoading(false);
    const next = data?.some((item) => item.id === selectedRef.current) ? selectedRef.current : data?.[0]?.id || "";
    if (next !== selectedRef.current) { chooseConversation(next); return true; }
    return false;
  }, [chooseConversation]);

  const loadLatest = useCallback(async (id, reset = false) => {
    const version = generation.current;
    const { data, error } = await supabase.rpc("get_request_messages", { p_conversation_id: id });
    if (!active.current || selectedRef.current !== id || version !== generation.current) return;
    setThreadLoading(false);
    if (error) {
      if (error.code === "42501") { setMessages([]); setAvailable(false); }
      throw error;
    }
    if (reset) setHasOlder(data?.length === 50);
    const bottom = !panel.current || panel.current.scrollHeight - panel.current.scrollTop - panel.current.clientHeight < 60;
    scrollLatest.current = reset || bottom;
    setMessages((current) => mergeRequestMessages(reset ? [] : current, data || []));
    setNewBelow(!scrollLatest.current);
  }, []);

  useEffect(() => {
    active.current = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try { const changed = await loadThreads(); if (!changed && selectedRef.current) await loadLatest(selectedRef.current); }
      catch (error) { if (active.current) setNotice({ error: true, text: messageError(error) }); }
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active.current = false; generation.current += 1; clearInterval(timer);
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadThreads, loadLatest]);

  useEffect(() => {
    if (!selected) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow the selected conversation's async RPC.
    void loadLatest(selected, true).catch((error) => {
      if (active.current && selectedRef.current === selected) setNotice({ error: true, text: messageError(error) });
    });
  }, [selected, loadLatest]);

  const markRead = useCallback(async () => {
    const last = messages.at(-1);
    if (!last || !panel.current || document.visibilityState !== "visible" || !document.hasFocus()
      || panel.current.scrollHeight - panel.current.scrollTop - panel.current.clientHeight > 60) return;
    const id = selected;
    const key = `${id}:${last.id}`;
    if (reading.current === key) return;
    reading.current = key;
    const { error } = await supabase.rpc("read_request_messages", { p_conversation_id: id, p_last_message_id: last.id });
    if (error) { if (reading.current === key) reading.current = ""; return; }
    if (active.current && selectedRef.current === id) void loadThreads().catch(() => {});
  }, [messages, selected, loadThreads]);

  useEffect(() => {
    if (scrollLatest.current && panel.current) {
      panel.current.scrollTop = panel.current.scrollHeight; scrollLatest.current = false;
    }
    void markRead();
  }, [messages, markRead]);

  const older = async () => {
    if (olderLoading || !messages.length) return;
    const id = selected; const version = generation.current;
    const height = panel.current?.scrollHeight || 0;
    setOlderLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_request_messages", { p_conversation_id: id, p_before_id: messages[0].id });
      if (error) throw error;
      if (!active.current || selectedRef.current !== id || generation.current !== version) return;
      setHasOlder(data?.length === 50);
      setMessages((current) => mergeRequestMessages(current, data || []));
      requestAnimationFrame(() => {
        if (panel.current && selectedRef.current === id) panel.current.scrollTop += panel.current.scrollHeight - height;
      });
    } catch (error) { if (active.current && selectedRef.current === id) setNotice({ error: true, text: messageError(error) }); }
    finally { if (active.current) setOlderLoading(false); }
  };

  const send = async (event) => {
    event.preventDefault();
    if (sendLock.current || !thread?.can_send || !available || !length || length > MESSAGE_LIMIT) return;
    const id = selected; const body = draft.trim();
    if (retries.current[id]?.body !== body) retries.current[id] = { body, nonce: crypto.randomUUID() };
    const attempt = retries.current[id];
    let confirmed = false;
    sendLock.current = true; setSending(true); setNotice(null);
    try {
      const { error } = await supabase.rpc("send_request_message", { p_conversation_id: id, p_body: body, p_client_nonce: attempt.nonce });
      if (error) throw error;
      confirmed = true;
      if (!active.current) return;
      delete retries.current[id];
      setDrafts((current) => ({ ...current, [id]: "" }));
      setNotice({ error: false, text: "메시지를 보냈습니다." });
      await loadLatest(id); await loadThreads();
    } catch (error) {
      if (active.current) setNotice({ error: true, text: confirmed ? "메시지는 전송됐지만 최신 대화를 불러오지 못했습니다. 새로고침해 주세요." : `${messageError(error)} 작성한 메시지는 남아 있습니다.` });
    } finally { sendLock.current = false; if (active.current) setSending(false); }
  };

  return <section className="request-messaging" aria-label="의뢰별 메시지">
    <header className="request-messaging-title"><h2>의뢰 메시지</h2>
      <button type="button" className="request-message-icon" title="대화 새로고침" aria-label="대화 새로고침" disabled={sending || threadLoading}
        onClick={async () => { try { setNotice(null); const changed = await loadThreads(); if (!changed && selected) await loadLatest(selected); }
          catch (error) { setNotice({ error: true, text: messageError(error) }); } }}><RefreshCw size={18} /></button>
    </header>
    {notice && <p className={`request-message-notice${notice.error ? " is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    {loading ? <p role="status">대화를 불러오는 중입니다.</p> : threads.length === 0 ? <div className="request-message-empty"><MessageSquare size={24} /><p>배정된 의뢰의 대화가 없습니다.</p></div> : <>
      <label className="request-message-selector">의뢰 · 대화 상대
        <select value={selected} disabled={sending || olderLoading} onChange={(event) => chooseConversation(event.target.value)}>
          {threads.map((item) => <option key={item.id} value={item.id}>{item.request_no} · {item.event_name} · {item.peer_name}{Number(item.unread_count) ? ` (미읽음 ${item.unread_count})` : ""}</option>)}
        </select>
      </label>
      {thread && <div className="request-message-workspace">
        <div className="request-message-heading"><div><h3>{thread.peer_name}</h3><p>{thread.assignment_no || thread.request_no} · {thread.event_name}</p></div>
          {!thread.can_send && <span>조회 전용</span>}
        </div>
        <div className="request-message-history" ref={panel} role="region" aria-label="대화 내용" tabIndex={0}
          onScroll={() => { if (panel.current.scrollHeight - panel.current.scrollTop - panel.current.clientHeight < 60) { setNewBelow(false); void markRead(); } }}>
          {hasOlder && <button type="button" className="request-message-older" disabled={olderLoading || threadLoading} onClick={older}><ChevronUp size={16} />{olderLoading ? "불러오는 중" : "이전 메시지"}</button>}
          {threadLoading ? <p role="status">메시지를 불러오는 중입니다.</p> : messages.length === 0 ? <p className="request-message-empty-text">아직 메시지가 없습니다.</p> :
            messages.map((item) => <article className={`request-message-row${item.mine ? " is-mine" : ""}`} key={item.id}>
              <p className="request-message-body">{item.body}</p>
              <footer><span>{item.mine ? "나" : thread.peer_name}</span><time dateTime={item.created_at}>{formatTime(item.created_at)}</time>{item.mine && <span>{item.peer_read ? "읽음" : "안 읽음"}</span>}</footer>
            </article>)}
        </div>
        {newBelow && <button type="button" className="request-message-jump" onClick={() => { panel.current.scrollTop = panel.current.scrollHeight; setNewBelow(false); void markRead(); }}><ArrowDown size={16} />최신 메시지</button>}
        <form className="request-message-compose" onSubmit={send}>
          <label htmlFor="request-message-body">메시지</label>
          <textarea id="request-message-body" rows={3} value={draft} disabled={sending || threadLoading || !thread.can_send || !available}
            placeholder={thread.can_send ? "메시지를 입력하세요" : "배정이 취소된 의뢰는 메시지를 보낼 수 없습니다"}
            aria-describedby="request-message-length" aria-invalid={length > MESSAGE_LIMIT}
            onChange={(event) => setDrafts((current) => ({ ...current, [selected]: event.target.value }))} />
          <div><span id="request-message-length" className={length > MESSAGE_LIMIT ? "is-error" : ""}>{length.toLocaleString("ko-KR")} / 2,000</span>
            <button type="submit" disabled={sending || threadLoading || !thread.can_send || !available || !length || length > MESSAGE_LIMIT}><Send size={17} />{sending ? "전송 중" : "보내기"}</button></div>
        </form>
      </div>}
    </>}
  </section>;
}
