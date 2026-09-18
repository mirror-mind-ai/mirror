import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GOLDEN, seededDatabase, seededPath } from "./support/fixture.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = join(HERE, "..", "..", "src", "mcp", "main.ts");

/**
 * The whole surface, end to end, the way a client drives it.
 *
 * The golden carries the exact stdin the REAL Python server was fed and the
 * exact stdout it produced, on a database seeded from the same ordered seed
 * this test seeds. So this compares two processes, not two function calls —
 * framing, dispatch, and every tool payload in one diff.
 *
 * Only deterministic tool calls appear: a `query` would need a live provider on
 * both sides, and the replayed query path is graded case-by-case elsewhere.
 */
test("both engines answer the same transcript with identical bytes", async () => {
  const db = seededDatabase();
  const dbPath = seededPath(db);
  db.close();

  const run = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DB_PATH: dbPath,
        MEMORY_ENV: "test",
        MIRROR_MCP_VERSION: GOLDEN.frozen_version ?? "0.0.0-golden",
      };
      // Bare node, as an MCP client spawns it: no NODE_OPTIONS to silence
      // node:sqlite's ExperimentalWarning into something stderr never sees.
      delete env.NODE_OPTIONS;
      delete env.MIRROR_HOME;
      delete env.MIRROR_USER;
      const child = spawn(process.execPath, [MAIN], { cwd: join(HERE, "..", ".."), env });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => (stdout += chunk));
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ stdout, stderr, code }));
      child.stdin.write(GOLDEN.transcript.stdin);
      child.stdin.end();
    },
  );

  assert.equal(run.stderr, "", "stderr is the client's log and must stay empty");
  assert.equal(run.code, GOLDEN.transcript.exit_code);
  assert.deepEqual(run.stdout.split("\n").filter(Boolean), GOLDEN.transcript.stdout_lines);
});
