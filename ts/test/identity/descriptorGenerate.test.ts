import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { descriptorPreview, runDescriptorGenerate } from "#identity/descriptorGenerate.ts";

/**
 * CV22.DS7.US11 plateau 5 — `descriptor generate`, graded against
 * `ts/test/goldens/descriptor.golden.json` (model stubbed).
 *
 * The corpus records ZERO `llm_calls` rows for every case, which is the point:
 * Python passes no `on_llm_call` here, so this is the only LLM role that
 * writes nothing to the ledger. A port that started logging would be "better"
 * and wrong.
 */

interface GoldenCase {
  label: string;
  argv: string[];
  identities: { layer: string; key: string; content: string }[];
  responses: string[];
  stdout: string;
  stderr: string;
  exit: number;
  descriptors: { layer: string; key: string; descriptor: string }[];
  llm_calls: { role: string }[];
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "descriptor.golden.json"),
    "utf8",
  ),
) as { cases: GoldenCase[] };

function flag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index === -1 ? null : (argv[index + 1] ?? null);
}

function scratch(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-descriptor-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("every descriptor case records ZERO ledger rows", () => {
  for (const c of golden.cases) {
    assert.equal(c.llm_calls.length, 0, `${c.label}: Python writes no llm_calls row here`);
  }
});

for (const c of golden.cases) {
  test(`descriptor generate — ${c.label}`, () => {
    const { dbPath, cleanup } = scratch();
    try {
      const db = openDatabaseCopyForWrite(dbPath);
      createIdentityTable(db);
      db.prepare(
        "CREATE TABLE identity_descriptors (layer TEXT NOT NULL, key TEXT NOT NULL, descriptor TEXT NOT NULL, generated_at TEXT NOT NULL, PRIMARY KEY (layer, key))",
      ).run();
      const now = "2026-09-09T12:00:00.000000Z";
      c.identities.forEach((identity, index) => {
        db.prepare(
          "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) VALUES (?, ?, ?, ?, '1.0.0', ?, ?)",
        ).run(`id-${index}`, identity.layer, identity.key, identity.content, now, now);
      });

      const remaining = [...c.responses];
      const out: string[] = [];
      const err: string[] = [];
      const result = runDescriptorGenerate(
        db,
        { layer: flag(c.argv, "--layer"), key: flag(c.argv, "--key") },
        {
          generate: () => (remaining.length > 0 ? (remaining.shift() as string) : ""),
          nowIso: now,
          print: (line) => out.push(line),
          printError: (line) => err.push(line),
        },
      );
      db.close();

      assert.equal(out.join(""), c.stdout, "stdout is byte-exact to the oracle");
      assert.equal(err.join(""), c.stderr, "stderr is byte-exact to the oracle");
      assert.equal(result.exitCode, c.exit, "exit code");

      const read = openDatabaseReadOnly(dbPath);
      const rows = read
        .prepare("SELECT layer, key, descriptor FROM identity_descriptors ORDER BY layer, key")
        .all() as unknown as { layer: string; key: string; descriptor: string }[];
      read.close();
      assert.deepEqual(rows, c.descriptors, "descriptor rows match the oracle");
    } finally {
      cleanup();
    }
  });
}

test("the 80-character preview boundary is code points, with the ellipsis only past it", () => {
  assert.equal(descriptorPreview("B".repeat(80)), "B".repeat(80), "exactly 80: no ellipsis");
  assert.equal(descriptorPreview("B".repeat(81)), `${"B".repeat(80)}...`, "81: ellipsis");

  const astral = `\u{1F30D}${"C".repeat(100)}`;
  const preview = descriptorPreview(astral);
  assert.ok(preview.endsWith("..."));
  assert.equal([...preview.slice(0, -3)].length, 80, "80 code points, not UTF-16 units");
  assert.ok(preview.startsWith("\u{1F30D}"), "the astral character is not split");
});
