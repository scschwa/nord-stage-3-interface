# Nord Stage 3 Interface

A desktop companion application for the **Nord Stage 3** keyboard. Connect via USB MIDI to get a live note visualizer, real-time sheet music capture, a patch settings viewer, and an AI sound design assistant — all in one window.

---

## Features

### Piano Visualizer
Plug in your Nord and play. Notes light up on an 88-key SVG keyboard and fall as color-coded bars (Piano VFX style), rendered in WebGL via PixiJS. Chord names are detected in real time and displayed above the keys.

### Sheet Music Capture
Hit **Record**, play a phrase, hit **Stop**. The app quantizes your notes (with BPM auto-detection), generates MusicXML, and renders it as sheet music using OpenSheetMusicDisplay. Export to **MusicXML** or print to **PDF** directly from the app.

### Patch Viewer
Load a `.ns3fp` patch file from disk. The app parses the binary format and displays all settings across four tabs:

- **Piano** — type, model, timbre, KB touch, soft release, string resonance
- **Organ** — drawbar positions (visual fill bars), vibrato, percussion, preset 1/2
- **Synth** — oscillator type, filter, envelopes, LFO, arpeggiator, voice mode
- **Effects** — rotary, effect 1/2, delay, reverb, amp/EQ sim, compressor

Live CC overlays show which knobs you have physically moved since connecting. The viewer also tracks Program Change messages so it can auto-switch when you change presets on the Nord.

> **Note:** The Nord Stage 3 does not transmit its full settings over MIDI or SysEx. Patch settings are read from `.ns3fp` files only.

### AI Sound Designer
Describe any sound in plain language. The app streams a response from Claude (Anthropic), returning specific Nord knob settings with panel locations and explanations. If a patch is loaded, the AI receives it as context and can suggest targeted changes.

Your Anthropic API key is stored securely in **Windows Credential Manager** — it never touches the frontend or any file on disk.

### MIDI Monitor
A scrolling log of all incoming MIDI events (note on/off, CC, pitch bend, program change) with color-coded event types — useful for debugging or inspecting CC assignments.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 18+ | |
| [Rust](https://rustup.rs) | stable | Via rustup |
| [Python](https://python.org) | 3.12 | For patch parsing sidecar (Windows) |
| [Tauri CLI v2](https://tauri.app) | 2.x | Installed via npm |

Install Python dependencies (one-time):
```bash
cd src-python
pip install -r requirements.txt
```

Ensure `cargo` is on your PATH. If it was installed by rustup but isn't found, add it:
```powershell
# Run once in PowerShell, then restart your terminal
[System.Environment]::SetEnvironmentVariable(
  "PATH",
  "C:\Users\<you>\.cargo\bin;" + [System.Environment]::GetEnvironmentVariable("PATH", "User"),
  "User"
)
```

---

## Getting Started

```bash
# Install frontend dependencies
npm install

# Start the app in development mode (compiles Rust + starts Vite dev server)
npm run tauri dev
```

The first run takes ~1–2 minutes as Rust compiles all dependencies. Subsequent starts are fast.

To build a distributable installer:
```bash
npm run tauri build
```

---

## Connecting Your Nord Stage 3

1. Connect the Nord to your PC via USB.
2. Launch the app.
3. Open the **Visualizer** tab. The MIDI device selector in the toolbar will list available ports.
4. Select the Nord port (usually labelled `Nord Stage 3` or similar).
5. Play — notes should appear immediately.

---

## Loading a Patch File

1. Go to the **Patch** tab.
2. Wait for the sidecar badge in the header to show **Ready** (green dot).
3. Click **Load Patch** and select a `.ns3fp` file.

Patch files are stored on the Nord itself (use Nord Sound Manager to export them) or downloaded from [Nord User Library](https://www.nordkeyboards.com/sound-library).

---

## Setting Up the AI Assistant

1. Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com).
2. Go to the **AI** tab.
3. Click **⚙ Set Key** and paste your key (starts with `sk-ant-`).
4. Choose **Fast** (claude-haiku — quick suggestions) or **Deep** (claude-sonnet — detailed analysis).
5. Type a sound description, e.g. *"warm Oberheim pad in a large hall"* or *"bright funk Clavinet with envelope filter"*.

If a patch is loaded in the Patch tab, the AI automatically receives it as context and can suggest specific changes to your current sound.

---

## Project Structure

```
nord-stage-3-interface/
├── src/                          # React / TypeScript frontend
│   ├── components/
│   │   ├── ai/                   # AiAssistant, ParameterCard, ApiKeyModal
│   │   ├── layout/               # Toolbar
│   │   ├── midi/                 # DeviceSelector, MidiMonitor
│   │   ├── patchviewer/          # PatchPanel (4-tab patch display)
│   │   ├── sheetmusic/           # SheetMusicPanel, CaptureControls, ExportModal
│   │   └── visualizer/           # PianoVisualizer, FallingBars, KeyboardDisplay
│   ├── hooks/
│   │   ├── useAiStream.ts        # Tauri event wiring for Claude streaming
│   │   ├── useMidi.ts            # Web MIDI device management
│   │   ├── useNoteCapture.ts     # Recording + MusicXML generation trigger
│   │   └── useSidecar.ts        # Python sidecar lifecycle + patch file parsing
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── nordPrompt.ts     # Nord-specific Claude system prompt
│   │   │   └── paramParser.ts    # Parses <parameter> tags from AI responses
│   │   ├── midi/
│   │   │   ├── MidiEngine.ts     # Raw MIDI byte parser
│   │   │   ├── ccMapper.ts       # CC number → Nord parameter name
│   │   │   ├── chordRecognizer.ts
│   │   │   ├── musicXmlGenerator.ts
│   │   │   └── noteQuantizer.ts  # BPM detection + grid quantization
│   │   └── patch/
│   │       ├── ns3fpParser.ts    # Pure-TS binary .ns3f parser (no Python needed)
│   │       └── ns3fpTypes.ts     # TypeScript interfaces for patch data
│   └── store/
│       ├── aiStore.ts            # Chat message state
│       ├── midiStore.ts          # Live MIDI state + event ring buffer
│       ├── patchStore.ts         # Loaded patch data + sidecar status
│       └── sessionStore.ts       # Recording state + captured notes
│
├── src-tauri/                    # Rust / Tauri backend
│   └── src/
│       ├── ai_assistant.rs       # Claude API streaming + Windows keychain
│       ├── lib.rs                # Sidecar spawn, file dialog, ZIP reader
│       └── main.rs               # Entry point
│
└── src-python/                   # Python sidecar (optional, desktop only)
    ├── main.py                   # FastAPI server on port 47821
    ├── patch_parser.py           # .ns3fp binary parser (Python reference impl.)
    └── requirements.txt
```

---

## Architecture Notes

### MIDI
The app uses `tauri-plugin-midi` which wraps the Rust `midir` crate and polyfills `navigator.requestMIDIAccess()` in the Tauri WebView. This avoids Web MIDI's browser security restrictions.

### Patch Parsing
`.ns3fp` files are ZIP archives containing a binary `.ns3f` program file. Byte offsets are reverse-engineered from [Chris55/nord-documentation](https://github.com/Chris55/nord-documentation) (MIT licensed).

Parsing is done in pure TypeScript (`ns3fpParser.ts`) — Rust reads and extracts the ZIP, TypeScript does all bit-level field extraction. No Python required for patch loading.

### AI Streaming
The Rust backend (`ai_assistant.rs`) reads the API key from Windows Credential Manager, makes a streaming POST to the Anthropic API, and emits Tauri events (`ai-token`, `ai-done`, `ai-error`) to the frontend. The key never enters the WebView process.

### Sheet Music
Notes are captured as raw MIDI events, BPM is detected via inter-onset interval analysis, and notes are quantized to the nearest rhythmic grid position before MusicXML is generated entirely in TypeScript — no server round-trip.

### Python Sidecar
The FastAPI sidecar (`src-python/main.py`) runs on `localhost:47821`. It is started automatically on app launch (desktop only) and kept alive for the session. On Android it is skipped entirely. Currently only used for the `/parse-patch` endpoint as a reference path; the primary patch parsing path is the TypeScript parser.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 (Rust) |
| Frontend | React 19, TypeScript, Vite |
| State | Zustand v5 |
| Visualizer | PixiJS v8 (WebGL) |
| Sheet music | OpenSheetMusicDisplay (OSMD) |
| MIDI | tauri-plugin-midi (midir) |
| AI | Anthropic Claude API (Haiku / Sonnet) |
| API key storage | Windows Credential Manager (keyring crate) |
| Patch parsing | Pure TypeScript + Rust ZIP extraction |
| Python sidecar | FastAPI + uvicorn |

---

## Development Tips

**TypeScript check:**
```bash
npx tsc --noEmit
```

**Rust check (without full compile):**
```powershell
cd src-tauri
cargo check
```

**VS Code extensions:** Install the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions for inline Rust diagnostics.

**Build output location:** The Rust binary and build artifacts are placed in `%LOCALAPPDATA%\nord-stage-3-interface\target` (outside OneDrive) to avoid sync conflicts with large binary files.

---

## Limitations

- **Windows only** (current build). Android support is in progress — prerequisites: Android Studio, NDK 26, and `rustup target add aarch64-linux-android`.
- The Nord Stage 3 **does not send patch settings over MIDI or SysEx**. Only note events, CC, pitch bend, aftertouch, and program changes are available in real time. Full patch data requires loading a `.ns3fp` file.
- PDF export uses the browser's print dialog (`window.print()`). For best results, set paper size to A4 landscape and disable headers/footers.
