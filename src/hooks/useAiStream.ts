/**
 * Wires Tauri events to aiStore and exposes sendMessage().
 * Mount this once at the AiAssistant component level.
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAiStore } from "../store/aiStore";
import { usePatchStore } from "../store/patchStore";
import { parseParameters } from "../lib/ai/paramParser";
import { buildSystemPrompt } from "../lib/ai/nordPrompt";

interface TokenPayload { token: string; message_id: string }
interface DonePayload  { full_text: string; message_id: string }
interface ErrorPayload { error: string; message_id: string }

export function useAiStream() {
  const store = useAiStore();

  // Register event listeners for the lifetime of the component
  useEffect(() => {
    const p1 = listen<TokenPayload>("ai-token", (e) => {
      store.appendToken(e.payload.message_id, e.payload.token);
    });

    const p2 = listen<DonePayload>("ai-done", (e) => {
      const params = parseParameters(e.payload.full_text);
      store.finalizeMessage(e.payload.message_id, e.payload.full_text, params);
    });

    const p3 = listen<ErrorPayload>("ai-error", (e) => {
      store.markError(e.payload.message_id, e.payload.error);
    });

    return () => {
      p1.then((u) => u());
      p2.then((u) => u());
      p3.then((u) => u());
    };
  }, []);

  async function sendMessage(userText: string) {
    if (store.isStreaming) return;

    const patchJson = (() => {
      const p = usePatchStore.getState().patch;
      return p ? JSON.stringify(p) : null;
    })();

    // Build conversation history (exclude streaming/error messages)
    const history = store.messages
      .filter((m) => !m.streaming && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    const assistantId = crypto.randomUUID();
    store.addUserMessage(userText);
    store.beginAssistantMessage(assistantId);

    try {
      await invoke("stream_ai_completion", {
        model: store.model,
        system: buildSystemPrompt(patchJson),
        messages: [...history, { role: "user", content: userText }],
        messageId: assistantId,
      });
    } catch (err) {
      store.markError(assistantId, String(err));
    }
  }

  return { sendMessage };
}
