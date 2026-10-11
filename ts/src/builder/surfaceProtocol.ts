// CV22.DS7.US8 plateau 1 — the Ariad surface transport boundary.
//
// Port of `src/memory/builder/surface_protocol.py`, all ten lines of it, and it
// earns its own module for the same reason Python gives it one: every Ariad
// surface passes through here, and the marked block is a transport contract the
// runtime harness parses. A re-indent, a doubled newline, or a lost marker is a
// protocol break, not a formatting difference.
//
// Two details a port drops:
//
//   * the id is normalized — `strip()`, `upper()`, and spaces to underscores —
//     so callers pass `"plan_checkpoint"` or `"Plan Checkpoint"` and both emit
//     `PLAN_CHECKPOINT`;
//   * the body is `rstrip()`ed, and call sites are INCONSISTENT about whether
//     they append a trailing newline (`body + "\n"` in most of `builder/`, bare
//     `body` in three places in `lifecycle.py`). Because the body is stripped
//     either way the output is identical, which is exactly why a port that
//     forgets the strip appears to work until it meets the other call style.

import { PYTHON_WHITESPACE_CLASS, pyStrip } from "#util/pythonText.ts";

const TRAILING_WS_RE = new RegExp(`[${PYTHON_WHITESPACE_CLASS}]+$`, "u");

/** Python `str.rstrip()` with no argument — Python's whitespace set, not `.trimEnd()`. */
function pyRStripAll(text: string): string {
  return text.replace(TRAILING_WS_RE, "");
}

/**
 * Python `wrap_ariad_surface`: wrap a rendered surface in explicit transport
 * boundaries.
 *
 * Normalization is `surface_id.strip().upper().replace(" ", "_")`. Note it
 * replaces spaces only — a tab or a newline in an id would survive into the
 * marker, which no caller does but which the port must not silently "fix" by
 * normalizing all whitespace.
 */
export function wrapAriadSurface(surfaceId: string, body: string): string {
  const normalized = pyStrip(surfaceId).toUpperCase().replaceAll(" ", "_");
  const content = pyRStripAll(body);
  return `<<<ARIAD:${normalized}>>>\n${content}\n<<<END:${normalized}>>>\n`;
}
