// CR160 — `conversation-logger user-prompt` and `stop` take their payload as
// `--payload <json>` as well as on stdin.
//
// Pi's extension reaches the core through `pi.exec`, which has no way to write a
// child's stdin, and since CR160 it sends Pi's turns to the hooks' handlers
// (`user-prompt`, `stop`) instead of `log-user`/`log-assistant`. So the payload
// travels in argv, where Pi's prompt already travelled as `log-user`'s argument
// since CV9: the exposure is the one Pi always had, no wider (`stdinSource.ts`).
//
// Two properties: the payload is the one used, and a route given `--payload`
// never reads fd 0 -- a child whose stdin pipe nobody closes must still exit.
//
// Assertion messages never carry a payload (`hookPayloadRedaction.test.ts`).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap } from "#db/database.ts";

const BIN = fileURLToPath(new URL("../../../bin/mirror.js", import.meta.url));
const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratchHome(): string {
  const home = mkdtempSync(join(tmpdir(), "mirror-payload-"));
  roots.push(home);
  bootstrapDatabase(join(home, "memory.db")).close();
  return home;
}

interface Run {
  code: number | null;
  stdout: string;
  timedOut: boolean;
}

/** Run the front door with stdin left OPEN, as a pipe nobody writes or closes. */
function runWithOpenStdin(home: string, args: string[], timeoutMs = 20_000): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: {
        ...process.env,
        MEMORY_ENV: "production",
        MIRROR_HOME: home,
        MIRROR_USER: "",
        NODE_OPTIONS: "--no-warnings",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stdout, timedOut: true });
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, timedOut: false });
    });
  });
}

function messages(home: string): { role: string; content: string; metadata: string | null }[] {
  const db = openDatabaseForBootstrap(join(home, "memory.db"));
  try {
    return db
      .prepare("SELECT role, content, metadata FROM messages ORDER BY created_at, rowid")
      .all() as { role: string; content: string; metadata: string | null }[];
  } finally {
    db.close();
  }
}

test("user-prompt and stop use --payload, and never wait on stdin", async () => {
  const home = scratchHome();
  const prompt = await runWithOpenStdin(home, [
    "conversation-logger",
    "user-prompt",
    "--interface",
    "pi",
    "--payload",
    JSON.stringify({ session_id: "pi-s1", prompt: "what changed today?", turn_id: "t1" }),
  ]);
  assert.equal(prompt.timedOut, false, "user-prompt exited without stdin being closed");
  assert.equal(prompt.code, 0);

  const reply = await runWithOpenStdin(home, [
    "conversation-logger",
    "stop",
    "--interface",
    "pi",
    "--payload",
    JSON.stringify({ session_id: "pi-s1", turn_id: "t1", last_assistant_message: "Two commits." }),
  ]);
  assert.equal(reply.timedOut, false, "stop exited without stdin being closed");
  assert.equal(reply.code, 0);
  assert.equal(reply.stdout.trim(), "reply logged (turn_id)");

  assert.deepEqual(messages(home), [
    { role: "user", content: "what changed today?", metadata: '{"turn_id": "t1"}' },
    { role: "assistant", content: "Two commits.", metadata: '{"turn_id": "t1"}' },
  ]);
});

test("a skill sent through --payload is a command turn, and its reply an expected skip", async () => {
  const home = scratchHome();
  const prompt = await runWithOpenStdin(home, [
    "conversation-logger",
    "user-prompt",
    "--interface",
    "pi",
    "--payload",
    JSON.stringify({ session_id: "pi-s2", prompt: "/skill:mm-journeys", turn_id: "t1" }),
  ]);
  assert.equal(prompt.code, 0);
  const reply = await runWithOpenStdin(home, [
    "conversation-logger",
    "stop",
    "--interface",
    "pi",
    "--payload",
    JSON.stringify({ session_id: "pi-s2", turn_id: "t1", last_assistant_message: "a list" }),
  ]);
  assert.equal(reply.stdout.trim(), "reply skipped: command_turn");
  assert.equal(messages(home).length, 0);
});
