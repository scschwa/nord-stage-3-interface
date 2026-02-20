import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAiStore, ModelId } from "../../store/aiStore";
import { usePatchStore } from "../../store/patchStore";
import { useAiStream } from "../../hooks/useAiStream";
import { stripParameterTags } from "../../lib/ai/paramParser";
import { ParameterCard } from "./ParameterCard";
import { ApiKeyModal } from "./ApiKeyModal";
import "./AiAssistant.css";

const SUGGESTIONS = [
  "Warm Oberheim pad in a large hall",
  "Bright aggressive lead for a rock solo",
  "Vintage Rhodes with tape echo",
  "Full gospel Hammond B3 sound",
  "Soft ambient pad with slow attack",
  "Funky Clavinet with auto-wah",
];

export function AiAssistant() {
  const { messages, isStreaming, model, apiKeyConfigured, setModel, setApiKeyConfigured } =
    useAiStore();
  const patch = usePatchStore((s) => s.patch);
  const { sendMessage } = useAiStream();

  const [input, setInput] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check for stored API key on mount
  useEffect(() => {
    invoke<string | null>("get_api_key").then((key) => {
      setApiKeyConfigured(!!key);
    });
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    textareaRef.current!.style.height = "40px";
    sendMessage(text);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    // Auto-grow textarea
    const ta = e.target;
    ta.style.height = "40px";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  function handleSuggestion(text: string) {
    setInput(text);
    textareaRef.current?.focus();
  }

  const canSend = !!input.trim() && !isStreaming && apiKeyConfigured;

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-header">
        <span className="ai-title">✦ AI Sound Designer</span>

        {/* Model toggle */}
        <div className="model-toggle" title="Select Claude model">
          {(["claude-haiku-4-5-20251001", "claude-sonnet-4-6"] as ModelId[]).map((m) => (
            <button
              key={m}
              className={`model-btn${model === m ? " active" : ""}`}
              onClick={() => setModel(m)}
            >
              {m.includes("haiku") ? "Fast" : "Deep"}
            </button>
          ))}
        </div>

        <button
          className="ai-header-btn"
          onClick={() => useAiStore.getState().clearMessages()}
          title="Clear conversation"
        >
          Clear
        </button>

        <button
          className="ai-header-btn"
          onClick={() => setShowKeyModal(true)}
          title={apiKeyConfigured ? "API key stored ✓" : "Set API key"}
        >
          {apiKeyConfigured ? "⚙ Key ✓" : "⚙ Set Key"}
        </button>
      </div>

      {/* Patch context indicator */}
      {patch && (
        <div className="patch-context-bar">
          <span className="patch-context-badge">CONTEXT</span>
          Current patch:
          <span className="ctx-name">{patch.name}</span>
          (auto-included with your messages)
        </div>
      )}

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty">
            <div className="ai-empty-icon">✦</div>
            <h3>AI Sound Designer</h3>
            <p>
              Describe any sound in plain language and get specific Nord Stage 3 settings
              with exact panel locations. Try:
            </p>
            {!apiKeyConfigured && (
              <p style={{ color: "#f44336" }}>
                ↑ Click <strong>⚙ Set Key</strong> to add your Anthropic API key first.
              </p>
            )}
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="ai-suggestion-chip"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`msg-row ${msg.role}`}>
              {msg.error ? (
                <div className="msg-error">Error: {msg.error}</div>
              ) : (
                <>
                  <div className={`msg-bubble${msg.streaming ? " streaming" : ""}`}>
                    {msg.role === "assistant"
                      ? stripParameterTags(msg.content) || (msg.streaming ? "" : "…")
                      : msg.content}
                  </div>

                  {/* Parameter cards rendered after streaming completes */}
                  {!msg.streaming && msg.parameters.length > 0 && (
                    <div className="param-cards">
                      {msg.parameters.map((p, i) => (
                        <ParameterCard key={i} param={p} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-input-row">
        <textarea
          ref={textareaRef}
          className="ai-input"
          placeholder={
            apiKeyConfigured
              ? "Describe a sound… (Enter to send, Shift+Enter for newline)"
              : "Set your API key (⚙) to get started"
          }
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={!apiKeyConfigured || isStreaming}
          rows={1}
        />
        <button className="ai-send-btn" onClick={handleSend} disabled={!canSend}>
          {isStreaming ? "…" : "Send"}
        </button>
      </div>

      {/* API key modal */}
      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}
    </div>
  );
}
