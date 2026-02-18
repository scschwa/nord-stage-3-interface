// MusicXML generator: converts quantized note events into a MusicXML string
// that OSMD can render. Produces standard score-partwise format.

import { QuantizationResult, QuantizedNote } from "./noteQuantizer";

// Pitch class → { step, alter }
const PC_TO_STEP: Array<{ step: string; alter: number }> = [
  { step: "C", alter: 0 },  // 0
  { step: "C", alter: 1 },  // 1  C#
  { step: "D", alter: 0 },  // 2
  { step: "D", alter: 1 },  // 3  D#
  { step: "E", alter: 0 },  // 4
  { step: "F", alter: 0 },  // 5
  { step: "F", alter: 1 },  // 6  F#
  { step: "G", alter: 0 },  // 7
  { step: "G", alter: 1 },  // 8  G#
  { step: "A", alter: 0 },  // 9
  { step: "A", alter: 1 },  // 10 A#
  { step: "B", alter: 0 },  // 11
];

// MusicXML uses divisions (ticks) per quarter note. We use 16 for 16th note precision.
const DIVISIONS = 16;

// Duration in beats → divisions (quarter note = DIVISIONS)
function beatsToDivisions(beats: number): number {
  return Math.max(1, Math.round(beats * DIVISIONS));
}

// Divisions → nearest standard duration type + dots
function divisionsToType(divs: number): { type: string; dots: number } {
  // Standard durations in divisions
  const types: Array<{ type: string; divs: number }> = [
    { type: "whole", divs: DIVISIONS * 4 },
    { type: "half", divs: DIVISIONS * 2 },
    { type: "quarter", divs: DIVISIONS },
    { type: "eighth", divs: DIVISIONS / 2 },
    { type: "16th", divs: DIVISIONS / 4 },
    { type: "32nd", divs: DIVISIONS / 8 },
  ];

  // Try exact match first
  for (const t of types) {
    if (divs === t.divs) return { type: t.type, dots: 0 };
    // Try dotted (1.5x)
    if (divs === Math.round(t.divs * 1.5)) return { type: t.type, dots: 1 };
  }

  // Find closest
  let best = types[2]; // default to quarter
  let bestDiff = Math.abs(divs - best.divs);
  for (const t of types) {
    const diff = Math.abs(divs - t.divs);
    if (diff < bestDiff) { bestDiff = diff; best = t; }
  }
  return { type: best.type, dots: 0 };
}

function midiOctave(note: number): number {
  return Math.floor(note / 12) - 1;
}

interface MeasureNote {
  note: QuantizedNote;
  posInMeasure: number; // beat position within this measure
}


export function generateMusicXml(result: QuantizationResult, title = "Captured Performance"): string {
  const { bpm, timeSignatureNumerator, timeSignatureDenominator, notes, totalBeats } = result;
  const beatsPerMeasure = timeSignatureNumerator; // 4 for 4/4

  if (notes.length === 0) return "";

  // Group notes by measure
  const numMeasures = Math.max(1, Math.ceil(totalBeats / beatsPerMeasure));
  const measures: MeasureNote[][] = Array.from({ length: numMeasures }, () => []);

  for (const note of notes) {
    const measureIdx = Math.floor(note.startBeat / beatsPerMeasure);
    if (measureIdx < numMeasures) {
      measures[measureIdx].push({
        note,
        posInMeasure: note.startBeat - measureIdx * beatsPerMeasure,
      });
    }
  }

  // Build measures XML
  const measureXml = measures.map((measureNotes, idx) => {
    const isFirst = idx === 0;
    let xml = `    <measure number="${idx + 1}">\n`;

    // Attributes in first measure
    if (isFirst) {
      xml += `      <attributes>\n`;
      xml += `        <divisions>${DIVISIONS}</divisions>\n`;
      xml += `        <key><fifths>0</fifths><mode>major</mode></key>\n`;
      xml += `        <time><beats>${timeSignatureNumerator}</beats><beat-type>${timeSignatureDenominator}</beat-type></time>\n`;
      xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
      xml += `      </attributes>\n`;
      // Tempo marking
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type><metronome parentheses="no">`;
      xml += `<beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute>`;
      xml += `</metronome></direction-type>\n`;
      xml += `        <sound tempo="${bpm}"/>\n`;
      xml += `      </direction>\n`;
    }

    if (measureNotes.length === 0) {
      // Full measure rest
      xml += renderMeasureRest(beatsPerMeasure);
    } else {
      xml += renderMeasureContent(measureNotes, beatsPerMeasure);
    }

    xml += `    </measure>\n`;
    return xml;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <identification>
    <encoding>
      <software>Nord Stage 3 Interface</software>
      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
${measureXml}  </part>
</score-partwise>`;
}

function renderMeasureRest(beatsPerMeasure: number): string {
  const divs = beatsToDivisions(beatsPerMeasure);
  const { type } = divisionsToType(divs);
  return `      <note><rest measure="yes"/><duration>${divs}</duration><type>${type}</type></note>\n`;
}

function renderMeasureContent(measureNotes: MeasureNote[], beatsPerMeasure: number): string {
  let xml = "";

  // Sort notes by position within measure
  const sorted = [...measureNotes].sort((a, b) => a.posInMeasure - b.posInMeasure);

  // Fill gaps with rests
  const measureDivs = beatsToDivisions(beatsPerMeasure);
  let cursor = 0; // in divisions

  // Group notes that start at the same position (chords)
  const groups: MeasureNote[][] = [];
  let i = 0;
  while (i < sorted.length) {
    const group: MeasureNote[] = [sorted[i]];
    while (i + 1 < sorted.length &&
      Math.abs(sorted[i + 1].posInMeasure - sorted[i].posInMeasure) < 0.02) {
      i++;
      group.push(sorted[i]);
    }
    groups.push(group);
    i++;
  }

  for (const group of groups) {
    const groupPosDivs = beatsToDivisions(group[0].posInMeasure);

    // Insert rest if there's a gap
    if (groupPosDivs > cursor) {
      const restDivs = groupPosDivs - cursor;
      xml += renderRest(restDivs);
    }

    // Find max duration in this chord group
    const chordDivs = Math.max(...group.map(mn => beatsToDivisions(mn.note.durationBeats)));

    // Render notes in the chord
    for (let j = 0; j < group.length; j++) {
      const { type, dots } = divisionsToType(chordDivs);
      xml += renderNote(group[j].note, chordDivs, type, dots, j > 0);
    }

    cursor = groupPosDivs + chordDivs;
  }

  // Fill remaining measure with rest
  if (cursor < measureDivs) {
    xml += renderRest(measureDivs - cursor);
  }

  return xml;
}

function renderRest(divs: number): string {
  if (divs <= 0) return "";
  const { type, dots } = divisionsToType(divs);
  let xml = `      <note><rest/><duration>${divs}</duration><type>${type}</type>`;
  for (let d = 0; d < dots; d++) xml += `<dot/>`;
  xml += `</note>\n`;
  return xml;
}

function renderNote(note: QuantizedNote, divs: number, type: string, dots: number, isChord: boolean): string {
  const pc = note.note % 12;
  const octave = midiOctave(note.note);
  const { step, alter } = PC_TO_STEP[pc];

  let xml = `      <note>\n`;
  if (isChord) xml += `        <chord/>\n`;
  xml += `        <pitch><step>${step}</step>`;
  if (alter !== 0) xml += `<alter>${alter}</alter>`;
  xml += `<octave>${octave}</octave></pitch>\n`;
  xml += `        <duration>${divs}</duration>\n`;
  xml += `        <type>${type}</type>\n`;
  for (let d = 0; d < dots; d++) xml += `        <dot/>\n`;
  if (alter !== 0) {
    xml += `        <accidental>${alter > 0 ? "sharp" : "flat"}</accidental>\n`;
  }
  xml += `        <notations><dynamics><mp/></dynamics></notations>\n`;
  xml += `      </note>\n`;
  return xml;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
