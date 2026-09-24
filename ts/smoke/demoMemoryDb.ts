// A public, synthetic Mirror `memory.db` for smokes and validation routes.
//
// The TypeScript port of `ts/parity/generate_demo_memory_db.py` (CV22.DS10.TS5,
// slice G). The database uses the real schema and the real bootstrap, but every
// row is fictional, so a smoke, a hook row-diff, or a Navigator route can copy
// it without needing anyone's private mirror.
//
// It writes what the Python generator wrote, through the TypeScript writers
// that replaced the ones it called -- `createMemoryRow`, `setIdentity`,
// `createConsolidation` -- and plain inserts where the Python generator bypassed
// its own services (tasks with a status other than `todo`, a pre-populated
// access log). One difference is deliberate and invisible to every reader:
// the database is born CURRENT, with all known migrations, where the Python
// generator stopped at the last migration Python knew and relied on the first
// TypeScript open to apply the rest. The journey rows therefore carry the
// `parent_journey` column that migrate-on-open's backfill would have written.

import { rmSync } from "node:fs";
import { createConsolidation } from "#cultivation/consolidationStore.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { embeddingToBytes } from "#db/decode.ts";
import { setIdentity } from "#identity/setIdentity.ts";
import { createMemoryRow } from "#memory/memoryWrite.ts";
import { newId, nowIso, pythonJsonDumps } from "#util/pyGenerators.ts";

export interface DemoMemory {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: string;
  readonly useCount: number;
  readonly relevance: number;
  readonly vector: readonly number[];
  readonly accessCount: number;
  readonly lastAccessed: string | null;
  readonly memoryType: string;
  readonly layer: string;
  readonly journey: string;
}

/**
 * Types, layers, and journeys are varied so the listing filters demonstrably
 * narrow the result set.
 */
export const DEMO_MEMORIES: readonly DemoMemory[] = [
  {
    id: "demo-search-1",
    title: "Search parity foundation",
    content: "A synthetic memory about Mirror search parity and TypeScript ranker migration.",
    createdAt: "2026-06-20T12:00:00Z",
    useCount: 3,
    relevance: 0.8,
    vector: [1.0, 0.45, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0],
    accessCount: 2,
    lastAccessed: "2026-06-22T12:00:00Z",
    memoryType: "insight",
    layer: "ego",
    journey: "demo-parity",
  },
  {
    id: "demo-builder-1",
    title: "Builder validation route",
    content: "A synthetic memory about Builder Mode validation routes and redacted evidence.",
    createdAt: "2026-06-21T12:00:00Z",
    useCount: 2,
    relevance: 0.7,
    vector: [0.82, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0],
    accessCount: 3,
    lastAccessed: "2026-06-22T15:00:00Z",
    memoryType: "decision",
    layer: "ego",
    journey: "demo-parity",
  },
  {
    id: "demo-identity-1",
    title: "Identity context",
    content:
      "A synthetic memory about identity context, persona routing, and local-first continuity.",
    createdAt: "2026-06-10T12:00:00Z",
    useCount: 1,
    relevance: 0.6,
    vector: [0.1, 0.0, 1.0, 0.45, 0.0, 0.0, 0.0, 0.0],
    accessCount: 1,
    lastAccessed: "2026-06-11T12:00:00Z",
    memoryType: "insight",
    layer: "self",
    journey: "demo-identity",
  },
  {
    id: "demo-runtime-1",
    title: "Runtime mode",
    content: "A synthetic memory about runtime modes, sessions, and thin interface contracts.",
    createdAt: "2026-05-25T12:00:00Z",
    useCount: 0,
    relevance: 0.5,
    vector: [0.0, 0.0, 0.7, 0.7, 0.1, 0.0, 0.0, 0.0],
    accessCount: 0,
    lastAccessed: null,
    memoryType: "pattern",
    layer: "shadow",
    journey: "demo-parity",
  },
  {
    id: "demo-conversation-1",
    title: "Conversation search",
    content:
      "A synthetic memory about conversation search, memory listing, and deterministic read models.",
    createdAt: "2026-05-20T12:00:00Z",
    useCount: 5,
    relevance: 0.5,
    vector: [0.2, 0.1, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
    accessCount: 4,
    lastAccessed: "2026-06-20T12:00:00Z",
    memoryType: "insight",
    layer: "ego",
    journey: "demo-conversations",
  },
  {
    id: "demo-journey-1",
    title: "Journey map",
    content: "A synthetic memory about journey maps, roadmap hierarchy, and baton handoff.",
    createdAt: "2026-06-01T12:00:00Z",
    useCount: 0,
    relevance: 0.9,
    vector: [0.0, 0.2, 0.0, 0.0, 0.0, 1.0, 0.1, 0.0],
    accessCount: 0,
    lastAccessed: null,
    memoryType: "idea",
    layer: "ego",
    journey: "demo-parity",
  },
];

/** Persona routing rows for the portable `detect-persona` route. */
export const DEMO_PERSONAS: ReadonlyArray<readonly [key: string, keywords: readonly string[]]> = [
  ["demo-code-reviewer", ["code", "pull request", "refactor", "bug"]],
  ["demo-finance-coach", ["budget", "savings-plan", "investment", "cash flow"]],
  ["demo-garden-planner", ["garden", "soil", "compost bin", "seedling"]],
];

/**
 * Journeys with a deliberately malformed hierarchy: an orphan whose parent does
 * not exist and a two-journey loop, beside a healthy four-level chain. The
 * first content line is the name; `**Status:**` is the status.
 */
export const DEMO_JOURNEYS: ReadonlyArray<
  readonly [key: string, content: string, parent: string | null]
> = [
  ["demo-root-active", "# Demo Root Active\n**Status:** active", null],
  ["demo-root-done", "# Demo Root Done\n**Status:** completed", null],
  ["demo-child-beta", "# Demo Child Beta\n**Status:** active", "demo-root-active"],
  ["demo-child-alpha", "# Demo Child Alpha\n**Status:** paused", "demo-root-active"],
  ["demo-grandchild", "# Demo Grandchild\n**Status:** active", "demo-child-beta"],
  ["demo-great-grandchild", "# Demo Great Grandchild\n**Status:** active", "demo-grandchild"],
  ["demo-orphan", "# Demo Orphan\n**Status:** active", "missing-parent"],
  ["demo-loop-a", "# Demo Loop A\n**Status:** active", "demo-loop-b"],
  ["demo-loop-b", "# Demo Loop B\n**Status:** active", "demo-loop-a"],
];

export interface DemoConsolidation {
  readonly id: string;
  readonly action: string;
  readonly proposal: string;
  readonly source_memory_ids: string;
  readonly target_layer: string | null;
  readonly target_key: string | null;
  readonly rationale: string | null;
  readonly status: string;
  readonly created_at: string;
}

/**
 * Consolidation proposals for the `consolidate list` / `shadow list` routes.
 * `source_memory_ids` names real demo memories, so a person reading the
 * fixture by hand sees a coherent cluster.
 */
export const DEMO_CONSOLIDATIONS: readonly DemoConsolidation[] = [
  {
    id: "demo-consolidation-pending",
    action: "identity_update",
    proposal: "A synthetic surfaced pattern about search parity, pending review.",
    source_memory_ids: pythonJsonDumps(["demo-search-1", "demo-builder-1"]),
    target_layer: "ego",
    target_key: "behavior",
    rationale: "seen across two synthetic memories",
    status: "pending",
    created_at: "2026-06-23T09:00:00Z",
  },
  {
    id: "demo-consolidation-accepted",
    action: "shadow_candidate",
    proposal: "A synthetic shadow-candidate observation, already accepted.",
    source_memory_ids: pythonJsonDumps(["demo-runtime-1"]),
    target_layer: null,
    target_key: null,
    rationale: "a synthetic recurring pattern",
    status: "accepted",
    created_at: "2026-06-22T09:00:00Z",
  },
  {
    id: "demo-consolidation-rejected",
    action: "merge",
    proposal: "A synthetic merge proposal, rejected by the demo Navigator.",
    source_memory_ids: pythonJsonDumps(["demo-journey-1"]),
    target_layer: null,
    target_key: null,
    rationale: null,
    status: "rejected",
    created_at: "2026-06-21T09:00:00Z",
  },
];

export interface DemoTask {
  readonly id: string;
  readonly journey: string | null;
  readonly title: string;
  readonly status: string;
  readonly due_date: string | null;
  readonly scheduled_at: string | null;
  readonly stage: string | null;
}

/** `YYYY-MM-DD` from LOCAL date parts -- Python's `date.today()` is local too. */
function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Tasks dated RELATIVE to the week containing `today`, not to fixed dates: the
 * `week view` route reads the real current Monday..Sunday, so a fixed date
 * would leave it nothing to find a week after the fixture was written.
 */
export function demoTasks(today: Date): DemoTask[] {
  // Python's `weekday()` is Monday=0; JavaScript's `getDay()` is Sunday=0.
  const sinceMonday = (today.getDay() + 6) % 7;
  const iso = (offsetDays: number): string =>
    localIsoDate(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday + offsetDays),
    );
  const task = (fields: Partial<DemoTask> & Pick<DemoTask, "id" | "title" | "status">) => ({
    journey: null,
    due_date: null,
    scheduled_at: null,
    stage: null,
    ...fields,
  });
  return [
    task({
      id: "demo-task-mon",
      journey: "demo-root-active",
      title: "Demo Task Monday",
      status: "todo",
      due_date: iso(0),
      stage: "Setup",
    }),
    task({
      id: "demo-task-wed-scheduled",
      journey: "demo-root-active",
      title: "Demo Task Wednesday Scheduled",
      status: "doing",
      scheduled_at: `${iso(2)}T14:00`,
    }),
    task({
      id: "demo-task-thu-done",
      journey: "demo-child-beta",
      title: "Demo Task Thursday Done",
      status: "done",
      due_date: iso(3),
    }),
    task({
      id: "demo-task-fri-blocked",
      title: "Demo Task Friday Blocked",
      status: "blocked",
      due_date: iso(4),
    }),
    task({
      id: "demo-task-next-week",
      journey: "demo-root-active",
      title: "Demo Task Next Week",
      status: "todo",
      due_date: iso(7),
    }),
    task({
      id: "demo-task-last-week-done",
      journey: "demo-child-beta",
      title: "Demo Task Last Week Done",
      status: "done",
      due_date: iso(-6),
    }),
  ];
}

export interface GenerateOptions {
  /** The day the task dates are computed from. Defaults to now. */
  readonly today?: Date;
}

/** Generate the demo database at `path`, replacing whatever was there. */
export function generateDemoMemoryDb(path: string, options: GenerateOptions = {}): void {
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    rmSync(candidate, { force: true });
  }
  const db = bootstrapDatabase(path);
  try {
    writeMemories(db);
    writeIdentities(db);
    writeTasks(db, demoTasks(options.today ?? new Date()));
    for (const consolidation of DEMO_CONSOLIDATIONS) {
      createConsolidation(db, { ...consolidation, result: null, reviewed_at: null });
    }
  } finally {
    db.close();
  }
}

function writeMemories(db: WritableDatabase): void {
  for (const memory of DEMO_MEMORIES) {
    createMemoryRow(db, {
      id: memory.id,
      memoryType: memory.memoryType,
      layer: memory.layer,
      title: memory.title,
      content: memory.content,
      createdAt: memory.createdAt,
      relevanceScore: memory.relevance,
      useCount: memory.useCount,
      journey: memory.journey,
      embedding: embeddingToBytes(memory.vector),
    });
    for (let access = 0; access < memory.accessCount; access += 1) {
      db.prepare(
        "INSERT INTO memory_access_log (memory_id, accessed_at, access_context) VALUES (?, ?, ?)",
      ).run(memory.id, memory.lastAccessed, "demo-parity");
    }
    if (memory.lastAccessed !== null) {
      db.prepare("UPDATE memories SET last_accessed_at = ? WHERE id = ?").run(
        memory.lastAccessed,
        memory.id,
      );
    }
  }
}

function writeIdentities(db: WritableDatabase): void {
  for (const [key, keywords] of DEMO_PERSONAS) {
    setIdentity(
      db,
      {
        id: newId(),
        layer: "persona",
        key,
        content: `Synthetic persona ${key} for parity fixtures.`,
        metadata: pythonJsonDumps({ routing_keywords: keywords }),
      },
      nowIso(),
    );
  }
  for (const [key, content, parent] of DEMO_JOURNEYS) {
    setIdentity(
      db,
      {
        id: newId(),
        layer: "journey",
        key,
        content,
        metadata: parent === null ? null : pythonJsonDumps({ parent_journey: parent }),
      },
      nowIso(),
    );
    // The projection migrate-on-open's backfill writes from the metadata. The
    // generic identity writer does not maintain it -- only the journey writers
    // do -- and the hierarchy readers index on it.
    db.prepare("UPDATE identity SET parent_journey = ? WHERE layer = 'journey' AND key = ?").run(
      parent,
      key,
    );
  }
}

function writeTasks(db: WritableDatabase, tasks: readonly DemoTask[]): void {
  const now = nowIso();
  for (const task of tasks) {
    db.prepare(
      "INSERT INTO tasks (id, journey, title, status, due_date, scheduled_at, time_hint, stage, " +
        "context, source, created_at, updated_at, completed_at, metadata) " +
        "VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'manual', ?, ?, NULL, NULL)",
    ).run(
      task.id,
      task.journey,
      task.title,
      task.status,
      task.due_date,
      task.scheduled_at,
      task.stage,
      now,
      now,
    );
  }
}
