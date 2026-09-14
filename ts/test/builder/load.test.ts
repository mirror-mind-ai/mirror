// CV22.DS7.US8 plateau 7 — `build load` graded end to end against Python.
//
// The pure half lives in `loadSurfaces.test.ts`. This one replays the INVOCATIONS
// the oracle recorded: the same database, built from the same rows the corpus
// carries, driven through `runBuildLoad` with the replay embedding provider
// reading the very fixture Python's patched seam read.
//
// Four faces are compared per case, and the third and fourth are the ones a
// surface golden cannot see:
//
//   * stdout, stderr, exit code;
//   * the `runtime_sessions` rows — the sticky defaults, the operating-mode row,
//     and the conversation the switch created;
//   * `memory_access` — `log_access` makes this read MUTATE `use_count` and
//     `last_accessed_at` on exactly the memories it returned, which is why the
//     rule is one `load` per database copy;
//   * `llm_calls` — two embedding rows per `load`, with the token count a
//     replayed call honestly has (none), so neither engine invents a price.

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { mergeRankedResults, runBuildLoad } from "#builder/load.ts";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { switchConversation } from "#conversation/logger.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import golden from "#goldens/builder-load.golden.json" with { type: "json" };
import { createJourney } from "#journey/journeyWrite.ts";
import { loadReplayEmbeddingProvider } from "#providers/embedding.ts";

const FIXTURE = new URL("../fixtures/builder-load/replay-embedding.json", import.meta.url);
const FROZEN_NOW = "2026-01-01T00:00:00+00:00";
const SESSION_ID = "builder-load-session";

interface SeedMemory {
  id: string;
  memory_type: string;
  layer: string;
  title: string;
  content: string;
  journey: string | null;
  created_at: string;
  use_count: number;
  relevance_score: number;
  embedding: number[];
}

interface Invocation {
  name: string;
  slug: string;
  project_root: string;
  seed: {
    journey_content: string | null;
    with_project: boolean;
    memories: SeedMemory[];
    adopted_method: string | null;
    cursor: Record<string, unknown> | null;
  };
  stdout: string;
  stderr: string;
  exit_code: number;
  runtime_sessions: Record<string, unknown>[];
  memory_access: Record<string, unknown>[];
  llm_calls: Record<string, unknown>[];
}

const invocations = (golden as unknown as { invocations: Invocation[] }).invocations;

const temporaryDirectories: string[] = [];
test.after(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

/**
 * Build one case's database from the rows the CORPUS carries.
 *
 * Not a TypeScript mirror of the generator's `_seed`: the data lives in the
 * golden, so the two engines cannot drift about what was seeded — only about what
 * they do with it, which is the thing under test. The command corpus mirrors its
 * seed by hand and that duplication has broken twice.
 */
function seedDatabase(entry: Invocation): { db: WritableDatabase; project: string } {
  // The sequence's OWN recorded root, staged relative like the generator's. The
  // transition card truncates the project-path row, so a `mkdtemp` root would push
  // that row through path normalization and stop grading it — the same reason the
  // lifecycle replay stages `tmp/parity/builder-lifecycle/<name>`.
  const project = entry.project_root;
  const root = dirname(project);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(join(project, "docs", "project", "roadmap"), { recursive: true });
  writeFileSync(join(project, "docs", "project", "roadmap", "index.md"), "# Roadmap\n", "utf8");
  temporaryDirectories.push(root);
  const db = bootstrapDatabase(join(root, "memory_test.db"));
  if (entry.seed.journey_content !== null) {
    createJourney(
      db,
      {
        id: `journey-${entry.slug}`,
        slug: entry.slug,
        content: entry.seed.journey_content,
        ...(entry.seed.with_project ? { projectPath: project } : {}),
      },
      FROZEN_NOW,
    );
  }
  for (const memory of entry.seed.memories) {
    // float32 little-endian, exactly what `embedding_to_bytes` writes.
    const buffer = new ArrayBuffer(memory.embedding.length * 4);
    const view = new DataView(buffer);
    memory.embedding.forEach((value, index) => {
      view.setFloat32(index * 4, value, true);
    });
    db.prepare(
      "INSERT INTO memories (id, memory_type, layer, title, content, journey, created_at, " +
        "relevance_score, embedding, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      memory.id,
      memory.memory_type,
      memory.layer,
      memory.title,
      memory.content,
      memory.journey,
      memory.created_at,
      memory.relevance_score,
      new Uint8Array(buffer),
      memory.use_count,
    );
  }
  if (entry.seed.adopted_method) {
    setAdoptedMethod(db, entry.slug, entry.seed.adopted_method, () => FROZEN_NOW);
  }
  if (entry.seed.cursor) {
    const cursor = entry.seed.cursor as Record<string, string | null>;
    setDeliveryCursor(
      db,
      {
        journey: entry.slug,
        method: cursor.method ?? "ariad",
        activeItem: cursor.active_item ?? null,
        activeItemTitle: cursor.active_item_title ?? null,
        activeItemLevel: cursor.active_item_level ?? null,
        lastDeliveryEvent: cursor.last_delivery_event ?? null,
      },
      { nowIso: () => FROZEN_NOW },
    );
  }
  return { db, project };
}

function runtimeRows(db: WritableDatabase): Record<string, unknown>[] {
  return db
    .prepare(
      "SELECT session_id, interface, journey, persona, conversation_id, active, started_at, " +
        "updated_at, closed_at, metadata FROM runtime_sessions ORDER BY session_id",
    )
    .all() as Record<string, unknown>[];
}

/**
 * Which memories the read touched, and how often — not WHEN.
 *
 * `log_access` stamps its own wall clock (not the injectable one), so the value is
 * unfreezable on both sides; the access-log COUNT and the presence of the cached
 * timestamp are the behavior. `use_count` is graded because it must not move:
 * retrieval logs access, `log_use` logs use, and conflating them inflates the
 * reinforcement term for every memory a Navigator merely loaded.
 */
function memoryAccess(db: WritableDatabase): Record<string, unknown>[] {
  return db
    .prepare(
      "SELECT m.id, m.use_count, m.last_accessed_at IS NOT NULL AS accessed, " +
        "(SELECT COUNT(*) FROM memory_access_log a WHERE a.memory_id = m.id) AS access_rows " +
        "FROM memories m ORDER BY m.id",
    )
    .all() as Record<string, unknown>[];
}

function llmCalls(db: WritableDatabase): Record<string, unknown>[] {
  return db
    .prepare("SELECT role, model, prompt_tokens, completion_tokens FROM llm_calls ORDER BY id")
    .all() as Record<string, unknown>[];
}

test("every recorded load matches Python on all four faces", async () => {
  assert.ok(invocations.length >= 5, "expected the recorded load matrix");
  const provider = await loadReplayEmbeddingProvider(FIXTURE.pathname);
  for (const entry of invocations) {
    const { db } = seedDatabase(entry);
    try {
      const result = await runBuildLoad(
        db,
        { slug: entry.slug, sessionId: SESSION_ID },
        {
          nowIso: () => FROZEN_NOW,
          // Python's frozen `_uuid` counts from one, and `load` creates exactly
          // one conversation.
          newId: () => "00000001",
          embeddingProvider: provider,
          // The real switch, with NO close hooks: these cases seed no previous
          // conversation, so no close tail runs and the corpus stays provider-free
          // on that seam. The route supplies the hooks (and the tail's own
          // transport) at plateau 8.
          switchConversation: async (journey, sessionId) => {
            await switchConversation(
              db,
              sessionId,
              { persona: "engineer", journey },
              { nowIso: () => FROZEN_NOW, newId: () => "00000001" },
            );
          },
        },
      );
      assert.equal(result.stdout, entry.stdout, `${entry.name} stdout`);
      assert.equal(result.stderr, entry.stderr, `${entry.name} stderr`);
      assert.equal(result.exitCode, entry.exit_code, `${entry.name} exit code`);
      assert.deepEqual(memoryAccess(db), entry.memory_access, `${entry.name} memory access`);
      assert.deepEqual(llmCalls(db), entry.llm_calls, `${entry.name} llm_calls`);
      assert.deepEqual(runtimeRows(db), entry.runtime_sessions, `${entry.name} runtime rows`);
    } finally {
      db.close();
    }
  }
});

test("load mutates what it read, and only in the way retrieval should", async () => {
  // The database-architect's rule as an assertion: this read WRITES, which is why
  // every artifact in this plateau grades one load per database copy.
  const entry = invocations.find((candidate) => candidate.name === "load_adopted_with_memories");
  assert.ok(entry);
  const touched = entry.memory_access.filter((row) => row.accessed === 1);
  assert.ok(touched.length > 0, "the recorded run must have touched memories");
  for (const row of touched) {
    const seeded: SeedMemory | undefined = entry.seed.memories.find(
      (memory) => memory.id === row.id,
    );
    assert.ok(seeded, "every touched memory was seeded");
    // Retrieval logs ACCESS, never USE. `log_use` is the stronger signal, reserved
    // for a memory the model actually drew on; bumping it here would inflate the
    // reinforcement term for anything a Navigator merely loaded.
    assert.equal(row.use_count, seeded.use_count, `${row.id}: use_count unchanged`);
    assert.ok((row.access_rows as number) >= 1, `${row.id}: access logged`);
  }
});

test("a replayed load prices nothing", async () => {
  // Two embedding rows, one per search, with a null token count. A replayed call
  // cost nothing; recording a price would put fiction in the ledger that plateau 9
  // measures the per-session floor from.
  const entry = invocations.find((candidate) => candidate.name === "load_adopted_with_memories");
  assert.ok(entry);
  assert.equal(entry.llm_calls.length, 2);
  for (const row of entry.llm_calls) {
    assert.equal(row.role, "embedding");
    assert.equal(row.prompt_tokens, null);
    assert.equal(row.completion_tokens, null);
  }
});

test("the merge keeps the FIRST occurrence, which carries the scoped score", () => {
  // Declared corpus-unreachable, and graded here. Through the command the two
  // scores for a duplicated id differ only when MMR's diversity penalty differs
  // between the candidate sets, and they must then INVERT two ids' relative order
  // before the rendered block changes. Two corpus shapes failed to expose it;
  // engineering a third to satisfy a mutant would be writing a case for the test
  // rather than for the behavior.
  const scoped = [
    { id: "a", score: 0.4 },
    { id: "b", score: 0.3 },
  ];
  const global = [
    { id: "b", score: 0.9 },
    { id: "a", score: 0.1 },
    { id: "c", score: 0.5 },
  ];
  assert.deepEqual(mergeRankedResults(scoped, global), [
    { id: "c", score: 0.5 },
    { id: "a", score: 0.4 },
    { id: "b", score: 0.3 },
  ]);
});

test("the merge takes six, and equal scores keep scoped before global", () => {
  const scoped = Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, score: 0.5 }));
  const global = Array.from({ length: 5 }, (_, index) => ({ id: `g${index}`, score: 0.5 }));
  const merged = mergeRankedResults(scoped, global);
  assert.equal(merged.length, 6);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["s0", "s1", "s2", "s3", "s4", "g0"],
  );
});

test("the clone-role guard refuses before any surface is printed", async () => {
  // Graded here rather than in the corpus, because the guard's real inputs are a
  // git root and a `.mirror-clone-role` marker — properties of the machine, not of
  // the command. CI proved that the hard way: the staging directory lives inside
  // this checkout, so the first corpus inherited the developer's `dev` marker and
  // every case refused on a runner that has none, where the default is
  // `production`.
  //
  // What must hold is the ORDER: a refusal leaves no banner, no card, and no mode
  // row, because Python checks the role before it prints anything.
  const entry = invocations.find((candidate) => candidate.name === "load_adopted_with_memories");
  assert.ok(entry);
  const { db } = seedDatabase({ ...entry, name: "clone_role_refusal" });
  try {
    const result = await runBuildLoad(
      db,
      { slug: entry.slug, sessionId: SESSION_ID },
      {
        nowIso: () => FROZEN_NOW,
        newId: () => "00000001",
        cloneRoleRefusal: () =>
          "Builder Mode refused: the journey project clone is marked 'production'.\n",
      },
    );
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "", "a refused load prints no surface");
    assert.match(result.stderr, /marked 'production'/u);
    assert.equal(result.providerCalls, 0, "a refused load reaches no provider");
    const rows = runtimeRows(db).filter((row) => row.session_id === SESSION_ID);
    assert.deepEqual(rows, [], "a refused load writes no operating-mode row");
  } finally {
    db.close();
  }
});
