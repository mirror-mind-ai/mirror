// `detect-persona` parity port (CV22.DS2.US2).
//
// A faithful TypeScript port of Python `IdentityService.detect_persona`
// (`src/memory/services/identity.py`). The router is pure and deterministic — it
// reads DB-backed routing metadata only, no clock and no embeddings — so parity
// is exact behavioral equality, not the ordered-id-with-float-drift metric the
// hybrid ranker uses.
//
// This module scores an already-decoded persona routing table; reading the
// `persona` identity rows out of the SQLite seam belongs to the caller (the DS3
// front door and the real-DB-copy harness), keeping this the pure decision core.

/** One persona's routing table, as parsed from `identity.metadata`. */
export interface PersonaRoutingRow {
  key: string;
  routing_keywords: readonly string[];
}

/** A routing decision: the persona, its hit count, and the match kind. */
export interface PersonaMatch {
  key: string;
  score: number;
  matchType: string;
}

/**
 * Normalize routing text, mirroring Python `_normalize_routing_text`:
 * lowercase, turn `-`/`_` into spaces, replace any run of non-alphanumeric,
 * non-whitespace characters with a space, then collapse whitespace and trim.
 *
 * JS `\s` and Python `re`'s `\s` both match Unicode whitespace, and ASCII
 * `[a-z0-9]` is identical across engines, so the synthetic (ASCII) corpus is
 * reproduced exactly.
 */
export function normalizeRoutingText(text: string): string {
  const lowered = text.toLowerCase().replaceAll("-", " ").replaceAll("_", " ");
  const normalized = lowered.replace(/[^a-z0-9\s]+/g, " ");
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Detect likely personas from routing metadata, reproducing the Python oracle.
 *
 * A single-word keyword must match a whole query token (set membership); a
 * multi-word keyword (including one that becomes multi-word after normalization,
 * e.g. `savings-plan` -> `savings plan`) matches as a raw substring of the
 * normalized query — no word boundary, exactly like Python's `in`. Personas with
 * `hitCount >= threshold` are returned, sorted by score descending then key
 * ascending, matching `matches.sort(key=lambda i: (-i[1], i[0]))`.
 */
export function detectPersona(
  query: string,
  personas: readonly PersonaRoutingRow[],
  threshold = 1.0,
): PersonaMatch[] {
  const normalizedQuery = normalizeRoutingText(query);
  if (!normalizedQuery) return [];

  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const matches: PersonaMatch[] = [];

  for (const persona of personas) {
    let hitCount = 0;
    for (const keyword of persona.routing_keywords) {
      if (typeof keyword !== "string") continue;
      const normalizedKeyword = normalizeRoutingText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedKeyword.includes(" ")) {
        if (normalizedQuery.includes(normalizedKeyword)) hitCount += 1;
      } else if (queryTokens.has(normalizedKeyword)) {
        hitCount += 1;
      }
    }
    if (hitCount >= threshold) {
      matches.push({ key: persona.key, score: hitCount, matchType: "keyword" });
    }
  }

  matches.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return matches;
}
