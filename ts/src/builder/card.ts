// CV22.DS7.US8 plateau 1 — the primitives under every Builder surface.
//
// Python has TEN copies of `_wrap_plain_text` and SEVEN of `_card_prefixed`,
// spread across `src/memory/builder/`. Measured across the 501-row card golden
// rather than read, they collapse to TWO behaviors each:
//
//   * wrap: eight owners CHUNK a word longer than the width into width-sized
//     slices; `release_intent` appends it whole and lets `cardText` truncate
//     the tail away. Same input, two outputs, one module apart.
//   * prefixed: `delivery_story_closure` strips a leading `"- "` from each
//     item; the other six do not. (`flow_unit`'s `lines or [none]` is
//     STRUCTURALLY different from the others' `if not items` but behaviorally
//     identical on every row of the corpus, so it is not a third behavior.)
//
// So this module is one wrapper with one flag and one prefixer with one flag,
// not ten functions. Factoring them into a single shared helper with no flag
// would be wrong in exactly one place, which is the trap the golden exists to
// catch — grading all nine owners means a future refactor cannot quietly
// unify them.
//
// Widths are Python's literals: 54 for card body text, 52 for prefixed list
// items. Both budgets are measured in CODE POINTS, because Python's `len()`
// is.

import { codePointLength, pySplitWhitespace, sliceCodePoints } from "#util/pythonText.ts";

/** `_card_text`'s field width: `f"│ {text[:54]:<54} │"`. */
export const CARD_WIDTH = 54;

/** `_card_prefixed`'s wrap budget: the prefix and its space cost two columns. */
export const CARD_PREFIX_WIDTH = 52;

/** Python's `["none"]` fallback for an empty wrap result. */
const NONE = "none";

export interface WrapOptions {
  width: number;
  /**
   * Python's divergence, as a parameter. `true` for the eight owners that
   * slice an over-long word into width-sized chunks; `false` for
   * `release_intent`, which appends it whole so `cardText` truncates it.
   */
  chunkLongWords: boolean;
}

/**
 * Python `_wrap_plain_text(text, *, width)`.
 *
 * Splits with `str.split()` semantics — Python's whitespace set, not
 * JavaScript's `\s` — so embedded newlines are separators and paragraphs
 * COLLAPSE. That is Python's behavior, not an oversight to fix here.
 *
 * Returns `["none"]` for text that contains no words, matching Python's
 * `return lines or ["none"]`.
 */
export function wrapPlainText(text: string, options: WrapOptions): string[] {
  const { width, chunkLongWords } = options;
  const lines: string[] = [];
  let current = "";

  for (const word of pySplitWhitespace(text)) {
    if (chunkLongWords && codePointLength(word) > width) {
      // Python flushes `current` BEFORE slicing, so a short lead word does not
      // get glued to the first chunk.
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      const points = Array.from(word);
      for (let start = 0; start < points.length; start += width) {
        lines.push(points.slice(start, start + width).join(""));
      }
      continue;
    }
    const candidate = current === "" ? word : `${current} ${word}`;
    if (codePointLength(candidate) > width && current !== "") {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current !== "") lines.push(current);
  return lines.length > 0 ? lines : [NONE];
}

/**
 * Python `_card_text(text)`: `f"│ {text[:54]:<54} │"` — truncate to 54 code
 * points, THEN pad to 54. The order matters: a 60-character string is cut to
 * 54 and not padded; a 3-character string is padded to 54.
 *
 * Padding is in code points, so a card carrying astral-plane glyphs (`🟪`,
 * `🟦`, `🧰`) is padded to the same CODE POINT count as an ASCII card and
 * therefore renders NARROWER in a terminal that gives those glyphs two
 * columns. That is Python's output and the golden pins it.
 */
export function cardText(text: string): string {
  const truncated = sliceCodePoints(text, CARD_WIDTH);
  const padding = " ".repeat(Math.max(0, CARD_WIDTH - codePointLength(truncated)));
  return `│ ${truncated}${padding} │`;
}

/** Python `_card_wrapped(text)`: wrap at 54, then one card line per wrapped line. */
export function cardWrapped(text: string): string[] {
  return wrapPlainText(text, { width: CARD_WIDTH, chunkLongWords: true }).map(cardText);
}

/**
 * Python `_card_line(left, right)` (`pull_candidates` only): right-anchor
 * `right`, give `left` whatever remains, and pad the whole content to 54.
 *
 * Two details a port drops: `left_width` has a `max(1, …)` floor, so a `right`
 * wider than the card still leaves one column for `left`; and the content is
 * padded to `width` AFTER the inner `left` padding, so a short pair is padded
 * twice and the result is still exactly 54 code points.
 */
export function cardLine(left: string, right: string): string {
  const leftWidth = Math.max(1, CARD_WIDTH - codePointLength(right) - 1);
  const trimmedLeft = sliceCodePoints(left, leftWidth);
  const leftPadding = " ".repeat(Math.max(0, leftWidth - codePointLength(trimmedLeft)));
  const content = `${trimmedLeft}${leftPadding} ${right}`;
  const contentPadding = " ".repeat(Math.max(0, CARD_WIDTH - codePointLength(content)));
  return `│ ${content}${contentPadding} │`;
}

/**
 * Python `_card_context_items(items)` (`lifecycle` only): the Prepare surface's
 * terrain read. The glyph is chosen by a SUBSTRING test — `"present" in item`
 * — not by a status field, so an item whose path happens to contain the word
 * "present" renders `✓` regardless of whether the file exists. Reproduced.
 */
export function cardContextItems(items: readonly string[]): string[] {
  if (items.length === 0) return [cardText(NONE)];
  return items.map((item) => cardText(`${item.includes("present") ? "✓" : "○"} ${item}`));
}

export interface CardPrefixedOptions {
  /**
   * `delivery_story_closure`'s divergence: strip a leading `"- "` from each
   * item before wrapping, so a Markdown-bulleted debt list renders unbulleted
   * there and bulleted everywhere else. Note it is `"- "` exactly — `-x` is
   * not a bullet.
   */
  stripDash?: boolean;
}

/**
 * Python `_card_prefixed(items, prefix)`: the first wrapped line of each item
 * carries the prefix glyph, continuation lines carry a space.
 *
 * An empty tuple yields a single `none` card. An item that wraps to nothing —
 * `""` or only spaces — yields `none` as its body, because `wrapPlainText`
 * returns `["none"]`, so a tuple of two blanks renders TWO `none` cards. That
 * reads like a defect and is Python's behavior; it is reproduced, not fixed.
 */
export function cardPrefixed(
  items: readonly string[],
  prefix: string,
  options: CardPrefixedOptions = {},
): string[] {
  if (items.length === 0) return [cardText(NONE)];
  const lines: string[] = [];
  for (const item of items) {
    const normalized = options.stripDash && item.startsWith("- ") ? item.slice(2) : item;
    const wrapped = wrapPlainText(normalized, {
      width: CARD_PREFIX_WIDTH,
      chunkLongWords: true,
    });
    wrapped.forEach((line, index) => {
      lines.push(cardText(`${index === 0 ? prefix : " "} ${line}`));
    });
  }
  return lines;
}
