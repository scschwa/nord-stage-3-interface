"""
Nord Stage 3 .ns3fp patch file parser.

The .ns3fp file is a ZIP archive containing a binary .ns3f program file.
Byte offsets are reverse-engineered from Chris55/nord-documentation
(https://github.com/Chris55/nord-documentation), licensed MIT.

Bit convention: bit 7 = MSB, bit 0 = LSB within each byte.
Multi-byte fields are read MSB-first across byte boundaries.
"""

import zipfile
import struct
import os
from typing import Any


# ─── Low-level bit helpers ──────────────────────────────────────────────────

def _read_byte(data: bytes, offset: int) -> int:
    if offset >= len(data) or offset < 0:
        return 0
    return data[offset]


def _read_bytes(data: bytes, offset: int, length: int) -> bytes:
    return data[offset:offset + length]


def _read_string(data: bytes, offset: int, length: int) -> str:
    raw = data[offset:offset + length]
    return raw.rstrip(b"\x00").decode("ascii", errors="replace").strip()


def _abs_bit(byte_offset: int, bit: int) -> int:
    """Convert (byte_offset, bit 7=MSB..0=LSB) to absolute bit stream position."""
    return byte_offset * 8 + (7 - bit)


def _read_bits(data: bytes, abs_start: int, n: int) -> int:
    """Read n bits from the absolute MSB-first bit stream position abs_start."""
    result = 0
    for i in range(n):
        pos = abs_start + i
        byte_idx = pos // 8
        bit_in_byte = 7 - (pos % 8)
        result = (result << 1) | ((_read_byte(data, byte_idx) >> bit_in_byte) & 1)
    return result


def _b(data: bytes, byte_offset: int, high_bit: int, low_bit: int = -1) -> int:
    """Convenience: extract bits [high_bit..low_bit] from a SINGLE byte.
    If low_bit is omitted, extract a single bit (high_bit).
    """
    if low_bit < 0:
        low_bit = high_bit
    mask = (1 << (high_bit - low_bit + 1)) - 1
    return (_read_byte(data, byte_offset) >> low_bit) & mask


def _cross(data: bytes, byte_a: int, bit_a_hi: int, byte_b: int, bit_b_hi: int, total_bits: int) -> int:
    """Read a value that starts at bit_a_hi in byte_a, continuing into byte_b.
    total_bits is the total field width."""
    return _read_bits(data, _abs_bit(byte_a, bit_a_hi), total_bits)


# ─── Enum lookup tables ──────────────────────────────────────────────────────

PIANO_TYPES = ["Grand", "Upright", "Electric", "Clav", "Digital", "Misc"]

PIANO_TIMBRE_STANDARD = ["None", "Soft", "Mid", "Bright"]
PIANO_TIMBRE_ELECTRIC = ["None", "Soft", "Mid", "Bright", "Dyno1", "Dyno2"]
PIANO_TIMBRE_CLAV = ["Soft", "Treble", "Soft+Treble", "Brilliant",
                     "Soft+Brilliant", "Treble+Brilliant", "Soft+Treble+Brilliant", "Bass+Brilliant"]
PIANO_KB_TOUCH = ["Normal", "Touch 1", "Touch 2", "Touch 3"]

ORGAN_TYPES = ["B3", "Vox", "Farfisa", "Pipe1", "Pipe2"]
ORGAN_VIBRATO_MODES = ["V1", "C1", "V2", "C2", "V3", "C3"]

SYNTH_VOICE_MODES = ["Poly", "Legato", "Mono"]
SYNTH_UNISON = ["Off", "Detune 1", "Detune 2", "Detune 3"]
SYNTH_VIBRATO = ["Off", "Delay 1", "Delay 2", "Delay 3", "Wheel", "AfterTouch"]
SYNTH_LFO_WAVES = ["Triangle", "Saw", "Neg Saw", "Square", "S&H"]
SYNTH_OSC_TYPES = ["Classic", "Wave", "Formant", "Super", "Sample"]
SYNTH_FILTER_TYPES = ["LP12", "LP24", "Mini Moog", "LP+HP", "BP24", "HP24"]
SYNTH_KB_TRACK = ["Off", "1/3", "2/3", "1"]
SYNTH_DRIVE = ["Off", "Level 1", "Level 2", "Level 3"]
SYNTH_ARP_PATTERNS = ["Up", "Down", "Up/Down", "Random"]
SYNTH_ARP_RANGES = ["1 Oct", "2 Oct", "3 Oct", "4 Oct"]

FX_SOURCES = ["Off", "Piano", "Synth", "Piano+Synth"]
FX1_TYPES = ["A-Pan", "Trem", "RM", "Wa-Wa", "A-Wa 1", "A-Wa 2"]
FX2_TYPES = ["Phas1", "Phas2", "Flanger", "Vibe", "Chor1", "Chor2"]
REVERB_TYPES = ["Room 1", "Room 2", "Stage 1", "Stage 2", "Hall 1", "Hall 2"]
AMP_TYPES = ["No Amp", "Small", "JC", "Twin", "4x4 Cab", "1x12 Cab", "4x12 Cab", "Acoustic"]
ROTARY_SOURCES = ["Off", "Piano+Synth", "Synth", "Piano"]


def _lookup(table: list[str], index: int) -> str:
    if 0 <= index < len(table):
        return table[index]
    return f"Unknown ({index})"


# ─── Section parsers ─────────────────────────────────────────────────────────

def _parse_piano(data: bytes) -> dict[str, Any]:
    """Piano section starting at 0x43."""
    B = 0x43

    on = bool(_b(data, B + 0x00, 7))
    volume = _cross(data, B + 0x00, 2, B + 0x01, 7, 7)  # 3 bits from 0x43 + 4 bits from 0x44
    octave_shift = _read_byte(data, B + 0x04) - 6          # 0x47

    pitch_stick = bool(_b(data, B + 0x05, 7))             # 0x48
    sustain = bool(_b(data, B + 0x05, 6))
    type_idx = _b(data, B + 0x05, 5, 3)
    model = _cross(data, B + 0x05, 2, B + 0x06, 7, 5)    # 0x48 b2-0 + 0x49 b7-6

    timbre_idx = _b(data, B + 0x0B, 5, 3)                 # 0x4E bits 5-3

    kb_touch = _cross(data, B + 0x0A, 0, B + 0x0B, 7, 2)  # 0x4D b0 + 0x4E b7
    soft_release = bool(_b(data, B + 0x0A, 4))
    string_resonance = bool(_b(data, B + 0x0A, 3))
    pedal_noise = bool(_b(data, B + 0x0A, 2))

    piano_type = _lookup(PIANO_TYPES, type_idx)

    if type_idx == 2:       # Electric
        timbre = _lookup(PIANO_TIMBRE_ELECTRIC, timbre_idx)
    elif type_idx == 3:     # Clav
        timbre = _lookup(PIANO_TIMBRE_CLAV, timbre_idx)
    else:
        timbre = _lookup(PIANO_TIMBRE_STANDARD, timbre_idx)

    return {
        "enabled": on,
        "volume": volume,
        "octave_shift": octave_shift,
        "pitch_stick": pitch_stick,
        "sustain": sustain,
        "type": piano_type,
        "model": model,
        "timbre": timbre,
        "kb_touch": _lookup(PIANO_KB_TOUCH, kb_touch),
        "soft_release": soft_release,
        "string_resonance": string_resonance,
        "pedal_noise": pedal_noise,
    }


def _read_drawbars(data: bytes, base_offset: int) -> list[int]:
    """Read 9 drawbar positions (0–8) from a packed bit stream.

    Each drawbar entry is 18 bits: 4-bit position + 7-bit wheel morph + 7-bit AT morph.
    9 drawbars × 18 bits = 162 bits fits in 21 bytes starting at base_offset.
    """
    base_abs = _abs_bit(base_offset, 7)
    drawbars = []
    for i in range(9):
        val = _read_bits(data, base_abs + i * 18, 4)
        drawbars.append(min(val, 8))
    return drawbars


def _parse_organ(data: bytes) -> dict[str, Any]:
    """Organ section starting at 0xB6."""
    B = 0xB6

    on = bool(_b(data, B, 7))
    volume = _cross(data, B, 2, B + 1, 7, 7)            # 0xB6 b2-0 + 0xB7 b7-4
    octave_shift = _read_byte(data, B + 0x04) - 6        # 0xBA

    sustain = bool(_b(data, B + 0x05, 7))                # 0xBB
    type_idx = _b(data, B + 0x05, 6, 4)
    live_mode = bool(_b(data, B + 0x05, 3))
    preset2_on = bool(_b(data, B + 0x05, 2))

    drawbars_1 = _read_drawbars(data, B + 0x08)          # 0xBE
    drawbars_2 = _read_drawbars(data, B + 0x23)          # 0xD9

    # Vibrato/Percussion for preset 1 at 0xD3
    vp1 = 0xD3
    vibrato_on = bool(_b(data, vp1, 4))
    percussion_on = bool(_b(data, vp1, 3))
    harmonic_third = bool(_b(data, vp1, 2))
    decay_fast = bool(_b(data, vp1, 1))
    volume_soft = bool(_b(data, vp1, 0))

    # Organ vibrato mode is stored in global panel at 0x34 bits 3-1
    vib_mode_idx = _b(data, 0x34, 3, 1)

    organ_type = _lookup(ORGAN_TYPES, type_idx)

    # Post-process drawbars for Vox (binary: <4 → 0, ≥4 → 1)
    if type_idx == 1:  # Vox
        drawbars_1 = [0 if v < 4 else 1 for v in drawbars_1]
        drawbars_2 = [0 if v < 4 else 1 for v in drawbars_2]
    # Post-process for Farfisa: position 8 (1') forced to 0
    elif type_idx == 2:  # Farfisa
        if drawbars_1:
            drawbars_1[8] = 0
        if drawbars_2:
            drawbars_2[8] = 0

    return {
        "enabled": on,
        "volume": volume,
        "octave_shift": octave_shift,
        "sustain": sustain,
        "type": organ_type,
        "live_mode": live_mode,
        "preset2_on": preset2_on,
        "vibrato_on": vibrato_on,
        "vibrato_mode": _lookup(ORGAN_VIBRATO_MODES, vib_mode_idx),
        "percussion_on": percussion_on,
        "harmonic_third": harmonic_third,
        "decay_fast": decay_fast,
        "volume_soft": volume_soft,
        "drawbars_1": drawbars_1,
        "drawbars_2": drawbars_2,
    }


def _parse_synth(data: bytes) -> dict[str, Any]:
    """Synth section starting at 0x52."""
    B = 0x52

    on = bool(_b(data, B, 7))
    volume = _cross(data, B, 2, B + 1, 7, 7)
    octave_shift = _read_byte(data, B + 0x04) - 6        # 0x56

    pitch_stick = bool(_b(data, B + 0x05, 7))            # 0x57
    sustain = bool(_b(data, B + 0x05, 6))
    preset_location = _b(data, B + 0x05, 5, 0)

    preset_name = _read_string(data, B + 0x06, 16)       # 0x58, 16 bytes

    # Voice mode: 0x84 b0 + 0x85 b7 = 2 bits
    voice = _cross(data, 0x84, 0, 0x85, 7, 2)
    glide = _b(data, 0x85, 6, 0)

    unison = _b(data, 0x86, 7, 6)
    vibrato = _b(data, 0x86, 5, 3)
    lfo_wave = _b(data, 0x86, 2, 0)
    lfo_master_clock = bool(_b(data, 0x87, 7))
    lfo_rate = _b(data, 0x87, 6, 0)

    # Mod Env: Attack 7-bit at 0x8B b7-1
    mod_attack = _b(data, 0x8B, 7, 1)
    # Mod Env: Decay 7-bit = 0x8B b0 + 0x8C b7-2
    mod_decay = _cross(data, 0x8B, 0, 0x8C, 7, 7)
    # Mod Env: Release 7-bit = 0x8C b1-0 + 0x8D b7-3
    mod_release = _cross(data, 0x8C, 1, 0x8D, 7, 7)
    mod_velocity = bool(_b(data, 0x8D, 2))

    # Oscillator type: 3 bits = 0x8D b1-0 + 0x8E b7
    osc_type = _cross(data, 0x8D, 1, 0x8E, 7, 3)

    # Filter type: 3 bits at 0x98 b4-2
    filter_type = _b(data, 0x98, 4, 2)
    # Filter freq: 7 bits = 0x98 b1-0 + 0x99 b7-3
    filter_freq = _cross(data, 0x98, 1, 0x99, 7, 7)
    # Filter resonance: 7 bits = 0x99 b2-0 + 0x9A b7-4
    filter_res = _cross(data, 0x99, 2, 0x9A, 7, 7)

    # KB Track: 0xA5 b5-4 (2 bits)
    kb_track = _b(data, 0xA5, 5, 4)
    # Drive: 0xA5 b3-2 (2 bits)
    drive = _b(data, 0xA5, 3, 2)

    # Amp Env Attack: 7 bits = 0xA5 b1-0 + 0xA6 b7-3
    amp_attack = _cross(data, 0xA5, 1, 0xA6, 7, 7)
    # Amp Env Decay: 7 bits = 0xA6 b2-0 + 0xA7 b7-4
    amp_decay = _cross(data, 0xA6, 2, 0xA7, 7, 7)
    # Amp Env Release: 7 bits = 0xA7 b3-0 + 0xA8 b7-5
    amp_release = _cross(data, 0xA7, 3, 0xA8, 7, 7)
    amp_velocity = _b(data, 0xA8, 4, 3)

    # Arpeggiator
    arp_on = bool(_b(data, 0x80, 6))
    arp_kb_sync = bool(_b(data, 0x80, 5))
    arp_range = _b(data, 0x80, 4, 3)
    arp_pattern = _b(data, 0x80, 2, 1)
    arp_master_clock = bool(_b(data, 0x80, 0))
    arp_rate = _b(data, 0x81, 7, 1)

    return {
        "enabled": on,
        "volume": volume,
        "octave_shift": octave_shift,
        "pitch_stick": pitch_stick,
        "sustain": sustain,
        "preset_location": preset_location,
        "preset_name": preset_name,
        "voice_mode": _lookup(SYNTH_VOICE_MODES, voice),
        "glide": glide,
        "unison": _lookup(SYNTH_UNISON, unison),
        "vibrato": _lookup(SYNTH_VIBRATO, vibrato),
        "osc_type": _lookup(SYNTH_OSC_TYPES, osc_type),
        "lfo_wave": _lookup(SYNTH_LFO_WAVES, lfo_wave),
        "lfo_rate": lfo_rate,
        "lfo_master_clock": lfo_master_clock,
        "filter_type": _lookup(SYNTH_FILTER_TYPES, filter_type),
        "filter_freq": filter_freq,
        "filter_resonance": filter_res,
        "kb_track": _lookup(SYNTH_KB_TRACK, kb_track),
        "drive": _lookup(SYNTH_DRIVE, drive),
        "mod_env": {
            "attack": mod_attack,
            "decay": mod_decay,
            "release": mod_release,
            "velocity": mod_velocity,
        },
        "amp_env": {
            "attack": amp_attack,
            "decay": amp_decay,
            "release": amp_release,
            "velocity": amp_velocity,
        },
        "arpeggiator": {
            "on": arp_on,
            "kb_sync": arp_kb_sync,
            "range": _lookup(SYNTH_ARP_RANGES, arp_range),
            "pattern": _lookup(SYNTH_ARP_PATTERNS, arp_pattern),
            "master_clock": arp_master_clock,
            "rate": arp_rate,
        },
    }


def _parse_effects(data: bytes) -> dict[str, Any]:
    """Effects section starting at 0x10B."""
    B = 0x10B

    rotary_on = bool(_b(data, B, 7))
    rotary_source_idx = _b(data, B, 6, 5)

    fx1_on = bool(_b(data, B, 4))
    fx1_source_idx = _b(data, B, 3, 2)
    fx1_type = _cross(data, B, 1, B + 1, 7, 3)           # 0x10B b1-0 + 0x10C b7
    fx1_master_clock = bool(_b(data, B + 1, 6))
    fx1_rate = _b(data, B + 1, 5, 0)
    fx1_amount = _b(data, B + 5, 6, 0)                   # 0x110 b6-0

    fx2_on = bool(_b(data, B + 9, 7))                    # 0x114
    fx2_source_idx = _b(data, B + 9, 6, 5)
    fx2_type = _b(data, B + 9, 4, 2)
    fx2_rate = _cross(data, B + 9, 1, B + 10, 7, 7)      # 0x114 b1-0 + 0x115 b7-3
    fx2_amount = _cross(data, B + 10, 2, B + 11, 7, 7)   # 0x115 b2-0 + 0x116 b7-4

    delay_on = bool(_b(data, B + 14, 3))                 # 0x119
    delay_source_idx = _b(data, B + 14, 2, 1)
    delay_master_clock = bool(_b(data, B + 14, 0))
    delay_tempo = _cross(data, B + 15, 7, B + 16, 7, 14) # 0x11A-0x11B, 14-bit
    delay_mix = _cross(data, B + 22, 7, B + 23, 7, 7)   # 0x121-0x122
    ping_pong = bool(_b(data, B + 26, 5))                # 0x125
    delay_filter = _b(data, B + 26, 4, 3)
    delay_feedback = _cross(data, B + 26, 2, B + 27, 7, 7)  # 0x125 b2-0 + 0x126 b7-4

    analog_mode = bool(_b(data, B + 30, 3))              # 0x129
    amp_sim_on = bool(_b(data, B + 30, 2))
    amp_type_idx = _b(data, B + 31, 7, 5)                # 0x12A b7-5
    treble = _cross(data, B + 31, 4, B + 32, 7, 7)       # 0x12A b4-0 + 0x12B b7-6
    mid_res = _cross(data, B + 32, 5, B + 33, 7, 7)      # 0x12B b5-0 + 0x12C b7
    bass_dry_wet = _b(data, B + 33, 6, 0)                # 0x12C b6-0
    mid_freq = _b(data, B + 34, 7, 1)                    # 0x12D b7-1

    # Reverb: type (3 bits) = 0x134 b0 + 0x135 b7-6
    reverb_on = bool(_b(data, B + 9, 7))  # shared with fx2
    reverb_type = _cross(data, 0x134, 0, 0x135, 7, 3)
    reverb_bright = bool(_b(data, 0x135, 5))
    reverb_amount = _cross(data, 0x135, 4, 0x136, 7, 7)

    compressor_on = bool(_b(data, 0x139, 5))
    compressor_amount = _cross(data, 0x139, 4, 0x13A, 7, 7)
    compressor_fast = bool(_b(data, 0x13A, 5))

    return {
        "rotary": {
            "on": rotary_on,
            "source": _lookup(ROTARY_SOURCES, rotary_source_idx),
        },
        "effect1": {
            "on": fx1_on,
            "source": _lookup(FX_SOURCES, fx1_source_idx),
            "type": _lookup(FX1_TYPES, fx1_type),
            "rate": fx1_rate,
            "amount": fx1_amount,
            "master_clock": fx1_master_clock,
        },
        "effect2": {
            "on": fx2_on,
            "source": _lookup(FX_SOURCES, fx2_source_idx),
            "type": _lookup(FX2_TYPES, fx2_type),
            "rate": fx2_rate,
            "amount": fx2_amount,
        },
        "delay": {
            "on": delay_on,
            "source": _lookup(FX_SOURCES, delay_source_idx),
            "master_clock": delay_master_clock,
            "tempo": delay_tempo,
            "mix": delay_mix,
            "ping_pong": ping_pong,
            "filter": delay_filter,
            "feedback": delay_feedback,
            "analog_mode": analog_mode,
        },
        "reverb": {
            "on": reverb_on,
            "type": _lookup(REVERB_TYPES, reverb_type),
            "bright": reverb_bright,
            "amount": reverb_amount,
        },
        "amp_sim_eq": {
            "on": amp_sim_on,
            "amp_type": _lookup(AMP_TYPES, amp_type_idx),
            "treble": treble,
            "mid_res": mid_res,
            "bass_dry_wet": bass_dry_wet,
            "mid_filter_freq": mid_freq,
        },
        "compressor": {
            "on": compressor_on,
            "amount": compressor_amount,
            "fast": compressor_fast,
        },
    }


# ─── Top-level parser ────────────────────────────────────────────────────────

def parse_ns3fp(file_path: str) -> dict[str, Any]:
    """Parse a .ns3fp or .ns3f file and return structured patch data."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    if not file_path.lower().endswith((".ns3fp", ".ns3f")):
        raise ValueError(f"Expected .ns3fp or .ns3f file, got: {file_path}")

    if file_path.lower().endswith(".ns3fp"):
        with zipfile.ZipFile(file_path, "r") as zf:
            ns3f_names = [n for n in zf.namelist() if n.lower().endswith(".ns3f")]
            if not ns3f_names:
                raise ValueError("No .ns3f file found inside .ns3fp archive")
            raw = zf.read(ns3f_names[0])
    else:
        with open(file_path, "rb") as f:
            raw = f.read()

    return _parse_binary(raw, os.path.basename(file_path))


def _parse_binary(data: bytes, filename: str) -> dict[str, Any]:
    """Parse the raw .ns3f binary buffer."""
    # Validate CBIN magic at 0x0000
    magic = _read_bytes(data, 0x00, 4)
    if magic != b"CBIN":
        raise ValueError(f"Invalid Nord Stage 3 file magic: {magic!r} (expected b'CBIN')")

    # File type identifier at 0x0008 should be b"ns3f"
    file_type = _read_bytes(data, 0x08, 4)
    if file_type != b"ns3f":
        raise ValueError(f"Unexpected file type: {file_type!r} (expected b'ns3f')")

    format_type = _read_byte(data, 0x04)   # 0=legacy 574B, 1=new+CRC 592B
    bank = _read_byte(data, 0x0C)
    location = _read_byte(data, 0x0E)
    category = _read_byte(data, 0x10)
    name = _read_string(data, 0x18, 16)
    version = struct.unpack_from(">H", data, 0x2E)[0]  # big-endian at 0x2E

    # Master clock BPM: bits 2-0 of 0x38 + bits 7-3 of 0x39 + 30
    bpm = _cross(data, 0x38, 2, 0x39, 7, 8) + 30

    # Transpose
    transpose_on = bool(_b(data, 0x34, 7))
    transpose_val = _b(data, 0x34, 6, 3) - 6  # stored as 0-12, center=6

    return {
        "filename": filename,
        "format_version": version,
        "format_type": format_type,
        "name": name,
        "bank": bank,
        "location": location,
        "category": category,
        "master_clock_bpm": bpm,
        "transpose": {"on": transpose_on, "semitones": transpose_val},
        "piano": _parse_piano(data),
        "organ": _parse_organ(data),
        "synth": _parse_synth(data),
        "effects": _parse_effects(data),
        "_raw_length": len(data),
    }
