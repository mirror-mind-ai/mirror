import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { deactivateMirrorState, logMirrorResponse, runMirrorLoad } from "#mirror/orchestration.ts";

const golden = JSON.parse(
  readFileSync(new URL("../goldens/mirror-state.golden.json", import.meta.url), "utf8"),
) as { sessions: unknown[]; conversations: unknown[]; messages: unknown[] };

test("TS Mirror load/log/deactivate state reproduces the normalized Python oracle", async () => {
  const dir = mkdtempSync("/tmp/mirror-state-golden-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  createRuntimeTables(db);
  db.exec(`
    CREATE TABLE identity_descriptors (layer TEXT, key TEXT, descriptor TEXT, generated_at TEXT, PRIMARY KEY(layer,key));
    CREATE TABLE attachments (id TEXT PRIMARY KEY, journey_id TEXT, name TEXT, description TEXT, content TEXT, embedding BLOB, created_at TEXT);
  `);
  const insert = db.prepare(
    "INSERT INTO identity (id,layer,key,content,created_at,updated_at) VALUES (?,?,?,?,'t','t')",
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
      (session_id,interface,started_at,updated_at) VALUES ('state-session','pi','t0','t0')`,
  ).run();
  let id = 0;
  let time = 0;
  const newId = () => `id-${++id}`;
  const nowIso = () => `2026-01-01T00:00:0${time++}.000000Z`;

  await runMirrorLoad(db, {
    identity: "fixture",
    persona: "engineer",
    journey: "mirror-ts-core",
    sessionId: "state-session",
    receptionEnabled: false,
    newId,
    nowIso,
  });
  logMirrorResponse(db, {
    summary: "First sentence. More detail.",
    sessionId: "state-session",
    muted: false,
    newId,
    nowIso,
  });
  deactivateMirrorState(db, "state-session", nowIso());

  const sessionRows = db
    .prepare(
      `SELECT session_id,conversation_id,interface,mirror_active,persona,journey,
              hook_injected,active,closed_at,metadata
       FROM runtime_sessions
       WHERE session_id IN ('state-session','__global_operating_mode__','__global_sticky_defaults__')
       ORDER BY session_id`,
    )
    .all();
  const conversationId = String(
    sessionRows.find((row) => row.session_id === "state-session")?.conversation_id,
  );
  const normalizeMetadata = (value: unknown) =>
    typeof value === "string" ? JSON.parse(value) : null;
  const sessions = sessionRows.map((row) => ({
    session_id: row.session_id,
    conversation_id: row.conversation_id ? "<conversation-1>" : null,
    interface: row.interface,
    mirror_active: row.mirror_active,
    persona: row.persona,
    journey: row.journey,
    hook_injected: row.hook_injected,
    active: row.active,
    closed_at: row.closed_at,
    metadata: normalizeMetadata(row.metadata),
  }));
  const conversations = db
    .prepare("SELECT title,ended_at,interface,persona,journey FROM conversations WHERE id=?")
    .all(conversationId)
    .map((row) => ({ id: "<conversation-1>", ...row }));
  const messages = db
    .prepare(
      "SELECT role,content,token_count,metadata FROM messages WHERE conversation_id=? ORDER BY created_at",
    )
    .all(conversationId)
    .map((row) => ({
      conversation_id: "<conversation-1>",
      role: row.role,
      content: row.content,
      token_count: row.token_count,
      metadata: normalizeMetadata(row.metadata),
    }));

  assert.deepEqual({ sessions, conversations, messages }, golden);
  db.close();
});
