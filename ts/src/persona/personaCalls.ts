// Personas as calls — CR205, and CR207's `createPersona`.
//
// A host that embeds this core (Nautilus for Mirror) shows a persona and edits
// it through these calls:
//
//   - `listPersonas`: every persona's id, name and description;
//   - `readPersona`: one persona whole;
//   - `updatePersona`: its name, prompt, description and routing keywords;
//   - `createPersona` (CR207): a new persona with those fields, under an id no
//     persona holds. Deleting one is `personaDeletion.ts`.
//
// A persona is one identity row (`layer = 'persona'`): `content` is its prompt,
// and its metadata carries the rest. The default model and the inheritance are
// read, never written: changing them changes semantics this call does not own.
// A metadata `briefing`, which some older homes hold, is not offered: nothing
// reads it, and the seed puts a YAML briefing into the prompt instead. Every
// metadata key a call does not write is kept, in its place.
//
// Like the Journey calls (`journey/journeyCalls.ts`), every call takes an
// explicit database path, refuses a database that is not `current`, and
// refuses with a `PersonaCallRejectedError` that writes nothing. The reads
// open read-only; the update checks its request first, then writes behind the
// front door's verified snapshot, in one immediate transaction, only when
// something changes. A changed prompt leaves the persona's generated
// descriptor as it was, as `mirror identity set` does.

import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { type Database, openDatabaseReadOnly, withTransaction } from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { upsertIdentity } from "#identity/identityStore.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { isKebabSlug } from "#util/slug.ts";

export type PersonaCallRejection =
  | "invalid_request"
  | "unknown_persona"
  | "persona_changed"
  | "metadata_unreadable"
  | "invalid_name"
  | "invalid_prompt"
  | "invalid_description"
  | "invalid_routing_keywords"
  // CR207.
  | "invalid_persona_id"
  | "persona_exists"
  | "persona_has_heirs"
  | "backup_failed";

/** A call's refusal, naming the field when one was at fault. Nothing was written. */
export class PersonaCallRejectedError extends Error {
  readonly reason: PersonaCallRejection;
  /** The personas the refusal is about: the heirs, for `persona_has_heirs`. */
  readonly personas: string[];

  constructor(reason: PersonaCallRejection, personas: string[] = []) {
    super(personas.length ? `${reason}: ${personas.join(", ")}` : reason);
    this.reason = reason;
    this.personas = personas;
  }
}

export interface PersonaSummary {
  id: string;
  name: string | null;
  description: string | null;
}

export interface Persona extends PersonaSummary {
  prompt: string;
  routingKeywords: string[];
  defaultModel: string | null;
  inheritsFrom: string | null;
  /** What `updatePersona` takes back as `expectedUpdatedAt`. */
  updatedAt: string;
}

export interface CreatePersonaRequest {
  /** The new persona's id: a kebab slug no persona holds. */
  persona: string;
  name: string;
  prompt: string;
  description?: string | null;
  routingKeywords?: string[];
}

export interface UpdatePersonaRequest {
  persona: string;
  expectedUpdatedAt: string;
  /** `null` removes the name. */
  name?: string | null;
  prompt?: string;
  /** `null` removes the description. */
  description?: string | null;
  /** An empty list removes the keywords. */
  routingKeywords?: string[];
}

/** CR204's bound for a name a host shows. */
const MAX_NAME = 80;
const MAX_DESCRIPTION = 2000;
const MAX_KEYWORD = 80;
const MAX_KEYWORDS = 200;
const WRITABLE = new Set(["name", "prompt", "description", "routingKeywords"]);
const CREATE_KEYS = new Set(["persona", ...WRITABLE]);
const REQUEST_KEYS = new Set(["persona", "expectedUpdatedAt", ...WRITABLE]);

type Metadata = Record<string, unknown>;

/** C0 and C1 control characters, which a name or a keyword never holds. */
function hasControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

interface PersonaRow {
  key: string;
  content: string;
  version: string;
  updated_at: string;
  metadata: string | null;
}

function reject(reason: PersonaCallRejection, personas?: string[]): never {
  throw new PersonaCallRejectedError(reason, personas);
}

export function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) reject("invalid_request");
  return value;
}

/** The metadata object, `{}` when there is none, `null` when it cannot be read as one. */
function parseMetadata(raw: string | null): Metadata | null {
  if (raw === null || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Metadata) }
      : null;
  } catch {
    return null;
  }
}

function optionalText(meta: Metadata, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function keywordsOf(meta: Metadata): string[] {
  const value = meta.routing_keywords;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function summaryOf(row: PersonaRow): PersonaSummary {
  const meta = parseMetadata(row.metadata) ?? {};
  return {
    id: row.key,
    name: optionalText(meta, "name"),
    description: optionalText(meta, "description"),
  };
}

function personaOf(row: PersonaRow): Persona {
  const meta = parseMetadata(row.metadata) ?? {};
  return {
    ...summaryOf(row),
    prompt: row.content,
    routingKeywords: keywordsOf(meta),
    defaultModel: optionalText(meta, "default_model"),
    inheritsFrom: optionalText(meta, "inherits_from"),
    updatedAt: row.updated_at,
  };
}

export function personaRow(db: Database, key: string): PersonaRow | undefined {
  return db
    .prepare(
      "SELECT key, content, version, updated_at, metadata FROM identity WHERE layer = 'persona' AND key = ?",
    )
    .get(key) as unknown as PersonaRow | undefined;
}

export function withRead<T>(dbPath: string, read: (db: Database) => T): T {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openDatabaseReadOnly(dbPath);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

/** Every persona the home keeps, by id. */
export function listPersonas(dbPath: string): PersonaSummary[] {
  return withRead(dbPath, (db) =>
    (
      db
        .prepare(
          "SELECT key, content, version, updated_at, metadata FROM identity WHERE layer = 'persona' ORDER BY key",
        )
        .all() as unknown as PersonaRow[]
    ).map(summaryOf),
  );
}

/** One persona whole. */
export function readPersona(dbPath: string, request: { persona: string }): Persona {
  const key = text(request?.persona);
  return withRead(dbPath, (db) => {
    const row = personaRow(db, key);
    if (!row) reject("unknown_persona");
    return personaOf(row);
  });
}

function cleanName(value: unknown): string | null {
  if (value === null) return null;
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length === 0 || [...name].length > MAX_NAME || hasControl(name)) reject("invalid_name");
  return name;
}

function cleanPrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) reject("invalid_prompt");
  return value;
}

function cleanDescription(value: unknown): string | null {
  if (value === null) return null;
  const description = typeof value === "string" ? value.trim() : "";
  if (description.length === 0 || [...description].length > MAX_DESCRIPTION) {
    reject("invalid_description");
  }
  return description;
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_KEYWORDS) reject("invalid_routing_keywords");
  return value.map((item) => {
    const keyword = typeof item === "string" ? item.trim() : "";
    if (keyword.length === 0 || [...keyword].length > MAX_KEYWORD || hasControl(keyword)) {
      reject("invalid_routing_keywords");
    }
    return keyword;
  });
}

/** Set `key` in place, or remove it for `null`. */
function assign(meta: Metadata, key: string, value: unknown): void {
  if (value === null) delete meta[key];
  else meta[key] = value;
}

/** Change a persona's name, prompt, description or routing keywords; answer it whole. */
export function updatePersona(dbPath: string, request: UpdatePersonaRequest): Persona {
  const key = text(request?.persona);
  const expected = text(request.expectedUpdatedAt);
  const given = Object.keys(request).filter(
    (field) => request[field as keyof UpdatePersonaRequest] !== undefined,
  );
  if (given.some((field) => !REQUEST_KEYS.has(field))) reject("invalid_request");
  if (!given.some((field) => WRITABLE.has(field))) reject("invalid_request");
  const has = (field: keyof UpdatePersonaRequest) => request[field] !== undefined;
  const name = has("name") ? cleanName(request.name) : undefined;
  const prompt = has("prompt") ? cleanPrompt(request.prompt) : undefined;
  const description = has("description") ? cleanDescription(request.description) : undefined;
  const keywords = has("routingKeywords") ? cleanKeywords(request.routingKeywords) : undefined;

  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openLiveWriteDatabase(dbPath);
  try {
    return withTransaction(db, () => {
      const row = personaRow(db, key);
      if (!row) reject("unknown_persona");
      if (row.updated_at !== expected) reject("persona_changed");
      let metadata = row.metadata;
      if (name !== undefined || description !== undefined || keywords !== undefined) {
        const meta = parseMetadata(row.metadata);
        if (meta === null) reject("metadata_unreadable");
        const before = JSON.stringify(meta);
        if (name !== undefined) assign(meta, "name", name);
        if (description !== undefined) assign(meta, "description", description);
        if (keywords !== undefined)
          assign(meta, "routing_keywords", keywords.length ? keywords : null);
        const after = JSON.stringify(meta);
        if (after !== before) metadata = after;
      }
      const content = prompt ?? row.content;
      if (content === row.content && metadata === row.metadata) return personaOf(row);
      upsertIdentity(
        db,
        { id: key, layer: "persona", key, content, version: row.version, metadata },
        nowIso(),
      );
      const written = personaRow(db, key);
      if (!written) reject("unknown_persona");
      return personaOf(written);
    });
  } finally {
    db.close();
  }
}

/**
 * Create a persona; answer it whole. Its metadata holds what the seed writes
 * for a persona file (`persona_id`, then the fields given), and it is offered
 * to the router from the next turn by its description (`routablePersonas`).
 * The default model and the inheritance are not taken, as in `updatePersona`.
 */
export function createPersona(dbPath: string, request: CreatePersonaRequest): Persona {
  const key = text(request?.persona);
  const given = Object.keys(request).filter(
    (field) => request[field as keyof CreatePersonaRequest] !== undefined,
  );
  if (given.some((field) => !CREATE_KEYS.has(field))) reject("invalid_request");
  if (!isKebabSlug(key)) reject("invalid_persona_id");
  const name = request.name === null ? reject("invalid_name") : cleanName(request.name);
  const prompt = cleanPrompt(request.prompt);
  const meta: Metadata = { persona_id: key, name };
  // A description is optional; `null`, as `undefined`, creates the persona without one.
  const description = request.description == null ? null : cleanDescription(request.description);
  if (description !== null) meta.description = description;
  if (request.routingKeywords !== undefined) {
    const keywords = cleanKeywords(request.routingKeywords);
    if (keywords.length) meta.routing_keywords = keywords;
  }

  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openLiveWriteDatabase(dbPath);
  try {
    return withTransaction(db, () => {
      if (personaRow(db, key)) reject("persona_exists");
      upsertIdentity(
        db,
        {
          id: newId(),
          layer: "persona",
          key,
          content: prompt,
          version: "1.0.0",
          metadata: JSON.stringify(meta),
        },
        nowIso(),
      );
      const written = personaRow(db, key);
      if (!written) reject("unknown_persona");
      return personaOf(written);
    });
  } finally {
    db.close();
  }
}
