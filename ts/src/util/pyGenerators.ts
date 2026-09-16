// Deterministic identifier + timestamp generation matching the Python core.
//
// During DS4 parity, `id` and `now` were INJECTED so the TS write matched the
// oracle. For live front-door writes (US4) the TS core must GENERATE them the way
// Python does: `_uuid()` = uuid4().hex[:8] (8 lowercase hex chars) and `_now()` =
// datetime.now(timezone.utc).isoformat().replace("+00:00","Z") (microsecond ISO-Z).

import { randomUUID } from "node:crypto";
import { compareByCodePoint } from "./pythonText.ts";

/** Match Python `_uuid()` = uuid4().hex[:8]: 8 lowercase hex chars. */
/**
 * Serialize like Python `json.dumps(value, ensure_ascii=False)`: item
 * separator `", "` and key separator `": "`. Scoped to JSON-decodable values
 * (the shapes Mirror stores in TEXT metadata columns); byte-parity of stored
 * metadata is part of the DS7 golden contract.
 */
export function pythonJsonDumps(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonJsonDumps(item)).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${JSON.stringify(key)}: ${pythonJsonDumps(item)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Serialize like Python's DEFAULT `json.dumps(value)` -- same `", "`/`": "`
 * separators as above, but with `ensure_ascii=True`, so non-ASCII characters
 * are escaped as `\uXXXX`.
 *
 * Mirror uses both variants, and which one applies is a per-call-site fact, not
 * a preference: conversation `metadata`/`tags` are written with
 * `ensure_ascii=False` (raw UTF-8), while memory `tags` go through
 * `services/memory.py`'s plain `json.dumps(tags)` and are escaped. Storing
 * `["café"]` where Python stored `["caf\u00e9"]` is a silent byte divergence in
 * a column both cores read.
 *
 * JavaScript strings are UTF-16, so astral characters are already surrogate
 * pairs and escaping each unit reproduces Python's surrogate-pair output.
 */
export function pythonJsonDumpsEnsureAscii(value: unknown): string {
  return escapeNonAscii(pythonJsonDumps(value));
}

/**
 * Serialize like Python `json.dumps(value, indent=2, sort_keys=True)` -- the
 * shape of a file written to be read back by BOTH cores.
 *
 * `ensure_ascii` is left at Python's default (True), because the call site this
 * mirrors leaves it there too: the welcome's update cache is written with a
 * plain `json.dumps(payload, indent=2, sort_keys=True)`. A release title
 * carrying an em dash must land as `\u2014`, not as raw UTF-8, or the two
 * cores write different bytes for the same state and thrash each other's TTL.
 */
export function pythonJsonDumpsIndented(value: unknown, indent = 2): string {
  return escapeNonAscii(JSON.stringify(sortKeysDeep(value), null, indent));
}

/**
 * Serialize like Python `json.dumps(value, indent=2)` -- indented and
 * ASCII-escaped, but in INSERTION order.
 *
 * Separate from `pythonJsonDumpsIndented` because that one carries
 * `sort_keys=True`, and this call site does not: the extension runtime catalog
 * is written key by key as `schema_version, runtime, target_root,
 * generated_at, extensions`. Sorting would hoist `extensions` to the top and
 * change every byte of a file both cores read and rewrite.
 */
export function pythonJsonDumpsIndentedOrdered(value: unknown, indent = 2): string {
  return escapeNonAscii(JSON.stringify(value, null, indent));
}

/**
 * Serialize like Python `json.dumps(value, ensure_ascii=True,
 * separators=(",", ":"), sort_keys=True)` -- the canonical form a HASH is taken
 * over.
 *
 * Separate from `pythonJsonDumpsIndented` because the bytes differ in three ways
 * at once (no indent, no spaces after separators, escaped non-ASCII), and this one
 * feeds `scope_fingerprint`. A fingerprint is an equality test on authority: if the
 * two engines canonicalize differently, a receipt Python recorded cannot be
 * consumed by TypeScript and the Navigator is asked to approve a Plan they already
 * authorized.
 *
 * Keys are ordered by CODE POINT, not by JavaScript's default UTF-16 comparison.
 * The fingerprint payload has fixed ASCII keys so the two orders coincide today;
 * using the correct comparator means a future key cannot silently diverge.
 */
export function pythonJsonDumpsCanonical(value: unknown): string {
  return escapeNonAscii(JSON.stringify(sortKeysByCodePoint(value)));
}

function sortKeysByCodePoint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysByCodePoint);
  if (typeof value !== "object" || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort(compareByCodePoint)) {
    sorted[key] = sortKeysByCodePoint((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** Python's `sort_keys=True`, applied at every level. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== "object" || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function escapeNonAscii(text: string): string {
  return text.replace(/[\u0080-\uffff]/g, (character) => {
    const code = character.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });
}

export function newId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * Format a Date the way Python's `_now()` does: an ISO-8601 UTC string with a `Z`
 * suffix and 6-digit microseconds. JS Date resolves only to milliseconds, so the
 * final three digits are zero-padded. This keeps the stored string the same length
 * and lexicographic ordering as Python's timestamps — a millisecond `.123Z` would
 * otherwise sort *after* a microsecond `.123456Z`, corrupting recency ordering.
 */
export function toMicrosecondIso(date: Date): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/** Match Python `_now()`: the current UTC time as a microsecond ISO-`Z` string. */
export function nowIso(): string {
  return toMicrosecondIso(new Date());
}
