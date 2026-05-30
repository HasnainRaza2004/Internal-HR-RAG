"use client";

/**
 * Chat UI Component
 *
 * Main frontend interface for the HR RAG chatbot.
 * Connects to the backend SSE stream (/api/chat/stream) and renders
 * messages, loading states, source citations, and starter test queries.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const STARTER_QUESTIONS = [
  "What backend technologies are required for this role?",
  "Do I need to know how to deploy models locally?",
  "How many days of paid time off does VentureDive offer?",
];

/**
 * SourceBadge({ source })
 * ----------------------
 * Collapsible UI element showing one retrieved JD chunk citation.
 * Displays chunk id, similarity match %, and an excerpt of the chunk text.
 */
function SourceBadge({ source }) {
  return (
    <details className="source">
      <summary>
        {source.id}
        <span className="score">{(source.score * 100).toFixed(1)}% match</span>
      </summary>
      <p>{source.excerpt}</p>
    </details>
  );
}

/**
 * Chat()
 * ------
 * Root chat component. Manages message history, input state, and SSE streaming.
 *
 * On mount: pings /health to show backend status in the header.
 * On send:   POSTs to /api/chat/stream and appends tokens as they arrive.
 */
export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I'm the VentureDive HR assistant. Ask me anything about the JavaScript Full Stack AI Engineer role — I'll answer strictly from the job description.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: "offline" }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /**
   * sendMessage(text)
   * -----------------
   * Sends a user question to the backend SSE stream and updates the UI
   * in real time as tokens and source citations arrive.
   *
   * SSE event flow handled:
   *   sources → token (×N) → done | error
   */
  const sendMessage = useCallback(
    async (text) => {
      const question = text.trim();
      if (!question || loading) return;

      setInput("");
      setLoading(true);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: "", sources: [], streaming: true },
      ]);

      try {
        const response = await fetch(`${API_URL}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const line = block.replace(/^data: /, "").trim();
            if (!line) continue;

            const event = JSON.parse(line);

            if (event.type === "sources") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = { ...last, sources: event.sources };
                return next;
              });
            }

            if (event.type === "token") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = {
                  ...last,
                  content: last.content + event.token,
                };
                return next;
              });
            }

            if (event.type === "error") {
              throw new Error(event.error);
            }
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      } catch (err) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: `Sorry, something went wrong: ${err.message}. Make sure the backend and Ollama are running.`,
            streaming: false,
          };
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  /** Handles form submit — prevents page reload and sends the input text */
  const onSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>VentureDive HR Assistant</h1>
          <p className="subtitle">JavaScript Full Stack AI Engineer — RAG Demo</p>
        </div>
        <div className={`status ${health?.status === "ok" ? "online" : "offline"}`}>
          {health?.status === "ok"
            ? `${health.chunks} chunks indexed · ${health.ollamaModel}`
            : "Backend offline"}
        </div>
      </header>

      <main className="chat">
        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="bubble">
                {msg.content || (msg.streaming ? <span className="typing">Thinking…</span> : "")}
              </div>
              {msg.sources?.length > 0 && (
                <div className="sources">
                  <span className="sources-label">Sources used</span>
                  {msg.sources.map((s) => (
                    <SourceBadge key={s.id} source={s} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {!loading && messages.length <= 1 && (
          <div className="starters">
            <p>Try these test queries:</p>
            <div className="starter-buttons">
              {STARTER_QUESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <form className="input-bar" onSubmit={onSubmit}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the job description…"
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? "…" : "Send"}
          </button>
        </form>
      </main>

      <style jsx>{`
        .app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          max-width: 860px;
          margin: 0 auto;
          padding: 1.5rem 1rem 2rem;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }

        h1 {
          font-size: 1.35rem;
          font-weight: 600;
        }

        .subtitle {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-top: 0.25rem;
        }

        .status {
          font-size: 0.75rem;
          padding: 0.35rem 0.65rem;
          border-radius: 999px;
          white-space: nowrap;
        }

        .status.online {
          background: rgba(34, 197, 94, 0.15);
          color: var(--success);
        }

        .status.offline {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
        }

        .chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .messages {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding-bottom: 1rem;
        }

        .message {
          display: flex;
          flex-direction: column;
          max-width: 85%;
        }

        .message.user {
          align-self: flex-end;
        }

        .message.assistant {
          align-self: flex-start;
        }

        .bubble {
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          white-space: pre-wrap;
          word-break: break-word;
        }

        .message.user .bubble {
          background: var(--user-bubble);
          border-bottom-right-radius: 4px;
        }

        .message.assistant .bubble {
          background: var(--bot-bubble);
          border: 1px solid var(--border);
          border-bottom-left-radius: 4px;
        }

        .typing {
          color: var(--text-muted);
          animation: pulse 1.2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }

        .sources {
          margin-top: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .sources-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .source {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
        }

        .source summary {
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
          color: var(--accent);
        }

        .score {
          color: var(--text-muted);
          font-size: 0.75rem;
        }

        .source p {
          margin-top: 0.5rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .starters {
          margin-bottom: 1rem;
        }

        .starters p {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 0.5rem;
        }

        .starter-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .starter-buttons button {
          text-align: left;
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 0.6rem 0.85rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }

        .starter-buttons button:hover {
          background: var(--surface-hover);
          border-color: var(--accent);
        }

        .input-bar {
          display: flex;
          gap: 0.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border);
        }

        .input-bar input {
          flex: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 0.75rem 1rem;
          color: var(--text);
          outline: none;
        }

        .input-bar input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }

        .input-bar button {
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius);
          padding: 0 1.25rem;
          cursor: pointer;
          font-weight: 500;
        }

        .input-bar button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
