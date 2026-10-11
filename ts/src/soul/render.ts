// CV22.DS7.US6 plateau 1 — the Soul Mode surfaces, ported from
// `src/memory/surfaces/soul.py`.
//
// These are `transport=verbatim` cards: the golden grades the rendered
// box-drawing, so padding, wrapping, and blank-line placement are behavior.
// Every measurement goes through the Python string primitives in
// `#util/pythonText.ts` -- Python counts code points and splits on Python's
// whitespace and line-boundary sets, and a JavaScript-native `length`,
// `trim()`, `\s`, or `split("\n")` disagrees with all four.
//
// The refusals are part of the surface too: Soul's error strings are ritual
// text the user reads, so they are reproduced exactly and carried by a
// dedicated error type the CLI layer renders as Python's `Error: <message>`.

import {
  codePointLength,
  pyRStrip,
  pySplitLines,
  pySplitWhitespace,
  pyStrip,
  sliceCodePoints,
} from "#util/pythonText.ts";

export const WIDTH = 40;

/** Python raises `ValueError`; the CLI catches it and exits 1. */
export class SoulSurfaceError extends Error {}

export const VOICE_ICONS: Readonly<Record<string, string>> = {
  self: "✦",
  shadow: "◐",
  wisdom: "♢",
  beauty: "✺",
};

export const VOICE_LABELS: Readonly<Record<string, string>> = {
  self: "Self Voice",
  shadow: "Shadow Voice",
  wisdom: "Wisdom Voice",
  beauty: "Beauty Voice",
};

export const PSYCHE_LAYER_ICONS: Readonly<Record<string, string>> = {
  self: "✦",
  shadow: "◐",
  ego: "◇",
  persona: "◈",
};

export const PSYCHE_LAYER_LABELS: Readonly<Record<string, string>> = {
  self: "SELF",
  shadow: "SHADOW",
  ego: "EGO",
  persona: "PERSONA",
};

interface ActiveRiteDefault {
  readonly title: string;
  readonly utterance: string;
  readonly listeningFor: string;
}

export const ACTIVE_RITE_DEFAULTS: Readonly<Record<string, ActiveRiteDefault>> = {
  self: {
    title: "SELF VOICE LISTENING",
    utterance: "usefulness can remain a gift only when it stops being payment for belonging",
    listeningFor: "what remains true without proof",
  },
  shadow: {
    title: "SHADOW VOICE LISTENING",
    utterance: "if they depend on me, they cannot forget me",
    listeningFor: "the protection inside control",
  },
  wisdom: {
    title: "WISDOM VOICE LISTENING",
    utterance: "this already knows the difference between urgency and truth",
    listeningFor: "the lesson already present",
  },
  beauty: {
    title: "BEAUTY VOICE LISTENING",
    utterance: "there is still care in the way this hurts",
    listeningFor: "the form of aliveness",
  },
};

export interface SoulListeningOption {
  readonly voice: string;
  readonly description: string;
}

/** Python `_line`: truncate to WIDTH code points, then left-justify to WIDTH. */
function line(text: string): string {
  const content = sliceCodePoints(text, WIDTH);
  return `│${content.padEnd(WIDTH + (content.length - codePointLength(content)))}│`;
}

/** Python `_wrap`: greedy fill measured in code points. */
function wrap(text: string, indent: string): string[] {
  const maxWidth = WIDTH - codePointLength(indent);
  const words = pySplitWhitespace(text);
  if (words.length === 0) return [pyRStrip(indent)];

  const lines: string[] = [];
  let current = words[0] as string;
  for (const word of words.slice(1)) {
    if (codePointLength(current) + 1 + codePointLength(word) <= maxWidth) {
      current += ` ${word}`;
    } else {
      lines.push(indent + current);
      current = word;
    }
  }
  lines.push(indent + current);
  return lines;
}

/** Python `_wrap_blocks`: wrap while preserving paragraph breaks. */
function wrapBlocks(text: string, indent: string): string[] {
  const paragraphs = pySplitLines(text).map(pyStrip);
  const lines: string[] = [];
  let previousHadContent = false;
  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      if (previousHadContent && (lines.length === 0 || lines[lines.length - 1] !== "")) {
        lines.push("");
      }
      previousHadContent = false;
      continue;
    }
    lines.push(...wrap(paragraph, indent));
    previousHadContent = true;
  }
  return lines.length > 0 ? lines : [pyRStrip(indent)];
}

/** Python `_normalize_voice_text`: literal `\n` escapes become real newlines. */
function normalizeVoiceText(text: string): string {
  return pyStrip(text.replaceAll("\\n", "\n"));
}

const TOP = `╭${"─".repeat(WIDTH)}╮`;
const BOTTOM = `╰${"─".repeat(WIDTH)}╯`;

function card(title: string, body: readonly string[]): string {
  return ["Soul Mode", TOP, line(`   ${title}`), ...body, BOTTOM].join("\n");
}

export function renderPossibleListenings(options: readonly SoulListeningOption[]): string {
  if (options.length === 0) {
    throw new SoulSurfaceError("at least one listening option is required");
  }
  for (const option of options) {
    if (!(option.voice in VOICE_ICONS)) {
      throw new SoulSurfaceError(`unknown listening voice: ${option.voice}`);
    }
    if (pyStrip(option.description) === "") {
      throw new SoulSurfaceError("listening option descriptions must not be empty");
    }
  }

  const body: string[] = [];
  for (const option of options) {
    body.push(line(""));
    body.push(line(`   ${VOICE_ICONS[option.voice]} ${VOICE_LABELS[option.voice]}`));
    for (const wrapped of wrap(pyStrip(option.description), "     ")) body.push(line(wrapped));
  }
  body.push(line(""));
  for (const wrapped of wrap(
    "Say if you want to hear one of these voices now, or just continue the conversation.",
    "   ",
  )) {
    body.push(line(wrapped));
  }
  return card("✧  POSSIBLE LISTENINGS", body);
}

function renderFruitCard(fruit: string, title: string, footer: readonly string[]): string {
  const normalized = pyStrip(fruit);
  if (normalized === "") throw new SoulSurfaceError("fruit must not be empty");

  const body: string[] = [line("")];
  for (const wrapped of wrap(normalized, "   ")) body.push(line(wrapped));
  body.push(line(""));
  for (const footerLine of footer) body.push(line(footerLine));
  return card(title, body);
}

export function renderFruitInMaturation(fruit: string): string {
  return renderFruitCard(fruit, "❦  FRUIT IN MATURATION", [
    "   continue if you want to mature more",
    "   or say you wish to harvest",
  ]);
}

export function renderHarvestedFruit(fruit: string): string {
  return renderFruitCard(fruit, "❦  HARVESTED FRUIT", [
    "   save to journal as it is",
    "   or change anything first?",
  ]);
}

type Section = readonly [label: string, value: string | null | undefined];

function renderSectionCard(input: {
  title: string;
  sections: readonly Section[];
  emptyError: string;
  footer?: string;
}): string {
  const normalized = input.sections
    .filter(([, value]) => typeof value === "string" && pyStrip(value) !== "")
    .map(([label, value]) => [label, normalizeVoiceText(value as string)] as const);
  if (normalized.length === 0) throw new SoulSurfaceError(input.emptyError);

  const body: string[] = [];
  for (const [label, text] of normalized) {
    body.push(line(""));
    body.push(line(`   ${label}`));
    for (const wrapped of wrapBlocks(text, "   ")) body.push(line(wrapped));
  }
  if (input.footer) {
    body.push(line(""));
    for (const wrapped of wrapBlocks(input.footer, "   ")) body.push(line(wrapped));
  }
  return card(input.title, body);
}

export function renderClosingRite(input: {
  harvested?: string | null;
  echoes?: string | null;
  remainsOpen?: string | null;
  integration?: string | null;
}): string {
  return renderSectionCard({
    title: "☾  CLOSING RITE",
    sections: [
      ["what was harvested", input.harvested],
      ["what still echoes", input.echoes],
      ["what remains open", input.remainsOpen],
      ["what may want integration", input.integration],
    ],
    emptyError: "at least one closing section is required",
  });
}

export function renderIntegrationReview(input: {
  journal?: string | null;
  selfMaterial?: string | null;
  shadow?: string | null;
  ego?: string | null;
  persona?: string | null;
  leaveOpen?: string | null;
}): string {
  return renderSectionCard({
    title: "☾  INTEGRATION PROPOSAL",
    sections: [
      ["origin", input.journal],
      ["self", input.selfMaterial],
      ["shadow", input.shadow],
      ["ego behavior", input.ego],
      ["persona", input.persona],
      ["leave open", input.leaveOpen],
    ],
    emptyError: "at least one integration review section is required",
    footer: "proposal only — nothing changed",
  });
}

export function renderEnrichmentProposal(
  layer: string,
  input: {
    key: string;
    origin: string;
    current: string | null | undefined;
    proposed: string;
    why: string;
  },
): string {
  if (!(layer in PSYCHE_LAYER_ICONS)) {
    throw new SoulSurfaceError(`unsupported psyche layer: ${layer}`);
  }
  if (pyStrip(input.key) === "") throw new SoulSurfaceError("proposal key must not be empty");
  if (pyStrip(input.origin) === "") {
    throw new SoulSurfaceError("proposal origin must not be empty");
  }
  if (pyStrip(input.proposed) === "") {
    throw new SoulSurfaceError("proposal content must not be empty");
  }
  if (pyStrip(input.why) === "") {
    throw new SoulSurfaceError("proposal rationale must not be empty");
  }

  const currentText =
    typeof input.current === "string" && pyStrip(input.current) !== ""
      ? pyStrip(input.current)
      : "none loaded";
  return renderSectionCard({
    title: `${PSYCHE_LAYER_ICONS[layer]}  ${PSYCHE_LAYER_LABELS[layer]} ENRICHMENT PROPOSAL`,
    sections: [
      ["target", `${layer}/${pyStrip(input.key)}`],
      ["origin", input.origin],
      ["current", currentText],
      ["proposed", input.proposed],
      ["why this may belong", input.why],
    ],
    emptyError: "enrichment proposal requires content",
    footer: "proposal only — no identity changed",
  });
}

export function renderIdentityChangeApplied(
  layer: string,
  input: { key: string; content: string },
): string {
  if (!(layer in PSYCHE_LAYER_ICONS)) {
    throw new SoulSurfaceError(`unsupported psyche layer: ${layer}`);
  }
  if (pyStrip(input.key) === "") throw new SoulSurfaceError("identity key must not be empty");
  if (pyStrip(input.content) === "") {
    throw new SoulSurfaceError("identity content must not be empty");
  }

  return renderSectionCard({
    title: `${PSYCHE_LAYER_ICONS[layer]}  ${PSYCHE_LAYER_LABELS[layer]} IDENTITY UPDATED`,
    sections: [
      ["target", `${layer}/${pyStrip(input.key)}`],
      ["applied", input.content],
    ],
    emptyError: "identity update requires content",
  });
}

export function renderActiveRite(
  voice: string,
  input: {
    utterance?: string | null;
    /** Accepted and ignored, exactly as Python does — see the story handoff. */
    listeningFor?: string | null;
    question?: string | null;
  } = {},
): string {
  const defaults = ACTIVE_RITE_DEFAULTS[voice];
  if (!defaults) throw new SoulSurfaceError(`unsupported active rite voice: ${voice}`);

  let utterance = input.utterance;
  if (input.question && !utterance) utterance = input.question;
  if ((voice === "wisdom" || voice === "beauty") && !utterance) {
    throw new SoulSurfaceError(`${VOICE_LABELS[voice]} requires a situated --says response`);
  }
  const voiceSays = normalizeVoiceText(utterance || defaults.utterance);
  if (voiceSays === "") {
    throw new SoulSurfaceError("active rite voice utterance must not be empty");
  }

  const body: string[] = [line(""), line("   the voice says"), line("")];
  for (const wrapped of wrapBlocks(voiceSays, "   ")) body.push(line(wrapped));
  return card(`${VOICE_ICONS[voice]}  ${defaults.title}`, body);
}
