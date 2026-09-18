// CV22.DS9.TS2 plateau 2 — the server opens its database the way Python does.
//
// Python's `serve()` builds a MemoryClient, whose `get_connection` takes the
// bootstrap lock, runs migrations, and applies the schema DDL before the first
// line is read. US2's `main.ts` did none of that: it opened read-only and
// nothing else. A TS-authored migration still pending when a client spawned the
// server would have surfaced as a tool error on the first read that touched the
// new shape — where Python would have applied it and answered.
//
// The other half is `initialize`: Python reports the installed package version
// (0.31.x), TS reported "0.0.0" unless MIRROR_MCP_VERSION was exported, which
// only the parity harness does. A client would have seen the version change
// with the engine.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap } from "#db/database.ts";
import { TS_AUTHORED_MIGRATION_IDS } from "#db/schemaState.ts";
import { regressToPre017 } from "#helpers/legacyDb.ts";
import { versionFromPyproject } from "#runtime/version.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_ROOT = join(HERE, "..", "..");
const MAIN = join(TS_ROOT, "src", "mcp", "main.ts");
// Read from the source of truth rather than retyped: a hand-copied id that no
// migration carries would make the assertion below pass for the wrong reason.
const [TS_AUTHORED_017] = [...TS_AUTHORED_MIGRATION_IDS];

const INITIALIZE = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {},
})}\n`;

function freshDatabase(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-mcp-open-"));
  const dbPath = join(dir, "memory.db");
  bootstrapDatabase(dbPath).close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function migrationIds(dbPath: string): string[] {
  const db = openDatabaseForBootstrap(dbPath);
  try {
    return (db.prepare("SELECT id FROM _migrations ORDER BY id").all() as { id: string }[]).map(
      (row) => row.id,
    );
  } finally {
    db.close();
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Spawn the entry the way a client does: bare node, no NODE_OPTIONS. */
function runServer(dbPath: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // The ambient pin is cleared BEFORE the case's own environment is applied:
    // deleting afterwards would silently drop the explicit pin a case sets.
    const env: NodeJS.ProcessEnv = { ...process.env, DB_PATH: dbPath };
    delete env.NODE_OPTIONS;
    delete env.MIRROR_MCP_VERSION;
    Object.assign(env, extraEnv);
    const child = spawn(process.execPath, [MAIN], { cwd: TS_ROOT, env, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
    child.stdin.write(INITIALIZE);
    child.stdin.end();
  });
}

test("a pending TS-authored migration is applied at launch, as Python applies it", async () => {
  const fixture = freshDatabase();
  try {
    regressToPre017(fixture.dbPath);
    assert.ok(
      !migrationIds(fixture.dbPath).includes(TS_AUTHORED_017),
      "the fixture must start behind the migration or the test proves nothing",
    );

    const run = await runServer(fixture.dbPath);

    assert.ok(
      migrationIds(fixture.dbPath).includes(TS_AUTHORED_017),
      "the server must migrate on open; Python would have",
    );
    assert.match(run.stdout, /"serverInfo"/, "and still answer initialize");
    // The one stderr exception: a migration is an operator-visible event, and
    // the client's log is where this server's diagnostics go. Metadata only —
    // ids and a backup file name, never content.
    assert.match(run.stderr, new RegExp(`migrate_on_open applied=${TS_AUTHORED_017} backup=`));
    assert.doesNotMatch(run.stderr, /ExperimentalWarning/);
  } finally {
    fixture.cleanup();
  }
});

test("a current database launches with empty stderr, as the harness requires", async () => {
  const fixture = freshDatabase();
  try {
    const run = await runServer(fixture.dbPath);
    assert.equal(run.stderr, "", "steady state must stay silent on the protocol's log channel");
    assert.equal(run.code, 0);
  } finally {
    fixture.cleanup();
  }
});

test("initialize reports the project version without MIRROR_MCP_VERSION set", async () => {
  const fixture = freshDatabase();
  try {
    const run = await runServer(fixture.dbPath);
    const response = JSON.parse(run.stdout.split("\n").filter(Boolean)[0]);
    const expected = versionFromPyproject(TS_ROOT);
    assert.ok(expected, "the repository must expose a version to match against");
    assert.equal(
      response.result.serverInfo.version,
      expected,
      "a client sets no MIRROR_MCP_VERSION; without a fallback it would read 0.0.0 " +
        "while Python reports the installed version",
    );
    assert.equal(response.result.serverInfo.name, "mirror-mind");
  } finally {
    fixture.cleanup();
  }
});

test("an explicit MIRROR_MCP_VERSION still wins, so the parity harness can pin it", async () => {
  const fixture = freshDatabase();
  try {
    const run = await runServer(fixture.dbPath, { MIRROR_MCP_VERSION: "9.9.9" });
    const response = JSON.parse(run.stdout.split("\n").filter(Boolean)[0]);
    assert.equal(response.result.serverInfo.version, "9.9.9");
  } finally {
    fixture.cleanup();
  }
});
