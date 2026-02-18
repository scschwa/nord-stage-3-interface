import { create } from "zustand";
import { MidiEvent } from "../lib/midi/MidiEngine";
import { ChordResult } from "../lib/midi/chordRecognizer";

export interface NoteState {
  velocity: number;
  timestamp: number;
  channel: number;
}

export interface CCState {
  value: number;
  timestamp: number;
}

// Ring buffer for session recording (last 10 minutes of events)
const SESSION_BUFFER_MAX = 50000;

export interface MidiStore {
  // MIDI device state
  inputPortId: string | null;
  inputPortName: string | null;
  isConnected: boolean;
  setInputPort: (id: string, name: string) => void;
  setConnected: (connected: boolean) => void;

  // Live note state: note number → NoteState
  activeNotes: Map<number, NoteState>;
  noteOn: (note: number, velocity: number, channel: number, timestamp: number) => void;
  noteOff: (note: number) => void;

  // CC state: cc number → CCState
  ccValues: Map<number, CCState>;
  setCCValue: (cc: number, value: number, timestamp: number) => void;

  // Pitch bend (-8192 to +8191)
  pitchBend: number;
  setPitchBend: (bend: number) => void;

  // Chord recognition
  currentChord: ChordResult | null;
  setCurrentChord: (chord: ChordResult | null) => void;

  // Session recorder (ring buffer)
  sessionEvents: MidiEvent[];
  addSessionEvent: (event: MidiEvent) => void;
  clearSession: () => void;

  // Recent events for MIDI monitor (last 100)
  recentEvents: MidiEvent[];
}

export const useMidiStore = create<MidiStore>((set, _get) => ({
  inputPortId: null,
  inputPortName: null,
  isConnected: false,
  setInputPort: (id, name) => set({ inputPortId: id, inputPortName: name }),
  setConnected: (connected) => set({ isConnected: connected }),

  activeNotes: new Map(),
  noteOn: (note, velocity, channel, timestamp) =>
    set((state) => {
      const next = new Map(state.activeNotes);
      next.set(note, { velocity, channel, timestamp });
      return { activeNotes: next };
    }),
  noteOff: (note) =>
    set((state) => {
      const next = new Map(state.activeNotes);
      next.delete(note);
      return { activeNotes: next };
    }),

  ccValues: new Map(),
  setCCValue: (cc, value, timestamp) =>
    set((state) => {
      const next = new Map(state.ccValues);
      next.set(cc, { value, timestamp });
      return { ccValues: next };
    }),

  pitchBend: 0,
  setPitchBend: (bend) => set({ pitchBend: bend }),

  currentChord: null,
  setCurrentChord: (chord) => set({ currentChord: chord }),

  sessionEvents: [],
  addSessionEvent: (event) =>
    set((state) => {
      const events = state.sessionEvents;
      if (events.length >= SESSION_BUFFER_MAX) {
        return { sessionEvents: [...events.slice(-SESSION_BUFFER_MAX + 1), event] };
      }
      return { sessionEvents: [...events, event] };
    }),
  clearSession: () => set({ sessionEvents: [] }),

  recentEvents: [],
}));

// Separate updater for recent events to avoid re-renders on session buffer changes
export function addRecentEvent(event: MidiEvent) {
  useMidiStore.setState((state) => {
    const next = [...state.recentEvents, event];
    if (next.length > 100) next.splice(0, next.length - 100);
    return { recentEvents: next };
  });
}
