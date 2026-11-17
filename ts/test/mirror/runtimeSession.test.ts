// CV9.DS8.TS2: the environment session reader and the targeted column update.

import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createRuntimeTables } from "#helpers/runtimeSchema.ts";
import { tempDir } from "#helpers/tempDir.ts";
import {
  environmentSessionId,
  getRuntimeSession,
  resolveRuntimeSessionId,
  updateRuntimeSessionColumns,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";

test("environmentSessionId: MIRROR_SESSION_ID, else CLAUDE_CODE_SESSION_ID, else CODEX_SESSION_ID, trimmed", () => {
  assert.equal(environmentSessionId({}), null);
  assert.equal(environmentSessionId({ MIRROR_SESSION_ID: "  " }), null);
  assert.equal(environmentSessionId({ CODEX_SESSION_ID: " codex-1 " }), "codex-1");
  assert.equal(
    environmentSessionId({ CLAUDE_CODE_SESSION_ID: "claude-1", CODEX_SESSION_ID: "codex-1" }),
    "claude-1",
  );
  assert.equal(
    environmentSessionId({
      MIRROR_SESSION_ID: "/path with space/session.jsonl",
      CLAUDE_CODE_SESSION_ID: "claude-1",
    }),
    "/path with space/session.jsonl",
  );
});

test("updateRuntimeSessionColumns: only the named columns move; a missing row is reported", () => {
  const db = openDatabaseCopyForWrite(join(tempDir("mirror-runtime-session-"), "copy.db"));
  try {
    createRuntimeTables(db);
    upsertRuntimeSession(
      db,
      "S",
      { interface: "pi", conversationId: "conv-1", mirrorActive: true, persona: "cfo" },
      "t0",
    );
    assert.equal(updateRuntimeSessionColumns(db, "S", {}, "t1"), false);
    assert.equal(updateRuntimeSessionColumns(db, "missing", { persona: "x" }, "t1"), false);
    assert.equal(updateRuntimeSessionColumns(db, "S", { persona: "writer" }, "t1"), true);
    assert.equal(updateRuntimeSessionColumns(db, "S", { metadata: '{"k": 1}' }, "t2"), true);
    const row = getRuntimeSession(db, "S");
    assert.deepEqual(
      {
        conversationId: row?.conversationId,
        mirrorActive: row?.mirrorActive,
        persona: row?.persona,
        metadata: row?.metadata,
        updatedAt: row?.updatedAt,
        interface: row?.interface,
      },
      {
        conversationId: "conv-1",
        mirrorActive: true,
        persona: "writer",
        metadata: '{"k": 1}',
        updatedAt: "t2",
        interface: "pi",
      },
    );
  } finally {
    db.close();
  }
});

test("a guessed session is never one whose Conversation a host owns (CR216)", () => {
  const db = openDatabaseCopyForWrite(join(tempDir("runtime-session-host-"), "copy.db"));
  try {
    createRuntimeTables(db);
    db.prepare(
      "INSERT INTO conversations (id, started_at, interface, journey, metadata) VALUES (?, 't', ?, ?, ?)",
    ).run("host-conv", "nautilus", "journey-host", '{"journey_authority": "host"}');
    db.prepare(
      "INSERT INTO conversations (id, started_at, interface, journey, metadata) VALUES (?, 't', ?, ?, ?)",
    ).run("broken-conv", "pi", "journey-pi", "not json");
    upsertRuntimeSession(db, "terminal", { interface: "pi", conversationId: "broken-conv" }, "t1");
    upsertRuntimeSession(db, "host", { interface: "nautilus", conversationId: "host-conv" }, "t2");
    assert.equal(resolveRuntimeSessionId(db, null, null), "terminal");
    // Named, it is still the host's session: only a name reaches it.
    assert.equal(resolveRuntimeSessionId(db, "host", null), "host");
  } finally {
    db.close();
  }
});
