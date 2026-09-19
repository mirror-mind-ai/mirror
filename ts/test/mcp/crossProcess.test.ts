// CV22.DS9.TS1 plateau 4 — the guard is shared, not per process.
//
// This is the ai-engineer lens's dissent at the DS9 review, as behaviour: a user runs
// several MCP clients at once, so a guard whose state lives in process memory is bypassed
// by the second client and the ceiling is a belief. The state is rows in `llm_calls`, so
// two servers on one database draw on one budget — and this test fails for any
// implementation that caches the count in the process.

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

const SEARCH = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "search_memories", arguments: { query: "anything" } },
};

function askOneServer(dbPath: string, rateLimit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DB_PATH: dbPath,
      MIRROR_MCP_VERSION: "0.0.0-test",
      MIRROR_MCP_EMBED_RATE_LIMIT: String(rateLimit),
    };
    delete env.NODE_OPTIONS;
    delete env.MIRROR_TS_MCP_GUARDS;
    const child = spawn(process.execPath, [MAIN], { cwd: TS_ROOT, env, stdio: "pipe" });
    let stdout = "";
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const line = stdout.split("\n").filter(Boolean)[0];
      const result = JSON.parse(line).result as { content: { text: string }[] };
      resolve(result.content[0].text);
    });
    child.stdin.write(`${JSON.stringify(SEARCH)}\n`);
    child.stdin.end();
  });
}

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

test("a second MCP process sees the first's calls and is refused by the shared count", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-guard-xproc-"));
  const dbPath = join(dir, "memory.db");
  try {
    bootstrapDatabase(dbPath).close();
    // Two calls already made through some other client, and a limit of two.
    seedMcpCalls(dbPath, 2);

    // Two independent server processes, neither of which made those calls.
    const [first, second] = await Promise.all([askOneServer(dbPath, 2), askOneServer(dbPath, 2)]);

    for (const text of [first, second]) {
      assert.match(
        text,
        /rate-limited \(2 query searches in 10 minutes\)/,
        "a per-process counter would have given this server its own fresh budget",
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fresh process is allowed when the shared count is under the limit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-guard-xproc-ok-"));
  const dbPath = join(dir, "memory.db");
  try {
    bootstrapDatabase(dbPath).close();
    seedMcpCalls(dbPath, 1);
    // Under the limit: the call proceeds past the guard and fails later, on the absent
    // provider key -- a different error, which is exactly the distinction being asserted.
    const text = await askOneServer(dbPath, 2);
    assert.doesNotMatch(text, /rate-limited/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
