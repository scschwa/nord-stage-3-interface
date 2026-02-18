// useNoteCapture: watches active notes and tracks note-on/off pairs into
// the session store. Triggers MusicXML generation when recording stops.

import { useEffect, useRef } from "react";
import { useMidiStore } from "../store/midiStore";
import { useSessionStore } from "../store/sessionStore";
import { RawNoteEvent } from "../lib/midi/noteQuantizer";
import { quantizeNotes } from "../lib/midi/noteQuantizer";
import { generateMusicXml } from "../lib/midi/musicXmlGenerator";

interface HeldNote {
  startMs: number;
  velocity: number;
  channel: number;
}

export function useNoteCapture() {
  // Notes currently held down, tracked independently of the MIDI store
  const heldRef = useRef<Map<number, HeldNote>>(new Map());

  const activeNotes = useMidiStore((s) => s.activeNotes);
  const prevActiveRef = useRef<Map<number, unknown>>(new Map());

  const { recordingState, addCapturedNote, setMusicXml } = useSessionStore();
  const recordingStateRef = useRef(recordingState);
  recordingStateRef.current = recordingState;

  // Detect note-on / note-off transitions
  useEffect(() => {
    if (recordingStateRef.current !== "recording") {
      prevActiveRef.current = new Map(activeNotes);
      return;
    }

    const recStart = useSessionStore.getState().recordingStartMs;
    if (!recStart) return;
    const now = Date.now();

    // New note-ons
    activeNotes.forEach((noteState, noteNum) => {
      if (!prevActiveRef.current.has(noteNum)) {
        heldRef.current.set(noteNum, {
          startMs: now,
          velocity: noteState.velocity,
          channel: noteState.channel,
        });
      }
    });

    // Note-offs
    prevActiveRef.current.forEach((_, noteNum) => {
      if (!activeNotes.has(noteNum)) {
        const held = heldRef.current.get(noteNum);
        if (held) {
          addCapturedNote({
            note: noteNum,
            velocity: held.velocity,
            channel: held.channel,
            startMs: held.startMs - recStart,
            endMs: now - recStart,
          });
          heldRef.current.delete(noteNum);
        }
      }
    });

    prevActiveRef.current = new Map(activeNotes);
  }, [activeNotes, addCapturedNote]);

  // On recording stop: flush held notes + generate MusicXML
  useEffect(() => {
    if (recordingState !== "stopped") return;

    const recStart = useSessionStore.getState().recordingStartMs;
    const now = Date.now();
    const storeNotes = useSessionStore.getState().capturedNotes;

    // Flush still-held notes
    const flushed: RawNoteEvent[] = [];
    heldRef.current.forEach((held, noteNum) => {
      if (recStart) {
        flushed.push({
          note: noteNum,
          velocity: held.velocity,
          channel: held.channel,
          startMs: held.startMs - recStart,
          endMs: now - recStart,
        });
      }
    });
    heldRef.current.clear();

    const allNotes = [...storeNotes, ...flushed].sort((a, b) => a.startMs - b.startMs);

    if (allNotes.length === 0) {
      setMusicXml("", 120);
      return;
    }

    const result = quantizeNotes(allNotes);
    const xml = generateMusicXml(result, "Captured Performance");
    setMusicXml(xml, result.bpm);
  }, [recordingState, setMusicXml]);
}
