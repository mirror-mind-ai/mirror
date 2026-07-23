// `list personas` read primitives — the port of the persona branch of
// memory.cli.inspect.cmd_list. Distinct from persona/detectPersona.ts's
// `routingRows`: same JSON shape, different call site/output (this one also
// needs `version`).

import type { Database } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

export interface PersonaListRow {
  key: string;
  version: string;
  routingKeywords: string[];
}

/** Port of `_persona_metadata(identity).get("routing_keywords") or []`. */
function parseRoutingKeywords(metadata: string | null): string[] {
  if (!metadata) return [];
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    if (!Array.isArray(parsed.routing_keywords)) return [];
    return parsed.routing_keywords.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** Port of `mem.get_identity(layer="persona")`, pre-sorted by key (Python re-sorts a no-op). */
export function listPersonas(db: Database): PersonaListRow[] {
  return db
    .prepare("SELECT key, version, metadata FROM identity WHERE layer = 'persona' ORDER BY key")
    .all()
    .map((row) => ({
      key: requireString(row, "key"),
      version: requireString(row, "version"),
      routingKeywords: parseRoutingKeywords(optionalString(row, "metadata")),
    }));
}
