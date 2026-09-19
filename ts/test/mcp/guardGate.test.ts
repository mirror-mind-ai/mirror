// CV22.DS9.TS1 plateau 3 — the gate and the tunables, at process level.
//
// The unit tests grade the wrapper; this grades what a client actually launches: the gate
// parsed from the environment, the tunables resolved at startup, and the refusal arriving
// as an `isError` RESULT rather than a protocol error — because a protocol error looks to
// the client like a broken server, and the session would not survive it.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap } from "#db/database.ts";
import { MCP_LEDGER_SESSION } from "#mcp/guards.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_ROOT = join(HERE, "..", "..");
const MAIN = join(TS_ROOT, "src", "mcp", "main.ts");

interface RunResult {
  responses: Record<string, unknown>[];
  stderr: string;
  code: number | null;
}

function database(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-guard-gate-"));
  const path = join(dir, "memory.db");
  bootstrapDatabase(path).close();
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Pre-fill the window with attributed rows, so the guard's state is a fact of the
 * database rather than something this test has to spend money to create. */
function seedMcpCalls(dbPath: string, count: number): void {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    for (let index = 0; index < count; index += 1) {
      db.prepare(
        "INSERT INTO llm_calls (id, role, model, prompt, response, cost_usd, session_id, called_at) " +
          "VALUES (?, 'embedding', 'openai/text-embedding-3-small', '', '', 0.000002, ?, ?)",
      ).run(`seed-${index}`, MCP_LEDGER_SESSION, new Date().toISOString());
    }
  } finally {
    db.close();
  }
}

function run(
  dbPath: string,
  lines: unknown[],
  extraEnv: Record<string, string>,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DB_PATH: dbPath,
      MIRROR_MCP_VERSION: "0.0.0-test",
    };
    delete env.NODE_OPTIONS;
    for (const key of Object.keys(env))
      if (key.startsWith("MIRROR_MCP_") && key !== "MIRROR_MCP_VERSION") delete env[key];
    delete env.MIRROR_TS_MCP_GUARDS;
    Object.assign(env, extraEnv);
    const child = spawn(process.execPath, [MAIN], { cwd: TS_ROOT, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        responses: stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
        stderr,
        code,
      }),
    );
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
    child.stdin.end();
  });
}

const recall = (limit: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "recall_conversation", arguments: { conversation_id: "anything", limit } },
});

function toolText(response: Record<string, unknown>): { text: string; isError: boolean } {
  const result = response.result as { content: { text: string }[]; isError: boolean };
  return { text: result.content[0].text, isError: result.isError };
}

test("an out-of-range limit is refused as a result, not a protocol error", async () => {
  const fixture = database();
  try {
    const run1 = await run(fixture.path, [recall(0)], {});
    const [response] = run1.responses;
    assert.equal(response.error, undefined, "a protocol error would look like a broken server");
    const { text, isError } = toolText(response);
    assert.equal(isError, true);
    assert.match(text, /limit must be an integer from 1 to 200 \(received 0\)/);
    assert.equal(run1.code, 0, "the server survives a refusal and exits cleanly on EOF");
  } finally {
    fixture.cleanup();
  }
});

test("MIRROR_TS_MCP_GUARDS=0 restores the oracle's behaviour", async () => {
  const fixture = database();
  try {
    const guardsOff = await run(fixture.path, [recall(0)], { MIRROR_TS_MCP_GUARDS: "0" });
    const { text } = toolText(guardsOff.responses[0]);
    // The database has no conversations, so the tool's own "not found" surfaces -- which is
    // the point: the BOUNDARY no longer refuses, so the call reaches the tool.
    assert.doesNotMatch(text, /limit must be an integer/);
    assert.match(text, /no conversation matching/);
  } finally {
    fixture.cleanup();
  }
});

test("the rate limit refuses from ledger state alone, and the tunable moves it", async () => {
  const fixture = database();
  try {
    seedMcpCalls(fixture.path, 3);
    const search = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search_memories", arguments: { query: "anything" } },
    };

    const refused = await run(fixture.path, [search], { MIRROR_MCP_EMBED_RATE_LIMIT: "3" });
    const { text, isError } = toolText(refused.responses[0]);
    assert.equal(isError, true);
    assert.match(text, /rate-limited \(3 query searches in 10 minutes\)/);
    assert.match(text, /Do not send another query to this tool until the user replies\.$/);
    assert.match(refused.stderr, /guard refused tool=search_memories reason=rate_limit/);
    assert.doesNotMatch(refused.stderr, /anything/, "the query must never reach the log");

    // A larger limit lets the same state through -- proving the tunable is read, not that
    // the guard is simply off. The call then fails on the absent provider/key, which is a
    // different error and still not a rate refusal.
    const allowed = await run(fixture.path, [search], { MIRROR_MCP_EMBED_RATE_LIMIT: "4" });
    assert.doesNotMatch(toolText(allowed.responses[0]).text, /rate-limited/);
  } finally {
    fixture.cleanup();
  }
});

test("a malformed tunable fails the launch loudly instead of serving unguarded", async () => {
  const fixture = database();
  try {
    const result = await run(fixture.path, [recall(5)], { MIRROR_MCP_EMBED_RATE_LIMIT: "thirty" });
    assert.notEqual(
      result.code,
      0,
      "silently unguarded while the user believes otherwise is worse",
    );
    assert.match(result.stderr, /MIRROR_MCP_EMBED_RATE_LIMIT/);
    assert.equal(result.responses.length, 0);
  } finally {
    fixture.cleanup();
  }
});
