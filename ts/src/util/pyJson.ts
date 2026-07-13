// Python-compatible JSON serialization.
//
// The identity table stores metadata as a JSON string produced by Python's
// json.dumps. For write parity the TS port must reproduce that string exactly,
// and JS JSON.stringify does not: Python uses ", " / ": " separators, escapes
// non-ASCII under ensure_ascii (astral chars as \u surrogate pairs), and can sort
// keys. This reproduces json.dumps for the JSON value types Mirror's metadata
// uses (objects, arrays, strings, numbers, booleans, null).

export interface PyJsonDumpsOptions {
  /** Escape non-ASCII as \uXXXX, like Python's default ensure_ascii=True. */
  ensureAscii?: boolean;
  /** Sort object keys, like Python's sort_keys=True. */
  sortKeys?: boolean;
}

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};

function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).padStart(4, "0")}`;
}

function encodeString(value: string, ensureAscii: boolean): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0) as number;
    const shortEscape = SHORT_ESCAPES[ch];
    if (shortEscape !== undefined) {
      out += shortEscape;
    } else if (code < 0x20) {
      out += unicodeEscape(code);
    } else if (ensureAscii && code > 0x7e) {
      if (code > 0xffff) {
        const offset = code - 0x10000;
        out += unicodeEscape(0xd800 + (offset >> 10)) + unicodeEscape(0xdc00 + (offset & 0x3ff));
      } else {
        out += unicodeEscape(code);
      }
    } else {
      out += ch;
    }
  }
  return `${out}"`;
}

function encode(value: unknown, ensureAscii: boolean, sortKeys: boolean): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return encodeString(value, ensureAscii);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("pyJsonDumps: non-finite numbers are not supported");
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => encode(item, ensureAscii, sortKeys)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = sortKeys ? Object.keys(record).sort() : Object.keys(record);
    const entries = keys.map(
      (key) => `${encodeString(key, ensureAscii)}: ${encode(record[key], ensureAscii, sortKeys)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  throw new Error(`pyJsonDumps: unsupported type ${typeof value}`);
}

/** Serialize a value the way Python's json.dumps would. */
export function pyJsonDumps(value: unknown, options: PyJsonDumpsOptions = {}): string {
  return encode(value, options.ensureAscii ?? true, options.sortKeys ?? false);
}
