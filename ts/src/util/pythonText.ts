// Python string semantics the port must reproduce byte-for-byte.
//
// Python indexes, slices, and orders `str` by Unicode code point. JavaScript
// does all three by UTF-16 code unit, which agrees with Python on the Basic
// Multilingual Plane and silently disagrees the moment an emoji or any other
// astral character appears: `"🎯x".slice(0, 1)` is half a surrogate pair, and
// `"🎯" < "\uFFFF"` in JS while Python says the opposite. Title truncation,
// sorted term lists, and path ordering are all parity surfaces graded against
// Python's output, so every one of them must go through these helpers.

/**
 * Python's whitespace set: what `str.isspace()` reports, what `str.strip()`
 * removes, and what `\s` matches in a `str` pattern. It is NOT JavaScript's
 * `\s`, and the difference is load-bearing in both directions:
 *
 * - Python includes U+001C-U+001F (the file/group/record/unit separators);
 *   JavaScript does not.
 * - JavaScript includes U+FEFF (the byte-order mark); Python does not.
 *
 * A UTF-8 file that opens with a BOM is the realistic case: both cores read
 * the BOM into the string, and a JavaScript `\s` would silently collapse it
 * away while Python keeps it -- enough to change a checksum and make one core
 * report drift the other cannot see. Written as a class body so callers can
 * build the anchors and quantifiers they need.
 */
export const PYTHON_WHITESPACE_CLASS =
  "\\t\\n\\v\\f\\r\\u001c-\\u001f \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";

/** A fresh regex over {@link PYTHON_WHITESPACE_CLASS}; `flags` always gets `u`. */
export function pythonWhitespaceRegex(quantifier = "+", flags = "g"): RegExp {
  return new RegExp(`[${PYTHON_WHITESPACE_CLASS}]${quantifier}`, `${flags}u`);
}

const PY_STRIP_RE = new RegExp(
  `^[${PYTHON_WHITESPACE_CLASS}]+|[${PYTHON_WHITESPACE_CLASS}]+$`,
  "gu",
);

/** Python `str.strip()` with no argument. Not `String.prototype.trim()`. */
export function pyStrip(text: string): string {
  return text.replace(PY_STRIP_RE, "");
}

const PY_RSTRIP_RE = new RegExp(`[${PYTHON_WHITESPACE_CLASS}]+$`, "u");

/** Python `str.rstrip()` with no argument. */
export function pyRStrip(text: string): string {
  return text.replace(PY_RSTRIP_RE, "");
}

const PY_SPLIT_RE = new RegExp(`[${PYTHON_WHITESPACE_CLASS}]+`, "u");

/**
 * Python `str.split()` with no argument: split on RUNS of whitespace and drop
 * the empty leading/trailing fields. `"a  b ".split()` is `["a", "b"]`, while
 * JavaScript's `"a  b ".split(/\s+/)` yields a trailing `""` -- and disagrees
 * about the separator set on U+001C-U+001F and U+FEFF besides.
 */
export function pySplitWhitespace(text: string): string[] {
  const stripped = pyStrip(text);
  if (stripped === "") return [];
  return stripped.split(PY_SPLIT_RE);
}

/**
 * Python `str.splitlines()`: the line boundaries are \n, \r, \r\n, \v, \f,
 * U+001C, U+001D, U+001E, U+0085, U+2028, and U+2029 -- eleven of them, where
 * `split("\n")` knows one. A ritual card fed a form feed renders as two blocks
 * in Python and one long line in a naive port.
 *
 * Like Python, a trailing boundary does not produce a final empty field.
 */
export function pySplitLines(text: string): string[] {
  if (text === "") return [];
  const lines: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string;
    if (char === "\r") {
      lines.push(current);
      current = "";
      if (text[index + 1] === "\n") index += 1;
      continue;
    }
    if (PY_LINE_BOUNDARIES.has(char)) {
      lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current !== "") lines.push(current);
  return lines;
}

const PY_LINE_BOUNDARIES = new Set([
  "\n",
  "\v",
  "\f",
  "\u001c",
  "\u001d",
  "\u001e",
  "\u0085",
  "\u2028",
  "\u2029",
]);

/**
 * Python truthiness. JavaScript and Python agree on `null`/`undefined`,
 * `false`, `0`, `NaN`, and `""` -- and disagree on containers: `[]` and `{}`
 * are falsy in Python and truthy in JavaScript. Manifest validation leans on
 * this exactly (`if not data.get(field)`), so an extension declaring
 * `runtimes: {}` must fail the required-field check, not sail past it.
 */
export function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

/**
 * Python `str(value)` for the scalar shapes a YAML manifest can hold. Error
 * messages interpolate parsed YAML directly, so `None`/`True`/`False` must
 * render with Python's capitalization, not JavaScript's.
 */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([key, item]) => `${pyRepr(key)}: ${pyRepr(item)}`).join(", ")}}`;
  }
  return String(value);
}

/** Python `repr(value)` / an f-string's `!r`: strings gain single quotes. */
export function pyRepr(value: unknown): string {
  if (typeof value !== "string") return pyStr(value);
  const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

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

/**
 * Python `str.format(**values)` for named fields, including brace escaping.
 *
 * `"{{"` and `"}}"` are LITERAL braces in a format string and collapse to a
 * single brace, which a naive `replaceAll("{name}", value)` leaves doubled.
 * `WEEK_PLAN_PROMPT` embeds a JSON example written with doubled braces exactly
 * so `.format()` can be applied to it, so the difference is not cosmetic: the
 * assembled prompt bytes -- and therefore the replay digest -- disagree
 * (CV22.DS7.US11, caught by the prompt-assembly golden).
 *
 * Only the subset the vendored templates use is implemented: named fields with
 * no conversion, no format spec, no attribute or index access. An unknown
 * field raises, as Python's `KeyError` does, rather than silently emitting the
 * placeholder into a prompt.
 */
export function pyFormat(template: string, values: Readonly<Record<string, string>>): string {
  let out = "";
  for (let index = 0; index < template.length; index += 1) {
    const char = template[index];
    const next = template[index + 1];
    if (char === "{" && next === "{") {
      out += "{";
      index += 1;
    } else if (char === "}" && next === "}") {
      out += "}";
      index += 1;
    } else if (char === "{") {
      const close = template.indexOf("}", index + 1);
      if (close === -1) throw new Error("pyFormat: unmatched '{' in template");
      const field = template.slice(index + 1, close);
      if (!Object.hasOwn(values, field)) {
        throw new Error(`pyFormat: no value for field ${JSON.stringify(field)}`);
      }
      out += values[field];
      index = close;
    } else if (char === "}") {
      throw new Error("pyFormat: single '}' in template");
    } else {
      out += char;
    }
  }
  return out;
}
