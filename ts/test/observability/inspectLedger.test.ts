// CV22.DS7.TS4 plateau 2 — the ledger reads against Python's answer.
//
// The corpus is `ledger-inspect.golden.json`, recorded from the real Python
// CLI in subprocesses over a database seeded from `ledger-inspect/rows.json`.
// This test seeds ITS OWN database from that same file, so both engines
// provably start from the same values and nothing binary is committed.
//
// Nothing is routed; the front door is plateau 7.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { runInspectEmbeddingProvenance, runInspectLlmCalls } from "#observability/inspectLedger.ts";

interface GoldenCase {
  label: string;
  argv: string[];
  stdout: string;
  stderr: string;
  exit_code: number;
}

const golden = JSON.parse(
  readFileSync(new URL("../fixtures/ledger-inspect.golden.json", import.meta.url), "utf8"),
) as { cases: GoldenCase[] };

const rows = JSON.parse(
  readFileSync(new URL("../fixtures/ledger-inspect/rows.json", import.meta.url), "utf8"),
) as {
  conversations: Array<Record<string, string>>;
  llm_calls: Array<Record<string, string | number | null>>;
  memories: Array<Record<string, string | null>>;
};

function seed(db: WritableDatabase, empty: boolean): void {
  if (empty) return;
  for (const conversation of rows.conversations) {
    db.prepare("INSERT INTO conversations (id, started_at, interface) VALUES (?, ?, ?)").run(
      conversation.id as string,
      conversation.started_at as string,
      conversation.interface as string,
    );
  }
  for (const call of rows.llm_calls) {
    db.prepare(
      `INSERT INTO llm_calls (
         id, role, model, prompt, response, prompt_tokens, completion_tokens,
         latency_ms, cost_usd, conversation_id, session_id, called_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      call.id as string,
      call.role as string,
      call.model as string,
      call.prompt as string,
      call.response as string,
      call.prompt_tokens as number | null,
      call.completion_tokens as number | null,
      call.latency_ms as number | null,
      call.cost_usd as number | null,
      call.conversation_id as string | null,
      call.session_id as string | null,
      call.called_at as string,
    );
  }
  for (const memory of rows.memories) {
    db.prepare(
      `INSERT INTO memories (id, memory_type, layer, title, content, created_at, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      memory.id as string,
      memory.memory_type as string,
      memory.layer as string,
      memory.title as string,
      memory.content as string,
      memory.created_at as string,
      memory.embedding === null ? null : Buffer.from(memory.embedding as string, "utf8"),
      memory.metadata as string,
    );
  }
}

function withDatabase<T>(empty: boolean, run: (db: WritableDatabase) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ledger-inspect-"));
  const db = bootstrapDatabase(join(root, "memory_test.db"));
  try {
    seed(db, empty);
    return run(db);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}

function invoke(db: WritableDatabase, argv: readonly string[]) {
  // `--mirror-home` is the generator's; the database is already resolved here.
  const args = argv
    .slice(2)
    .filter((token, index, all) => token !== "--mirror-home" && all[index - 1] !== "--mirror-home");
  return argv[1] === "llm-calls"
    ? runInspectLlmCalls(db, args)
    : runInspectEmbeddingProvenance(db, args);
}

const EMPTY_LABELS = new Set([
  "llm_calls_empty_database",
  "llm_calls_summary_empty_database",
  "embedding_provenance_empty_database",
]);

test("every recorded ledger read matches Python, bytes and exit code", () => {
  const seeded = golden.cases.filter((recorded) => !EMPTY_LABELS.has(recorded.label));
  const empty = golden.cases.filter((recorded) => EMPTY_LABELS.has(recorded.label));
  assert.ok(seeded.length >= 15 && empty.length === 3, "the corpus covers both database states");

  for (const [isEmpty, cases] of [
    [false, seeded],
    [true, empty],
  ] as const) {
    withDatabase(isEmpty, (db) => {
      for (const recorded of cases) {
        const actual = invoke(db, recorded.argv);
        if (recorded.exit_code === 2) {
          // argparse's usage block wraps to the terminal's COLUMNS, so its TEXT
          // is not a portable contract. The graded contract is the class: same
          // input refused, stdout empty, a message on stderr, exit 2.
          assert.equal(actual.exitCode, 2, recorded.label);
          assert.equal(actual.stdout, "", recorded.label);
          assert.equal(recorded.stdout, "", `${recorded.label} (oracle stdout)`);
          assert.notEqual(actual.stderr, "", recorded.label);
          continue;
        }
        assert.equal(actual.stdout, recorded.stdout, recorded.label);
        assert.equal(actual.stderr, recorded.stderr, `${recorded.label} (stderr)`);
        assert.equal(actual.exitCode, recorded.exit_code, `${recorded.label} (exit)`);
      }
    });
  }
});

test("the corpus grades what a reading of the module would not give", () => {
  const byLabel = new Map(golden.cases.map((recorded) => [recorded.label, recorded]));
  const at = (label: string): GoldenCase => {
    const recorded = byLabel.get(label);
    assert.ok(recorded, `missing case: ${label}`);
    return recorded;
  };

  // `--session` is applied AFTER the store's LIMIT: the same filter finds a row
  // unlimited and nothing at `--limit 3`.
  assert.match(at("llm_calls_session_after_limit").stdout, /no llm_calls rows match/);
  assert.match(at("llm_calls_session_full").stdout, /llm_calls \(1 row\)/);

  // Empty role and model reach the `or "?"` fallback; NULL cannot (NOT NULL).
  assert.match(at("llm_calls_limit_3").stdout, /\] \? \| \?$/m);

  // The role column pads to 18 and never truncates, so a longer role overflows.
  assert.match(at("llm_calls_summary").stdout, /journal_classification {5}1 calls/);

  // An all-unpriced bucket keeps an em dash instead of summing to zero.
  assert.match(
    at("llm_calls_summary").stdout,
    /embedding {14}2 calls {2}200→0 tokens {2}— {2}\(2 unpriced\)/,
  );

  // repr picks the quote Python picks, and the 200-code-point cut ends WITH the
  // astral character a UTF-16 cut would halve.
  assert.match(at("llm_calls_default_limit").stdout, /prompt: {3}"it's a quoted prompt"/);
  assert.match(at("llm_calls_default_limit").stdout, /prompt: {3}'he said "it\\'s fine" and left'/);
  const truncated = at("llm_calls_default_limit")
    .stdout.split("\n")
    .find((line) => line.includes("Classifica"));
  assert.ok(truncated?.endsWith("\u{1D518}'"), "the cut keeps the whole astral character");

  // Unknown-provenance vectors sort before a named model on a tie, because
  // Python sorts by `str(None)`.
  assert.match(
    at("embedding_provenance").stdout,
    /\(5 memory vectors\) ===\n {7}2 {2}unknown \(pre-provenance\)\n {7}2 {2}openai/,
  );
});
