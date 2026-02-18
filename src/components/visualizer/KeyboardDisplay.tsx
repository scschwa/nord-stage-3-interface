import { useMemo } from "react";
import { useMidiStore } from "../../store/midiStore";
import "./KeyboardDisplay.css";

// 88-key piano: A0 (21) through C8 (108)
const FIRST_NOTE = 21;
const LAST_NOTE = 108;

// Which pitch classes (0-11) are black keys
const BLACK_KEY_PCS = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

interface KeyInfo {
  note: number;
  isBlack: boolean;
  whiteIndex: number; // position among white keys
}

function buildKeyLayout(): KeyInfo[] {
  const keys: KeyInfo[] = [];
  let whiteIndex = 0;
  for (let note = FIRST_NOTE; note <= LAST_NOTE; note++) {
    const pc = note % 12;
    const isBlack = BLACK_KEY_PCS.has(pc);
    keys.push({ note, isBlack, whiteIndex: isBlack ? whiteIndex - 1 : whiteIndex });
    if (!isBlack) whiteIndex++;
  }
  return keys;
}

const KEY_LAYOUT = buildKeyLayout();
const WHITE_KEY_COUNT = KEY_LAYOUT.filter((k) => !k.isBlack).length;

// Key dimensions
const WHITE_KEY_WIDTH = 14;
const WHITE_KEY_HEIGHT = 80;
const BLACK_KEY_WIDTH = 9;
const BLACK_KEY_HEIGHT = 50;

// Black key offset within a white key group
const BLACK_OFFSETS: Record<number, number> = {
  1: 9,   // C# (after C)
  3: 23,  // D# (after D)
  6: 51,  // F# (after F)
  8: 65,  // G# (after G)
  10: 79, // A# (after A)
};

function getKeyX(key: KeyInfo): number {
  if (!key.isBlack) {
    return key.whiteIndex * WHITE_KEY_WIDTH;
  }
  // Black key: find the white key group start
  const pc = key.note % 12;
  const octaveStart = key.whiteIndex * WHITE_KEY_WIDTH;
  return octaveStart + (BLACK_OFFSETS[pc] ?? 0) - 2;
}

// Colors for active notes by velocity
function noteColor(velocity: number): string {
  const hue = 200 - Math.floor((velocity / 127) * 60); // blue to teal
  const lightness = 40 + Math.floor((velocity / 127) * 30);
  return `hsl(${hue}, 90%, ${lightness}%)`;
}

const TOTAL_WIDTH = WHITE_KEY_COUNT * WHITE_KEY_WIDTH;
const TOTAL_HEIGHT = WHITE_KEY_HEIGHT + 4;

export function KeyboardDisplay() {
  const activeNotes = useMidiStore((s) => s.activeNotes);
  const currentChord = useMidiStore((s) => s.currentChord);

  const svgKeys = useMemo(() => {
    const whites = KEY_LAYOUT.filter((k) => !k.isBlack);
    const blacks = KEY_LAYOUT.filter((k) => k.isBlack);
    return { whites, blacks };
  }, []);

  return (
    <div className="keyboard-container">
      {currentChord && (
        <div className="chord-display">
          <span className="chord-name">{currentChord.full}</span>
          <span className="chord-quality">{currentChord.quality}</span>
        </div>
      )}
      <div className="keyboard-scroll">
        <svg
          className="keyboard-svg"
          width={TOTAL_WIDTH}
          height={TOTAL_HEIGHT}
          viewBox={`0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`}
        >
          {/* White keys */}
          {svgKeys.whites.map((key) => {
            const active = activeNotes.has(key.note);
            const vel = active ? activeNotes.get(key.note)!.velocity : 0;
            const x = getKeyX(key);
            return (
              <rect
                key={key.note}
                x={x + 0.5}
                y={0.5}
                width={WHITE_KEY_WIDTH - 1}
                height={WHITE_KEY_HEIGHT - 1}
                rx={2}
                className="white-key"
                fill={active ? noteColor(vel) : "#f5f5f5"}
                stroke={active ? noteColor(vel) : "#333"}
                strokeWidth={0.5}
              />
            );
          })}
          {/* Black keys (rendered on top) */}
          {svgKeys.blacks.map((key) => {
            const active = activeNotes.has(key.note);
            const vel = active ? activeNotes.get(key.note)!.velocity : 0;
            const x = getKeyX(key);
            return (
              <rect
                key={key.note}
                x={x}
                y={0.5}
                width={BLACK_KEY_WIDTH}
                height={BLACK_KEY_HEIGHT}
                rx={2}
                className="black-key"
                fill={active ? noteColor(vel) : "#1a1a1a"}
                stroke={active ? noteColor(vel) : "#000"}
                strokeWidth={0.5}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
