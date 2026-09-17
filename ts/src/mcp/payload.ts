// Python-compatible JSON encoding for the MCP surface (CV22.DS9.US1 + US2).
//
// One encoder, two shapes. The JSON-RPC envelope is written compactly with
// Python's default separators (`", "` / `": "`); tool payloads are written with
// `indent=2`. Both come from `json.dumps` in the oracle, so both live here --
// two modules would be the same rules maintained twice.
//
// Two places where `JSON.stringify` is not enough:
//
// 1. **Separators.** Python writes `{"a": 1, "b": 2}`; JS writes `{"a":1,"b":2}`.
//    Semantically identical, byte-wise different, and the parity claim is about
//    bytes (see the US1 plan).
//
// 2. **Whole floats.** Python writes `2.0` for a float that happens to be whole;
//    JS writes `2`, and JavaScript has no int/float distinction to recover from
//    (`2.0 === 2`). Measured on the real database: `detect_persona` returns
//    scores of `1.0` and `2.0` routinely. So float-ness is carried at runtime by
//    `PyFloat`, wrapped at the mapper for exactly the fields the oracle types as
//    `float`. A compile-time brand cannot do this -- it is erased before the
//    encoder ever sees the value.
//
// Escaping is delegated to `JSON.stringify` for every scalar and object key, so
// string escaping, unicode (Python runs `ensure_ascii=False`, which matches JS),
// and number formatting stay exactly what the platform does.

/**
 * A number the Python oracle types as `float`, so it renders `2.0` where an int
 * would render `2`. A class rather than a branded type because the distinction
 * must survive to runtime.
 */
export class PyFloat {
  // An explicit field, not a parameter property: Node runs TypeScript in
  // strip-only mode, which rejects `constructor(readonly value: number)`.
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }
}

/** Wrap a value the oracle types as `float`. */
export function pyFloat(value: number): PyFloat {
  return new PyFloat(value);
}

export interface PythonJsonOptions {
  /** Spaces per level. Omit or pass 0 for Python's compact default. */
  indent?: number;
}

/** Encode a value the way Python's `json.dumps` would. */
export function pythonJson(value: unknown, options: PythonJsonOptions = {}): string {
  const indent = options.indent ?? 0;
  return encode(value, indent, 0);
}

/** Encode one JSON-RPC line: compact, Python separators. */
export function encodeJsonLine(value: unknown): string {
  return pythonJson(value);
}

/**
 * Render a float the way Python's `repr` does.
 *
 * Two differences from `String(n)`, both measured against `json.dumps`:
 * whole values keep a `.0` (`2` -> `2.0`), and exponents are written with at
 * least two digits (`1e-7` -> `1e-07`). A value already in exponent form never
 * gains a `.0` -- Python writes `1e+22`, not `1e+22.0`.
 */
function encodeFloat(value: number): string {
  if (!Number.isFinite(value)) {
    // Python emits bare Infinity/NaN here; no MCP payload carries them, and a
    // silent mismatch would be worse than a loud failure.
    throw new TypeError(`cannot encode non-finite float: ${value}`);
  }
  if (Object.is(value, -0)) return "-0.0";

  const rendered = String(value);
  const exponentIndex = rendered.indexOf("e");
  if (exponentIndex === -1) {
    return Number.isInteger(value) ? `${rendered}.0` : rendered;
  }

  const mantissa = rendered.slice(0, exponentIndex);
  const sign = rendered[exponentIndex + 1] === "-" ? "-" : "+";
  const digits = rendered.slice(exponentIndex + 1).replace(/^[+-]/, "");
  return `${mantissa}e${sign}${digits.padStart(2, "0")}`;
}

function encode(value: unknown, indent: number, depth: number): string {
  if (value instanceof PyFloat) return encodeFloat(value.value);
  if (value === null || value === undefined) return "null";

  const type = typeof value;
  if (type === "string" || type === "boolean") return JSON.stringify(value);
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`cannot encode non-finite number: ${String(value)}`);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => encode(item, indent, depth + 1));
    return wrap("[", items, "]", indent, depth);
  }

  if (type === "object") {
    // Only plain objects are data. A Date, Map, or class instance would encode
    // as `{}` through Object.entries -- silently losing content that Python
    // would have rendered through `default=str`. Reject it instead.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        `cannot encode ${(value as object).constructor?.name ?? "object"} as Python JSON`,
      );
    }
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );
    if (entries.length === 0) return "{}";
    const items = entries.map(
      ([key, entryValue]) => `${JSON.stringify(key)}: ${encode(entryValue, indent, depth + 1)}`,
    );
    return wrap("{", items, "}", indent, depth);
  }

  // Python's `default=str` would stringify anything else. There is no honest
  // port of that -- `String(obj)` is `[object Object]`, never Python's repr --
  // and after the DS9.US2 D1 fix no tool payload contains such a value. Failing
  // loudly puts the surprise in a test rather than in a client's context window.
  throw new TypeError(`cannot encode value of type ${type} as Python JSON`);
}

function wrap(open: string, items: string[], close: string, indent: number, depth: number): string {
  if (indent <= 0) return `${open}${items.join(", ")}${close}`;
  const inner = " ".repeat(indent * (depth + 1));
  const outer = " ".repeat(indent * depth);
  return `${open}\n${inner}${items.join(`,\n${inner}`)}\n${outer}${close}`;
}
