import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LifecycleFaceError,
  runLifecycleDryRun,
  runLifecyclePreviewAtMessage,
} from "#conversation/lifecycleFaces.ts";
import { openDatabaseCopyForWrite } from "#db/database.ts";
import { createConversationTables } from "#helpers/conversationSchema.ts";

/**
 * CV22.DS7.US11 plateau 5b — the two ES-001 READ faces, graded against
 * `ts/test/goldens/lifecycle-faces.golden.json`.
 *
 * `apply` and `demo` are deliberately absent: they need the unported
 * `apply_metadata_lifecycle`, and `routing.ts` refuses them by name for
 * DS7.TS4 (Navigator decision 2026-09-09, option B).
 */

interface GoldenCase {
  face: "dry_run" | "preview_at_message";
  label: string;
  argument: string;
  report: Record<string, unknown> | null;
  error: string | null;
}
interface ConversationRow {
  id: string;
  title: string | null;
  started_at: string;
  metadata: string | null;
}
interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}
interface Golden {
  cases: GoldenCase[];
  seeds: Record<string, { conversation_row: ConversationRow; message_rows: MessageRow[] }>;
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "lifecycle-faces.golden.json"),
    "utf8",
  ),
) as Golden;

/**
 * Rebuild the oracle's world from the ROWS the generator recorded, not from a
 * guess at them. An earlier draft seeded its own idea of the metadata
 * `set_provisional_title` writes and produced a `keep` decision where Python
 * says `repair` — the fixture was wrong, not the port. The corpus now carries
 * the conversation and message rows verbatim.
 */
function seedWorld(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-lifecycle-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createConversationTables(db);

  for (const seed of Object.values(golden.seeds)) {
    const row = seed.conversation_row;
    db.prepare(
      "INSERT INTO conversations (id, interface, title, started_at, metadata) VALUES (?, 'cli', ?, ?, ?)",
    ).run(row.id, row.title, row.started_at, row.metadata);
    for (const message of seed.message_rows) {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(message.id, row.id, message.role, message.content, message.created_at);
    }
  }
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("the corpus covers both faces and both error shapes", () => {
  const faces = new Set(golden.cases.map((c) => c.face));
  assert.equal(faces.size, 2);
  assert.ok(golden.cases.some((c) => c.error?.includes("required")));
  assert.ok(golden.cases.some((c) => c.error?.includes("not found")));
});

for (const c of golden.cases) {
  test(`${c.face} — ${c.label}`, () => {
    const { dbPath, cleanup } = seedWorld();
    try {
      const db = openDatabaseCopyForWrite(dbPath);
      const run = () =>
        c.face === "dry_run"
          ? runLifecycleDryRun(db, c.argument)
          : runLifecyclePreviewAtMessage(db, c.argument);

      if (c.error !== null) {
        assert.throws(run, (error: unknown) => {
          assert.ok(error instanceof LifecycleFaceError);
          assert.equal(error.message, c.error, "error text is byte-exact to the oracle");
          return true;
        });
      } else {
        const report = run();
        assert.deepEqual(JSON.parse(JSON.stringify(report)), c.report, "report matches the oracle");
      }
      db.close();
    } finally {
      cleanup();
    }
  });
}

test("the boundary moves the included/excluded counts", () => {
  const previews = golden.cases.filter((c) => c.face === "preview_at_message" && c.report);
  const counts = previews.map((c) => [
    c.report?.included_message_count,
    c.report?.excluded_message_count,
  ]);
  assert.ok(
    new Set(counts.map((pair) => pair.join("/"))).size > 1,
    "different boundaries produce different counts — otherwise the case proves nothing",
  );
});
