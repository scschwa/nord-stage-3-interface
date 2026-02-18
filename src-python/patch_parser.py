"""
Nord Stage 3 .ns3fp patch file parser.

The .ns3fp file is a ZIP archive containing a binary .ns3f program file.
Byte offsets are reverse-engineered from Chris55/ns3-program-viewer
(https://github.com/Chris55/ns3-program-viewer), licensed MIT.

This is a Phase 3 foundation — currently parses the basic program header
and section enable states. Full parameter extraction will be added
as Phase 3 progresses.
"""

import zipfile
import struct
import os
from typing import Any


# Known byte offsets in the .ns3f binary format
# Based on ns3-program-viewer's src/nord/ns3/program/ns3-program.js
OFFSET = {
    "HEADER":           0x00,   # 4 bytes: file magic
    "VERSION":          0x04,   # 2 bytes: format version
    "BANK":             0x0A,   # 1 byte: bank index
    "LOCATION":         0x0B,   # 1 byte: program location
    "CATEGORY":         0x0C,   # 1 byte: category
    "NAME":             0x10,   # 16 bytes: program name (ASCII)
    "PIANO_ON":         0x2B,   # bit 7: piano section enabled
    "ORGAN_ON":         0x2C,   # bit 7: organ section enabled
    "SYNTH_ON":         0x2D,   # bit 7: synth section enabled
    "MASTER_CLOCK_BPM": 0x38,   # 2 bytes: master clock BPM
}

NORD_MAGIC = b"NORD"


def parse_ns3fp(file_path: str) -> dict[str, Any]:
    """
    Parse a .ns3fp patch file and return a structured dict of patch parameters.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    if not file_path.lower().endswith((".ns3fp", ".ns3f")):
        raise ValueError(f"Expected .ns3fp or .ns3f file, got: {file_path}")

    # .ns3fp is a ZIP archive
    if file_path.lower().endswith(".ns3fp"):
        with zipfile.ZipFile(file_path, "r") as zf:
            # Find the .ns3f binary inside the ZIP
            ns3f_names = [n for n in zf.namelist() if n.endswith(".ns3f")]
            if not ns3f_names:
                raise ValueError("No .ns3f file found inside .ns3fp archive")
            raw = zf.read(ns3f_names[0])
    else:
        with open(file_path, "rb") as f:
            raw = f.read()

    return _parse_binary(raw, os.path.basename(file_path))


def _read_byte(data: bytes, offset: int) -> int:
    if offset >= len(data):
        return 0
    return data[offset]


def _read_bytes(data: bytes, offset: int, length: int) -> bytes:
    return data[offset:offset + length]


def _read_string(data: bytes, offset: int, length: int) -> str:
    raw = data[offset:offset + length]
    return raw.rstrip(b"\x00").decode("ascii", errors="replace")


def _bit(byte_val: int, bit: int) -> bool:
    """Extract bit from byte (bit 7 = MSB)."""
    return bool((byte_val >> bit) & 1)


def _parse_binary(data: bytes, filename: str) -> dict[str, Any]:
    # Validate magic header
    magic = _read_bytes(data, OFFSET["HEADER"], 4)
    if magic != NORD_MAGIC:
        raise ValueError(f"Invalid Nord file magic: {magic!r}")

    version = struct.unpack_from(">H", data, OFFSET["VERSION"])[0]
    name = _read_string(data, OFFSET["NAME"], 16)
    bank = _read_byte(data, OFFSET["BANK"])
    location = _read_byte(data, OFFSET["LOCATION"])

    piano_byte = _read_byte(data, OFFSET["PIANO_ON"])
    organ_byte = _read_byte(data, OFFSET["ORGAN_ON"])
    synth_byte = _read_byte(data, OFFSET["SYNTH_ON"])

    piano_on = _bit(piano_byte, 7)
    organ_on = _bit(organ_byte, 7)
    synth_on = _bit(synth_byte, 7)

    result = {
        "filename": filename,
        "format_version": version,
        "name": name,
        "bank": bank,
        "location": location,
        "sections": {
            "piano": {"enabled": piano_on},
            "organ": {"enabled": organ_on},
            "synth": {"enabled": synth_on},
        },
        "_raw_length": len(data),
        "_note": "Full parameter extraction coming in Phase 3",
    }

    return result
