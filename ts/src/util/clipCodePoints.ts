// CR018 — a cut that says so.
//
// The card primitives cut silently, as Python's did, and a Navigator reading a title
// cut mid-word had no way to know it went on. This rule marks the cut with `…`, and
// backs a cut that would split a word up to the word's start, because a code cut short
// reads as another code: `(per D12)` must not become `(per D1…`. It began as `card.ts`'s
// own; CR103 moved it here so a status clause can be bounded by the same rule before it
// reaches any card.

/**
 * `text` cut to fit `width` code points, with `…` in the last place when anything was
 * cut. A cut that would split a word backs up to the word's start, but only while at
 * least half the width stays; past that, the word is cut. A space the cut leaves at the
 * end goes, so the mark sits on the word.
 */
export function clipCodePoints(text: string, width: number): string {
  const points = Array.from(text);
  if (points.length <= width) return text;
  let kept = points.slice(0, width - 1);
  const next = points[width - 1] ?? "";
  if (!/\s/u.test(next)) {
    const wordStart = kept.lastIndexOf(" ");
    if (wordStart >= Math.ceil(width / 2)) kept = kept.slice(0, wordStart);
  }
  return `${kept.join("").trimEnd()}…`;
}
