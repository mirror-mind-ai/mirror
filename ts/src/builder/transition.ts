// CV22.DS7.US8 plateau 7 — the ■ BUILDER MODE ACTIVE card and `load`'s query.
//
// Ports `render_builder_mode_transition` and its private helpers from
// `src/memory/surfaces/mode_transition.py`, plus `_extract_query` from
// `cli/build.py`.
//
// `_box` / `_line` / `_wrap` are character-identical to the Explorer card's
// (`explorer/transition.ts`), and that is not an accident worth deduplicating
// away: they are the SAME Python module, so sharing them here is correct where
// sharing them with the story cards in `render.ts` would not be — those chunk
// over-long words, these truncate. The duplication stays inside the module that
// owns each oracle.
//
// Three behaviors this file reproduces that a reasonable port would fix:
//
//   1. **`_extract_query` tests every LINE, not only headings**, and a match
//      `continue`s — so a body line containing `context` is silently DROPPED from
//      the query while the lines around it survive. Harmless in a long
//      description, fatal in a short one: a body whose only line mentions the word
//      captures nothing and the query becomes the slug.
//   2. **No Unicode normalization.** The Portuguese section names are compared as
//      literals, so an NFD `Descrição` does not match the NFC list and the query
//      falls back to the slug. Adding `.normalize("NFC")` here would fix the
//      defect and break parity; it is a CR instead.
//   3. **`[:500]` is code points**, not UTF-16 units. A briefing of astral
//      characters cut with `slice(0, 500)` loses half the text, changing the
//      embedding and therefore the ranking, with no error.

import { codePointLength, pySplitWhitespace, sliceCodePoints } from "#util/pythonText.ts";

const WIDTH = 56;

/** `mode_transition._line`: slice to WIDTH, then pad — both by code point. */
function line(text: string): string {
  const content = sliceCodePoints(text, WIDTH);
  return `│${content.padEnd(WIDTH + (content.length - codePointLength(content)))}│`;
}

/** `mode_transition._wrap`: greedy fill at WIDTH-2, long words NOT chunked. */
function wrap(text: string): string[] {
  const maxWidth = WIDTH - 2;
  const words = pySplitWhitespace(text);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] as string;
  for (const word of words.slice(1)) {
    if (codePointLength(current) + 1 + codePointLength(word) <= maxWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

type Row = readonly [label: string, value: string];

/** `mode_transition._box`. */
function box(title: string, rows: readonly Row[]): string {
  const lines = ["Mirror", `╭${"─".repeat(WIDTH)}╮`, line(`        ${title}`)];
  for (const [label, value] of rows) {
    lines.push(line(""));
    lines.push(line(`  ${label}`));
    for (const wrapped of wrap(value)) lines.push(line(`  ${wrapped}`));
  }
  lines.push(`╰${"─".repeat(WIDTH)}╯`);
  return lines.join("\n");
}

/**
 * `mode_transition._extract_stage`.
 *
 * `^\*\*Stage:\*\*\s*(.+)$` under `re.MULTILINE`. Written with explicit anchors
 * because JavaScript's `m` flag also anchors at U+2028/U+2029 where Python's does
 * not, and `.` must not cross a newline in either.
 */
const STAGE_RE = /(?<=^|\n)\*\*Stage:\*\*[^\S\n]*(?<stage>[^\n]+)(?=\n|$)/u;

export function extractStage(content: string): string | null {
  const match = STAGE_RE.exec(content);
  const stage = match?.groups?.stage;
  return stage === undefined ? null : stage.trim();
}

/**
 * `mode_transition._extract_section`.
 *
 * Capture starts at the first heading whose text contains one of `names`, and ends
 * at the NEXT heading. When nothing was captured it falls back to every non-heading
 * line joined and cut at 240 — a port that returns `null` there renders a card with
 * no briefing row, which is the row a Navigator reads first.
 */
export function extractSection(content: string, names: readonly string[]): string | null {
  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];
  for (const raw of lines) {
    const stripped = raw.trim();
    const header = stripped.replace(/^#+/u, "").trim().toLowerCase();
    if (stripped.startsWith("#")) {
      if (capturing) break;
      if (names.some((name) => header.includes(name))) {
        capturing = true;
      }
    } else if (capturing) {
      result.push(stripped);
    }
  }
  const text = result
    .filter((entry) => entry !== "")
    .join(" ")
    .trim();
  if (text) return text;
  const fallback = lines
    .filter((entry) => entry.trim() !== "" && !entry.startsWith("#"))
    .map((entry) => entry.trim())
    .join(" ");
  return sliceCodePoints(fallback, 240).trim() || null;
}

/** `mode_transition._truncate_words`. */
export function truncateWords(text: string, limit: number): string {
  const words = pySplitWhitespace(text);
  if (words.length <= limit) return text;
  // Python `rstrip(".,;")` strips a SET of characters, not a suffix.
  return `${words
    .slice(0, limit)
    .join(" ")
    .replace(/[.,;]+$/u, "")}…`;
}

/** Python `render_builder_mode_transition`. */
export function renderBuilderModeTransition(options: {
  journey: string;
  journeyContent: string;
  projectPath?: string | null;
}): string {
  const rows: Row[] = [["active journey", options.journey]];
  const stage = extractStage(options.journeyContent);
  if (stage) rows.push(["journey path", stage]);
  if (options.projectPath) rows.push(["project path", options.projectPath]);
  const briefing = extractSection(options.journeyContent, ["briefing", "description", "context"]);
  if (briefing) rows.push(["briefing", truncateWords(briefing, 32)]);
  rows.push(["boundary", "Builder executes commitment."]);
  return box("■  BUILDER MODE ACTIVE", rows);
}

/** The five section names `_extract_query` accepts, NFC as Python writes them. */
const QUERY_SECTIONS = ["description", "briefing", "context", "descrição", "contexto"] as const;

/**
 * Python `cli/build._extract_query`.
 *
 * Note what this is NOT: it is not `extractSection` with different names. The
 * match runs against every line, a matching line is SKIPPED rather than captured,
 * and the fallback is the slug rather than a 240-character digest. Two extractors,
 * two behaviors, over the same document — reproduced separately because merging
 * them changes both.
 */
export function extractQuery(journeyContent: string, slug: string): string {
  const result: string[] = [];
  let capturing = false;
  for (const raw of journeyContent.split("\n")) {
    const header = raw.replace(/^#+/u, "").trim().toLowerCase();
    if (QUERY_SECTIONS.some((section) => header.includes(section))) {
      capturing = true;
      continue;
    }
    if (capturing) {
      if (raw.startsWith("#")) break;
      result.push(raw);
    }
  }
  const text = result.join(" ").trim();
  return text ? sliceCodePoints(text, 500) : slug;
}
