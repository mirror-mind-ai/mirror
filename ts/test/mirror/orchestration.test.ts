import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import {
  deactivateMirrorState,
  extensionBindingsCouldContribute,
  listActiveMirrorJourneys,
  logMirrorResponse,
  runMirrorLoad,
  titleFromSummary,
} from "#mirror/orchestration.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

function fixture() {
  const dir = mkdtempSync("/tmp/mirror-orchestration-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  db.exec(`
    CREATE TABLE identity_descriptors (layer TEXT, key TEXT, descriptor TEXT, generated_at TEXT, PRIMARY KEY(layer,key));
    CREATE TABLE attachments (id TEXT PRIMARY KEY, journey_id TEXT, name TEXT, description TEXT, content TEXT, embedding BLOB, created_at TEXT);
    CREATE TABLE _ext_bindings (extension_id TEXT, capability_id TEXT, target_kind TEXT, target_id TEXT);
    CREATE TABLE llm_calls (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL,
      response TEXT NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER,
      latency_ms INTEGER, cost_usd REAL, conversation_id TEXT, session_id TEXT, called_at TEXT NOT NULL
    );
  `);
  const insert = db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  );
  insert.run("1", "ego", "behavior", "Be useful");
  insert.run("2", "user", "identity", "User context");
  insert.run("3", "persona", "engineer", "Engineer context");
  insert.run(
    "4",
    "journey",
    "mirror-ts-core",
    "# Mirror TS Core\n**Status:** active\n\n## Description\nTS migration\n\n## End",
  );
  db.prepare(
    `INSERT INTO runtime_sessions
      (session_id, interface, started_at, updated_at)
     VALUES ('s1', 'pi', 't0', 't0')`,
  ).run();
  return db;
}

function ids() {
  let value = 0;
  return () => `id${++value}`;
}

function times() {
  let value = 0;
  return () => `2026-01-01T00:00:0${value++}.000000Z`;
}

test("mirror load composes context and persists mode, mirror, sticky, and conversation state", async () => {
  const db = fixture();
  const result = await runMirrorLoad(db, {
    identity: "mirror-dev",
    persona: "engineer",
    journey: "mirror-ts-core",
    sessionId: "s1",
    receptionEnabled: false,
    newId: ids(),
    nowIso: times(),
  });
  assert.match(result.stdout, /◌ {2}MIRROR MODE ACTIVE/);
  assert.match(result.stdout, /active journey/);
  assert.match(result.stdout, /=== persona\/engineer ===\nEngineer context/);
  assert.match(result.stdout, /=== journey\/mirror-ts-core ===/);
  assert.match(result.stderr, /⏺ Mirror Mode active/);
  assert.match(result.stderr, /✦ Persona: engineer/);
  const session = db.prepare("SELECT * FROM runtime_sessions WHERE session_id = 's1'").get();
  assert.equal(session?.mirror_active, 1);
  assert.equal(session?.hook_injected, 0);
  assert.equal(session?.persona, "engineer");
  assert.equal(session?.journey, "mirror-ts-core");
  assert.ok(session?.conversation_id);
  assert.equal(
    db
      .prepare("SELECT journey FROM conversations WHERE id = ?")
      .get(String(session?.conversation_id))?.journey,
    "mirror-ts-core",
  );
  assert.equal(
    db
      .prepare("SELECT active FROM runtime_sessions WHERE session_id = '__global_operating_mode__'")
      .get()?.active,
    1,
  );
  db.close();
});

test("reception replay is logged metadata-only", async () => {
  const db = fixture();
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      reception: {
        content: '{"personas":["engineer"],"journey":"mirror-ts-core","touches_identity":false}',
        model: "fixture-model",
      },
    },
  });
  await runMirrorLoad(db, {
    identity: "mirror-dev",
    query: "private routing query",
    sessionId: "s1",
    receptionEnabled: true,
    llmProvider: provider,
    embeddingProvider: { embed: async () => [1, 0] },
    newId: ids(),
    nowIso: times(),
  });
  const row = db.prepare("SELECT role,model,prompt,response,session_id FROM llm_calls").get();
  assert.deepEqual(row, {
    role: "reception",
    model: "fixture-model",
    prompt: "",
    response: "",
    session_id: "s1",
  });
  db.close();
});

test("mirror deactivate changes only session mirror state", () => {
  const db = fixture();
  db.prepare(
    "UPDATE runtime_sessions SET mirror_active = 1, hook_injected = 0 WHERE session_id = 's1'",
  ).run();
  deactivateMirrorState(db, "s1", "t1");
  const row = db
    .prepare("SELECT mirror_active, hook_injected FROM runtime_sessions WHERE session_id = 's1'")
    .get();
  assert.deepEqual(row, { mirror_active: 0, hook_injected: 1 });
  db.close();
});

test("mirror log is mute-aware and updates assistant message and summary title", () => {
  const db = fixture();
  const newId = ids();
  const nowIso = times();
  logMirrorResponse(db, {
    summary: "First sentence. More detail.",
    sessionId: "s1",
    muted: true,
    newId,
    nowIso,
  });
  assert.equal(db.prepare("SELECT COUNT(*) count FROM messages").get()?.count, 0);
  logMirrorResponse(db, {
    summary: "First sentence. More detail.",
    sessionId: "s1",
    muted: false,
    newId,
    nowIso,
  });
  assert.equal(
    db.prepare("SELECT content FROM messages").get()?.content,
    "First sentence. More detail.",
  );
  assert.equal(db.prepare("SELECT title FROM conversations").get()?.title, "First sentence");
  db.prepare("UPDATE runtime_sessions SET metadata = ? WHERE session_id = 's1'").run(
    JSON.stringify({ discard_current_conversation: true }),
  );
  logMirrorResponse(db, {
    summary: "Discarded title still updates. More detail.",
    sessionId: "s1",
    muted: false,
    newId,
    nowIso,
  });
  assert.equal(db.prepare("SELECT COUNT(*) count FROM messages").get()?.count, 1);
  assert.equal(
    db.prepare("SELECT title FROM conversations").get()?.title,
    "Discarded title still updates",
  );
  db.close();
});

test("journeys render only active entries", () => {
  const db = fixture();
  assert.equal(
    listActiveMirrorJourneys(db),
    "- **mirror-ts-core** — Mirror TS Core: TS migration\n",
  );
  db.close();
});

test("matching extension bindings force a conservative fallback", () => {
  const db = fixture();
  db.prepare("INSERT INTO _ext_bindings VALUES ('ext', 'ctx', 'journey', 'mirror-ts-core')").run();
  assert.equal(extensionBindingsCouldContribute(db, { journey: "mirror-ts-core" }), true);
  assert.equal(extensionBindingsCouldContribute(db, { journey: "other" }), true);
  assert.equal(extensionBindingsCouldContribute(db, { persona: "other", journey: "other" }), false);
  assert.equal(extensionBindingsCouldContribute(db, { query: "route me" }), true);
  db.close();
});

test("title truncation follows first-sentence and 60-character contract", () => {
  assert.equal(titleFromSummary("A title. ignored"), "A title");
  assert.equal(
    titleFromSummary(`${"word ".repeat(20)}. ignored`),
    "word word word word word word word word word word word word...",
  );
});
