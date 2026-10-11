// CV22.DS7.US6 plateau 6 — the Soul Mode entry card, ported from
// `render_soul_mode_transition` (`src/memory/surfaces/mode_transition.py`).
//
// A different module and a different WIDTH (56, against the 40 of the ritual
// cards in `render.ts`), but the same transport=verbatim contract.
//
// The card is CONSTANT: the oracle accepts `journey` and immediately discards
// it — "Soul Mode entry keeps journey context in state, not in the ritual card"
// — so the journey reaches the operating-mode row and the sticky defaults, and
// never the rendered surface. The golden records both call shapes so that
// property is pinned rather than assumed.

const WIDTH = 56;

function line(text: string): string {
  return `│${text.padEnd(WIDTH)}│`;
}

const CARD = [
  "Mirror",
  `╭${"─".repeat(WIDTH)}╮`,
  line("        ☾  SOUL MODE ACTIVE"),
  line(""),
  line("  Soul Mode turns the day toward the inner life."),
  line(""),
  line("  ✦  IN ORDER TO"),
  line("  remember who you are"),
  line(""),
  line("  ▹  START BY ANSWERING"),
  line("  how is your day going today?"),
  `╰${"─".repeat(WIDTH)}╯`,
].join("\n");

/** Port of `render_soul_mode_transition`. The journey never reaches the card. */
export function renderSoulModeTransition(_journey?: string | null): string {
  return CARD;
}
