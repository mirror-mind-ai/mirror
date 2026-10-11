import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { createTasksTable } from "#helpers/tasksSchema.ts";
import { runWeekSave } from "#planning/weekSave.ts";

/**
 * CV22.DS7.US11 plateau 1 — `week save`, graded against the Python oracle in
 * `ts/test/goldens/week-save.golden.json`.
 *
 * This is the one leaf of US11 that crosses no provider seam: it reads the
 * pending file, writes tasks, unlinks, and prints. CR068 found it filed as
 * "LLM-gated" in `routing.ts`; the corpus is the evidence that it is not.
 *
 * Generated task ids are aliased in receipt order (`<task-1>`), matching the
 * conversation-logger corpus convention. `id_shapes` pins the raw shape
 * separately, so an alias cannot hide a port that emits ids of the wrong
 * length or character class.
 */

interface GoldenTask {
  id: string;
  journey: string | null;
  title: string;
  status: string;
  due_date: string | null;
  scheduled_at: string | null;
  time_hint: string | null;
  stage: string | null;
  context: string | null;
  source: string;
}
interface GoldenCase {
  label: string;
  pending: Record<string, unknown>[] | null;
  stdout: string;
  pending_file_exists_after: boolean;
  tasks: GoldenTask[];
  id_shapes: { length: number; hex: boolean }[];
}
const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "week-save.golden.json"),
    "utf8",
  ),
) as { cases: GoldenCase[] };

function scratch(): { dbPath: string; pendingPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-weeksave-"));
  // The DS4 copy guard refuses a write target outside a `tmp/` directory.
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createTasksTable(db);
  db.close();
  return {
    dbPath,
    pendingPath: join(dir, "mm_week_pending.json"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("week-save golden is well-formed", () => {
  assert.ok(golden.cases.length >= 9, "corpus covers the receipt matrix");
  assert.ok(
    golden.cases.some((c) => c.pending === null),
    "includes the no-pending-file path",
  );
  assert.ok(
    golden.cases.some(
      (c) => c.stdout.includes("not-a-timestamp") === false && c.label.includes("unparseable"),
    ),
    "includes the ValueError path, whose receipt drops the time suffix",
  );
  assert.ok(
    golden.cases.every((c) => c.id_shapes.every((s) => s.length === 8 && s.hex)),
    "every printed id is an 8-character hex prefix",
  );
});

for (const c of golden.cases) {
  test(`week save — ${c.label}`, () => {
    const { dbPath, pendingPath, cleanup } = scratch();
    try {
      if (c.pending !== null) {
        writeFileSync(pendingPath, `${JSON.stringify(c.pending, null, 2)}\n`, "utf8");
      }
      const db = openDatabaseCopyForWrite(dbPath);
      const printed: string[] = [];
      const result = runWeekSave(db, {
        pendingPath,
        print: (line) => printed.push(line),
      });
      db.close();

      // Alias ids the way the generator does: receipt order.
      let stdout = printed.map((l) => `${l}\n`).join("");
      const shapes = [...stdout.matchAll(/`([0-9a-f]+)`/g)].map((m) => m[1]);
      shapes.forEach((raw, index) => {
        stdout = stdout.replace(`\`${raw}\``, `\`<task-${index + 1}>\``);
      });

      assert.equal(stdout, c.stdout, "receipt is byte-exact to the oracle");
      assert.deepEqual(
        shapes.map((v) => ({ length: v.length, hex: /^[0-9a-f]+$/.test(v) })),
        c.id_shapes,
        "printed id shape matches the oracle's",
      );
      assert.equal(result.savedCount, c.tasks.length, "saved count");

      const read = openDatabaseReadOnly(dbPath);
      const rows = read
        .prepare(
          "SELECT id, journey, title, status, due_date, scheduled_at, time_hint, stage, context, source FROM tasks ORDER BY created_at ASC, title ASC",
        )
        .all() as unknown as GoldenTask[];
      read.close();
      const aliased = rows.map((row, index) => ({ ...row, id: `<task-${index + 1}>` }));
      assert.deepEqual(aliased, c.tasks, "task rows match the oracle");

      assert.equal(existsSync(pendingPath), c.pending_file_exists_after, "pending file removal");
    } finally {
      cleanup();
    }
  });
}
