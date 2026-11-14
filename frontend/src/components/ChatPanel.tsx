import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { chat } from "../api";
import type { ChatMessage } from "../api";
import { executeAction } from "../lib/executeAction";
import { useStore } from "../store/useStore";
import { Icon } from "./Icons";

const suggestions = [
  "Show me Shackleton",
  "Compare Connecting Ridge and Malapert",
  "What about 12 March?",
  "Show me the sky from the site",
];

export default function ChatPanel() {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useStore((state) => state.messages);
  const setMessages = useStore((state) => state.setMessages);
  const selectedSiteId = useStore((state) => state.selectedSiteId);
  const selectedDate = useStore((state) => state.selectedDate);
  const view = useStore((state) => state.view);
  const level = useStore((state) => state.level);
  const setLevel = useStore((state) => state.setLevel);
  const loading = useStore((state) => state.chatLoading);
  const setLoading = useStore((state) => state.setChatLoading);
  const error = useStore((state) => state.chatError);
  const setError = useStore((state) => state.setChatError);
  const open = useStore((state) => state.chatOpen);
  const setOpen = useStore((state) => state.setChatOpen);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || loading) return;
    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages(nextHistory);
    setDraft("");
    setLoading(true);
    setError(null);
    try {
      const response = await chat(prompt, messages, level, {
        selected_site: selectedSiteId,
        selected_date: selectedDate,
        view,
      });
      setMessages([...nextHistory, { role: "assistant", content: response.text }]);
      response.actions.forEach((action) => { executeAction(action); });
      if (response.rejected.length) {
        setError(response.rejected.map((item) => item.error).join(" "));
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The assistant could not complete that request.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  if (!open) {
    return (
      <button className="chat-reopen" onClick={() => setOpen(true)} aria-label="Open mission assistant">
        <Icon name="chat" size={18} /><span>MISSION ASSISTANT</span><i className="live-dot" />
      </button>
    );
  }

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div className="chat-avatar"><Icon name="spark" size={17} /></div>
        <div className="chat-heading"><strong>Mission assistant</strong><span><i className="live-dot" /> LOCAL MODEL · READY</span></div>
        <button className="icon-button chat-collapse" onClick={() => setOpen(false)} aria-label="Collapse assistant"><Icon name="close" size={17} /></button>
      </header>
      <div className="chat-level-switch">
        <button className={level === "decouverte" ? "selected" : ""} onClick={() => setLevel("decouverte")}>DÉCOUVERTE</button>
        <button className={level === "expert" ? "selected" : ""} onClick={() => setLevel("expert")}>EXPERT</button>
      </div>
      <div className="chat-content">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <div className="welcome-orbit"><Icon name="compass" size={22} /></div>
            <div className="eyebrow">YOUR LUNAR COPILOT</div>
            <h3>Where should we land?</h3>
            <p>Explore candidate sites, compare their light and communications, or ask what the surface sky looks like.</p>
            <div className="suggestion-list">
              {suggestions.map((prompt) => <button key={prompt} onClick={() => void send(prompt)}><span>{prompt}</span><Icon name="arrow" size={14} /></button>)}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`chat-message ${message.role}`} key={`${index}-${message.content.slice(0, 16)}`}>
            {message.role === "assistant" && <div className="assistant-dot"><Icon name="spark" size={12} /></div>}
            <div className="message-bubble">{message.content}</div>
          </div>
        ))}
        {loading && <div className="chat-message assistant"><div className="assistant-dot"><Icon name="spark" size={12} /></div><div className="message-bubble typing"><i /><i /><i /></div></div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="chat-error" role="status"><Icon name="warning" size={14} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><Icon name="close" size={13} /></button></div>}
      <div className="chat-bottom">
        {messages.length > 0 && (
          <div className="quick-prompts">
            {suggestions.slice(0, 2).map((prompt) => <button key={prompt} disabled={loading} onClick={() => void send(prompt)}>{prompt}</button>)}
          </div>
        )}
        <form className="chat-compose" onSubmit={submit}>
          <input value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Ask about a landing site…" aria-label="Ask the mission assistant" />
          <button type="submit" disabled={!draft.trim() || loading} aria-label="Send message"><Icon name="send" size={16} /></button>
        </form>
        <div className="chat-disclaimer">MOCK ASSISTANT <span>·</span> Answers use local evaluator data</div>
      </div>
    </aside>
  );
}
