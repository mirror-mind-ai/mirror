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
import { type EmbeddingProvider, loadReplayEmbeddingProvider } from "#providers/embedding.ts";

/**
 * The outage the oracle ran under: a provider EXCEPTION, not a missing key.
 *
 * The distinction is the whole ledger contract. Python logs an unpriced row for
 * a failed round-trip (`_log_embedding_call(on_llm_call, None, ...)` and then
 * raises) because a failed call is still billable traffic, and logs nothing at
 * all for a missing key, which never reaches the wire.
 */
const FAILING_PROVIDER: EmbeddingProvider = {
  embed: async () => {
    throw new Error("parity outage");
  },
};

/**
 * The seam each case was recorded under: the fixture, a dead provider, or one
 * that dies partway.
 *
 * `load` embeds twice, and both engines catch per SEARCH, so a provider that
 * fails on the second call leaves one semantic ranking and one lexical fallback
 * inside a single command. With a provider that either always works or always
 * fails, nothing distinguishes "the command degraded" from "the first search
 * degraded" -- mutation testing reported that rule ungraded, and this is what
 * grades it.
 */
function providerFor(entry: Invocation, replay: EmbeddingProvider): EmbeddingProvider {
  if (entry.fail_embedding) return FAILING_PROVIDER;
  if (entry.fail_embedding_calls.length === 0) return replay;
  const failing = new Set(entry.fail_embedding_calls);
  let calls = 0;
  return {
    embed: async (text: string) => {
      calls += 1;
      if (failing.has(calls)) throw new Error("parity outage");
      return replay.embed(text);
    },
  };
}

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
  /** The transport the oracle ran under: a failing embedding seam, or the fixture. */
  fail_embedding: boolean;
  /** Which round-trips failed, one-based. Empty with `fail_embedding` = all of them. */
  fail_embedding_calls: number[];
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
  assert.ok(
    invocations.some((entry) => entry.fail_embedding),
    "the matrix must include the provider outage, or the degraded path is ungraded",
  );
  // Both directions: the rule is that EITHER search degrading degrades the
  // command, and a single partial case can only ever prove half of it.
  for (const call of [1, 2]) {
    assert.ok(
      invocations.some((entry) => entry.fail_embedding_calls.includes(call)),
      `and the partial outage where call ${call} fails`,
    );
  }
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
          embeddingProvider: providerFor(entry, provider),
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

// --- the provider outage (plan items 18a, 18c, and the devops dissent) --------
//
// The four faces above already grade the degraded runs against Python. What
// these add is what the corpus RECORDS but nothing asserted: that the outage
// changes the memories block and nothing else, that the filter is hard rather
// than soft, and that the surface says nothing about any of it.

/** Run one recorded case on a fresh copy, with the transport it was recorded under. */
async function runRecorded(entry: Invocation, options: { provider?: EmbeddingProvider } = {}) {
  const { db } = seedDatabase(entry);
  try {
    const result = await runBuildLoad(
      db,
      { slug: entry.slug, sessionId: SESSION_ID },
      {
        nowIso: () => FROZEN_NOW,
        newId: () => "00000001",
        ...(options.provider === undefined ? {} : { embeddingProvider: options.provider }),
        // The same real switch the four-face comparison injects. Without it the
        // conversation the session start binds would be missing, and the outage
        // assertions below would be reading a session `load` never finished.
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
    return { result, runtime: runtimeRows(db), access: memoryAccess(db), calls: llmCalls(db) };
  } finally {
    db.close();
  }
}

function recorded(name: string): Invocation {
  const entry = invocations.find((candidate) => candidate.name === name);
  assert.ok(entry, `the corpus must carry ${name}`);
  return entry;
}

/** Each twin stages its own root; the case name is the only difference. */
function withoutRoot(entry: Invocation, text: string): string {
  return text.replaceAll(entry.project_root, "<PROJECT>");
}

test("an outage changes the memories block and nothing else about the session start", async () => {
  // The devops dissent as an assertion: four surfaces print before the first
  // provider call, so an outage must not leave a half-written session. Python
  // simply continues -- sticky defaults, mode row, conversation switch, exit 0 --
  // and a port that raised instead would strand a Navigator mid-start.
  const healthy = recorded("load_lexical_healthy");
  const offline = recorded("load_lexical_offline");
  const good = await runRecorded(healthy, {
    provider: await loadReplayEmbeddingProvider(FIXTURE.pathname),
  });
  const bad = await runRecorded(offline, { provider: FAILING_PROVIDER });

  const split = (entry: Invocation, stdout: string) =>
    withoutRoot(entry, stdout).split("=== recent memories ===");
  const [goodPrefix, goodBlock] = split(healthy, good.result.stdout);
  const [badPrefix, badBlock] = split(offline, bad.result.stdout);

  assert.equal(bad.result.exitCode, 0, "an outage is not a failed command");
  assert.equal(badPrefix, goodPrefix, "everything before the block is byte-identical");
  assert.notEqual(badBlock, goodBlock, "the block is the part that degrades");
  assert.equal(
    withoutRoot(offline, bad.result.stderr),
    withoutRoot(healthy, good.result.stderr),
    "the banner is identical too -- stderr carries no warning either",
  );
  // The state the command exists to write is still written.
  assert.deepEqual(
    bad.runtime.map((row) => row.session_id),
    good.runtime.map((row) => row.session_id),
  );
  const modeRow = bad.runtime.find((row) => row.session_id === SESSION_ID);
  assert.ok(modeRow, "the operating-mode row survives the outage");
  assert.ok(modeRow.conversation_id, "and so does the conversation the switch bound");
});

test("a degraded search is a HARD filter: the unmatched memory is never touched", async () => {
  // Python drops non-FTS candidates outright (`mem.id not in fts_lookup: continue`)
  // rather than scoring them lower, so the memory with the best embedding vanishes
  // when the provider does -- and, because the block is what `log_access` stamps,
  // it is not even marked as read.
  const healthy = recorded("load_lexical_healthy");
  const offline = recorded("load_lexical_offline");

  assert.match(healthy.stdout, /Cadence decides what may happen unasked\./u);
  assert.doesNotMatch(offline.stdout, /Cadence decides what may happen unasked\./u);
  const touched = (entry: Invocation) =>
    entry.memory_access.filter((row) => row.accessed === 1).map((row) => row.id);
  assert.deepEqual(touched(healthy), ["lex-global", "lex-scoped", "lex-semantic-only"]);
  assert.deepEqual(touched(offline), ["lex-global", "lex-scoped"]);
});

test("a real briefing query matches nothing at all when the provider is down", async () => {
  // The shape a Navigator actually meets. `_fts_query` ANDs every whitespace word
  // of the query, and `load`'s query is a briefing paragraph cut at 500 code
  // points, so in degraded mode the block disappears entirely -- on a machine
  // whose corpus is full. Reproduced, not repaired: the memories block silently
  // becomes an empty section, which is the CR.
  const entry = recorded("load_degraded_briefing_query");
  const outage = await runRecorded(entry, { provider: FAILING_PROVIDER });

  assert.equal(outage.result.exitCode, 0);
  assert.doesNotMatch(outage.result.stdout, /=== recent memories ===/u);
  assert.deepEqual(
    outage.access.filter((row) => row.accessed === 1),
    [],
    "nothing was returned, so nothing was stamped",
  );
  assert.equal(outage.runtime.filter((row) => row.session_id === SESSION_ID).length, 1);
  // A failed round-trip is still billable traffic: Python logs it unpriced, and
  // so must this. Two searches, two rows, no invented price.
  assert.equal(outage.calls.length, 2);
  for (const row of outage.calls) {
    assert.equal(row.role, "embedding");
    assert.equal(row.prompt_tokens, null);
  }
  assert.equal(outage.result.providerCalls, 2);
});

test("the degraded kind is a category, never the query or the provider's words", async () => {
  // It travels to the front-door log, where a payload is forbidden. The class is
  // the diagnosis an operator needs; the query is the Navigator's own briefing
  // prose and must not leave the process.
  const entry = recorded("load_lexical_offline");
  const outage = await runRecorded(entry, { provider: FAILING_PROVIDER });
  const kind = outage.result.degradedKind;

  assert.ok(kind, "an outage must be diagnosable");
  assert.match(kind, /^[a-z_]+$/u, "a short, content-free category");
  assert.doesNotMatch(kind, /parity outage/u, "not the provider's message");
  for (const word of ["Strangler", "parity", "oracle"]) {
    assert.doesNotMatch(kind, new RegExp(word, "iu"), `the query word ${word} must not travel`);
  }
});

test("an unconfigured install degrades exactly like an outage, and prices nothing", async () => {
  // Python has no absent-provider state: a missing key raises inside
  // `generate_embedding`, the search catches it, and the FTS-only block still
  // renders. Returning no results instead -- which this did until the outage
  // scenario measured it -- shows an EMPTY memories block on a machine with a
  // full corpus, silently, in the surface a Navigator reads to pick the day's
  // work.
  const entry = recorded("load_lexical_offline");
  const unconfigured = await runRecorded(entry);

  // Byte for byte what Python recorded under a FAILING provider: the two failure
  // modes differ in the ledger, never in the surface.
  assert.equal(unconfigured.result.stdout, entry.stdout, "the same block an outage renders");
  assert.equal(unconfigured.result.degradedKind, "config");
  // A key that was never configured reaches no provider, so Python writes no
  // ledger row -- and `calls=` must not claim one either.
  assert.deepEqual(unconfigured.calls, []);
  assert.equal(unconfigured.result.providerCalls, 0);
});

test("either search failing degrades the command, whichever one it was", async () => {
  // A rate limit that arrives between `load`'s two embeddings, and the transient
  // failure that recovers before the second. Both engines catch per search, so
  // one ranking is semantic and the other lexical inside a single command -- and
  // the two cases render DIFFERENT blocks, which is what makes "report the first
  // status" and "report the second" both wrong.
  const replay = await loadReplayEmbeddingProvider(FIXTURE.pathname);
  const blocks: string[] = [];
  for (const name of ["load_partial_outage", "load_first_call_outage"]) {
    const entry = recorded(name);
    const partial = await runRecorded(entry, { provider: providerFor(entry, replay) });

    assert.equal(partial.result.exitCode, 0, `${name} is not a failed command`);
    assert.ok(partial.result.degradedKind, `${name}: the failure must reach the log`);
    assert.equal(partial.result.providerCalls, 2, `${name}: both searches called`);
    // One succeeded and one failed, and BOTH are in the ledger: a failed
    // round-trip is unpriced, never absent.
    assert.equal(partial.calls.length, 2, `${name}: two ledger rows`);
    assert.equal(partial.result.stdout, entry.stdout, `${name} stdout`);
    blocks.push(partial.result.stdout.split("=== recent memories ===")[1] ?? "");
  }
  assert.notEqual(blocks[0], blocks[1], "which search degraded changes what is rendered");
});
