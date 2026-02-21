/**
 * Nord Stage 3 .ns3fp patch file parser — pure TypeScript.
 *
 * Operates on a raw Uint8Array (the .ns3f binary extracted from the ZIP by Rust).
 * This makes patch loading fully cross-platform with no Python sidecar required.
 *
 * Byte offsets reverse-engineered from Chris55/nord-documentation (MIT).
 * Bit convention: bit 7 = MSB, bit 0 = LSB within each byte.
 */

import type {
  PatchData, PianoData, OrganData, SynthData, EffectsData,
} from "./ns3fpTypes";

// ── Low-level bit helpers ────────────────────────────────────────────────────

function readByte(d: Uint8Array, offset: number): number {
  return offset >= 0 && offset < d.length ? d[offset] : 0;
}

function readString(d: Uint8Array, offset: number, length: number): string {
  let str = "";
  for (let i = offset; i < offset + length; i++) {
    const ch = d[i];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }
  return str.trim();
}

/** Convert (byteOffset, bit 7=MSB..0=LSB) to absolute bit-stream position. */
function absBit(byteOffset: number, bit: number): number {
  return byteOffset * 8 + (7 - bit);
}

/** Read n bits starting at absStart in the MSB-first bit stream. */
function readBits(d: Uint8Array, absStart: number, n: number): number {
  let result = 0;
  for (let i = 0; i < n; i++) {
    const pos = absStart + i;
    const bitInByte = 7 - (pos % 8);
    result = (result << 1) | ((readByte(d, Math.floor(pos / 8)) >> bitInByte) & 1);
  }
  return result;
}

/** Extract bits [highBit..lowBit] from a single byte. */
function b(d: Uint8Array, byteOffset: number, highBit: number, lowBit = highBit): number {
  const mask = (1 << (highBit - lowBit + 1)) - 1;
  return (readByte(d, byteOffset) >> lowBit) & mask;
}

/** Read a value that starts at byteA bit bitAHi, spanning totalBits into byteB. */
function cross(d: Uint8Array, byteA: number, bitAHi: number, _byteB: number, _bitBHi: number, totalBits: number): number {
  return readBits(d, absBit(byteA, bitAHi), totalBits);
}

function lookup(table: readonly string[], index: number): string {
  return index >= 0 && index < table.length ? table[index] : `Unknown (${index})`;
}

// ── Enum tables ──────────────────────────────────────────────────────────────

const PIANO_TYPES         = ["Grand", "Upright", "Electric", "Clav", "Digital", "Misc"] as const;
const PIANO_TIMBRE_STD    = ["None", "Soft", "Mid", "Bright"] as const;
const PIANO_TIMBRE_ELEC   = ["None", "Soft", "Mid", "Bright", "Dyno1", "Dyno2"] as const;
const PIANO_TIMBRE_CLAV   = ["Soft", "Treble", "Soft+Treble", "Brilliant",
                              "Soft+Brilliant", "Treble+Brilliant", "Soft+Treble+Brilliant", "Bass+Brilliant"] as const;
const PIANO_KB_TOUCH      = ["Normal", "Touch 1", "Touch 2", "Touch 3"] as const;

const ORGAN_TYPES         = ["B3", "Vox", "Farfisa", "Pipe1", "Pipe2"] as const;
const ORGAN_VIBRATO_MODES = ["V1", "C1", "V2", "C2", "V3", "C3"] as const;

const SYNTH_VOICE_MODES   = ["Poly", "Legato", "Mono"] as const;
const SYNTH_UNISON        = ["Off", "Detune 1", "Detune 2", "Detune 3"] as const;
const SYNTH_VIBRATO       = ["Off", "Delay 1", "Delay 2", "Delay 3", "Wheel", "AfterTouch"] as const;
const SYNTH_LFO_WAVES     = ["Triangle", "Saw", "Neg Saw", "Square", "S&H"] as const;
const SYNTH_OSC_TYPES     = ["Classic", "Wave", "Formant", "Super", "Sample"] as const;
const SYNTH_FILTER_TYPES  = ["LP12", "LP24", "Mini Moog", "LP+HP", "BP24", "HP24"] as const;
const SYNTH_KB_TRACK      = ["Off", "1/3", "2/3", "1"] as const;
const SYNTH_DRIVE         = ["Off", "Level 1", "Level 2", "Level 3"] as const;
const SYNTH_ARP_PATTERNS  = ["Up", "Down", "Up/Down", "Random"] as const;
const SYNTH_ARP_RANGES    = ["1 Oct", "2 Oct", "3 Oct", "4 Oct"] as const;

const FX_SOURCES          = ["Off", "Piano", "Synth", "Piano+Synth"] as const;
const FX1_TYPES           = ["A-Pan", "Trem", "RM", "Wa-Wa", "A-Wa 1", "A-Wa 2"] as const;
const FX2_TYPES           = ["Phas1", "Phas2", "Flanger", "Vibe", "Chor1", "Chor2"] as const;
const REVERB_TYPES        = ["Room 1", "Room 2", "Stage 1", "Stage 2", "Hall 1", "Hall 2"] as const;
const AMP_TYPES           = ["No Amp", "Small", "JC", "Twin", "4x4 Cab", "1x12 Cab", "4x12 Cab", "Acoustic"] as const;
const ROTARY_SOURCES      = ["Off", "Piano+Synth", "Synth", "Piano"] as const;

// ── Section parsers ──────────────────────────────────────────────────────────

function parsePiano(d: Uint8Array): PianoData {
  const B = 0x43;
  const typeIdx   = b(d, B + 0x05, 5, 3);
  const timbreIdx = b(d, B + 0x0B, 5, 3);
  const timbre = typeIdx === 2 ? lookup(PIANO_TIMBRE_ELEC, timbreIdx)
               : typeIdx === 3 ? lookup(PIANO_TIMBRE_CLAV, timbreIdx)
               :                 lookup(PIANO_TIMBRE_STD,  timbreIdx);
  return {
    enabled:          !!b(d, B + 0x00, 7),
    volume:           cross(d, B + 0x00, 2, B + 0x01, 7, 7),
    octave_shift:     readByte(d, B + 0x04) - 6,
    pitch_stick:      !!b(d, B + 0x05, 7),
    sustain:          !!b(d, B + 0x05, 6),
    type:             lookup(PIANO_TYPES, typeIdx),
    model:            cross(d, B + 0x05, 2, B + 0x06, 7, 5),
    timbre,
    kb_touch:         lookup(PIANO_KB_TOUCH, cross(d, B + 0x0A, 0, B + 0x0B, 7, 2)),
    soft_release:     !!b(d, B + 0x0A, 4),
    string_resonance: !!b(d, B + 0x0A, 3),
    pedal_noise:      !!b(d, B + 0x0A, 2),
  };
}

function readDrawbars(d: Uint8Array, baseOffset: number): number[] {
  // Each drawbar entry: 18 bits (4-bit position + 7-bit wheel morph + 7-bit AT morph)
  const baseAbs = absBit(baseOffset, 7);
  return Array.from({ length: 9 }, (_, i) => Math.min(readBits(d, baseAbs + i * 18, 4), 8));
}

function parseOrgan(d: Uint8Array): OrganData {
  const B = 0xB6;
  const typeIdx = b(d, B + 0x05, 6, 4);

  let drawbars1 = readDrawbars(d, B + 0x08); // 0xBE
  let drawbars2 = readDrawbars(d, B + 0x23); // 0xD9

  if (typeIdx === 1) {        // Vox: binary positions only
    drawbars1 = drawbars1.map(v => v < 4 ? 0 : 1);
    drawbars2 = drawbars2.map(v => v < 4 ? 0 : 1);
  } else if (typeIdx === 2) { // Farfisa: 1' drawbar (index 8) always 0
    drawbars1[8] = 0;
    drawbars2[8] = 0;
  }

  const vp1 = 0xD3;
  return {
    enabled:        !!b(d, B, 7),
    volume:         cross(d, B, 2, B + 1, 7, 7),
    octave_shift:   readByte(d, B + 0x04) - 6,
    sustain:        !!b(d, B + 0x05, 7),
    type:           lookup(ORGAN_TYPES, typeIdx),
    live_mode:      !!b(d, B + 0x05, 3),
    preset2_on:     !!b(d, B + 0x05, 2),
    vibrato_on:     !!b(d, vp1, 4),
    vibrato_mode:   lookup(ORGAN_VIBRATO_MODES, b(d, 0x34, 3, 1)),
    percussion_on:  !!b(d, vp1, 3),
    harmonic_third: !!b(d, vp1, 2),
    decay_fast:     !!b(d, vp1, 1),
    volume_soft:    !!b(d, vp1, 0),
    drawbars_1:     drawbars1,
    drawbars_2:     drawbars2,
  };
}

function parseSynth(d: Uint8Array): SynthData {
  const B = 0x52;
  return {
    enabled:          !!b(d, B, 7),
    volume:           cross(d, B, 2, B + 1, 7, 7),
    octave_shift:     readByte(d, B + 0x04) - 6,
    pitch_stick:      !!b(d, B + 0x05, 7),
    sustain:          !!b(d, B + 0x05, 6),
    preset_location:  b(d, B + 0x05, 5, 0),
    preset_name:      readString(d, B + 0x06, 16),
    voice_mode:       lookup(SYNTH_VOICE_MODES,  cross(d, 0x84, 0, 0x85, 7, 2)),
    glide:            b(d, 0x85, 6, 0),
    unison:           lookup(SYNTH_UNISON,        b(d, 0x86, 7, 6)),
    vibrato:          lookup(SYNTH_VIBRATO,        b(d, 0x86, 5, 3)),
    osc_type:         lookup(SYNTH_OSC_TYPES,      cross(d, 0x8D, 1, 0x8E, 7, 3)),
    lfo_wave:         lookup(SYNTH_LFO_WAVES,      b(d, 0x86, 2, 0)),
    lfo_rate:         b(d, 0x87, 6, 0),
    lfo_master_clock: !!b(d, 0x87, 7),
    filter_type:      lookup(SYNTH_FILTER_TYPES,   b(d, 0x98, 4, 2)),
    filter_freq:      cross(d, 0x98, 1, 0x99, 7, 7),
    filter_resonance: cross(d, 0x99, 2, 0x9A, 7, 7),
    kb_track:         lookup(SYNTH_KB_TRACK,        b(d, 0xA5, 5, 4)),
    drive:            lookup(SYNTH_DRIVE,            b(d, 0xA5, 3, 2)),
    mod_env: {
      attack:   b(d, 0x8B, 7, 1),
      decay:    cross(d, 0x8B, 0, 0x8C, 7, 7),
      release:  cross(d, 0x8C, 1, 0x8D, 7, 7),
      velocity: !!b(d, 0x8D, 2),
    },
    amp_env: {
      attack:   cross(d, 0xA5, 1, 0xA6, 7, 7),
      decay:    cross(d, 0xA6, 2, 0xA7, 7, 7),
      release:  cross(d, 0xA7, 3, 0xA8, 7, 7),
      velocity: b(d, 0xA8, 4, 3),
    },
    arpeggiator: {
      on:           !!b(d, 0x80, 6),
      kb_sync:      !!b(d, 0x80, 5),
      range:        lookup(SYNTH_ARP_RANGES,   b(d, 0x80, 4, 3)),
      pattern:      lookup(SYNTH_ARP_PATTERNS, b(d, 0x80, 2, 1)),
      master_clock: !!b(d, 0x80, 0),
      rate:         b(d, 0x81, 7, 1),
    },
  };
}

function parseEffects(d: Uint8Array): EffectsData {
  const B = 0x10B;
  return {
    rotary: {
      on:     !!b(d, B, 7),
      source: lookup(ROTARY_SOURCES, b(d, B, 6, 5)),
    },
    effect1: {
      on:           !!b(d, B, 4),
      source:       lookup(FX_SOURCES, b(d, B, 3, 2)),
      type:         lookup(FX1_TYPES,  cross(d, B, 1, B + 1, 7, 3)),
      master_clock: !!b(d, B + 1, 6),
      rate:         b(d, B + 1, 5, 0),
      amount:       b(d, B + 5, 6, 0),
    },
    effect2: {
      on:     !!b(d, B + 9, 7),
      source: lookup(FX_SOURCES, b(d, B + 9, 6, 5)),
      type:   lookup(FX2_TYPES,  b(d, B + 9, 4, 2)),
      rate:   cross(d, B + 9, 1, B + 10, 7, 7),
      amount: cross(d, B + 10, 2, B + 11, 7, 7),
    },
    delay: {
      on:           !!b(d, B + 14, 3),
      source:       lookup(FX_SOURCES, b(d, B + 14, 2, 1)),
      master_clock: !!b(d, B + 14, 0),
      tempo:        cross(d, B + 15, 7, B + 16, 7, 14),
      mix:          cross(d, B + 22, 7, B + 23, 7, 7),
      ping_pong:    !!b(d, B + 26, 5),
      filter:       b(d, B + 26, 4, 3),
      feedback:     cross(d, B + 26, 2, B + 27, 7, 7),
      analog_mode:  !!b(d, B + 30, 3),
    },
    reverb: {
      on:     !!b(d, B + 9, 7),
      type:   lookup(REVERB_TYPES, cross(d, 0x134, 0, 0x135, 7, 3)),
      bright: !!b(d, 0x135, 5),
      amount: cross(d, 0x135, 4, 0x136, 7, 7),
    },
    amp_sim_eq: {
      on:              !!b(d, B + 30, 2),
      amp_type:        lookup(AMP_TYPES, b(d, B + 31, 7, 5)),
      treble:          cross(d, B + 31, 4, B + 32, 7, 7),
      mid_res:         cross(d, B + 32, 5, B + 33, 7, 7),
      bass_dry_wet:    b(d, B + 33, 6, 0),
      mid_filter_freq: b(d, B + 34, 7, 1),
    },
    compressor: {
      on:     !!b(d, 0x139, 5),
      amount: cross(d, 0x139, 4, 0x13A, 7, 7),
      fast:   !!b(d, 0x13A, 5),
    },
  };
}

// ── Top-level parser ─────────────────────────────────────────────────────────

/**
 * Parse a raw .ns3f binary buffer into a structured PatchData object.
 * The buffer must already be extracted from the .ns3fp ZIP by the caller.
 */
export function parseNs3f(data: Uint8Array, filename: string): PatchData {
  const magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
  if (magic !== "CBIN")
    throw new Error(`Invalid Nord Stage 3 file magic: "${magic}" (expected "CBIN")`);

  const fileType = String.fromCharCode(data[8], data[9], data[10], data[11]);
  if (fileType !== "ns3f")
    throw new Error(`Unexpected file type: "${fileType}" (expected "ns3f")`);

  // Big-endian uint16 at 0x2E
  const version = (data[0x2E] << 8) | data[0x2F];
  // Master clock BPM: 8 bits spanning 0x38 b2-0 + 0x39 b7-3, offset +30
  const bpm = cross(data, 0x38, 2, 0x39, 7, 8) + 30;

  return {
    filename,
    format_version:   version,
    format_type:      readByte(data, 0x04),
    name:             readString(data, 0x18, 16),
    bank:             readByte(data, 0x0C),
    location:         readByte(data, 0x0E),
    category:         readByte(data, 0x10),
    master_clock_bpm: bpm,
    transpose: {
      on:        !!b(data, 0x34, 7),
      semitones: b(data, 0x34, 6, 3) - 6,
    },
    piano:   parsePiano(data),
    organ:   parseOrgan(data),
    synth:   parseSynth(data),
    effects: parseEffects(data),
    _raw_length: data.length,
  };
}
