import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAiStore } from "../../store/aiStore";

interface Props {
  onClose: () => void;
}

export function ApiKeyModal({ onClose }: Props) {
  const { apiKeyConfigured, setApiKeyConfigured } = useAiStore();
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setError("Key should start with sk-ant-");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await invoke("set_api_key", { key: trimmed });
      setApiKeyConfigured(true);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await invoke("delete_api_key");
      setApiKeyConfigured(false);
      setKey("");
    } catch (e) {
      setError(String(e));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="api-key-modal-overlay" onClick={onClose}>
      <div className="api-key-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Anthropic API Key</h3>

        <p>
          The key is stored securely in Windows Credential Manager and never
          leaves your machine. Get one at{" "}
          <a
            href="https://console.anthropic.com"
            onClick={(e) => e.preventDefault()}
          >
            console.anthropic.com
          </a>
          .
        </p>

        <div className={`key-status ${apiKeyConfigured ? "" : "none"}`}>
          {apiKeyConfigured ? "✓ Key is stored" : "No key stored yet"}
        </div>

        <input
          className="api-key-input"
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        {error && <div style={{ color: "#f44336", fontSize: 12 }}>{error}</div>}

        <div className="api-key-modal-actions">
          {apiKeyConfigured && (
            <button className="modal-btn danger" onClick={handleDelete}>
              Remove Key
            </button>
          )}
          <button className="modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn primary"
            onClick={handleSave}
            disabled={saving || !key.trim()}
          >
            {saving ? "Saving…" : "Save Key"}
          </button>
        </div>
      </div>
    </div>
  );
}
