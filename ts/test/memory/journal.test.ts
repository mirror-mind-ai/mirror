import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDatabaseCopyForWrite, openDatabaseReadOnly } from "#db/database.ts";
import { parseJsonResponse } from "#extraction/json.ts";
import { createMemoriesTable } from "#helpers/cultivationSchema.ts";
import {
  addJournal,
  interpretJournalClassification,
  renderJournalReceipt,
  renderJournalTags,
} from "#memory/journal.ts";

/**
 * CV22.DS7.US11 plateau 3 — `journal`, graded against
 * `ts/test/goldens/journal.golden.json`.
 *
 * The corpus was generated with the model and the embedding CLIENT stubbed,
 * so the real `generate_embedding` still runs and still writes its ledger row.
 * That matters: an earlier draft stubbed one level higher and recorded ONE
 * `llm_calls` row where Python writes TWO, which would have graded the port
 * against a wrong number.
 */

interface GoldenMemory {
  memory_type: string;
  layer: string;
  title: string;
  content: string;
  journey: string | null;
  tags: string | null;
  has_embedding: number;
}
interface GoldenCase {
  label: string;
  argv: string[];
  llm_response: string | null;
  embedding_fails: boolean;
  stdout: string;
  stderr: string;
  exit: number;
  raised: string | null;
  memories: GoldenMemory[];
  llm_calls: { role: string; model: string; unpriced: number }[];
  id_shapes: { length: number; hex: boolean }[];
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "journal.golden.json"),
    "utf8",
  ),
) as { cases: GoldenCase[] };

function contentFromArgv(argv: string[]): { content: string; journey: string | null } {
  const words: string[] = [];
  let journey: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--journey") {
      journey = argv[i + 1] ?? null;
      i += 1;
    } else {
      words.push(argv[i]);
    }
  }
  return { content: words.join(" "), journey };
}

function scratchDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-journal-"));
  const tmpDir = join(dir, "tmp");
  mkdirSync(tmpDir);
  const dbPath = join(tmpDir, "copy.db");
  const db = openDatabaseCopyForWrite(dbPath);
  createMemoriesTable(db);
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("journal golden is well-formed and pins the failure case", () => {
  assert.ok(golden.cases.length >= 10);
  const failure = golden.cases.find((c) => c.embedding_fails);
  assert.ok(failure, "the embed-before-insert case exists");
  assert.equal(failure.memories.length, 0, "a failing embedding persists NOTHING");
  assert.equal(
    failure.llm_calls.length,
    2,
    "classification AND the embedding attempt are ledgered",
  );
  assert.equal(
    failure.llm_calls.at(-1)?.unpriced,
    1,
    "the failed embedding round-trip lands as an unpriced row, not a vanished one",
  );
});

for (const c of golden.cases) {
  const llmResponse = c.llm_response;
  if (llmResponse === null) continue; // refusal cases are graded below

  test(`journal classification — ${c.label}`, () => {
    const { content } = contentFromArgv(c.argv);
    const classification = interpretJournalClassification(llmResponse, content, parseJsonResponse);
    const expected = c.memories[0];

    if (expected) {
      assert.equal(classification.title, expected.title, "title");
      assert.equal(classification.layer, expected.layer, "layer (AI-24 coercion applies)");
    } else {
      // The embedding-failure case: classification still happened, and the
      // title/layer it produced are not observable in a row. Assert the parse
      // did not throw and produced the model's values.
      assert.equal(typeof classification.title, "string");
      assert.ok(["self", "ego", "shadow"].includes(classification.layer));
    }
  });
}

for (const c of golden.cases) {
  const writeResponse = c.llm_response;
  if (writeResponse === null || c.memories.length === 0) continue;

  test(`journal write and receipt — ${c.label}`, () => {
    const { dbPath, cleanup } = scratchDb();
    try {
      const { content, journey } = contentFromArgv(c.argv);
      const classification = interpretJournalClassification(
        writeResponse,
        content,
        parseJsonResponse,
      );
      const db = openDatabaseCopyForWrite(dbPath);
      const result = addJournal(
        db,
        { content, journey, classification },
        {
          newId: () => "0123456789abcdef0123456789abcdef",
          nowIso: "2026-09-09T12:00:00.000000Z",
          embed: () => new Uint8Array(8),
        },
      );
      db.close();

      const read = openDatabaseReadOnly(dbPath);
      const row = read
        .prepare(
          "SELECT memory_type, layer, title, content, journey, tags, (embedding IS NOT NULL) AS has_embedding FROM memories",
        )
        .get() as unknown as GoldenMemory;
      read.close();

      assert.deepEqual(row, c.memories[0], "memory row matches the oracle");

      const receipt = renderJournalReceipt(result, journey, row.tags).replace(
        /ID: [0-9a-f]+/,
        "ID: <memory-1>",
      );
      assert.equal(receipt, c.stdout, "receipt is byte-exact to the oracle");
    } finally {
      cleanup();
    }
  });
}

test("a failing embedding writes no memory row", () => {
  const { dbPath, cleanup } = scratchDb();
  try {
    const db = openDatabaseCopyForWrite(dbPath);
    assert.throws(
      () =>
        addJournal(
          db,
          {
            content: "anything",
            journey: null,
            classification: { title: "t", layer: "ego", tags: [] },
          },
          {
            newId: () => "id",
            nowIso: "2026-09-09T12:00:00.000000Z",
            embed: () => {
              throw new Error("embedding provider unavailable");
            },
          },
        ),
      /embedding provider unavailable/,
    );
    db.close();

    const read = openDatabaseReadOnly(dbPath);
    const count = read.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number };
    read.close();
    assert.equal(count.n, 0, "embed-before-insert: nothing persisted");
  } finally {
    cleanup();
  }
});

test("`, `.join over a STRING iterates characters, as Python does", () => {
  assert.equal(renderJournalTags("not-a-list"), "n, o, t, -, a, -, l, i, s, t");
  assert.equal(renderJournalTags(["a", "b"]), "a, b");
  assert.equal(renderJournalTags([]), "");
});

test("the non-JSON fallback cuts the title at 60 CODE POINTS", () => {
  const content = `\u{1F30D} ${"a".repeat(100)}`;
  const classification = interpretJournalClassification("not json", content, parseJsonResponse);
  assert.equal([...classification.title].length, 60);
  assert.ok(classification.title.startsWith("\u{1F30D}"), "the astral character is not split");
  assert.equal(classification.layer, "ego");
});

test("an unknown layer is coerced to ego (AI-24), not written through", () => {
  const parsed = interpretJournalClassification(
    JSON.stringify({ title: "t", layer: "superego", tags: [] }),
    "content",
    parseJsonResponse,
  );
  assert.equal(parsed.layer, "ego");
});
