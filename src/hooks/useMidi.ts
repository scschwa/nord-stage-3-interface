import { useEffect, useRef, useState } from "react";
import { parseMidiMessage } from "../lib/midi/MidiEngine";
import { recognizeChord } from "../lib/midi/chordRecognizer";
import { useMidiStore, addRecentEvent } from "../store/midiStore";

export interface MidiPort {
  id: string;
  name: string;
  type: "input" | "output";
}

export function useMidi() {
  const [inputPorts, setInputPorts] = useState<MidiPort[]>([]);
  const [error, setError] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);

  const { setInputPort, setConnected, noteOn, noteOff, setCCValue, setPitchBend, setCurrentChord, addSessionEvent } =
    useMidiStore();

  const refreshPorts = (access: MIDIAccess) => {
    const ports: MidiPort[] = [];
    access.inputs.forEach((input) => {
      ports.push({ id: input.id, name: input.name ?? input.id, type: "input" });
    });
    setInputPorts(ports);
  };

  useEffect(() => {
    if (typeof navigator.requestMIDIAccess !== "function") {
      setError("WebMIDI not available. Make sure the MIDI plugin is loaded.");
      return;
    }

    navigator.requestMIDIAccess({ sysex: false }).then((access) => {
      midiAccessRef.current = access;
      refreshPorts(access);

      access.onstatechange = () => refreshPorts(access);
    }).catch((err) => {
      setError(`Failed to get MIDI access: ${err}`);
    });

    return () => {
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null;
      }
    };
  }, []);

  const connectToPort = (portId: string) => {
    const access = midiAccessRef.current;
    if (!access) return;

    // Disconnect current
    if (activeInputRef.current) {
      activeInputRef.current.onmidimessage = null;
    }

    const input = access.inputs.get(portId);
    if (!input) return;

    activeInputRef.current = input;
    setInputPort(portId, input.name ?? portId);
    setConnected(true);

    input.onmidimessage = (event: MIDIMessageEvent) => {
      if (!event.data) return;
      const parsed = parseMidiMessage(event.data, event.timeStamp);

      // Update stores
      switch (parsed.type) {
        case "noteOn":
          noteOn(parsed.note!, parsed.velocity!, parsed.channel, parsed.timestamp);
          // Chord recognition from current active notes
          setTimeout(() => {
            const notes = Array.from(useMidiStore.getState().activeNotes.keys());
            setCurrentChord(recognizeChord(notes));
          }, 0);
          break;
        case "noteOff":
          noteOff(parsed.note!);
          setTimeout(() => {
            const notes = Array.from(useMidiStore.getState().activeNotes.keys());
            setCurrentChord(notes.length >= 2 ? recognizeChord(notes) : null);
          }, 0);
          break;
        case "controlChange":
          setCCValue(parsed.controller!, parsed.value!, parsed.timestamp);
          break;
        case "pitchBend":
          setPitchBend(parsed.bend!);
          break;
      }

      addSessionEvent(parsed);
      addRecentEvent(parsed);
    };

    input.onstatechange = () => {
      if (input.state === "disconnected") {
        setConnected(false);
      }
    };
  };

  const disconnect = () => {
    if (activeInputRef.current) {
      activeInputRef.current.onmidimessage = null;
      activeInputRef.current = null;
    }
    setConnected(false);
  };

  return { inputPorts, connectToPort, disconnect, error };
}
