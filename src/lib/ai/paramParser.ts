/**
 * Parse <parameter .../> tags from Claude's streaming output.
 *
 * Tag format (self-closing):
 *   <parameter section="synth" name="filter_freq" value="72"
 *              range="0–127" location="SYNTH panel, FILTER section"
 *              knob="Freq" rationale="Open cutoff for brightness" />
 */

export type ParameterSection = "piano" | "organ" | "synth" | "effects";

export interface ParsedParameter {
  section: ParameterSection;
  name: string;       // e.g. "filter_freq", "amp_env.attack", "drawbars_1[3]"
  value: string;
  range?: string;
  location: string;
  knob: string;
  rationale?: string;
}

const TAG_RE = /<parameter\s([\s\S]*?)\/>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

/** Extract all <parameter> tags from a completed message. */
export function parseParameters(text: string): ParsedParameter[] {
  const results: ParsedParameter[] = [];
  TAG_RE.lastIndex = 0;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = TAG_RE.exec(text)) !== null) {
    const attrs: Record<string, string> = {};
    ATTR_RE.lastIndex = 0;

    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_RE.exec(tagMatch[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    if (attrs.section && attrs.name && attrs.value && attrs.location && attrs.knob) {
      results.push({
        section: attrs.section as ParameterSection,
        name: attrs.name,
        value: attrs.value,
        range: attrs.range,
        location: attrs.location,
        knob: attrs.knob,
        rationale: attrs.rationale,
      });
    }
  }
  return results;
}

/** Return the message text with all <parameter> tags removed (for prose display). */
export function stripParameterTags(text: string): string {
  return text
    .replace(/<parameter\s[\s\S]*?\/>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Section display info for UI colour-coding. */
export const SECTION_META: Record<ParameterSection, { label: string; color: string }> = {
  piano:   { label: "Piano",   color: "#1565c0" },
  organ:   { label: "Organ",   color: "#2e7d32" },
  synth:   { label: "Synth",   color: "#e65100" },
  effects: { label: "Effects", color: "#6a1b9a" },
};
