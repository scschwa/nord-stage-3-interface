// MIDI Engine: parses raw MIDI bytes into structured events

export type MidiMessageType =
  | "noteOn"
  | "noteOff"
  | "controlChange"
  | "programChange"
  | "pitchBend"
  | "channelPressure"
  | "polyPressure"
  | "sysex"
  | "unknown";

export interface MidiEvent {
  type: MidiMessageType;
  channel: number;    // 1-16
  timestamp: number;
  raw: number[];
  // noteOn / noteOff
  note?: number;
  velocity?: number;
  // controlChange
  controller?: number;
  value?: number;
  // programChange
  program?: number;
  // pitchBend (-8192 to +8191)
  bend?: number;
  // channelPressure / polyPressure
  pressure?: number;
}

export function parseMidiMessage(data: Uint8Array, timestamp: number): MidiEvent {
  const status = data[0];
  const type = (status & 0xf0) >> 4;
  const channel = (status & 0x0f) + 1;
  const raw = Array.from(data);

  switch (type) {
    case 0x9: {  // Note On (velocity 0 = note off)
      const note = data[1];
      const velocity = data[2];
      return {
        type: velocity > 0 ? "noteOn" : "noteOff",
        channel, timestamp, raw, note, velocity,
      };
    }
    case 0x8:    // Note Off
      return {
        type: "noteOff",
        channel, timestamp, raw,
        note: data[1], velocity: data[2],
      };
    case 0xb:    // Control Change
      return {
        type: "controlChange",
        channel, timestamp, raw,
        controller: data[1], value: data[2],
      };
    case 0xc:    // Program Change
      return {
        type: "programChange",
        channel, timestamp, raw,
        program: data[1],
      };
    case 0xe:    // Pitch Bend
      return {
        type: "pitchBend",
        channel, timestamp, raw,
        bend: ((data[2] << 7) | data[1]) - 8192,
      };
    case 0xd:    // Channel Pressure (aftertouch)
      return {
        type: "channelPressure",
        channel, timestamp, raw,
        pressure: data[1],
      };
    case 0xa:    // Polyphonic Key Pressure
      return {
        type: "polyPressure",
        channel, timestamp, raw,
        note: data[1], pressure: data[2],
      };
    case 0xf:    // SysEx
      return { type: "sysex", channel: 0, timestamp, raw };
    default:
      return { type: "unknown", channel, timestamp, raw };
  }
}

// MIDI note number to note name (e.g. 60 → "C4")
export function midiNoteToName(note: number): string {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(note / 12) - 1;
  return `${noteNames[note % 12]}${octave}`;
}

// Note number to frequency in Hz
export function midiNoteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
