/** TypeScript types for Nord Stage 3 .ns3fp patch data, as returned by patch_parser.py */

export interface PianoData {
  enabled: boolean;
  volume: number;           // 0–127
  octave_shift: number;     // -6 to +6
  pitch_stick: boolean;
  sustain: boolean;
  type: string;             // "Grand" | "Upright" | "Electric" | "Clav" | "Digital" | "Misc"
  model: number;
  timbre: string;
  kb_touch: string;         // "Normal" | "Touch 1" | "Touch 2" | "Touch 3"
  soft_release: boolean;
  string_resonance: boolean;
  pedal_noise: boolean;
}

export interface OrganData {
  enabled: boolean;
  volume: number;
  octave_shift: number;
  sustain: boolean;
  type: string;             // "B3" | "Vox" | "Farfisa" | "Pipe1" | "Pipe2"
  live_mode: boolean;
  preset2_on: boolean;
  vibrato_on: boolean;
  vibrato_mode: string;     // "V1" | "C1" | "V2" | "C2" | "V3" | "C3"
  percussion_on: boolean;
  harmonic_third: boolean;
  decay_fast: boolean;
  volume_soft: boolean;
  drawbars_1: number[];     // 9 values 0–8
  drawbars_2: number[];     // 9 values 0–8
}

export interface SynthEnvelope {
  attack: number;           // 0–127
  decay: number;
  release: number;
  velocity: boolean | number;
}

export interface SynthArpData {
  on: boolean;
  kb_sync: boolean;
  range: string;            // "1 Oct" | "2 Oct" | "3 Oct" | "4 Oct"
  pattern: string;          // "Up" | "Down" | "Up/Down" | "Random"
  master_clock: boolean;
  rate: number;             // 0–127
}

export interface SynthData {
  enabled: boolean;
  volume: number;
  octave_shift: number;
  pitch_stick: boolean;
  sustain: boolean;
  preset_location: number;
  preset_name: string;
  voice_mode: string;       // "Poly" | "Legato" | "Mono"
  glide: number;            // 0–127
  unison: string;           // "Off" | "Detune 1" | "Detune 2" | "Detune 3"
  vibrato: string;
  osc_type: string;         // "Classic" | "Wave" | "Formant" | "Super" | "Sample"
  lfo_wave: string;
  lfo_rate: number;
  lfo_master_clock: boolean;
  filter_type: string;      // "LP12" | "LP24" | "Mini Moog" | "LP+HP" | "BP24" | "HP24"
  filter_freq: number;      // 0–127
  filter_resonance: number; // 0–127
  kb_track: string;
  drive: string;
  mod_env: SynthEnvelope;
  amp_env: SynthEnvelope;
  arpeggiator: SynthArpData;
}

export interface ReverbData {
  on: boolean;
  type: string;             // "Room 1" | "Room 2" | "Stage 1" | "Stage 2" | "Hall 1" | "Hall 2"
  bright: boolean;
  amount: number;           // 0–127
}

export interface EffectsData {
  rotary: {
    on: boolean;
    source: string;
  };
  effect1: {
    on: boolean;
    source: string;
    type: string;           // "A-Pan" | "Trem" | "RM" | "Wa-Wa" | "A-Wa 1" | "A-Wa 2"
    rate: number;
    amount: number;
    master_clock: boolean;
  };
  effect2: {
    on: boolean;
    source: string;
    type: string;           // "Phas1" | "Phas2" | "Flanger" | "Vibe" | "Chor1" | "Chor2"
    rate: number;
    amount: number;
  };
  delay: {
    on: boolean;
    source: string;
    master_clock: boolean;
    tempo: number;
    mix: number;
    ping_pong: boolean;
    filter: number;
    feedback: number;
    analog_mode: boolean;
  };
  reverb: ReverbData;
  amp_sim_eq: {
    on: boolean;
    amp_type: string;
    treble: number;
    mid_res: number;
    bass_dry_wet: number;
    mid_filter_freq: number;
  };
  compressor: {
    on: boolean;
    amount: number;
    fast: boolean;
  };
}

export interface PatchData {
  filename: string;
  format_version: number;
  format_type: number;
  name: string;
  bank: number;
  location: number;
  category: number;
  master_clock_bpm: number;
  transpose: { on: boolean; semitones: number };
  piano: PianoData;
  organ: OrganData;
  synth: SynthData;
  effects: EffectsData;
  _raw_length: number;
}
