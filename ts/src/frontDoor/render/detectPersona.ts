// `detect-persona` rendering: read persona routing rows, score the query,
// format the matches. Extracted from cli.ts (CR002).

import type { Database } from "../../db/database.ts";
import { requireString } from "../../db/rowDecode.ts";
import { detectPersona, type PersonaRoutingRow } from "../../persona/detectPersona.ts";
import { stripOptionWithValue } from "../args.ts";
import { identityRows } from "./identityRows.ts";

/** Parse each persona row's `routing_keywords` out of its identity metadata. */
export function routingRows(db: Database): PersonaRoutingRow[] {
  return identityRows(db, "persona").map((row) => {
    let keywords: string[] = [];
    const metadata = row.metadata;
    if (typeof metadata === "string" && metadata) {
      try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        if (Array.isArray(parsed.routing_keywords)) {
          keywords = parsed.routing_keywords.filter(
            (item): item is string => typeof item === "string",
          );
        }
      } catch {
        keywords = [];
      }
    }
    return { key: requireString(row, "key"), routing_keywords: keywords };
  });
}

/**
 * Render `detect-persona`. Strips known option flags (and their values) so only
 * the query tokens remain — both `--mirror-home` and `--db-path`, the latter of
 * which previously leaked into the query text.
 */
export function renderDetectPersona(db: Database, args: readonly string[]): string {
  const query = stripOptionWithValue(stripOptionWithValue(args, "--mirror-home"), "--db-path")
    .join(" ")
    .trim();
  const matches = detectPersona(query, routingRows(db));
  const lines = [`query: ${query}`];
  if (matches.length === 0) {
    lines.push("  (no persona match)");
  } else {
    for (const match of matches) {
      lines.push(`  ${match.key} score=${match.score} match=${match.matchType}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
