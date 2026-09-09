// CV22.DS7.US7 plateau 2 — Exploratory Story state, ported from
// `src/memory/services/explorer_story.py` and
// `src/memory/storage/explorer_stories.py`.
//
// A story lives in TWO places at once and both are graded by
// `explorer-story.golden.json`:
//
//   * the durable `exploratory_stories` row, whose four `*_json` columns are
//     written `ensure_ascii=False` in INSERTION order (never sorted), and whose
//     absent experiment/handoff is SQL NULL rather than the string `"null"`;
//   * the `__explorer_story__:<journey>` runtime session, which every mutation
//     still rewrites. The service docstring calls that payload "pre-DS8"; it
//     understates it. `_store_story` writes both stores on every mutation, so
//     it is a live dual write, and the read falls back to it whenever no
//     durable row exists.
//
// Dropping that fallback is the failure this module exists to avoid: an install
// that has not written a story since DS8 keeps its work only there, and a port
// that reads the table alone returns "no story" and exits 0 — the
// `conversations append` class (CR055) arriving through a read.
//
// Absent from this module by decision: publishing a Journey projection. Python
// holds the `fcntl.flock` publication lock and stays the single writer of
// `.mirror/projections` until it retires; `projectionRefreshRequested` below
// reproduces only the DECISION to refresh, and the delegation is the seam's.

import type { Database, WritableDatabase } from "#db/database.ts";
import { getRuntimeSession, upsertRuntimeSession } from "#mirror/runtimeSession.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";
import { pySplitLines, pyStrip, sliceCodePoints } from "#util/pythonText.ts";

export const EXPLORER_STORY_SESSION_PREFIX = "__explorer_story__:";

const ATTRACTOR_STATUSES = new Set(["proposed", "accepted"]);
const HANDOFF_READINESS = new Set(["proposed", "confirmed"]);
const STORY_STATUSES = new Set(["active", "archived", "promoted"]);

/** Python raises `ValueError`; the CLI catches it and exits 1. */
export class ExplorerStoryError extends Error {}

export interface ExplorerAttractor {
  readonly label: string;
  readonly description: string | null;
  readonly status: string;
}

export interface ExplorerExperimentProposal {
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
}

export interface ExplorerBuilderHandoff {
  readonly title: string;
  readonly summary: string | null;
  readonly readiness: string;
  readonly artifactDir: string | null;
  readonly indexPath: string | null;
  readonly exploratoryStoryPath: string | null;
  readonly handoffInfoPath: string | null;
  readonly productDesignProposalPath: string | null;
  readonly fullConversationPath: string | null;
}

export interface ExplorerSourceConversation {
  readonly conversationId: string;
  readonly title: string | null;
  readonly role: string;
}

export interface ExplorerStory {
  readonly journey: string;
  readonly currentExploratoryStory: string | null;
  readonly narrativeFieldSummary: string | null;
  readonly lastStoryCard: string | null;
  readonly attractors: readonly ExplorerAttractor[];
  readonly experimentProposal: ExplorerExperimentProposal | null;
  readonly builderHandoff: ExplorerBuilderHandoff | null;
  readonly sourceConversations: readonly ExplorerSourceConversation[];
  readonly id: string | null;
  readonly title: string | null;
  readonly status: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly promotedAt: string | null;
  readonly archivedAt: string | null;
}

/**
 * Python's `_UNSET` sentinel. The three optional scalars distinguish "not
 * passed" (keep the existing value) from "passed None or blank" (clear it), and
 * a port that maps both to `undefined` turns every clear into a keep.
 */
export const UNSET = Symbol("explorer.unset");
export type Settable = string | null | typeof UNSET;

/** Injected so the golden can advance them deterministically, as Python's are. */
export interface StoryClock {
  now(): string;
  uuid(): string;
}

// --- normalization ---------------------------------------------------------

/** Python `_string_or_none`: non-strings become null; blanks become null. */
function stringOrNone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = pyStrip(value);
  return cleaned === "" ? null : cleaned;
}

function validStatus(value: unknown): string {
  return typeof value === "string" && ATTRACTOR_STATUSES.has(value) ? value : "proposed";
}

function validHandoffReadiness(value: unknown): string {
  return typeof value === "string" && HANDOFF_READINESS.has(value) ? value : "proposed";
}

function validStoryStatus(value: unknown): string {
  return typeof value === "string" && STORY_STATUSES.has(value) ? value : "active";
}

function normalizeJourney(journey: string): string {
  const normalized = pyStrip(journey);
  if (normalized === "") throw new ExplorerStoryError("journey must not be empty");
  return normalized;
}

function sessionId(journey: string): string {
  const normalized = pyStrip(journey);
  if (normalized === "") throw new ExplorerStoryError("journey must not be empty");
  return `${EXPLORER_STORY_SESSION_PREFIX}${normalized}`;
}

/** Python `_clean` then `_resolve_scalar`, composed. */
function resolveScalar(
  value: Settable,
  existing: string | null,
  hasExisting: boolean,
): string | null {
  if (value === UNSET) return hasExisting ? existing : null;
  return stringOrNone(value);
}

// --- parsing ---------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAttractors(value: unknown): ExplorerAttractor[] {
  if (!Array.isArray(value)) return [];
  const attractors: ExplorerAttractor[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = stringOrNone(item.label);
    if (!label) continue;
    attractors.push({
      label,
      description: stringOrNone(item.description),
      status: validStatus(item.status),
    });
  }
  return attractors;
}

function parseExperiment(value: unknown): ExplorerExperimentProposal | null {
  if (!isRecord(value)) return null;
  const title = stringOrNone(value.title);
  if (!title) return null;
  return {
    title,
    description: stringOrNone(value.description),
    status: validStatus(value.status),
  };
}

function parseHandoff(value: unknown): ExplorerBuilderHandoff | null {
  if (!isRecord(value)) return null;
  const title = stringOrNone(value.title);
  if (!title) return null;
  return {
    title,
    summary: stringOrNone(value.summary),
    readiness: validHandoffReadiness(value.readiness),
    artifactDir: stringOrNone(value.artifact_dir),
    indexPath: stringOrNone(value.index_path),
    exploratoryStoryPath: stringOrNone(value.exploratory_story_path),
    handoffInfoPath: stringOrNone(value.handoff_info_path),
    productDesignProposalPath: stringOrNone(value.product_design_proposal_path),
    fullConversationPath: stringOrNone(value.full_conversation_path),
  };
}

function parseSourceConversations(value: unknown): ExplorerSourceConversation[] {
  if (!Array.isArray(value)) return [];
  const sources: ExplorerSourceConversation[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const conversationId = stringOrNone(item.conversation_id);
    if (!conversationId) continue;
    sources.push({
      conversationId,
      title: stringOrNone(item.title),
      role: stringOrNone(item.role) ?? "source evidence",
    });
  }
  return sources;
}

/** Python `_load_json`: a non-string, blank, or invalid column yields default. */
function loadJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string" || pyStrip(value) === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// --- serialization ---------------------------------------------------------

function attractorToDict(attractor: ExplorerAttractor): Record<string, unknown> {
  return { label: attractor.label, description: attractor.description, status: attractor.status };
}

function experimentToDict(
  proposal: ExplorerExperimentProposal | null,
): Record<string, unknown> | null {
  if (proposal === null) return null;
  return { title: proposal.title, description: proposal.description, status: proposal.status };
}

function handoffToDict(handoff: ExplorerBuilderHandoff | null): Record<string, unknown> | null {
  if (handoff === null) return null;
  return {
    title: handoff.title,
    summary: handoff.summary,
    readiness: handoff.readiness,
    artifact_dir: handoff.artifactDir,
    index_path: handoff.indexPath,
    exploratory_story_path: handoff.exploratoryStoryPath,
    handoff_info_path: handoff.handoffInfoPath,
    product_design_proposal_path: handoff.productDesignProposalPath,
    full_conversation_path: handoff.fullConversationPath,
  };
}

function sourceToDict(source: ExplorerSourceConversation): Record<string, unknown> {
  return { conversation_id: source.conversationId, title: source.title, role: source.role };
}

// --- reads -----------------------------------------------------------------

function storyFromRow(row: Record<string, unknown>): ExplorerStory {
  return {
    journey: String(row.journey),
    currentExploratoryStory: stringOrNone(row.current_story),
    narrativeFieldSummary: stringOrNone(row.narrative_summary),
    lastStoryCard: stringOrNone(row.last_story_card),
    attractors: parseAttractors(loadJson(row.attractors_json, [])),
    experimentProposal: parseExperiment(loadJson(row.experiment_proposal_json, null)),
    builderHandoff: parseHandoff(loadJson(row.builder_handoff_json, null)),
    sourceConversations: parseSourceConversations(loadJson(row.source_conversations_json, [])),
    id: stringOrNone(row.id),
    title: stringOrNone(row.title),
    status: validStoryStatus(row.status),
    createdAt: stringOrNone(row.created_at),
    updatedAt: stringOrNone(row.updated_at),
    promotedAt: stringOrNone(row.promoted_at),
    archivedAt: stringOrNone(row.archived_at),
  };
}

function activeRow(db: Database, journey: string): Record<string, unknown> | null {
  const row = db
    .prepare(
      `SELECT * FROM exploratory_stories
       WHERE journey = ? AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(journey);
  return row ?? null;
}

/**
 * Port of `_get_runtime_explorer_story` — the fallback that keeps pre-DS8
 * stories readable. Every malformed shape resolves to Python's result rather
 * than throwing: invalid JSON, a non-object payload, and non-string fields all
 * degrade quietly, because a corrupt column must not take down a read.
 */
function runtimeStory(db: Database, journey: string): ExplorerStory | null {
  const session = getRuntimeSession(db, sessionId(journey));
  if (!session?.active || !session.metadata) return null;

  let data: unknown;
  try {
    data = JSON.parse(session.metadata);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;

  return {
    journey,
    currentExploratoryStory: stringOrNone(data.current_exploratory_story),
    narrativeFieldSummary: stringOrNone(data.narrative_field_summary),
    lastStoryCard: stringOrNone(data.last_story_card),
    attractors: parseAttractors(data.attractors),
    experimentProposal: parseExperiment(data.experiment_proposal),
    builderHandoff: parseHandoff(data.builder_handoff),
    sourceConversations: parseSourceConversations(data.source_conversations),
    id: null,
    title: null,
    status: "active",
    createdAt: null,
    updatedAt: null,
    promotedAt: null,
    archivedAt: null,
  };
}

/** Port of `get_explorer_story`: durable row first, legacy payload second. */
export function getExplorerStory(db: Database, journey: string): ExplorerStory | null {
  const normalized = normalizeJourney(journey);
  const row = activeRow(db, normalized);
  if (row) return storyFromRow(row);
  return runtimeStory(db, normalized);
}

/** Port of `list_explorer_stories`: active first, then promoted, then archived. */
export function listExplorerStories(db: Database, journey: string): ExplorerStory[] {
  const normalized = normalizeJourney(journey);
  return db
    .prepare(
      `SELECT * FROM exploratory_stories
       WHERE journey = ?
       ORDER BY
         CASE status
           WHEN 'active' THEN 0
           WHEN 'promoted' THEN 1
           WHEN 'archived' THEN 2
           ELSE 3
         END,
         updated_at DESC`,
    )
    .all(normalized)
    .map(storyFromRow);
}

// --- writes ----------------------------------------------------------------

/** Python `_derive_title`: first line of the story, 80 code points, stripped. */
function deriveTitle(story: ExplorerStory): string {
  const text = story.currentExploratoryStory ?? story.narrativeFieldSummary ?? "Exploratory Story";
  const firstLine = pySplitLines(pyStrip(text))[0] ?? "";
  return pyStrip(sliceCodePoints(firstLine, 80)) || "Exploratory Story";
}

function storyPayload(story: ExplorerStory): Record<string, unknown> {
  return {
    id: story.id,
    title: story.title,
    status: story.status,
    current_exploratory_story: story.currentExploratoryStory,
    narrative_field_summary: story.narrativeFieldSummary,
    last_story_card: story.lastStoryCard,
    attractors: story.attractors.map(attractorToDict),
    experiment_proposal: experimentToDict(story.experimentProposal),
    builder_handoff: handoffToDict(story.builderHandoff),
    source_conversations: story.sourceConversations.map(sourceToDict),
  };
}

// The runtime-session row carries its OWN timestamp in Python: the session
// store calls its own `_now()`, not the one `storage/explorer_stories.py`
// imported. So these writes reuse the timestamp already minted for the durable
// row instead of asking the clock again — one mutation, one tick, exactly as
// the oracle consumes it. `runtime_sessions.updated_at` is not part of the
// graded contract; the metadata bytes and the `active` flag are.
function writeRuntimeStory(db: WritableDatabase, story: ExplorerStory, now: string): void {
  upsertRuntimeSession(
    db,
    sessionId(story.journey),
    {
      interface: "explorer_story",
      journey: story.journey,
      active: true,
      metadata: pythonJsonDumps(storyPayload(story)),
    },
    now,
  );
}

function clearRuntimeStory(db: WritableDatabase, journey: string, now: string): void {
  upsertRuntimeSession(
    db,
    sessionId(journey),
    { interface: "explorer_story", journey, active: false, metadata: null },
    now,
  );
}

/**
 * Port of `upsert_active_explorer_story_record`. `id` and `created_at` are
 * inherited from the existing active row; only `updated_at` moves. The four
 * JSON columns go through `pythonJsonDumps` for `ensure_ascii=False` insertion
 * order, and an absent experiment/handoff is written as SQL NULL — the string
 * `"null"` would be invisible to a parsed comparison and wrong on the wire.
 */
function upsertActiveRow(
  db: WritableDatabase,
  story: ExplorerStory,
  clock: StoryClock,
): { story: ExplorerStory; now: string } {
  const now = clock.now();
  const existing = activeRow(db, story.journey);
  const recordId = existing ? String(existing.id) : clock.uuid();
  const createdAt = existing ? String(existing.created_at) : now;
  const experiment = experimentToDict(story.experimentProposal);
  const handoff = handoffToDict(story.builderHandoff);

  db.prepare(
    `INSERT INTO exploratory_stories
       (id, journey, title, status, current_story, narrative_summary,
        last_story_card, attractors_json, experiment_proposal_json,
        builder_handoff_json, source_conversations_json, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         current_story = excluded.current_story,
         narrative_summary = excluded.narrative_summary,
         last_story_card = excluded.last_story_card,
         attractors_json = excluded.attractors_json,
         experiment_proposal_json = excluded.experiment_proposal_json,
         builder_handoff_json = excluded.builder_handoff_json,
         source_conversations_json = excluded.source_conversations_json,
         updated_at = excluded.updated_at`,
  ).run(
    recordId,
    story.journey,
    story.title ?? deriveTitle(story),
    story.currentExploratoryStory,
    story.narrativeFieldSummary,
    story.lastStoryCard,
    pythonJsonDumps(story.attractors.map(attractorToDict)),
    experiment === null ? null : pythonJsonDumps(experiment),
    handoff === null ? null : pythonJsonDumps(handoff),
    pythonJsonDumps(story.sourceConversations.map(sourceToDict)),
    createdAt,
    now,
  );

  const persisted = activeRow(db, story.journey);
  if (persisted === null) {
    // Defensive, and reachable: an id collision updates a non-active row
    // without restoring `status='active'`. Python raises here too.
    throw new ExplorerStoryError("failed to persist active Exploratory Story");
  }
  return { story: storyFromRow(persisted), now };
}

function emptyStory(journey: string): ExplorerStory {
  return {
    journey,
    currentExploratoryStory: null,
    narrativeFieldSummary: null,
    lastStoryCard: null,
    attractors: [],
    experimentProposal: null,
    builderHandoff: null,
    sourceConversations: [],
    id: null,
    title: null,
    status: "active",
    createdAt: null,
    updatedAt: null,
    promotedAt: null,
    archivedAt: null,
  };
}

/** Port of `_store_story`: durable row, then the runtime payload. */
function storeStory(
  db: WritableDatabase,
  story: ExplorerStory,
  clock: StoryClock,
): { story: ExplorerStory; refreshRequested: boolean } {
  const before = getExplorerStory(db, story.journey);
  const { story: persisted, now } = upsertActiveRow(db, story, clock);
  writeRuntimeStory(db, persisted, now);
  return { story: persisted, refreshRequested: projectionRefreshRequested(before, persisted) };
}

function carryForward(existing: ExplorerStory | null, journey: string): ExplorerStory {
  return existing ?? emptyStory(journey);
}

export interface StoryMutation {
  readonly story: ExplorerStory;
  readonly refreshRequested: boolean;
}

/** Port of `update_explorer_story`. Omitted scalars keep; explicit ones clear. */
export function updateExplorerStory(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  fields: {
    currentExploratoryStory?: Settable;
    narrativeFieldSummary?: Settable;
    lastStoryCard?: Settable;
  } = {},
): StoryMutation {
  const normalized = normalizeJourney(journey);
  const existing = getExplorerStory(db, normalized);
  const base = carryForward(existing, normalized);
  const hasExisting = existing !== null;

  // Presence, never nullishness. `fields.x ?? UNSET` looks equivalent and is
  // the bug: an explicit `null` means CLEAR, and `??` would fold it into the
  // absent case, turning every clear into a keep. Python distinguishes the two
  // with a sentinel default; the only faithful JavaScript equivalent is `in`.
  const settable = (key: keyof typeof fields): Settable =>
    key in fields ? (fields[key] as Settable) : UNSET;

  return storeStory(
    db,
    {
      ...base,
      journey: normalized,
      currentExploratoryStory: resolveScalar(
        settable("currentExploratoryStory"),
        base.currentExploratoryStory,
        hasExisting,
      ),
      narrativeFieldSummary: resolveScalar(
        settable("narrativeFieldSummary"),
        base.narrativeFieldSummary,
        hasExisting,
      ),
      lastStoryCard: resolveScalar(settable("lastStoryCard"), base.lastStoryCard, hasExisting),
      title: hasExisting ? base.title : null,
    },
    clock,
  );
}

function normalizeAttractor(attractor: {
  label: string;
  description?: string | null;
  status?: string;
}): ExplorerAttractor {
  const label = stringOrNone(attractor.label);
  if (!label) throw new ExplorerStoryError("attractor label must not be empty");
  return {
    label,
    description: stringOrNone(attractor.description),
    status: validStatus(attractor.status),
  };
}

export function setExplorerAttractors(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  attractors: readonly { label: string; description?: string | null; status?: string }[],
): StoryMutation {
  const normalized = normalizeJourney(journey);
  const base = carryForward(getExplorerStory(db, normalized), normalized);
  return storeStory(
    db,
    { ...base, journey: normalized, attractors: attractors.map(normalizeAttractor) },
    clock,
  );
}

export function setExplorerExperimentProposal(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  proposal: { title: string; description?: string | null; status?: string },
): StoryMutation {
  const normalized = normalizeJourney(journey);
  const title = stringOrNone(proposal.title);
  if (!title) throw new ExplorerStoryError("experiment title must not be empty");
  const base = carryForward(getExplorerStory(db, normalized), normalized);
  return storeStory(
    db,
    {
      ...base,
      journey: normalized,
      experimentProposal: {
        title,
        description: stringOrNone(proposal.description),
        status: validStatus(proposal.status),
      },
    },
    clock,
  );
}

export function setExplorerBuilderHandoff(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  handoff: {
    title: string;
    summary?: string | null;
    readiness?: string;
    artifactDir?: string | null;
    indexPath?: string | null;
    exploratoryStoryPath?: string | null;
    handoffInfoPath?: string | null;
    productDesignProposalPath?: string | null;
    fullConversationPath?: string | null;
  },
): StoryMutation {
  const normalized = normalizeJourney(journey);
  const title = stringOrNone(handoff.title);
  if (!title) throw new ExplorerStoryError("builder handoff title must not be empty");
  const base = carryForward(getExplorerStory(db, normalized), normalized);
  return storeStory(
    db,
    {
      ...base,
      journey: normalized,
      builderHandoff: {
        title,
        summary: stringOrNone(handoff.summary),
        readiness: validHandoffReadiness(handoff.readiness),
        artifactDir: stringOrNone(handoff.artifactDir),
        indexPath: stringOrNone(handoff.indexPath),
        exploratoryStoryPath: stringOrNone(handoff.exploratoryStoryPath),
        handoffInfoPath: stringOrNone(handoff.handoffInfoPath),
        productDesignProposalPath: stringOrNone(handoff.productDesignProposalPath),
        fullConversationPath: stringOrNone(handoff.fullConversationPath),
      },
    },
    clock,
  );
}

export function setExplorerSourceConversations(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  sources: readonly { conversationId: string; title?: string | null; role?: string }[],
): StoryMutation {
  const normalized = normalizeJourney(journey);
  const base = carryForward(getExplorerStory(db, normalized), normalized);
  const normalizedSources = sources.map((source) => {
    const conversationId = stringOrNone(source.conversationId);
    if (!conversationId) {
      throw new ExplorerStoryError("source conversation id must not be empty");
    }
    return {
      conversationId,
      title: stringOrNone(source.title),
      role: stringOrNone(source.role) ?? "source evidence",
    };
  });
  return storeStory(
    db,
    { ...base, journey: normalized, sourceConversations: normalizedSources },
    clock,
  );
}

function transitionActive(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
  status: "archived" | "promoted",
  timestampColumn: "archived_at" | "promoted_at",
): { story: ExplorerStory | null; refreshRequested: boolean } {
  const normalized = normalizeJourney(journey);
  const before = getExplorerStory(db, normalized);
  const existing = activeRow(db, normalized);

  if (!existing) {
    // Python clears the runtime payload even when nothing was active, and
    // returns before minting a story timestamp.
    clearRuntimeStory(db, normalized, clock.now());
    return { story: null, refreshRequested: false };
  }

  const now = clock.now();
  db.prepare(
    `UPDATE exploratory_stories
       SET status = ?, ${timestampColumn} = ?, updated_at = ?
       WHERE id = ?`,
  ).run(status, now, now, String(existing.id));

  const row = db.prepare("SELECT * FROM exploratory_stories WHERE id = ?").get(String(existing.id));
  clearRuntimeStory(db, normalized, now);
  const after = row ? storyFromRow(row) : null;
  return { story: after, refreshRequested: projectionRefreshRequested(before, after) };
}

export function archiveExplorerStory(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
): { story: ExplorerStory | null; refreshRequested: boolean } {
  return transitionActive(db, journey, clock, "archived", "archived_at");
}

export function markExplorerStoryPromoted(
  db: WritableDatabase,
  journey: string,
  clock: StoryClock,
): { story: ExplorerStory | null; refreshRequested: boolean } {
  return transitionActive(db, journey, clock, "promoted", "promoted_at");
}

/** Port of `clear_explorer_story`: archive under the pre-DS8 command's name. */
export function clearExplorerStory(db: WritableDatabase, journey: string, clock: StoryClock): void {
  archiveExplorerStory(db, journey, clock);
}

// --- projection refresh decision -------------------------------------------

/**
 * Port of `_projected_story`, as the DECISION only (US7 plan, Scope Amendment
 * item 16). Python compares this tuple before and after a mutation and requests
 * a Journey projection refresh when it changed.
 *
 * The comparison deliberately EXCLUDES `current_story`, `last_story_card`, and
 * `source_conversations`, and INCLUDES `title` — which `_derive_title` derives
 * from `current_story`. So editing the story text usually does request a
 * refresh, through the title, while editing only the last card never does. That
 * asymmetry looks like an oversight and is behavior; the golden pins both
 * directions.
 *
 * Publishing is not ported. Python holds the `fcntl.flock` publication lock and
 * remains the single writer of `.mirror/projections` until it retires.
 */
export function projectionRefreshRequested(
  before: ExplorerStory | null,
  after: ExplorerStory | null,
): boolean {
  return pythonJsonDumps(projected(before)) !== pythonJsonDumps(projected(after));
}

function projected(story: ExplorerStory | null): unknown {
  if (story === null) return null;
  return [
    story.id,
    story.title,
    story.status,
    story.narrativeFieldSummary,
    story.attractors.map((attractor) => Object.entries(attractorToDict(attractor))),
    story.experimentProposal === null
      ? null
      : Object.entries(experimentToDict(story.experimentProposal) as Record<string, unknown>),
    story.builderHandoff === null
      ? null
      : Object.entries(handoffToDict(story.builderHandoff) as Record<string, unknown>),
  ];
}

// --- context render --------------------------------------------------------

/** Port of `render_explorer_story_context` — prompt injection, not a card. */
export function renderExplorerStoryContext(story: ExplorerStory): string {
  const lines: string[] = ["=== △ Exploratory Story ===", `journey: ${story.journey}`];
  if (story.id) lines.push(`id: ${story.id}`);
  if (story.status) lines.push(`status: ${story.status}`);
  if (story.title) lines.push(`title: ${story.title}`);
  if (story.currentExploratoryStory) {
    lines.push("", "current exploratory story:", story.currentExploratoryStory);
  }
  if (story.narrativeFieldSummary) {
    lines.push("", "narrative field summary:", story.narrativeFieldSummary);
  }
  if (story.lastStoryCard) lines.push("", "last story card:", story.lastStoryCard);
  if (story.attractors.length > 0) {
    lines.push("", "attractors:");
    for (const attractor of story.attractors) {
      lines.push(`- ${attractor.label} [${attractor.status}]`);
      if (attractor.description) lines.push(`  ${attractor.description}`);
    }
  }
  if (story.experimentProposal) {
    lines.push(
      "",
      "experiment proposal:",
      `${story.experimentProposal.title} [${story.experimentProposal.status}]`,
    );
    if (story.experimentProposal.description) lines.push(story.experimentProposal.description);
  }
  if (story.sourceConversations.length > 0) {
    lines.push("", "source conversations:");
    for (const source of story.sourceConversations) {
      const title = source.title ? ` — ${source.title}` : "";
      lines.push(`- ${source.conversationId}${title} [${source.role}]`);
    }
  }
  if (story.builderHandoff) {
    lines.push(
      "",
      "builder handoff:",
      `${story.builderHandoff.title} [${story.builderHandoff.readiness}]`,
    );
    if (story.builderHandoff.artifactDir) {
      lines.push(`artifact_dir: ${story.builderHandoff.artifactDir}`);
    }
    if (story.builderHandoff.indexPath) lines.push(`index: ${story.builderHandoff.indexPath}`);
    if (story.builderHandoff.fullConversationPath) {
      lines.push(`full conversation: ${story.builderHandoff.fullConversationPath}`);
    }
  }
  return lines.join("\n");
}
