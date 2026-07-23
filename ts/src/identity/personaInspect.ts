// `inspect persona` read primitives — the port of memory.cli.inspect._inspect_persona
// and its shared _persona_metadata helper. `inspect extension`/`runtime-catalog`/
// `llm-calls`/`embedding-provenance` share the extension catalog / ops-tail
// machinery and stay on Python, bound to CV22.DS7.TS1.

import type { Database } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

export interface PersonaInspectRow {
  version: string;
  updatedAt: string;
  content: string;
  /** Parsed JSON object metadata, or {} for null/malformed/non-object metadata. */
  metadata: Record<string, unknown>;
}

/** Port of `_persona_metadata`: {} for null, malformed JSON, or a non-object payload. */
function parseMetadataObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Port of `mem.store.get_identity("persona", persona_id)`, projected for inspect. */
export function getPersonaInspect(db: Database, personaId: string): PersonaInspectRow | null {
  const row = db
    .prepare(
      "SELECT version, updated_at, content, metadata FROM identity WHERE layer = 'persona' AND key = ?",
    )
    .get(personaId);
  if (row === undefined) return null;
  return {
    version: requireString(row, "version"),
    updatedAt: requireString(row, "updated_at"),
    content: requireString(row, "content"),
    metadata: parseMetadataObject(optionalString(row, "metadata")),
  };
}
