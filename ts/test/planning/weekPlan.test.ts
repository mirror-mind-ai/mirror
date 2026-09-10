import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { parseJsonResponse } from "#extraction/json.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { createTasksTable } from "#helpers/tasksSchema.ts";
import { parseExtractedWeekItems, runWeekPlan, similarExistingTasks } from "#planning/weekPlan.ts";
import { createTask } from "#tasks/taskStore.ts";

/**
 * CV22.DS7.US11 plateau 4 — `week plan`, graded against
 * `ts/test/goldens/week-plan.golden.json` (model stubbed, clock frozen).
 *
 * The similarity check is the part worth grading hard: `LIKE '%fragment%'` over
 * the first 20 code points, unescaped, journey filter unused. The Plan review
 * corrected an earlier description of it as a prefix query, so these cases pin
 * the real semantics including the over-matching wildcards.
 */

interface GoldenCase {
  label: string;
  text: string;
  model_response: string;
  existing_tasks: { title: string; due_date?: string; status?: string }[];
  journeys: { slug: string; description: string }[];
  clock: { today: string; weekday: string };
  stdout: string;
  pending_file: string | null;
  llm_calls: { role: string; model: string }[];
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "week-plan.golden.json"),
    "utf8",
  ),
) as { cases: GoldenCase[] };

function scratch(): { dbPath: string; pendingPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-weekplan-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  return {
    dbPath: join(tmpDir, "copy.db"),
    pendingPath: join(dir, "mm_week_pending.json"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("week-plan golden pins the wildcard and boundary cases", () => {
  const labels = golden.cases.map((c) => c.label).join(" | ");
  for (const needle of ["UNESCAPED LIKE wildcard", "single-char wildcard", "first 20 characters"]) {
    assert.ok(labels.includes(needle), `corpus covers: ${needle}`);
  }
});

for (const c of golden.cases) {
  test(`week plan — ${c.label}`, () => {
    const { dbPath, pendingPath, cleanup } = scratch();
    try {
      const db = openDatabaseCopyForWrite(dbPath);
      createIdentityTable(db);
      createTasksTable(db);

      const now = "2026-09-09T12:00:00.000000Z";
      for (const journey of c.journeys) {
        db.prepare(
          "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at) VALUES (?, 'journey', ?, ?, '1.0.0', ?, ?)",
        ).run(`id-${journey.slug}`, journey.slug, journey.description, now, now);
      }
      c.existing_tasks.forEach((task, index) => {
        const created = createTask(
          db,
          { title: task.title, dueDate: task.due_date },
          `task-${index}`,
          now,
        );
        if (task.status === "done") {
          db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run(created.id);
        }
      });

      const printed: string[] = [];
      runWeekPlan(db, c.text, {
        complete: () => c.model_response,
        parseJson: parseJsonResponse,
        clock: c.clock,
        pendingPath,
        print: (value) => printed.push(value),
      });
      db.close();

      const stdout = printed.join("").replaceAll(pendingPath, "<pending-file>");
      assert.equal(stdout, c.stdout, "report is byte-exact to the oracle");

      if (c.pending_file === null) {
        assert.equal(existsSync(pendingPath), false, "no pending file is written");
      } else {
        assert.equal(
          readFileSync(pendingPath, "utf8"),
          c.pending_file,
          "pending file bytes match the oracle",
        );
      }
    } finally {
      cleanup();
    }
  });
}

test("the similarity fragment is the first 20 CODE POINTS, matched with LIKE '%…%'", () => {
  const { dbPath, cleanup } = scratch();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    createTasksTable(db);
    const now = "2026-09-09T12:00:00.000000Z";
    // A non-BMP lead makes a UTF-16 slice cut one code point short.
    createTask(
      db,
      { title: "\u{1F30D} abcdefghijklmnopqrs-TAIL", dueDate: "2026-09-10" },
      "t1",
      now,
    );

    const item = {
      title: "\u{1F30D} abcdefghijklmnopqrs-OTHER",
      due_date: "2026-09-10",
      scheduled_at: null,
      time_hint: null,
      journey: null,
      context: null,
    };
    const matches = similarExistingTasks(db, item);
    db.close();
    assert.equal(matches.length, 1, "the 20-code-point fragment still matches the stored task");
  } finally {
    cleanup();
  }
});

test("pydantic strictness: unknown keys and mistyped optionals skip the item", () => {
  assert.deepEqual(parseExtractedWeekItems([{ title: "t", due_date: "d", nope: 1 }]), []);
  assert.deepEqual(parseExtractedWeekItems([{ title: "t", due_date: "d", scheduled_at: 5 }]), []);
  assert.deepEqual(parseExtractedWeekItems([{ title: 123, due_date: "d" }]), []);
  assert.deepEqual(parseExtractedWeekItems([{ title: "t" }]), []);
  assert.equal(parseExtractedWeekItems([{ title: "t", due_date: "d" }]).length, 1);
  assert.equal(
    parseExtractedWeekItems([{ title: "t", due_date: "d", scheduled_at: null }]).length,
    1,
    "explicit null is accepted, unlike a wrong type",
  );
});

test("a non-list response yields no items", () => {
  assert.deepEqual(parseExtractedWeekItems({ not: "a list" }), []);
  assert.deepEqual(parseExtractedWeekItems(null), []);
});
