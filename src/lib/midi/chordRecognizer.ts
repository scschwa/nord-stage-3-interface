// Real-time chord recognition from a set of active MIDI note numbers.
// Uses interval pattern matching against a chord dictionary.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Chord interval patterns: [sorted semitone intervals from root]
// Intervals are relative to the root note
const CHORD_PATTERNS: Array<{ intervals: number[]; name: string; quality: string }> = [
  // Triads
  { intervals: [0, 4, 7], name: "", quality: "major" },
  { intervals: [0, 3, 7], name: "m", quality: "minor" },
  { intervals: [0, 4, 8], name: "aug", quality: "augmented" },
  { intervals: [0, 3, 6], name: "dim", quality: "diminished" },
  { intervals: [0, 5, 7], name: "sus4", quality: "suspended 4th" },
  { intervals: [0, 2, 7], name: "sus2", quality: "suspended 2nd" },
  // Seventh chords
  { intervals: [0, 4, 7, 11], name: "maj7", quality: "major 7th" },
  { intervals: [0, 4, 7, 10], name: "7", quality: "dominant 7th" },
  { intervals: [0, 3, 7, 10], name: "m7", quality: "minor 7th" },
  { intervals: [0, 3, 7, 11], name: "mMaj7", quality: "minor major 7th" },
  { intervals: [0, 3, 6, 10], name: "m7b5", quality: "half-diminished" },
  { intervals: [0, 3, 6, 9], name: "dim7", quality: "diminished 7th" },
  { intervals: [0, 4, 8, 10], name: "aug7", quality: "augmented 7th" },
  // 6th chords
  { intervals: [0, 4, 7, 9], name: "6", quality: "major 6th" },
  { intervals: [0, 3, 7, 9], name: "m6", quality: "minor 6th" },
  // 9th chords (5-note)
  { intervals: [0, 4, 7, 10, 14], name: "9", quality: "dominant 9th" },
  { intervals: [0, 4, 7, 11, 14], name: "maj9", quality: "major 9th" },
  { intervals: [0, 3, 7, 10, 14], name: "m9", quality: "minor 9th" },
  // Add chords
  { intervals: [0, 4, 7, 14], name: "add9", quality: "add 9th" },
  { intervals: [0, 2, 4, 7], name: "add9(no7)", quality: "major add9" },
  // Power chord
  { intervals: [0, 7], name: "5", quality: "power chord" },
];

export interface ChordResult {
  root: string;
  suffix: string;
  quality: string;
  bass?: string;   // slash chord bass note if inversion
  full: string;    // e.g. "Am7" or "C/E"
}

function pitchClass(midi: number): number {
  return midi % 12;
}

function noteName(pc: number): string {
  return NOTE_NAMES[pc];
}

function intervalsMatch(noteClasses: Set<number>, rootPc: number, pattern: number[]): boolean {
  if (pattern.length > noteClasses.size + 1) return false;
  return pattern.every(interval => noteClasses.has((rootPc + interval) % 12));
}

export function recognizeChord(activeNotes: number[]): ChordResult | null {
  if (activeNotes.length < 2) return null;

  const pitchClasses = new Set(activeNotes.map(pitchClass));
  const bassNote = Math.min(...activeNotes);
  const bassPc = pitchClass(bassNote);

  let bestMatch: { pattern: (typeof CHORD_PATTERNS)[0]; root: number } | null = null;
  let bestSize = 0;

  // Try each pitch class as the root
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const pattern of CHORD_PATTERNS) {
      if (pattern.intervals.length < bestSize) continue;
      if (intervalsMatch(pitchClasses, rootPc, pattern.intervals)) {
        if (pattern.intervals.length > bestSize) {
          bestSize = pattern.intervals.length;
          bestMatch = { pattern, root: rootPc };
        }
      }
    }
  }

  if (!bestMatch) return null;

  const rootName = noteName(bestMatch.root);
  const suffix = bestMatch.pattern.name;
  const quality = bestMatch.pattern.quality;

  // Detect slash chord (bass note is not the root)
  let bassStr: string | undefined;
  if (bassPc !== bestMatch.root) {
    bassStr = noteName(bassPc);
  }

  const full = bassStr ? `${rootName}${suffix}/${bassStr}` : `${rootName}${suffix}`;

  return { root: rootName, suffix, quality, bass: bassStr, full };
}
