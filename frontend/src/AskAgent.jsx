import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Plus, Send } from "lucide-react";
import "./chat.css";

export function AskAgentHome({ onChat, onTicket }) {
  return (
    <section className="page-stack">
      <div className="welcome-band">
        <div>
          <p className="eyebrow">Ask the agent</p>
          <h2>What would you like to do?</h2>
          <p>Get quick troubleshooting help first, or go straight to a ticket.</p>
        </div>
      </div>
      <div className="agent-choices">
        <button className="agent-choice" onClick={onChat}>
          <Bot size={24} />
          <strong>Troubleshoot with the AI</strong>
          <span>Describe the problem and get step-by-step help. If it isn't fixed, the agent can open a ticket for you.</span>
        </button>
        <button className="agent-choice" onClick={onTicket}>
          <Plus size={24} />
          <strong>Submit a ticket</strong>
          <span>Skip troubleshooting and send your request straight to the help desk.</span>
        </button>
      </div>
    </section>
  );
}

const GREETING = "Hi! I'm the IT help assistant. Tell me what's going wrong and I'll help you troubleshoot. If we can't fix it, I can open a ticket for you.";

export function AgentChat({ api, onBack, onTicket, onReply }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(event) {
    event.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setText("");
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ messages: next }) });
      setMessages([...next, { role: "assistant", content: data.reply }]);
      if (onReply) Promise.resolve(onReply()).catch(() => {});
    } catch (err) {
      setMessages(messages);
      setText(content);
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <section className="page-stack">
      <div className="chat-actions">
        <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <button className="secondary-button" onClick={() => { setMessages([]); setError(""); }}>New chat</button>
        <button className="secondary-button" onClick={onTicket}><Plus size={16} /> Submit a ticket instead</button>
      </div>
      <div className="chat-window">
        <div className="chat-log" ref={logRef}>
          <div className="chat-bubble assistant">{GREETING}</div>
          {messages.map((m, i) => <div key={i} className={`chat-bubble ${m.role}`}>{m.content}</div>)}
          {busy && <div className="chat-bubble assistant typing">Thinking...</div>}
        </div>
        {error && <p className="chat-error">{error}</p>}
        <form className="chat-form" onSubmit={send}>
          <textarea
            value={text}
            maxLength={1000}
            placeholder="Describe your problem..."
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) send(event); }}
          />
          <button className="primary-button" disabled={busy || !text.trim()}><Send size={16} /> Send</button>
        </form>
      </div>
    </section>
  );
}
