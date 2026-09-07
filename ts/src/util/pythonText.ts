// Python string semantics the port must reproduce byte-for-byte.
//
// Python indexes, slices, and orders `str` by Unicode code point. JavaScript
// does all three by UTF-16 code unit, which agrees with Python on the Basic
// Multilingual Plane and silently disagrees the moment an emoji or any other
// astral character appears: `"🎯x".slice(0, 1)` is half a surrogate pair, and
// `"🎯" < "\uFFFF"` in JS while Python says the opposite. Title truncation,
// sorted term lists, and path ordering are all parity surfaces graded against
// Python's output, so every one of them must go through these helpers.

/** Python `sorted()` / `<` on `str`: lexicographic by code point. */
export function compareByCodePoint(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const delta = (left[index]?.codePointAt(0) ?? 0) - (right[index]?.codePointAt(0) ?? 0);
    if (delta !== 0) return delta;
  }
  return left.length - right.length;
}

/** Python `sorted(values)` on strings. Returns a new array. */
export function sortByCodePoint(values: readonly string[]): string[] {
  return [...values].sort(compareByCodePoint);
}

/** Python `len(text)`: the number of code points, not UTF-16 units. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** Python `text[:end]`: the first `end` code points. */
export function sliceCodePoints(text: string, end: number): string {
  return Array.from(text).slice(0, end).join("");
}

/**
 * Python `sorted()` over `pathlib.Path` values: paths compare by their
 * COMPONENT lists, not by their joined string. The two orders diverge whenever
 * a directory name contains a character that sorts before `/` (0x2F) -- `-`
 * (0x2D) is the common one, so `a/b` precedes `a-x/c` for Python while a plain
 * string sort puts `a-x/c` first. Callers pass already-split components.
 */
export function comparePathComponents(a: readonly string[], b: readonly string[]): number {
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const delta = compareByCodePoint(a[index] as string, b[index] as string);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}
