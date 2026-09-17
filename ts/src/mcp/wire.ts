// JSON-RPC wire encoding (CV22.DS9.US1).
//
// Python's `json.dumps` defaults to the separators `", "` and `": "`; Node's
// `JSON.stringify` emits `","` and `":"`. Every response would therefore differ
// byte-for-byte from the oracle while parsing to the same value.
//
// The divergence is semantically invisible -- MCP clients parse each line -- so
// CV22's superset rule would have allowed recording it. It is fixed instead,
// because the alternative is a permanent asterisk on the parity claim: every
// future comparison of these two servers, including DS10's deletion decision,
// would have to re-establish that the difference is still only whitespace. A
// fifteen-line encoder is cheaper than carrying that question.
//
// Escaping is delegated to `JSON.stringify` for every scalar and for object
// keys, so string escaping, unicode handling (Python runs with
// `ensure_ascii=False`, which matches JS), and number formatting stay exactly
// what the platform does -- only structure and separators are hand-written.

/** Encode a value the way Python's default `json.dumps` would. */
export function encodeJsonLine(value: unknown): string {
  return encode(value);
}

function encode(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `[${value.map(encode).join(", ")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );
    if (entries.length === 0) return "{}";
    const body = entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}: ${encode(entryValue)}`)
      .join(", ");
    return `{${body}}`;
  }

  // Scalars: strings, numbers, booleans. JSON.stringify never returns undefined
  // for these, but the fallback keeps the function total.
  return JSON.stringify(value) ?? "null";
}
