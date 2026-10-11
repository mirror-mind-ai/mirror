// CV22.DS7.US7 plateau 1 — the △ EXPLORER MODE ACTIVE card, ported from
// `render_explorer_mode_transition` (`src/memory/surfaces/mode_transition.py`).
//
// Same WIDTH as the story cards in `render.ts`, and the `_box`/`_line` bodies
// are character-identical -- but `_wrap` is NOT. This module's oracle has no
// `_chunk_word`: a word longer than the line overflows, and `_line` truncates
// it to WIDTH. The story-card oracle chunks it across several lines instead.
//
// So the two helpers must stay separate. Factoring them into one shared
// implementation silently changes whichever card did not win the merge, and
// the only input that reveals it is a journey slug longer than 54 characters
// -- which is exactly why the golden carries one.

import { codePointLength, pySplitWhitespace, sliceCodePoints } from "#util/pythonText.ts";

const WIDTH = 56;

type Row = readonly [label: string, value: string];

function line(text: string): string {
  const content = sliceCodePoints(text, WIDTH);
  return `│${content.padEnd(WIDTH + (content.length - codePointLength(content)))}│`;
}

/** `mode_transition._wrap`: greedy fill, long words NOT chunked. */
function wrap(text: string): string[] {
  const maxWidth = WIDTH - 2;
  const words = pySplitWhitespace(text);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0] as string;
  for (const word of words.slice(1)) {
    if (codePointLength(current) + 1 + codePointLength(word) <= maxWidth) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function box(title: string, rows: readonly Row[]): string {
  const lines = ["Mirror", `╭${"─".repeat(WIDTH)}╮`, line(`        ${title}`)];
  for (const [label, value] of rows) {
    lines.push(line(""));
    lines.push(line(`  ${label}`));
    for (const wrapped of wrap(value)) {
      lines.push(line(`  ${wrapped}`));
    }
  }
  lines.push(`╰${"─".repeat(WIDTH)}╯`);
  return lines.join("\n");
}

/** Port of `render_explorer_mode_transition`. */
export function renderExplorerModeTransition(journey: string): string {
  return box("△  EXPLORER MODE ACTIVE", [
    ["active journey", journey],
    [
      "availability",
      "Explorer Mode is active and ready for durable exploration, story thickening, attractors, experiments, and Builder handoff.",
    ],
    [
      "what this mode is",
      "Exploration lens. Mirror preserves uncertainty, keeps signals, and thickens exploratory stories before construction.",
    ],
    ["boundary", "Explorer preserves uncertainty."],
  ]);
}
