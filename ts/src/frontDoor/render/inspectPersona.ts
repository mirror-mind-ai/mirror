// `inspect persona <id>` rendering — the port of memory.cli.inspect._inspect_persona.

import type { Database } from "../../db/database.ts";
import { getPersonaInspect } from "../../identity/personaInspect.ts";

/** Raised when no persona identity row exists for the id. Python prints this to
 * STDOUT (not stderr) before exit(1) — a deliberate divergence from `identity get`. */
export class PersonaNotFoundError extends Error {
  readonly personaId: string;
  constructor(personaId: string) {
    super(`persona/${personaId} not found`);
    this.personaId = personaId;
  }
}

/** Fixed key order the Python source iterates, printing only present (non-null) values. */
const METADATA_KEYS = [
  "persona_id",
  "name",
  "inherits_from",
  "description",
  "default_model",
] as const;

/** Render `inspect persona <id>`, or throw PersonaNotFoundError when absent. */
export function renderInspectPersona(db: Database, personaId: string): string {
  const row = getPersonaInspect(db, personaId);
  if (!row) throw new PersonaNotFoundError(personaId);

  const prints: string[] = [
    `=== persona/${personaId} ===`,
    `version: ${row.version}`,
    `updated_at: ${row.updatedAt}`,
    "metadata:",
  ];
  const metadataKeys = Object.keys(row.metadata);
  if (metadataKeys.length > 0) {
    for (const key of METADATA_KEYS) {
      const value = row.metadata[key];
      if (value !== undefined && value !== null) prints.push(`  ${key}: ${value}`);
    }
    const rawKeywords = row.metadata.routing_keywords;
    const keywords = Array.isArray(rawKeywords)
      ? rawKeywords.filter((item): item is string => typeof item === "string")
      : [];
    prints.push(`  routing_keywords: ${keywords.length > 0 ? keywords.join(", ") : "(none)"}`);
  } else {
    prints.push("  (none)");
  }
  prints.push("\ncontent:\n");
  prints.push(row.content);
  return prints.map((line) => `${line}\n`).join("");
}
