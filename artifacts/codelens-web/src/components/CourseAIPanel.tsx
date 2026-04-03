"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CourseAIPanelProps {
  courseId: string;
  moduleTitle?: string;
  onClose: () => void;
}

export function CourseAIPanel({ courseId, moduleTitle, onClose }: CourseAIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendQuestion = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch(`/api/courses/${courseId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, moduleTitle }),
      });
      const data = await res.json();
      if (data.answer) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to get an answer. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, courseId, moduleTitle]);

  return (
    <div className="ai-panel-overlay">
      <div className="ai-panel">
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Ask about this code
          </div>
          <button className="ai-panel-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ai-panel-messages">
          {messages.length === 0 && (
            <div className="ai-panel-empty">
              <p>Ask anything about this codebase or the current module.</p>
              <div className="ai-panel-suggestions">
                <button onClick={() => { setInput("How does the data flow work?"); }} className="ai-panel-suggestion">How does the data flow work?</button>
                <button onClick={() => { setInput("What would break if I changed this?"); }} className="ai-panel-suggestion">What would break if I changed this?</button>
                <button onClick={() => { setInput("Can you explain this in simpler terms?"); }} className="ai-panel-suggestion">Explain in simpler terms</button>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`ai-panel-msg ai-panel-msg-${msg.role}`}>
              <div className="ai-panel-msg-content">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="ai-panel-msg ai-panel-msg-assistant">
              <div className="ai-panel-msg-content ai-panel-loading">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="ai-panel-input-row">
          <input
            ref={inputRef}
            type="text"
            className="ai-panel-input"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendQuestion(); }}
            disabled={loading}
            maxLength={500}
          />
          <button className="ai-panel-send" onClick={sendQuestion} disabled={loading || !input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
