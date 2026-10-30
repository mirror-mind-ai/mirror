// Journeys as calls — CV24.DS8.
//
// A host that embeds this core (Mirror Desktop 0.3) creates, edits, moves and
// deletes Journeys through five calls, each answering with the home's Journey
// tree as `readJourneyTree` reads it:
//
//   - `addJourney`, `setJourneyProjectPath`, `moveJourney`, `deleteJourney`:
//     ports of Python 0.31.14's Journey administration, which Mirror Desktop 0.2
//     sent and CV22.DS10.TS4 retired as `journey-admin-verbs`, so the same
//     requests mean the same thing ("the administration" below);
//   - `updateJourney`: a Journey's name, description and status, which no
//     released Mirror could change from a host.
//
// Every call:
//
//   - takes an explicit database path and never reads the environment;
//   - asks the migration report first and refuses a database that is not
//     `current` (CV24.DS2), so it never migrates;
//   - checks the request before opening for writing, then writes through
//     `openLiveWriteDatabase`, behind the front door's verified snapshot, in one
//     immediate transaction;
//   - refuses with a `JourneyCallRejectedError` that writes nothing.

import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseNotCurrentError } from "#conversation/hostCalls.ts";
import { type WritableDatabase, withTransaction } from "#db/database.ts";
import { inspectMigrationState } from "#db/migrationReport.ts";
import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";
import { updateIdentityMetadata, upsertIdentity } from "#identity/identityStore.ts";
import { JourneyRemovalError, removeJourney } from "#journey/journeyRemoval.ts";
import { buildJourneyTree, type JourneyTree, type JourneyTreeRow } from "#journey/journeyTree.ts";
import {
  ParentJourneyValidationError,
  validateParentJourney,
} from "#journey/validateParentJourney.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { isKebabSlug } from "#util/slug.ts";

export type JourneyCallRejection =
  | "invalid_request"
  | "invalid_or_duplicate_slug"
  | "invalid_name"
  | "invalid_description"
  | "invalid_status"
  | "invalid_path"
  | "invalid_position"
  | "invalid_parent"
  | "unknown_parent"
  | "unknown_journey"
  | "journey_changed"
  | "journey_not_empty";

/** A call's refusal, named with the administration's codes where it had one. Nothing was written. */
export class JourneyCallRejectedError extends Error {
  readonly reason: JourneyCallRejection;
  /** For `journey_not_empty`: the association classes that hold records. */
  readonly populated: string[];

  constructor(reason: JourneyCallRejection, populated: string[] = []) {
    super(populated.length > 0 ? `${reason}:${populated.join(",")}` : reason);
    this.reason = reason;
    this.populated = populated;
  }
}

export interface JourneyCallResult {
  journeyId: string;
  tree: JourneyTree;
}

/** Python's `_validate_slug` pattern; this core's identity keys must also be kebab slugs. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;
const STATUSES = new Set(["active", "completed", "paused", "planned"]);
/** No sibling position: ordered after every positioned sibling, as Python's 2**31. */
const UNPOSITIONED = 2 ** 31;

type Metadata = Record<string, unknown>;

function reject(reason: JourneyCallRejection): never {
  throw new JourneyCallRejectedError(reason);
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) reject("invalid_request");
  return value;
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length === 0 || name.length > 160) reject("invalid_name");
  return name;
}

function cleanDescription(value: unknown): string {
  const description = typeof value === "string" ? value.trim() : "";
  if (description.length < 20 || description.length > 4000) reject("invalid_description");
  return description;
}

function cleanStatus(value: unknown): string {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!STATUSES.has(status)) reject("invalid_status");
  return status;
}

function optionalParent(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return text(value);
}

function position(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    reject("invalid_position");
  }
  return value;
}

/** Python's `_canonical_directory`, minus `~`: an existing directory, not a symlink, resolved. */
function canonicalDirectory(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) reject("invalid_path");
  const path = value.trim();
  if (!isAbsolute(path)) reject("invalid_path");
  try {
    // `lstat` reports a symlink as a symlink, never as a directory.
    if (!lstatSync(path).isDirectory()) reject("invalid_path");
    return realpathSync(path);
  } catch (error) {
    if (error instanceof JourneyCallRejectedError) throw error;
    return reject("invalid_path");
  }
}

function metadataOf(raw: unknown): Metadata {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Metadata) }
      : {};
  } catch {
    return {};
  }
}

/** Every Journey row, keyed, with its metadata parsed as the administration read it. */
interface JourneyRows {
  rows: Map<string, { content: string; updatedAt: string; version: string; raw: string | null }>;
  metas: Map<string, Metadata>;
}

function journeyRows(db: WritableDatabase): JourneyRows {
  const rows: JourneyRows["rows"] = new Map();
  const metas: JourneyRows["metas"] = new Map();
  for (const row of db
    .prepare(
      "SELECT key, content, version, updated_at, metadata FROM identity WHERE layer = 'journey' ORDER BY key",
    )
    .all()) {
    const key = String(row.key);
    const raw = typeof row.metadata === "string" ? row.metadata : null;
    rows.set(key, {
      content: typeof row.content === "string" ? row.content : "",
      updatedAt: String(row.updated_at),
      version: typeof row.version === "string" ? row.version : "1.0.0",
      raw,
    });
    metas.set(key, metadataOf(raw));
  }
  return { rows, metas };
}

/** The parent the administration honoured: a metadata parent that exists, else none. */
function effectiveParent(metas: Map<string, Metadata>, key: string): string | null {
  const parent = metas.get(key)?.parent_journey;
  return typeof parent === "string" && metas.has(parent) ? parent : null;
}

function siblingPosition(meta: Metadata | undefined): number {
  const value = meta?.sibling_position;
  return typeof value === "number" && Number.isInteger(value) ? value : UNPOSITIONED;
}

/** The administration's `ordered`: one sibling set, by position, then by key. */
function ordered(metas: Map<string, Metadata>, parent: string | null): string[] {
  return [...metas.keys()]
    .filter((key) => effectiveParent(metas, key) === parent)
    .sort(
      (a, b) =>
        siblingPosition(metas.get(a)) - siblingPosition(metas.get(b)) ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
}

function renumber(metas: Map<string, Metadata>, ids: readonly string[]): void {
  ids.forEach((key, index) => {
    const meta = metas.get(key) ?? {};
    meta.sibling_position = index;
    metas.set(key, meta);
  });
}

/** The administration's `position_group`: put `moving` at `at` in `parent`'s set and renumber it. */
function placeInGroup(
  metas: Map<string, Metadata>,
  parent: string | null,
  moving: string,
  at: number,
): void {
  const ids = ordered(metas, parent).filter((key) => key !== moving);
  if (at > ids.length) reject("invalid_position");
  ids.splice(at, 0, moving);
  renumber(metas, ids);
}

/** Write the metadata of every existing row whose metadata changed. */
function writeChangedMetadata(
  db: WritableDatabase,
  before: JourneyRows,
  metas: Map<string, Metadata>,
  now: string,
): void {
  for (const [key, meta] of metas) {
    const row = before.rows.get(key);
    if (!row) continue;
    const next = JSON.stringify(meta);
    if (next !== JSON.stringify(metadataOf(row.raw))) {
      updateIdentityMetadata(db, "journey", key, next, now);
    }
  }
}

function projectParentColumn(db: WritableDatabase, key: string, parent: string | null): void {
  db.prepare("UPDATE identity SET parent_journey = ? WHERE layer = 'journey' AND key = ?").run(
    parent,
    key,
  );
}

function readTree(db: WritableDatabase): JourneyTree {
  return buildJourneyTree(
    db
      .prepare(
        "SELECT key, content, updated_at, metadata FROM identity WHERE layer = 'journey' ORDER BY key",
      )
      .all() as unknown as JourneyTreeRow[],
  );
}

/** Open a `current` database behind the snapshot, run `write` in one transaction, answer the tree. */
function withJourneyWrite(
  dbPath: string,
  write: (db: WritableDatabase, rows: JourneyRows, now: string) => string,
): JourneyCallResult {
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openLiveWriteDatabase(dbPath);
  try {
    const journeyId = withTransaction(db, () => write(db, journeyRows(db), nowIso()));
    return { journeyId, tree: readTree(db) };
  } finally {
    db.close();
  }
}

function requireJourney(rows: JourneyRows, value: unknown): string {
  const journeyId = text(value);
  if (!rows.rows.has(journeyId)) reject("unknown_journey");
  return journeyId;
}

/** Python's template for a Journey the administration made, byte for byte. */
export function newJourneyContent(name: string, description: string): string {
  return (
    `# ${name}\n**Status:** active\n**Stage:** Starting\n\n## Description\n\n${description}` +
    "\n\n## Current focus\n\nClarify the next concrete movement."
  );
}

/** Create a Journey: the administration's `create_journey`. */
export function addJourney(
  dbPath: string,
  request: {
    slug: string;
    name: string;
    description: string;
    parentId?: string | null;
    position?: number;
    projectPath?: string | null;
  },
): JourneyCallResult {
  const slug = typeof request?.slug === "string" ? request.slug : "";
  if (!SLUG.test(slug) || !isKebabSlug(slug)) reject("invalid_or_duplicate_slug");
  const name = cleanName(request.name);
  const description = cleanDescription(request.description);
  const parent = optionalParent(request.parentId);
  const at = request.position === undefined ? null : position(request.position);
  const projectPath =
    request.projectPath === undefined || request.projectPath === null || request.projectPath === ""
      ? null
      : canonicalDirectory(request.projectPath);
  return withJourneyWrite(dbPath, (db, rows, now) => {
    if (rows.rows.has(slug)) reject("invalid_or_duplicate_slug");
    if (parent !== null && !rows.rows.has(parent)) reject("unknown_parent");
    const metas = new Map(rows.metas);
    const own: Metadata = { display_name: name };
    if (parent) own.parent_journey = parent;
    if (projectPath) own.project_path = projectPath;
    metas.set(slug, own);
    placeInGroup(metas, parent, slug, at ?? ordered(metas, parent).length - 1);
    upsertIdentity(
      db,
      {
        id: newId(),
        layer: "journey",
        key: slug,
        content: newJourneyContent(name, description),
        version: "1.0.0",
        // Inserted in sorted order, as Python's `json.dumps(sort_keys=True)` writes it.
        metadata: JSON.stringify(metas.get(slug) ?? own),
      },
      now,
    );
    projectParentColumn(db, slug, parent);
    writeChangedMetadata(db, rows, metas, now);
    return slug;
  });
}

/** Set a Journey's project path, or clear it with `null`. */
export function setJourneyProjectPath(
  dbPath: string,
  request: { journeyId: string; projectPath: string | null },
): JourneyCallResult {
  const projectPath =
    request?.projectPath === null ? null : canonicalDirectory(request?.projectPath);
  return withJourneyWrite(dbPath, (db, rows, now) => {
    const journeyId = requireJourney(rows, request.journeyId);
    const metas = new Map(rows.metas);
    const meta = { ...(metas.get(journeyId) ?? {}) };
    if (projectPath) meta.project_path = projectPath;
    else delete meta.project_path;
    metas.set(journeyId, meta);
    writeChangedMetadata(db, rows, metas, now);
    return journeyId;
  });
}

/** Move a Journey under `parentId` (null for a root) at `position` among its new siblings. */
export function moveJourney(
  dbPath: string,
  request: { journeyId: string; parentId: string | null; position: number },
): JourneyCallResult {
  const parent = optionalParent(request?.parentId);
  const at = position(request?.position);
  return withJourneyWrite(dbPath, (db, rows, now) => {
    const journeyId = requireJourney(rows, request.journeyId);
    if (parent !== null && !rows.rows.has(parent)) reject("unknown_parent");
    try {
      validateParentJourney(
        journeyId,
        parent,
        [...rows.metas.keys()].map((key) => ({
          key,
          parentJourney: effectiveParent(rows.metas, key) ?? "",
        })),
      );
    } catch (error) {
      if (error instanceof ParentJourneyValidationError) reject("invalid_parent");
      throw error;
    }
    const metas = new Map([...rows.metas].map(([key, meta]) => [key, { ...meta }]));
    const oldParent = effectiveParent(metas, journeyId);
    const meta = metas.get(journeyId) ?? {};
    if (parent) meta.parent_journey = parent;
    else delete meta.parent_journey;
    metas.set(journeyId, meta);
    if (oldParent !== parent) renumber(metas, ordered(metas, oldParent));
    placeInGroup(metas, parent, journeyId, at);
    writeChangedMetadata(db, rows, metas, now);
    projectParentColumn(db, journeyId, parent);
    return journeyId;
  });
}

/** Delete an existing leaf Journey with no associated records: the core's `removeJourney`. */
export function deleteJourney(dbPath: string, request: { journeyId: string }): JourneyCallResult {
  const journeyId = text(request?.journeyId);
  const report = inspectMigrationState(dbPath);
  if (report.state !== "current") throw new DatabaseNotCurrentError(report);
  const db = openLiveWriteDatabase(dbPath);
  try {
    try {
      removeJourney(db, journeyId);
    } catch (error) {
      if (!(error instanceof JourneyRemovalError)) throw error;
      if (!error.associations) reject("unknown_journey");
      throw new JourneyCallRejectedError(
        "journey_not_empty",
        Object.entries(error.associations)
          .filter(([, count]) => count > 0)
          .map(([name]) => name)
          .sort(),
      );
    }
    return { journeyId, tree: readTree(db) };
  } finally {
    db.close();
  }
}

/** Python's `_replace_title`. */
export function replaceTitle(content: string, title: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const index = lines.findIndex((line) => line.startsWith("# "));
  if (index >= 0) {
    lines[index] = `# ${title}`;
    return lines.join("\n").trim();
  }
  return `# ${title}\n\n${content.trim()}`.trim();
}

/** Python's `_replace_status`. */
export function replaceStatus(content: string, status: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const index = lines.findIndex((line) => line.startsWith("**Status:**"));
  if (index >= 0) {
    lines[index] = `**Status:** ${status}`;
    return lines.join("\n").trim();
  }
  if (lines.length > 0 && (lines[0] ?? "").startsWith("# ")) {
    return [lines[0], `**Status:** ${status}`, ...lines.slice(1)].join("\n").trim();
  }
  return `**Status:** ${status}\n\n${content.trim()}`.trim();
}

/**
 * Replace the body of the first `## Description` (or `## Descrição`) section,
 * up to the next `## ` heading, keeping every other line. Without one, the
 * section goes before the first `## ` heading, or at the end.
 */
export function replaceDescription(content: string, description: string): string {
  const lines = content.split(/\r\n|\r|\n/);
  const start = lines.findIndex((line) => /^## (?:Description|Descrição)\s*$/u.test(line));
  if (start >= 0) {
    const after = lines.findIndex((line, index) => index > start && line.startsWith("## "));
    const end = after >= 0 ? after : lines.length;
    const body = after >= 0 ? ["", description, ""] : ["", description];
    return [...lines.slice(0, start + 1), ...body, ...lines.slice(end)].join("\n");
  }
  const heading = lines.findIndex((line) => line.startsWith("## "));
  if (heading >= 0) {
    return [
      ...lines.slice(0, heading),
      "## Description",
      "",
      description,
      "",
      ...lines.slice(heading),
    ].join("\n");
  }
  return `${content.trimEnd()}\n\n## Description\n\n${description}`;
}

/**
 * Edit a Journey's name, description or status in its content. Refuses
 * `journey_changed` when the row is no longer the one the host showed; an
 * unchanged value writes nothing.
 */
export function updateJourney(
  dbPath: string,
  request: {
    journeyId: string;
    expectedUpdatedAt: string;
    name?: string;
    description?: string;
    status?: string;
  },
): JourneyCallResult {
  const expected = text(request?.expectedUpdatedAt);
  const present = (field: "name" | "description" | "status") => request[field] !== undefined;
  if (!present("name") && !present("description") && !present("status")) reject("invalid_request");
  const name = present("name") ? cleanName(request.name) : null;
  const description = present("description") ? cleanDescription(request.description) : null;
  const status = present("status") ? cleanStatus(request.status) : null;
  return withJourneyWrite(dbPath, (db, rows, now) => {
    const journeyId = requireJourney(rows, request.journeyId);
    const row = rows.rows.get(journeyId);
    if (!row || row.updatedAt !== expected) reject("journey_changed");
    let content = row.content;
    if (name !== null) content = replaceTitle(content, name);
    if (status !== null) content = replaceStatus(content, status);
    if (description !== null) content = replaceDescription(content, description);
    const meta = metadataOf(row.raw);
    let metadata = row.raw;
    if (name !== null && typeof meta.display_name === "string" && meta.display_name !== name) {
      meta.display_name = name;
      metadata = JSON.stringify(meta);
    }
    if (content !== row.content || metadata !== row.raw) {
      upsertIdentity(
        db,
        {
          id: journeyId,
          layer: "journey",
          key: journeyId,
          content,
          version: row.version,
          metadata,
        },
        now,
      );
    }
    return journeyId;
  });
}
