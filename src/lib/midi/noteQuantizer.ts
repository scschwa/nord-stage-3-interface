// Note quantizer: converts raw MIDI timing into rhythmic grid positions.
// Uses inter-onset interval (IOI) analysis for BPM detection, then snaps
// note start/end times to the nearest grid subdivision.

export interface RawNoteEvent {
  note: number;       // MIDI note number (0-127)
  velocity: number;   // 1-127
  startMs: number;    // wall-clock milliseconds when note started
  endMs: number;      // wall-clock milliseconds when note ended (or startMs+100 if sustaining)
  channel: number;
}

export interface QuantizedNote {
  note: number;
  velocity: number;
  channel: number;
  // Position in beats from start of recording (e.g. 2.5 = 3rd beat, 2nd eighth note)
  startBeat: number;
  durationBeats: number;
}

export interface QuantizationResult {
  bpm: number;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  notes: QuantizedNote[];
  totalBeats: number;
}

// Standard BPM range to consider
const MIN_BPM = 40;
const MAX_BPM = 240;

// Grid divisions to try (in fractions of a beat): 1, 1/2, 1/4, 1/8, 1/16
const GRID_SUBDIVISIONS = [1, 0.5, 0.25, 0.125, 0.0625];

// Minimum note duration in beats before it's considered a grace note
const MIN_DURATION_BEATS = 0.04;

/**
 * Detects BPM from a series of note onset times using autocorrelation
 * of inter-onset intervals.
 */
export function detectBPM(onsetTimesMs: number[]): number {
  if (onsetTimesMs.length < 3) return 120; // default

  // Compute IOIs
  const iois: number[] = [];
  for (let i = 1; i < onsetTimesMs.length; i++) {
    const ioi = onsetTimesMs[i] - onsetTimesMs[i - 1];
    if (ioi > 50 && ioi < 4000) iois.push(ioi); // filter extreme values
  }

  if (iois.length < 2) return 120;

  // Try each candidate BPM and score it by how well it aligns with IOIs
  let bestBpm = 120;
  let bestScore = -1;

  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const beatMs = (60 / bpm) * 1000;
    let score = 0;

    for (const ioi of iois) {
      // Find closest multiple of beat duration
      const ratio = ioi / beatMs;
      const closestMultiple = Math.round(ratio);
      if (closestMultiple < 1 || closestMultiple > 8) continue;
      const error = Math.abs(ioi - closestMultiple * beatMs) / beatMs;
      // Score inversely proportional to error (within 15% tolerance)
      if (error < 0.15) {
        score += 1 - error / 0.15;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // Round to nearest common BPM (avoid e.g. 119.5)
  const commonBpms = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76,
    80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168,
    176, 184, 192, 200, 208, 216, 224, 232, 240];
  const closest = commonBpms.reduce((a, b) =>
    Math.abs(b - bestBpm) < Math.abs(a - bestBpm) ? b : a
  );
  // Only snap to common BPM if within 3 BPM
  return Math.abs(closest - bestBpm) < 3 ? closest : Math.round(bestBpm);
}

/**
 * Snaps a beat position to the nearest grid subdivision that gives the
 * fewest "awkward" positions.
 */
function snapToGrid(beatPosition: number, subdivision: number): number {
  return Math.round(beatPosition / subdivision) * subdivision;
}

/**
 * Determines the best grid subdivision for a set of beat positions.
 * Tries each grid and picks the one with the least total error.
 */
function findBestSubdivision(beatPositions: number[]): number {
  let bestSub = 0.25;
  let bestError = Infinity;

  for (const sub of GRID_SUBDIVISIONS) {
    let totalError = 0;
    for (const pos of beatPositions) {
      const snapped = snapToGrid(pos, sub);
      totalError += Math.abs(pos - snapped);
    }
    if (totalError < bestError) {
      bestError = totalError;
      bestSub = sub;
    }
  }
  return bestSub;
}

/**
 * Main quantization function.
 * Takes raw MIDI note events and returns quantized notes with beat positions.
 */
export function quantizeNotes(rawNotes: RawNoteEvent[]): QuantizationResult {
  if (rawNotes.length === 0) {
    return {
      bpm: 120,
      timeSignatureNumerator: 4,
      timeSignatureDenominator: 4,
      notes: [],
      totalBeats: 0,
    };
  }

  // Normalize to start from 0
  const startTime = rawNotes[0].startMs;
  const normalized = rawNotes.map(n => ({
    ...n,
    startMs: n.startMs - startTime,
    endMs: n.endMs - startTime,
  }));

  // Get all unique onset times for BPM detection
  const onsets = [...new Set(normalized.map(n => n.startMs))].sort((a, b) => a - b);
  const bpm = detectBPM(onsets);
  const beatDurationMs = (60 / bpm) * 1000;

  // Convert all times to beats
  const beatPositions = normalized.map(n => n.startMs / beatDurationMs);
  const subdivision = findBestSubdivision(beatPositions);

  // Quantize each note
  const quantized: QuantizedNote[] = normalized.map((note) => {
    const startBeat = snapToGrid(note.startMs / beatDurationMs, subdivision);
    let durationBeats = snapToGrid(
      (note.endMs - note.startMs) / beatDurationMs,
      subdivision
    );

    // Enforce minimum duration
    if (durationBeats < MIN_DURATION_BEATS) {
      durationBeats = subdivision;
    }

    return {
      note: note.note,
      velocity: note.velocity,
      channel: note.channel,
      startBeat,
      durationBeats,
    };
  });

  // Sort by start beat, then by note
  quantized.sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);

  // Total length in beats (round up to next measure)
  const lastEndBeat = Math.max(...quantized.map(n => n.startBeat + n.durationBeats));
  const beatsPerMeasure = 4; // 4/4 assumed initially
  const totalBeats = Math.ceil(lastEndBeat / beatsPerMeasure) * beatsPerMeasure;

  return {
    bpm,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    notes: quantized,
    totalBeats,
  };
}
