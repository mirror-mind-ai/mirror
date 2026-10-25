// CV9.DS8.TS2: the one doorman. Given a turn's prompt and the session's state,
// it answers nothing, the full folder, or a delta -- and the tests below are
// the policy, case by case, before the module was written.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createLlmCallsTable } from "#helpers/llmCallsSchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { tempDir } from "#helpers/tempDir.ts";
import {
  DELIVERED_LINE_PREFIX,
  DOORMAN_MEMORY_SEMANTIC_THRESHOLD,
  decideDoorman,
  deliveredLine,
  type MemoryScore,
  readDoormanSessionState,
  runDoorman,
} from "#mirror/doorman.ts";
import { activateOperatingMode } from "#mode/operatingMode.ts";
import type { EmbeddingProvider, EmbeddingResult } from "#providers/embedding.ts";

const DIMENSIONS = 1536;

function unitVector(axis: number): number[] {
  const vector = Array(DIMENSIONS).fill(0);
  vector[axis] = 1;
  return vector;
}

function float32Blob(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

/** Counts its calls, so "one embedding per turn" is an assertion, not a hope. */
class CountingEmbeddingProvider implements EmbeddingProvider {
  calls = 0;
  private readonly vector: readonly number[];
  constructor(vector: readonly number[]) {
    this.vector = vector;
  }
  async embed(): Promise<EmbeddingResult> {
    this.calls += 1;
    return { vector: this.vector, promptTokens: 7 };
  }
}

class FailingEmbeddingProvider implements EmbeddingProvider {
  async embed(): Promise<never> {
    throw new Error("embedding provider unreachable");
  }
}

const PERSONAS = [
  { key: "cfo", routing_keywords: ["budget", "money"] },
  { key: "writer", routing_keywords: ["article", "draft"] },
];

function fixture(): { db: WritableDatabase; dir: string } {
  const dir = tempDir("mirror-doorman-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  createLlmCallsTable(db);
  db.exec(`
    CREATE TABLE identity_descriptors (layer TEXT, key TEXT, descriptor TEXT, generated_at TEXT, PRIMARY KEY(layer,key));
    CREATE TABLE attachments (id TEXT PRIMARY KEY, journey_id TEXT, name TEXT, description TEXT, content TEXT, embedding BLOB, created_at TEXT);
    CREATE TABLE _ext_bindings (extension_id TEXT, capability_id TEXT, target_kind TEXT, target_id TEXT);
    CREATE TABLE memories (
      id TEXT PRIMARY KEY, conversation_id TEXT, memory_type TEXT NOT NULL,
      layer TEXT NOT NULL DEFAULT 'ego', title TEXT NOT NULL, content TEXT NOT NULL, context TEXT,
      journey TEXT, persona TEXT, tags TEXT, created_at TEXT NOT NULL, relevance_score REAL DEFAULT 1.0,
      embedding BLOB, metadata TEXT, last_accessed_at TEXT, use_count INTEGER NOT NULL DEFAULT 0,
      readiness_state TEXT NOT NULL DEFAULT 'observed'
    );
    CREATE TABLE memory_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, memory_id TEXT NOT NULL, accessed_at TEXT NOT NULL, access_context TEXT
    );
    CREATE VIRTUAL TABLE memories_fts USING fts5(title, content, content='memories', content_rowid='rowid');
  `);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at, metadata) VALUES (?, ?, ?, ?, 't', 't', ?)",
  );
  insert.run("1", "self", "soul", "Soul text", null);
  insert.run("2", "ego", "behavior", "Be useful", null);
  insert.run("3", "user", "identity", "User context", null);
  insert.run(
    "4",
    "persona",
    "cfo",
    "CFO context",
    JSON.stringify({ routing_keywords: PERSONAS[0]?.routing_keywords }),
  );
  insert.run(
    "5",
    "persona",
    "writer",
    "Writer context",
    JSON.stringify({ routing_keywords: PERSONAS[1]?.routing_keywords }),
  );
  insert.run(
    "6",
    "journey",
    "mirror",
    "# Mirror\n**Status:** active\n\n## Description\nThe mirror itself\n\n## End",
    null,
  );
  db.prepare(
    `INSERT INTO memories (id, memory_type, layer, title, content, journey, created_at, embedding)
     VALUES (?, 'insight', 'ego', ?, ?, 'mirror', ?, ?)`,
  ).run(
    "m-near",
    "Near memory",
    "about drafting articles",
    "2026-10-01T00:00:00Z",
    float32Blob(unitVector(0)),
  );
  db.prepare(
    `INSERT INTO memories (id, memory_type, layer, title, content, journey, created_at, embedding)
     VALUES (?, 'insight', 'ego', ?, ?, 'mirror', ?, ?)`,
  ).run(
    "m-far",
    "Far memory",
    "about something else",
    "2026-09-01T00:00:00Z",
    float32Blob(unitVector(1)),
  );
  db.prepare("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')").run();
  db.prepare(
    `INSERT INTO attachments (id, journey_id, name, description, content, embedding, created_at)
     VALUES ('a1', 'mirror', 'Draft notes', 'notes', 'Attachment body', ?, 't')`,
  ).run(float32Blob(unitVector(0)));
  db.prepare(
    `INSERT INTO runtime_sessions (session_id, interface, conversation_id, started_at, updated_at)
     VALUES ('S', 'pi', 'conv-1', 't0', 't0')`,
  ).run();
  return { db, dir };
}

function activate(db: WritableDatabase, persona: string | null, journey: string | null): void {
  db.prepare(
    "UPDATE runtime_sessions SET mirror_active = 1, persona = ?, journey = ? WHERE session_id = 'S'",
  ).run(persona, journey);
}

function sessionRow(db: WritableDatabase) {
  return db
    .prepare(
      "SELECT conversation_id, mirror_active, hook_injected, persona, journey FROM runtime_sessions WHERE session_id = 'S'",
    )
    .get();
}

function ids() {
  let value = 0;
  return () => `id${++value}`;
}

function times() {
  let value = 0;
  return () => `2026-10-24T00:00:0${value++}.000000Z`;
}

function runInput(provider?: EmbeddingProvider, scores?: MemoryScore[][]) {
  return {
    identity: "mirror-dev",
    sessionId: "S",
    receptionEnabled: false,
    embeddingProvider: provider,
    newId: ids(),
    nowIso: times(),
    onMemoryScores: scores
      ? (turn: readonly MemoryScore[]) => {
          scores.push([...turn]);
        }
      : undefined,
  };
}

// --- the decision table ----------------------------------------------------

test("decideDoorman: Mirror Mode off and an ordinary prompt → nothing", () => {
  const decision = decideDoorman({
    prompt: "how do I split this module",
    state: { active: false, persona: null, journey: null },
    personas: PERSONAS,
  });
  assert.deepEqual(decision, { kind: "nothing" });
});

test("decideDoorman: an unnamed session reads as inactive", () => {
  assert.deepEqual(
    decideDoorman({ prompt: "should I take the money", state: null, personas: PERSONAS }),
    { kind: "nothing" },
  );
});

test("decideDoorman: a skill command that is not the Mirror form → nothing, even with Mirror Mode on", () => {
  // Debt paid by CV9.DS8.US5's walk: `/skill:mm-build mirror`, `/skill:mm-journeys`,
  // and `/skill:mm-explore` each paid an embedding and got a delta, and on one
  // build turn the model signed the Builder card. A skill invocation is not a
  // question to the mirror (CR160's rule for logging holds here too).
  const active = { active: true, persona: "cfo", journey: "mirror" };
  for (const prompt of [
    "/skill:mm-build mirror",
    "/skill:mm-journeys",
    "/mm-explore deactivate",
    "$mm-journeys",
    "$mirror-mind:mm:build mirror",
    "/compact",
  ]) {
    assert.deepEqual(
      decideDoorman({ prompt, state: active, personas: PERSONAS }),
      { kind: "nothing" },
      prompt,
    );
  }
  // The Mirror form is the exception, in every spelling: it IS the question.
  assert.equal(
    decideDoorman({ prompt: "$mm-mirror what about the budget", state: active, personas: PERSONAS })
      .kind,
    "full",
  );
  // And "$5 a month" is English, not a command.
  assert.equal(
    decideDoorman({ prompt: "$5 a month for the budget", state: active, personas: PERSONAS }).kind,
    "delta",
  );
});

test("decideDoorman: the explicit form → full, with the query after the form, in any state", () => {
  for (const state of [null, { active: false, persona: null, journey: null }]) {
    assert.deepEqual(
      decideDoorman({ prompt: "/mm-mirror should I take the offer?", state, personas: PERSONAS }),
      { kind: "full", query: "should I take the offer?" },
    );
  }
  assert.deepEqual(
    decideDoorman({
      prompt: "/mirror-mind:mm:mirror",
      state: { active: true, persona: "cfo", journey: "mirror" },
      personas: PERSONAS,
    }),
    { kind: "full", query: "" },
  );
});

test("decideDoorman: active + a persona that newly scores → delta naming it", () => {
  assert.deepEqual(
    decideDoorman({
      prompt: "review this article draft",
      state: { active: true, persona: "cfo", journey: "mirror" },
      personas: PERSONAS,
    }),
    { kind: "delta", query: "review this article draft", persona: "writer" },
  );
});

test("decideDoorman: active + the same persona, or none → delta with no persona", () => {
  const state = { active: true, persona: "cfo", journey: "mirror" };
  assert.deepEqual(decideDoorman({ prompt: "what about the budget", state, personas: PERSONAS }), {
    kind: "delta",
    query: "what about the budget",
    persona: null,
  });
  assert.deepEqual(decideDoorman({ prompt: "tell me more", state, personas: PERSONAS }), {
    kind: "delta",
    query: "tell me more",
    persona: null,
  });
});

// --- the delivered line ------------------------------------------------------

test("deliveredLine: one stable prefix, the session's persona, the clause with and without a signature", () => {
  assert.equal(
    deliveredLine({ kind: "full", persona: "cfo", journey: "mirror" }),
    `${DELIVERED_LINE_PREFIX}: full — answer as the mirror; sign ◇ cfo ===`,
  );
  assert.equal(
    deliveredLine({ kind: "delta", persona: "writer", journey: "mirror" }),
    `${DELIVERED_LINE_PREFIX}: delta (persona: writer · journey: mirror) — answer as the mirror; sign ◇ writer ===`,
  );
  assert.equal(
    deliveredLine({ kind: "delta", persona: null, journey: null }),
    `${DELIVERED_LINE_PREFIX}: delta (persona: none · journey: none) — answer as the mirror ===`,
  );
});

// --- the session state read --------------------------------------------------

test("readDoormanSessionState: the row's fields, null when unnamed or unknown", () => {
  const { db } = fixture();
  try {
    assert.equal(readDoormanSessionState(db, null), null);
    assert.equal(readDoormanSessionState(db, "nope"), null);
    assert.deepEqual(readDoormanSessionState(db, "S"), {
      active: false,
      persona: null,
      journey: null,
    });
    activate(db, "cfo", "mirror");
    assert.deepEqual(readDoormanSessionState(db, "S"), {
      active: true,
      persona: "cfo",
      journey: "mirror",
    });
  } finally {
    db.close();
  }
});

// CV9.DS8.US4, the review's mixed-mode finding: `mirror_active` is cleared by
// `mirror deactivate` alone, while `build load` switches the operating mode and
// leaves it set. Read on its own, the column would put "answer as the mirror"
// on every Builder turn of a session that was once in Mirror Mode. So the
// session is in Mirror Mode for the doorman only while the active operating
// mode -- the session's own, else the global row -- says so; no mode record at
// all (an older home) leaves the column to decide.
test("readDoormanSessionState: active only while the operating mode is Mirror Mode", () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const read = () => readDoormanSessionState(db, "S")?.active;

    assert.equal(read(), true, "no mode record anywhere: mirror_active decides");

    activateOperatingMode(db, { mode: "Builder Mode", journey: "mirror" }, "t1");
    assert.equal(read(), false, "the global row says Builder, the session has none");

    activateOperatingMode(db, { mode: "Mirror Mode", journey: "mirror", sessionId: "S" }, "t2");
    assert.equal(read(), true, "the session's own row says Mirror, and wins over the global");

    activateOperatingMode(db, { mode: "Builder Mode", journey: "mirror", sessionId: "S" }, "t3");
    assert.equal(read(), false, "/mm:build in this session: the deltas stop");

    activateOperatingMode(db, { mode: "Soul Mode", journey: null, sessionId: "S" }, "t4");
    assert.equal(read(), false, "Soul Mode is not Mirror Mode either");
  } finally {
    db.close();
  }
});

// --- the full folder -----------------------------------------------------------

test("runDoorman full: the delivered line, the transition surface, the folder; the session active and injected", async () => {
  const { db } = fixture();
  try {
    const provider = new CountingEmbeddingProvider(unitVector(0));
    const result = await runDoorman(
      db,
      { kind: "full", query: "should I take the money" },
      runInput(provider),
    );
    const lines = result.stdout.split("\n");
    assert.equal(lines[0], `${DELIVERED_LINE_PREFIX}: full — answer as the mirror; sign ◇ cfo ===`);
    assert.match(result.stdout, /◌ {2}MIRROR MODE ACTIVE/);
    assert.match(result.stdout, /=== self\/soul ===\nSoul text/);
    assert.match(result.stdout, /=== persona\/cfo ===\nCFO context/);
    // The journey came from the semantic detector (the fixture's one vector
    // matches everything); the persona from the keyword router.
    assert.deepEqual(sessionRow(db), {
      conversation_id: "conv-1",
      mirror_active: 1,
      hook_injected: 1,
      persona: "cfo",
      journey: "mirror",
    });
  } finally {
    db.close();
  }
});

// --- the delta -------------------------------------------------------------------

test("runDoorman delta with a new persona: line, persona section, memories, attachments; no identity layer", async () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const provider = new CountingEmbeddingProvider(unitVector(0));
    const scores: MemoryScore[][] = [];
    const result = await runDoorman(
      db,
      { kind: "delta", query: "review this article draft", persona: "writer" },
      runInput(provider, scores),
    );
    const lines = result.stdout.split("\n");
    assert.equal(
      lines[0],
      `${DELIVERED_LINE_PREFIX}: delta (persona: writer · journey: mirror) — answer as the mirror; sign ◇ writer ===`,
    );
    assert.match(result.stdout, /=== persona\/writer ===\nWriter context/);
    assert.match(result.stdout, /=== relevant memories ===\n/);
    assert.match(result.stdout, /\[ego\] Near memory\nabout drafting articles/);
    assert.match(
      result.stdout,
      /=== relevant attachments ===\n--- Draft notes \(score: 1\.000\) ---/,
    );
    assert.doesNotMatch(
      result.stdout,
      /=== self\/soul ===|=== ego\/behavior ===|=== user\/identity ===|=== journey\//,
    );
    assert.doesNotMatch(result.stdout, /HARD CONSTRAINTS|MIRROR MODE ACTIVE/);
    // One embedding for the turn, shared by the two searches, in the ledger once.
    assert.equal(provider.calls, 1);
    // Metadata-only, as every ledger row is: the prompt is not stored.
    const ledger = db.prepare("SELECT role, prompt, session_id FROM llm_calls").all();
    assert.deepEqual(ledger, [{ role: "embedding", prompt: "", session_id: "S" }]);
    // No reinforcement: the doorman searches on the system's behalf.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memory_access_log").get()?.n, 0);
    // Every ranked memory's scores went to the caller's sink, the one under the
    // threshold included (US5): the log measures, the block selects.
    assert.equal(scores.length, 1);
    assert.deepEqual(
      scores[0]?.map((s) => s.semantic),
      [1, 0],
    );
    assert.doesNotMatch(result.stdout, /Far memory/);
    // The persona moved, by a targeted write: the other columns are untouched.
    assert.deepEqual(sessionRow(db), {
      conversation_id: "conv-1",
      mirror_active: 1,
      hook_injected: 0,
      persona: "writer",
      journey: "mirror",
    });
  } finally {
    db.close();
  }
});

test("runDoorman delta with no new persona: the line names the session's persona, no persona section, persona unchanged", async () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const result = await runDoorman(
      db,
      { kind: "delta", query: "what about the budget", persona: null },
      runInput(new CountingEmbeddingProvider(unitVector(0))),
    );
    assert.equal(
      result.stdout.split("\n")[0],
      `${DELIVERED_LINE_PREFIX}: delta (persona: cfo · journey: mirror) — answer as the mirror; sign ◇ cfo ===`,
    );
    assert.doesNotMatch(result.stdout, /=== persona\//);
    assert.equal(sessionRow(db)?.persona, "cfo");
  } finally {
    db.close();
  }
});

test("runDoorman delta with nothing under it prints the line alone", async () => {
  const { db } = fixture();
  try {
    db.prepare("DELETE FROM memories").run();
    db.prepare("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')").run();
    db.prepare("DELETE FROM attachments").run();
    activate(db, null, "mirror");
    const result = await runDoorman(
      db,
      { kind: "delta", query: "tell me more", persona: null },
      runInput(new CountingEmbeddingProvider(unitVector(0))),
    );
    assert.equal(
      result.stdout,
      `${DELIVERED_LINE_PREFIX}: delta (persona: none · journey: mirror) — answer as the mirror ===\n`,
    );
  } finally {
    db.close();
  }
});

// --- the memory threshold (CV9.DS8.US5) ------------------------------------------
//
// DS8's policy injects the memories relevant to the prompt "when any score above
// the threshold". The threshold is on the semantic score the ranker reports, the
// rule `relevantAttachments` already applies to attachments: the hybrid score
// floors near 0.35 for a fresh, reinforced memory with no match at all.

test("runDoorman delta: memories under the semantic threshold are logged, not rendered", async () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const scores: MemoryScore[][] = [];
    // A query on an axis no memory shares: both score 0 semantically.
    const result = await runDoorman(
      db,
      { kind: "delta", query: "something else entirely", persona: null },
      runInput(new CountingEmbeddingProvider(unitVector(2)), scores),
    );
    assert.match(result.stdout, /^=== mirror context delivered/);
    assert.doesNotMatch(result.stdout, /=== relevant memories ===|Near memory|Far memory/);
    assert.equal(scores.length, 1);
    assert.equal(scores[0]?.length, 2, "both ranked memories reached the log");
    assert.ok(scores[0]?.every((s) => s.semantic === 0 && s.score > 0));
  } finally {
    db.close();
  }
});

test("runDoorman delta: a memory exactly at the threshold is rendered; one under it is not", async () => {
  const { db } = fixture();
  try {
    // |[2, 4, 2, 1]| = 5 and the query is the unit vector on axis 0: cosine 2/5,
    // exact in Float32 and in the division, so the boundary is tested, not a
    // neighbour of it.
    const edge = Array(DIMENSIONS).fill(0);
    edge[0] = 2;
    edge[1] = 4;
    edge[2] = 2;
    edge[3] = 1;
    db.prepare(
      `INSERT INTO memories (id, memory_type, layer, title, content, journey, created_at, embedding)
       VALUES ('m-edge', 'insight', 'ego', 'Edge memory', 'at the threshold', 'mirror', '2026-10-01T00:00:00Z', ?)`,
    ).run(float32Blob(edge));
    db.prepare("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')").run();
    activate(db, "cfo", "mirror");
    const scores: MemoryScore[][] = [];
    const result = await runDoorman(
      db,
      { kind: "delta", query: "drafting", persona: null },
      runInput(new CountingEmbeddingProvider(unitVector(0)), scores),
    );
    assert.equal(DOORMAN_MEMORY_SEMANTIC_THRESHOLD, 0.4);
    assert.match(result.stdout, /=== relevant memories ===\n/);
    assert.match(result.stdout, /\[ego\] Near memory/);
    assert.match(result.stdout, /\[ego\] Edge memory/);
    assert.doesNotMatch(result.stdout, /Far memory/);
    assert.deepEqual(scores[0]?.map((s) => s.semantic).sort(), [0, 0.4, 1]);
  } finally {
    db.close();
  }
});

test("runDoorman delta without a provider: FTS memories, no attachments, no throw, line present", async () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const result = await runDoorman(
      db,
      { kind: "delta", query: "drafting articles", persona: "writer" },
      runInput(new FailingEmbeddingProvider()),
    );
    assert.match(result.stdout, /^=== mirror context delivered/);
    assert.match(result.stdout, /=== persona\/writer ===/);
    assert.match(result.stdout, /\[ego\] Near memory/);
    assert.doesNotMatch(result.stdout, /Far memory|relevant attachments/);
    // The failed attempt is in the ledger, as the search ledger records one.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM llm_calls").get()?.n, 1);
  } finally {
    db.close();
  }
});

test("runDoorman delta with no provider at all behaves as degraded", async () => {
  const { db } = fixture();
  try {
    activate(db, "cfo", "mirror");
    const result = await runDoorman(
      db,
      { kind: "delta", query: "drafting articles", persona: null },
      runInput(undefined),
    );
    assert.match(result.stdout, /\[ego\] Near memory/);
    assert.doesNotMatch(result.stdout, /relevant attachments/);
  } finally {
    db.close();
  }
});
