// The scripted journey (CV21.DS2 test guide): recorded payload shapes for
// each runtime, piped through the real wrappers into a scratch Mirror home.
//
// The live route gets two turns per runtime, which cannot show what changes
// between turns: a reply after a command turn, a repeat Stop, the session-end
// Stop Grok adds, and whether SessionEnd's transcript backfill doubles a
// reply the Stop hook already logged. This journey can, with no model call.
// The expected table is the test guide's, the same on every shape.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { openDatabaseReadOnly } from "#db/database.ts";
import { hookFailureFindings } from "#runtime/diagnose.ts";
import type { RuntimeStatusReport } from "#runtime/status.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const HOOKS = join(REPO_ROOT, ".claude", "hooks");
const roots: string[] = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface Shape {
  readonly label: string;
  readonly env: Record<string, string>;
  /** The payload for a prompt, as the runtime builds it. */
  readonly prompt: (session: string, turn: string, text: string) => Record<string, unknown>;
  /** The payload for a Stop, as the runtime builds it. */
  readonly stop: (session: string, turn: string | null, text: string) => Record<string, unknown>;
}

const SHAPES: Shape[] = [
  {
    // Claude Code 2.1.296's common hook input, read from the binary.
    label: "claude_code",
    env: {},
    prompt: (session, turn, text) => ({
      session_id: session,
      transcript_path: "",
      cwd: "/tmp",
      prompt_id: turn,
      permission_mode: "default",
      hook_event_name: "UserPromptSubmit",
      prompt: text,
    }),
    stop: (session, turn, text) => ({
      session_id: session,
      transcript_path: "",
      cwd: "/tmp",
      ...(turn ? { prompt_id: turn } : {}),
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: text,
    }),
  },
  {
    // Codex 0.162.1 (DS12.TS2 L11): session_id, turn_id, transcript_path,
    // last_assistant_message at Stop.
    label: "codex",
    env: {},
    prompt: (session, turn, text) => ({
      session_id: session,
      turn_id: turn,
      transcript_path: "/tmp/.codex/sessions/rollout.jsonl",
      hook_event_name: "UserPromptSubmit",
      prompt: text,
    }),
    stop: (session, turn, text) => ({
      session_id: session,
      ...(turn ? { turn_id: turn } : {}),
      transcript_path: "/tmp/.codex/sessions/rollout.jsonl",
      hook_event_name: "Stop",
      last_assistant_message: text,
    }),
  },
  {
    // Grok 1.0.52 (DS12.TS4 L8, and its guide): camelCase with snake aliases,
    // the runner's variables on every hook, promptId absent on session events.
    label: "grok_build",
    env: { GROK_HOOK_EVENT: "stop", GROK_SESSION_ID: "set-by-the-runner" },
    prompt: (session, turn, text) => ({
      hookEventName: "user_prompt_submit",
      hook_event_name: "UserPromptSubmit",
      sessionId: session,
      session_id: session,
      cwd: "/tmp",
      workspaceRoot: "/tmp",
      promptId: turn,
      prompt: text,
    }),
    stop: (session, turn, text) => ({
      hookEventName: "stop",
      hook_event_name: "Stop",
      sessionId: session,
      session_id: session,
      cwd: "/tmp",
      ...(turn ? { promptId: turn } : { reason: "session_end" }),
      stopHookActive: false,
      lastAssistantMessage: text,
    }),
  },
];

function run(
  home: string,
  shape: Shape,
  wrapper: string,
  payload: Record<string, unknown>,
): string {
  return execFileSync("bash", [join(HOOKS, wrapper)], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      DB_PATH: join(home, "memory.db"),
      MEMORY_ENV: "production",
      MIRROR_HOME: home,
      MIRROR_USER: "",
      MIRROR_NODE: process.execPath,
      OPENROUTER_API_KEY: "",
      ...shape.env,
    },
    input: JSON.stringify(payload),
    timeout: 60_000,
  });
}

describe("the scripted journey, per runtime shape", () => {
  for (const shape of SHAPES) {
    test(shape.label, () => {
      const home = mkdtempSync(join(tmpdir(), `mirror-journey-${shape.label}-`));
      roots.push(home);
      mkdirSync(home, { recursive: true });
      const session = `journey-${shape.label}`;
      const mirrorTurn = {
        claude_code: "/mirror-mind:mm-mirror should I raise my price?",
        codex: "$mirror-mind:mm:mirror should I raise my price?",
        grok_build: "/mm-mirror should I raise my price?",
      }[shape.label] as string;

      const outputs: string[] = [];
      const step = (wrapper: string, payload: Record<string, unknown>) =>
        outputs.push(run(home, shape, wrapper, payload));

      // 1. the Mirror turn, and its Stop
      step("log-user-prompt.sh", shape.prompt(session, "t1", mirrorTurn));
      step("log-assistant-reply.sh", shape.stop(session, "t1", "◇ cfo — raise it"));
      // 2. an ordinary turn, and its Stop
      step("log-user-prompt.sh", shape.prompt(session, "t2", "which tools can you see?"));
      step("log-assistant-reply.sh", shape.stop(session, "t2", "seven mirror-mind tools"));
      // 3. a repeat Stop for the same turn
      step("log-assistant-reply.sh", shape.stop(session, "t2", "seven mirror-mind tools"));
      // 4. a command turn, and its Stop
      step("log-user-prompt.sh", shape.prompt(session, "t3", "/mm-journeys"));
      step("log-assistant-reply.sh", shape.stop(session, "t3", "the journey list"));
      // Grok's shape: the session-end Stop, without promptId
      if (shape.label === "grok_build") {
        step("log-assistant-reply.sh", shape.stop(session, null, "the journey list"));
      }

      // Every wrapper printed nothing: a Stop hook that printed would keep
      // the agent working, and the prompt logger never had output.
      assert.deepEqual(
        outputs,
        outputs.map(() => ""),
      );

      const db = openDatabaseReadOnly(join(home, "memory.db"));
      try {
        const rows = db
          .prepare(
            "SELECT m.role, m.content, json_extract(m.metadata, '$.turn_id') AS turn, c.interface " +
              "FROM messages m JOIN conversations c ON c.id = m.conversation_id " +
              "ORDER BY m.created_at, m.rowid",
          )
          .all();
        assert.deepEqual(rows, [
          { role: "user", content: "should I raise my price?", turn: "t1", interface: shape.label },
          { role: "assistant", content: "◇ cfo — raise it", turn: "t1", interface: shape.label },
          { role: "user", content: "which tools can you see?", turn: "t2", interface: shape.label },
          {
            role: "assistant",
            content: "seven mirror-mind tools",
            turn: "t2",
            interface: shape.label,
          },
        ]);
        const sessionRow = db
          .prepare("SELECT interface FROM runtime_sessions WHERE session_id = ?")
          .get(session);
        assert.equal(sessionRow?.interface, shape.label, "the runtime session carries the label");
      } finally {
        db.close();
      }

      // Every skip in this journey is expected -- a command turn's reply, a
      // repeat Stop, Grok's session-end Stop -- so hooks.log, which
      // `runtime diagnose` reads as failures, holds nothing (Debt Review,
      // 2026-10-13: the first version wrote a line for the command turn).
      const logPath = join(home, "hooks.log");
      const log = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      assert.equal(log, "", "no hook wrote to hooks.log");
    });
  }

  test("runtime diagnose reports a reply lost to the race, and nothing for the expected skips", () => {
    const home = mkdtempSync(join(tmpdir(), "mirror-journey-diagnose-"));
    roots.push(home);
    const shape = SHAPES[0] as Shape;
    const session = "journey-diagnose";
    const findings = () =>
      hookFailureFindings({ db_path: join(home, "memory.db") } as RuntimeStatusReport, new Date());

    // Expected skips: a command turn's reply, and a Stop that names no turn.
    run(home, shape, "log-user-prompt.sh", shape.prompt(session, "t1", "/mm-journeys"));
    run(home, shape, "log-assistant-reply.sh", shape.stop(session, "t1", "the journey list"));
    run(home, shape, "log-assistant-reply.sh", shape.stop(session, null, "the journey list"));
    assert.deepEqual(findings(), [], "no warning for expected skips");

    // A reply whose turn was never seen: the prompt never reached Mirror.
    run(
      home,
      shape,
      "log-assistant-reply.sh",
      shape.stop(session, "t9", "a reply nobody asked for"),
    );
    const reported = findings();
    assert.equal(reported.length, 1);
    assert.match(reported[0]?.detail ?? "", /1 hook failure\(s\).*claude:stop/);
    const log = readFileSync(join(home, "hooks.log"), "utf8");
    assert.match(log, /claude:stop: reply skipped: nothing_waiting/);
    assert.doesNotMatch(log, /nobody asked/, "never the reply's text");
  });

  test("Claude Code's SessionEnd backfill does not double a reply the Stop hook logged", () => {
    const home = mkdtempSync(join(tmpdir(), "mirror-journey-backfill-"));
    roots.push(home);
    const shape = SHAPES[0] as Shape;
    const session = "journey-backfill";
    run(home, shape, "log-user-prompt.sh", shape.prompt(session, "t1", "a question"));
    run(home, shape, "log-assistant-reply.sh", shape.stop(session, "t1", "an answer"));

    // The transcript Claude Code would hand SessionEnd, holding the same answer.
    const transcript = join(home, "transcript.jsonl");
    const now = new Date().toISOString();
    writeFileSync(
      transcript,
      `${[
        JSON.stringify({
          type: "user",
          timestamp: now,
          message: { role: "user", content: "a question" },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: new Date(Date.now() + 1000).toISOString(),
          message: { role: "assistant", content: [{ type: "text", text: "an answer" }] },
        }),
      ].join("\n")}\n`,
    );
    run(home, shape, "log-session-end.sh", {
      session_id: session,
      transcript_path: transcript,
      hook_event_name: "SessionEnd",
      reason: "exit",
    });

    const db = openDatabaseReadOnly(join(home, "memory.db"));
    try {
      const rows = db
        .prepare("SELECT role, content FROM messages ORDER BY created_at, rowid")
        .all();
      assert.deepEqual(rows, [
        { role: "user", content: "a question" },
        { role: "assistant", content: "an answer" },
      ]);
      const ended = db.prepare("SELECT ended_at FROM conversations").get();
      assert.ok(ended?.ended_at, "SessionEnd closed the conversation");
    } finally {
      db.close();
    }
  });
});
