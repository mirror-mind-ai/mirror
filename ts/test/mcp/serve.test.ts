import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createSchema } from "#db/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A database for the spawned server to open.
 *
 * `main.ts` opens its database eagerly, as Python's `serve()` does, so an
 * unconfigured install fails at startup instead of answering `initialize` and
 * then failing all seven tools. These tests therefore have to run the server
 * the way a client does -- with a real database -- rather than with none.
 */
function fixtureDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-mcp-serve-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const path = join(tmp, "copy.db");
  const db = openDatabaseCopyForWrite(path);
  try {
    createSchema(db);
  } finally {
    db.close();
  }
  return path;
}
const TS_ROOT = join(HERE, "..", "..");
const MAIN = join(TS_ROOT, "src", "mcp", "main.ts");
const TRANSCRIPT = join(TS_ROOT, "test", "fixtures", "mcp-framing.jsonl");
const GOLDEN = JSON.parse(
  readFileSync(join(TS_ROOT, "test", "goldens", "mcp-protocol.golden.json"), "utf-8"),
) as {
  frozen_version: string;
  framing: {
    stdout_lines: string[];
    stderr: string;
    exit_code: number;
    trailing_newline: boolean;
  };
};

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Spawn the entry point the way an MCP client does: bare `node`, a pipe on
 * stdio, and NO `NODE_OPTIONS`. The Mirror skills pass `--no-warnings`; a client
 * does not, which is exactly the condition under which `node:sqlite`'s
 * ExperimentalWarning would land in the client's log.
 */
function runServer(input: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MIRROR_MCP_VERSION: GOLDEN.frozen_version,
      DB_PATH: fixtureDatabasePath(),
      ...extraEnv,
    };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [MAIN], {
      cwd: TS_ROOT,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

test("framing parity: the recorded Python transcript produces identical bytes", async () => {
  const transcript = readFileSync(TRANSCRIPT, "utf-8");
  const run = await runServer(transcript);
  assert.deepEqual(run.stdout.split("\n").filter(Boolean), GOLDEN.framing.stdout_lines);
  assert.equal(run.stdout.endsWith("\n"), GOLDEN.framing.trailing_newline);
  assert.equal(run.code, GOLDEN.framing.exit_code);
});

test("stderr stays empty under bare node, as the client's log would see it", async () => {
  const run = await runServer(readFileSync(TRANSCRIPT, "utf-8"));
  assert.equal(run.stderr, "");
  assert.equal(run.stderr, GOLDEN.framing.stderr);
});

test("a large response survives immediate EOF (drain before exit)", async () => {
  // The shape `recall_conversation` produces: one very large line, then the
  // client closes stdin. On macOS stdout-to-a-pipe is asynchronous, so exiting
  // on end-of-input without draining truncates this line, and the model reads a
  // malformed tool result from a server that has already gone.
  const size = 1_000_000;
  const stubModule = join(TS_ROOT, "test", "mcp", "fixtures", "largeResponseServer.ts");
  const run = await new Promise<RunResult>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LARGE_RESPONSE_BYTES: String(size),
      DB_PATH: fixtureDatabasePath(),
    };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [stubModule], { cwd: TS_ROOT, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "__large" },
      })}\n`,
    );
    child.stdin.end();
  });

  assert.equal(run.code, 0);
  assert.equal(run.stderr, "");
  const lines = run.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "expected exactly one response line");
  const parsed = JSON.parse(lines[0]) as { result: { content: { text: string }[] } };
  assert.equal(parsed.result.content[0].text.length, size, "response was truncated");
});

test("a poisoned line cannot kill the server: later messages still answer", async () => {
  const input = [
    "not json",
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    "[1,2,3]",
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
  ].join("\n");
  const run = await runServer(`${input}\n`);
  const ids = run.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).id);
  assert.deepEqual(ids, [null, 1, null, 2]);
  assert.equal(run.code, 0);
});

test("an id of 0 is answered, not treated as a notification", async () => {
  // A client that sends id 0 and gets nothing back waits forever. This is the
  // failure a `||` on the id produces, and it is invisible in a happy-path demo.
  const run = await runServer(`${JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" })}\n`);
  const lines = run.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).id, 0);
});

test("neither arguments nor results reach any log sink", async () => {
  // RS005 sentinel: queries are agent-authored text and results are identity and
  // transcript content. stderr is the client's log for this server; a debugging
  // session must not become a disclosure.
  const secretArgument = "SENTINEL-ARGUMENT-e3f1a9";
  const input = `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "search_memories", arguments: { query: secretArgument } },
  })}\n`;
  const run = await runServer(input);
  assert.equal(run.stderr.includes(secretArgument), false, "argument leaked to stderr");
  assert.equal(run.stderr, "");
  // The refusal the stub handler produces must not echo the argument either.
  const payload = JSON.parse(run.stdout.split("\n").filter(Boolean)[0]);
  assert.equal(String(payload.result.content[0].text).includes(secretArgument), false);
});
