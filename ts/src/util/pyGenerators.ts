// Deterministic identifier + timestamp generation matching the Python core.
//
// During DS4 parity, `id` and `now` were INJECTED so the TS write matched the
// oracle. For live front-door writes (US4) the TS core must GENERATE them the way
// Python does: `_uuid()` = uuid4().hex[:8] (8 lowercase hex chars) and `_now()` =
// datetime.now(timezone.utc).isoformat().replace("+00:00","Z") (microsecond ISO-Z).

import { randomUUID } from "node:crypto";

/** Match Python `_uuid()` = uuid4().hex[:8]: 8 lowercase hex chars. */
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
