// CV22.DS7.US5 slice A / US10 slice F — CLI dispatch and stdout contract.
//
// The strangler's unit is `command + args -> stdout`, so these grade the
// output strings and exit codes of `conversation_logger.main()` for every
// subcommand of the family, plus the fallback boundary: an LLM-tail subcommand
// whose replay transport is not configured must report `handled: false` so
// the front door falls back to Python. `repair-journeys --apply` refuses, as
// Python does, when no backup is available (CV22.DS7.TS1 wires the zip).

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { logAssistantMessage, logUserMessage } from "#conversation/logger.ts";
import { runConversationLoggerCommand } from "#conversation/loggerCli.ts";
import { createLoggerRuntime, type LoggerRuntimeEnv } from "#conversation/loggerRuntime.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { CODEX_DIR } from "#helpers/backfillFixture.ts";
import { EMBEDDING_DIMENSIONS } from "#providers/embedding.ts";
import type { LlmProvider, LlmRequest, LlmResponse } from "#providers/llm.ts";

const NOW = "2026-09-02T12:00:00.000000Z";
let idCounter = 0;
const deps = {
  newId: () => {
    idCounter += 1;
    return `cli${String(idCounter).padStart(5, "0")}`;
  },
  nowIso: () => NOW,
};

class StubProvider implements LlmProvider {
  readonly calls: LlmRequest[] = [];
  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const content =
      request.role === "conversation_title"
        ? "A generated title"
        : request.role === "conversation_tags"
          ? '["alpha"]'
          : request.role === "conversation_summary" || request.role === "summary"
            ? "A summary."
            : "[]";
    return { content, model: "fixture-model", promptTokens: 11, completionTokens: 7, latencyMs: 3 };
  }
}

interface Fixture {
  db: WritableDatabase;
  home: string;
  llm: StubProvider;
  /** The runtime as the front door builds it, with the replay loaders stubbed. */
  runtime: (env?: LoggerRuntimeEnv) => ReturnType<typeof createLoggerRuntime>;
}

/** The real schema: `session-start` runs the extraction pipeline for real. */
function fixture(): Fixture {
  const home = mkdtempSync("/tmp/logger-cli-");
  const db = bootstrapDatabase(join(home, "memory.db"));
  const llm = new StubProvider();
  const runtime = (env: LoggerRuntimeEnv = {}) =>
    createLoggerRuntime({
      db,
      mirrorHome: home,
      homeDir: home,
      env,
      deps,
      loadLlm: async () => llm,
      loadEmbeddings: async () => ({
        embed: async () => Array<number>(EMBEDDING_DIMENSIONS).fill(0),
      }),
      monotonic: () => 0,
    });
  return { db, home, llm, runtime };
}

/** The environment under which the LLM tail is configured. */
const REPLAY_ENV: LoggerRuntimeEnv = {
  MIRROR_TS_CONVERSATION_LLM_REPLAY: "/replay/llm.json",
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/replay/embedding.json",
  PI_SESSIONS_DIR: "/absent/pi-sessions",
};

function run(f: Fixture, argv: string[], options: { stdin?: string; env?: LoggerRuntimeEnv } = {}) {
  return runConversationLoggerCommand(f.db, argv, f.runtime(options.env), { stdin: options.stdin });
}

/** Narrow to the handled branch so tests can grade stdout/exitCode directly. */
async function runHandled(
  f: Fixture,
  argv: string[],
  options: { stdin?: string; env?: LoggerRuntimeEnv } = {},
) {
  const result = await run(f, argv, options);
  if (!result.handled) {
    throw new Error(`expected TS to handle: ${JSON.stringify(argv)}`);
  }
  return result;
}

// --- mute / unmute / status stdout contract ---

test("mute, unmute, and status emit the released strings", async () => {
  const f = fixture();
  assert.deepEqual(await run(f, ["mute"]), {
    handled: true,
    stdout: ["Conversation logging MUTED."],
    stderr: [],
    exitCode: 0,
  });
  assert.deepEqual((await runHandled(f, ["status"])).stdout, ["MUTED"]);
  assert.deepEqual((await runHandled(f, ["unmute"])).stdout, ["Conversation logging ACTIVE."]);
  assert.deepEqual((await runHandled(f, ["status"])).stdout, ["ACTIVE"]);
  f.db.close();
});

// --- option parsing parity ---

test("a --mirror-home without a value fails with the released error and exit 1", async () => {
  const f = fixture();
  assert.deepEqual(await run(f, ["status", "--mirror-home"]), {
    handled: true,
    stdout: [],
    stderr: ["Error: --mirror-home requires a path"],
    exitCode: 1,
  });
  f.db.close();
});

test("a --session-id without a value fails with the released error and exit 1", async () => {
  const f = fixture();
  assert.deepEqual((await runHandled(f, ["switch", "--session-id"])).exitCode, 1);
  f.db.close();
});

test("no subcommand exits 1 silently; an unknown one exits 0 silently, as Python's main() does", async () => {
  const f = fixture();
  assert.deepEqual(await run(f, []), { handled: true, stdout: [], stderr: [], exitCode: 1 });
  assert.deepEqual(await run(f, ["no-such-subcommand"]), {
    handled: true,
    stdout: [],
    stderr: [],
    exitCode: 0,
  });
  f.db.close();
});

// --- the fallback boundary ---

test("LLM-tail subcommands fall back when the replay transport is unconfigured", async () => {
  const f = fixture();
  logUserMessage(f.db, "s1", "hello", { interface: "pi" }, deps);
  for (const argv of [
    ["switch", "--session-id", "s1"],
    ["session-end-pi", "s1"],
    ["session-end"],
    ["session-start"],
    ["session-maintenance"],
  ]) {
    assert.deepEqual(await run(f, argv), { handled: false }, argv.join(" "));
  }
  // Half-configured is unconfigured: both fixtures are required.
  assert.deepEqual(
    await run(f, ["session-maintenance"], {
      env: { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/replay/llm.json" },
    }),
    { handled: false },
  );
  // Nothing was ended or closed by the refused attempts.
  assert.equal(
    f.db.prepare("SELECT active FROM runtime_sessions WHERE session_id = 's1'").get()?.active,
    1,
  );
  f.db.close();
});

test("repair-journeys --apply with nothing to repair needs no backup and reports zero", async () => {
  const f = fixture();
  assert.deepEqual(await run(f, ["repair-journeys", "--apply"]), {
    handled: true,
    stdout: ["Repaired: 0"],
    stderr: [],
    exitCode: 0,
  });
  f.db.close();
});

test("repair-journeys --apply refuses when the runtime has no backup, and prints the backup's lines first when it has one", async () => {
  const f = fixture();
  // A journeyless conversation whose first user message names a journey.
  f.db
    .prepare(
      "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, 'journey', ?, ?, ?, ?)",
    )
    .run(
      "j-1",
      "alpha-one",
      "# Alpha One\n",
      "2026-09-03T12:00:00.000000Z",
      "2026-09-03T12:00:00.000000Z",
    );
  f.db
    .prepare(
      "INSERT INTO conversations (id, interface, journey, title, started_at) VALUES (?, 'pi', NULL, NULL, ?)",
    )
    .run("conv-a", "2026-09-03T10:00:00.000000Z");
  f.db
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)",
    )
    .run("conv-a-m00", "conv-a", "/mm-build alpha-one", "2026-09-03T10:00:01.000000Z");

  // No backup wired (this fixture's runtime): the repair refuses, like Python
  // when backup() returns None, and the row is untouched.
  await assert.rejects(
    run(f, ["repair-journeys", "--apply"]),
    /Database backup failed; refusing to repair/,
  );
  assert.equal(
    f.db.prepare("SELECT journey FROM conversations WHERE id = 'conv-a'").get()?.journey,
    null,
  );

  // With a backup wired, its progress lines come before the findings.
  const runtime = createLoggerRuntime({
    db: f.db,
    mirrorHome: f.home,
    homeDir: f.home,
    env: {},
    deps,
    backup: (stdout) => {
      stdout("Backup created: memory_20260907_140305.zip (1 KB)");
      return "/tmp/memory_20260907_140305.zip";
    },
  });
  const result = await runConversationLoggerCommand(
    f.db,
    ["repair-journeys", "--apply"],
    runtime,
    {},
  );
  assert.equal(result.handled, true);
  assert.deepEqual(result.handled && result.stdout.slice(0, 2), [
    "Backup created: memory_20260907_140305.zip (1 KB)",
    "Repaired: 1",
  ]);
  assert.equal(
    f.db.prepare("SELECT journey FROM conversations WHERE id = 'conv-a'").get()?.journey,
    "alpha-one",
  );
  f.db.close();
});

// --- logging subcommands ---

test("log-user writes a message and honours --interface", async () => {
  const f = fixture();
  const result = await runHandled(f, ["log-user", "s1", "hello", "--interface", "pi"]);
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 1);
  assert.equal(f.db.prepare("SELECT interface FROM conversations").get()?.interface, "pi");
  f.db.close();
});

test("log-assistant defaults the interface to claude_code", async () => {
  const f = fixture();
  await run(f, ["log-assistant", "s1", "reply"]);
  assert.equal(f.db.prepare("SELECT interface FROM conversations").get()?.interface, "claude_code");
  f.db.close();
});

test("log-user with fewer than two positional arguments writes nothing", async () => {
  const f = fixture();
  await runHandled(f, ["log-user", "s1"]);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  f.db.close();
});

// --- user-prompt hook through the CLI ---

test("user-prompt reads the payload from stdin and stays silent", async () => {
  const f = fixture();
  const result = await runHandled(f, ["user-prompt"], {
    stdin: JSON.stringify({ session_id: "s1", prompt: "hello" }),
  });
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 1);
  f.db.close();
});

test("user-prompt with malformed stdin still exits 0 and writes nothing", async () => {
  const f = fixture();
  const result = await runHandled(f, ["user-prompt"], { stdin: "{{{" });
  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  f.db.close();
});

// --- discard-current stdout contract ---

test("discard-current reports the discarded conversation id", async () => {
  const f = fixture();
  logUserMessage(f.db, "s1", "discard me", { interface: "pi" }, deps);
  const conversationId = String(
    f.db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 's1'").get()
      ?.conversation_id,
  );

  const result = await runHandled(f, ["discard-current", "--session-id", "s1"]);

  assert.deepEqual(result.stdout, [`Discarded current conversation: ${conversationId}`]);
  f.db.close();
});

test("discard-current reports the empty case with the released string", async () => {
  const f = fixture();
  assert.deepEqual((await runHandled(f, ["discard-current"])).stdout, [
    "No current conversation to discard.",
  ]);
  f.db.close();
});

// --- --mirror-home targeting (parity with the Python fix, CV22.DS7.US5) ---

test("--mirror-home overrides the ambient home for the hook's mute gate", async () => {
  const f = fixture();
  const explicitHome = mkdtempSync("/tmp/logger-cli-explicit-");
  // Mute only the explicit home; the ambient one stays active.
  await runHandled(f, ["mute", "--mirror-home", explicitHome]);

  const result = await runHandled(f, ["user-prompt", "--mirror-home", explicitHome], {
    stdin: JSON.stringify({ session_id: "s1", prompt: "must not be logged" }),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM messages").get()?.c, 0);
  f.db.close();
});

test("status reads mute state from --mirror-home, not the ambient home", async () => {
  const f = fixture();
  const explicitHome = mkdtempSync("/tmp/logger-cli-explicit-");
  await runHandled(f, ["mute", "--mirror-home", explicitHome]);

  assert.deepEqual((await runHandled(f, ["status"])).stdout, ["ACTIVE"]);
  assert.deepEqual((await runHandled(f, ["status", "--mirror-home", explicitHome])).stdout, [
    "MUTED",
  ]);
  f.db.close();
});

// --- slice F: switch / session-end-pi / session-end ---

test("switch closes the bound conversation through the close tail and reports the new id", async () => {
  const f = fixture();
  // Four turns under a journey: enough for the close tail to extract and to
  // finalize title, tags, and summary through the stub.
  logUserMessage(f.db, "s1", "first question about the port", { interface: "pi" }, deps);
  logAssistantMessage(f.db, "s1", "first answer", { interface: "pi" }, deps);
  logUserMessage(f.db, "s1", "second question", { interface: "pi" }, deps);
  logAssistantMessage(f.db, "s1", "second answer", { interface: "pi" }, deps);
  const oldId = String(
    f.db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 's1'").get()
      ?.conversation_id,
  );
  f.db.prepare("UPDATE conversations SET journey = 'alpha-one' WHERE id = ?").run(oldId);

  const result = await runHandled(f, ["switch", "--session-id", "s1"], { env: REPLAY_ENV });

  const newId = String(
    f.db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 's1'").get()
      ?.conversation_id,
  );
  assert.notEqual(newId, oldId);
  assert.deepEqual(result.stdout, [`New conversation created: ${newId}`]);
  assert.equal(
    f.db.prepare("SELECT ended_at FROM conversations WHERE id = ?").get(oldId)?.ended_at,
    NOW,
  );
  // Extraction and close-time finalization both ran under the stub, and every
  // model call landed in the ledger against the closed conversation, in order.
  const roles = f.llm.calls.map((call) => call.role);
  assert.ok(roles.includes("extraction") && roles.includes("conversation_title"), roles.join());
  const ledger = f.db
    .prepare(
      "SELECT role, model, prompt_tokens, completion_tokens, latency_ms, cost_usd, conversation_id " +
        "FROM llm_calls WHERE role != 'embedding' ORDER BY rowid",
    )
    .all();
  assert.deepEqual(
    ledger.map((row) => row.role),
    roles,
  );
  assert.deepEqual(ledger[0], {
    role: "extraction",
    model: "fixture-model",
    prompt_tokens: 11,
    completion_tokens: 7,
    latency_ms: 3,
    cost_usd: null,
    conversation_id: oldId,
  });
  f.db.close();
});

test("switch without any resolvable session reports the released string", async () => {
  const f = fixture();
  assert.deepEqual((await runHandled(f, ["switch"], { env: REPLAY_ENV })).stdout, [
    "No active session found.",
  ]);
  f.db.close();
});

test("switch resolves the session from MIRROR_SESSION_ID when no --session-id is given", async () => {
  const f = fixture();
  logUserMessage(f.db, "env-session", "first", { interface: "pi" }, deps);
  const result = await runHandled(f, ["switch"], {
    env: { ...REPLAY_ENV, MIRROR_SESSION_ID: "env-session" },
  });
  assert.match(result.stdout[0] ?? "", /^New conversation created: /);
  f.db.close();
});

test("session-end-pi ends the named session without extraction and prints nothing", async () => {
  const f = fixture();
  logUserMessage(f.db, "s1", "first", { interface: "pi" }, deps);

  const result = await runHandled(f, ["session-end-pi", "s1"], { env: REPLAY_ENV });

  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(
    f.db.prepare("SELECT active FROM runtime_sessions WHERE session_id = 's1'").get()?.active,
    0,
  );
  assert.ok(!f.llm.calls.some((call) => call.role === "extraction"), "extract=False");
  // Without a session argument Python does nothing at all.
  assert.deepEqual(await runHandled(f, ["session-end-pi"], { env: REPLAY_ENV }), {
    handled: true,
    stdout: [],
    stderr: [],
    exitCode: 0,
  });
  f.db.close();
});

test("session-end reads the hook payload from stdin, ends the session, and stays silent", async () => {
  const f = fixture();
  logUserMessage(f.db, "s1", "first", { interface: "claude_code" }, deps);

  const result = await runHandled(f, ["session-end"], {
    env: REPLAY_ENV,
    stdin: JSON.stringify({ session_id: "s1" }),
  });

  assert.deepEqual(result, { handled: true, stdout: [], stderr: [], exitCode: 0 });
  assert.equal(
    f.db.prepare("SELECT active FROM runtime_sessions WHERE session_id = 's1'").get()?.active,
    0,
  );
  f.db.close();
});

// --- slice F: session-start / session-maintenance ---

test("session-start --fast unmutes and defers maintenance", async () => {
  const f = fixture();
  await runHandled(f, ["mute"]);
  // Deterministic: no replay configuration is needed.
  const result = await runHandled(f, ["session-start", "--fast"]);
  assert.deepEqual(result.stdout, ["Conversation logging ACTIVE. Maintenance deferred."]);
  assert.deepEqual((await runHandled(f, ["status"])).stdout, ["ACTIVE"]);
  f.db.close();
});

test("session-start and session-maintenance render the report with the injected clock", async () => {
  const f = fixture();
  const start = await runHandled(f, ["session-start"], { env: REPLAY_ENV });
  assert.deepEqual(start.stdout, [
    [
      "Conversation logging ACTIVE.",
      "Conversation maintenance complete.",
      "Closed stale conversations: 0 (0.0s)",
      "Backfilled Pi sessions: 0 (0.0s)",
      "Retitled pending conversations: 0 (0.0s)",
      "Extracted pending conversations: 0 (0.0s)",
    ].join("\n"),
  ]);
  const maintenance = await runHandled(f, ["session-maintenance"], { env: REPLAY_ENV });
  assert.deepEqual(maintenance.stdout, [
    [
      "Conversation maintenance complete.",
      "Closed stale conversations: 0 (0.0s)",
      "Backfilled Pi sessions: 0 (0.0s)",
      "Retitled pending conversations: 0 (0.0s)",
      "Extracted pending conversations: 0 (0.0s)",
    ].join("\n"),
  ]);
  f.db.close();
});

// --- slice F: diagnose-journeys / repair-journeys ---

test("diagnose-journeys and a dry-run repair render the findings and the dry-run notice", async () => {
  const f = fixture();
  f.db
    .prepare(
      "INSERT INTO identity (layer, key, content, created_at, updated_at) " +
        "VALUES ('journey', 'alpha-one', ?, ?, ?)",
    )
    .run("# Alpha One\n\nDescription.\n", NOW, NOW);
  logUserMessage(f.db, "s1", "/mm-build alpha-one", { interface: "pi" }, deps);
  const conversationId = String(
    f.db.prepare("SELECT conversation_id FROM runtime_sessions WHERE session_id = 's1'").get()
      ?.conversation_id,
  );
  f.db.prepare("UPDATE conversations SET journey = NULL WHERE id = ?").run(conversationId);

  const diagnose = await runHandled(f, ["diagnose-journeys"]);
  assert.deepEqual(diagnose.stdout, [
    "Repair candidates: 1",
    `- ${conversationId} -> alpha-one (explicit build command; 1 messages; ${NOW}; /mm-build alpha-one)`,
  ]);

  const repair = await runHandled(f, ["repair-journeys", "--limit", "5"]);
  assert.deepEqual(repair.stdout, [
    ...diagnose.stdout,
    "Dry run only. Re-run with --apply to repair after reviewing candidates.",
  ]);
  // The dry run wrote nothing.
  assert.equal(
    f.db.prepare("SELECT journey FROM conversations WHERE id = ?").get(conversationId)?.journey,
    null,
  );
  f.db.close();
});

test("--limit without a value and a non-integer --limit fail with exit 1", async () => {
  const f = fixture();
  assert.deepEqual(await run(f, ["diagnose-journeys", "--limit"]), {
    handled: true,
    stdout: [],
    stderr: ["Error: --limit requires a number"],
    exitCode: 1,
  });
  const bad = await runHandled(f, ["diagnose-journeys", "--limit", "five"]);
  assert.equal(bad.exitCode, 1);
  assert.match(bad.stderr[0] ?? "", /invalid literal for int\(\)/);
  f.db.close();
});

// --- slice F: backfill-codex-session ---

test("backfill-codex-session reports the released strings and honours --interface", async () => {
  const f = fixture();
  const valid = join(CODEX_DIR, "valid.jsonl");
  assert.deepEqual(
    (await runHandled(f, ["backfill-codex-session", valid, "--interface", "codex-cli"])).stdout,
    [`Backfilled 1 Codex session from ${valid}`],
  );
  assert.equal(
    f.db
      .prepare("SELECT interface FROM runtime_sessions WHERE session_id = 'codex-valid-0001'")
      .get()?.interface,
    "codex-cli",
  );
  // Already tracked now; and a missing file reports the same negative string.
  assert.deepEqual((await runHandled(f, ["backfill-codex-session", valid])).stdout, [
    `No new Codex session backfilled from ${valid}`,
  ]);
  const missing = join(f.home, "missing.jsonl");
  assert.deepEqual((await runHandled(f, ["backfill-codex-session", missing])).stdout, [
    `No new Codex session backfilled from ${missing}`,
  ]);
  // Without a path Python does nothing at all.
  assert.deepEqual(await runHandled(f, ["backfill-codex-session"]), {
    handled: true,
    stdout: [],
    stderr: [],
    exitCode: 0,
  });
  f.db.close();
});

test("session-maintenance backfills Pi sessions from PI_SESSIONS_DIR through the real port", async () => {
  const f = fixture();
  const sessionsDir = mkdtempSync("/tmp/logger-cli-pi-");
  writeFileSync(
    join(sessionsDir, "one.jsonl"),
    [
      '{"type":"message","message":{"role":"user","content":"hello from pi","timestamp":"2026-04-17T10:00:00Z"}}',
      '{"type":"message","message":{"role":"assistant","content":"hi","timestamp":"2026-04-17T10:00:01Z"}}',
    ].join("\n"),
  );
  const result = await runHandled(f, ["session-maintenance"], {
    env: { ...REPLAY_ENV, PI_SESSIONS_DIR: sessionsDir },
  });
  // Imported with a provisional title, then -- same run, next step -- retitled
  // through the stub, exactly as Python's maintenance order does.
  assert.ok(result.stdout[0]?.includes("Backfilled Pi sessions: 1 (0.0s)"), result.stdout[0]);
  assert.ok(result.stdout[0]?.includes("Retitled pending conversations: 1 (0.0s)"));
  const row = f.db.prepare("SELECT title, metadata FROM conversations").get();
  assert.equal(row?.title, "A generated title");
  assert.ok(String(row?.metadata).includes('"title_source": "startup_maintenance"'));
  f.db.close();
});
