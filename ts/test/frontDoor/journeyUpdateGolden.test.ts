import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { spawnFrontDoor } from "#helpers/frontDoor.ts";
import { createIdentityTable, seedKnownMigrations } from "#helpers/identitySchema.ts";

/**
 * CR073 — `journey update` graded against the Python oracle over the
 * accept/refuse matrix in `ts/test/goldens/journey-update.golden.json`.
 *
 * The oracle refuses FLAG-SHAPED content (`^--?[A-Za-z]`) and empty content,
 * exits 1 with a message that names the real sentinel `-`, and leaves the
 * stored path untouched. Everything else — the `-` sentinel with stdin, a
 * markdown list from line one, an em-dash lead, ordinary text — is accepted
 * and stored verbatim. Byte-exact stderr is part of the contract: the message
 * is what a caller (usually a model) reads to correct itself.
 */

interface GoldenCase {
  label: string;
  content: string | null;
  stdin: string | null;
  exit: number;
  stderr: string;
  journey_path_after: string;
}
interface Golden {
  before: string;
  slug: string;
  cases: GoldenCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(HERE, "..", "goldens", "journey-update.golden.json"), "utf8"),
) as Golden;

function seededDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journeyupdategolden-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createIdentityTable(db);
  seedKnownMigrations(db);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) VALUES (?, 'journey_path', ?, ?, '1.0.0', ?, ?)",
  ).run("seed-journey-path", golden.slug, golden.before, now, now);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function storedPath(dbPath: string): string | undefined {
  const db = openDatabaseReadOnly(dbPath);
  const row = db
    .prepare("SELECT content FROM identity WHERE layer = 'journey_path' AND key = ?")
    .get(golden.slug) as { content: string } | undefined;
  db.close();
  return row?.content;
}

test("journey-update golden is well-formed", () => {
  assert.ok(golden.cases.length >= 12, "corpus covers the full matrix");
  assert.ok(
    golden.cases.some((c) => c.content === "-stdin"),
    "includes the incident",
  );
  assert.ok(
    golden.cases.some((c) => c.content?.startsWith("- ") && c.exit === 0),
    "includes the list-shaped ACCEPT case the review demanded",
  );
  assert.ok(
    golden.cases.some((c) => c.content === null),
    "includes the usage path",
  );
});

for (const c of golden.cases) {
  test(`journey update — ${c.label}: exit ${c.exit}, path ${c.exit === 0 ? "written" : "untouched"}`, () => {
    const { dbPath, cleanup } = seededDb();
    try {
      const args = ["journey", "update", golden.slug];
      if (c.content !== null) args.push(c.content);
      const result = spawnFrontDoor([...args, "--db-path", dbPath], {}, c.stdin ?? undefined);
      assert.equal(result.status, c.exit, `exit code (stderr: ${result.stderr})`);
      assert.equal(result.stderr, c.stderr, "stderr is byte-exact to the oracle");
      assert.equal(storedPath(dbPath), c.journey_path_after, "stored journey path");
    } finally {
      cleanup();
    }
  });
}
