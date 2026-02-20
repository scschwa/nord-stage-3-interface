import { create } from "zustand";
import { ParsedParameter } from "../lib/ai/paramParser";

export type ModelId = "claude-haiku-4-5-20251001" | "claude-sonnet-4-6";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;           // full raw text (includes <parameter> tags until finalized)
  parameters: ParsedParameter[];
  timestamp: number;
  streaming: boolean;
  error?: string;
}

export interface AiStore {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingId: string | null;
  model: ModelId;
  apiKeyConfigured: boolean;

  addUserMessage: (content: string) => string;    // returns id
  beginAssistantMessage: (id: string) => void;
  appendToken: (id: string, token: string) => void;
  finalizeMessage: (id: string, fullText: string, params: ParsedParameter[]) => void;
  markError: (id: string, error: string) => void;
  clearMessages: () => void;
  setModel: (model: ModelId) => void;
  setApiKeyConfigured: (v: boolean) => void;
}

export const useAiStore = create<AiStore>((set) => ({
  messages: [],
  isStreaming: false,
  streamingId: null,
  model: "claude-haiku-4-5-20251001",
  apiKeyConfigured: false,

  addUserMessage: (content) => {
    const id = crypto.randomUUID();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: "user", content, parameters: [], timestamp: Date.now(), streaming: false },
      ],
    }));
    return id;
  },

  beginAssistantMessage: (id) => {
    set((s) => ({
      isStreaming: true,
      streamingId: id,
      messages: [
        ...s.messages,
        { id, role: "assistant", content: "", parameters: [], timestamp: Date.now(), streaming: true },
      ],
    }));
  },

  appendToken: (id, token) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + token } : m
      ),
    })),

  finalizeMessage: (id, fullText, params) =>
    set((s) => ({
      isStreaming: false,
      streamingId: null,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: fullText, parameters: params, streaming: false } : m
      ),
    })),

  markError: (id, error) =>
    set((s) => ({
      isStreaming: false,
      streamingId: null,
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: "", error, streaming: false } : m
      ),
    })),

  clearMessages: () => set({ messages: [] }),
  setModel: (model) => set({ model }),
  setApiKeyConfigured: (v) => set({ apiKeyConfigured: v }),
}));
