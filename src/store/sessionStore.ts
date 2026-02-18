import { create } from "zustand";
import { RawNoteEvent } from "../lib/midi/noteQuantizer";

export type RecordingState = "idle" | "recording" | "stopped";

export interface SessionStore {
  recordingState: RecordingState;
  recordingStartMs: number | null;
  recordingDurationMs: number;   // live elapsed ms while recording
  capturedNotes: RawNoteEvent[]; // notes captured during the current take
  musicXml: string | null;       // generated MusicXML from last capture
  detectedBpm: number | null;

  startRecording: () => void;
  stopRecording: () => void;
  clearCapture: () => void;
  addCapturedNote: (note: RawNoteEvent) => void;
  setMusicXml: (xml: string, bpm: number) => void;
  tickDuration: () => void;      // called every second while recording
}

export const useSessionStore = create<SessionStore>((set, _get) => ({
  recordingState: "idle",
  recordingStartMs: null,
  recordingDurationMs: 0,
  capturedNotes: [],
  musicXml: null,
  detectedBpm: null,

  startRecording: () =>
    set({
      recordingState: "recording",
      recordingStartMs: Date.now(),
      recordingDurationMs: 0,
      capturedNotes: [],
      musicXml: null,
      detectedBpm: null,
    }),

  stopRecording: () =>
    set((s) => ({
      recordingState: "stopped",
      recordingDurationMs: s.recordingStartMs
        ? Date.now() - s.recordingStartMs
        : s.recordingDurationMs,
    })),

  clearCapture: () =>
    set({
      recordingState: "idle",
      recordingStartMs: null,
      recordingDurationMs: 0,
      capturedNotes: [],
      musicXml: null,
      detectedBpm: null,
    }),

  addCapturedNote: (note) =>
    set((s) => ({ capturedNotes: [...s.capturedNotes, note] })),

  setMusicXml: (xml, bpm) =>
    set({ musicXml: xml, detectedBpm: bpm }),

  tickDuration: () =>
    set((s) => ({
      recordingDurationMs: s.recordingStartMs
        ? Date.now() - s.recordingStartMs
        : s.recordingDurationMs,
    })),
}));
