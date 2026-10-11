import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  appendRun,
  type EvalRunRecord,
  historyPath,
  readHistory,
} from "#evals/harness/persistence.ts";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "mirror-eval-history-"));
}

function record(overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    eval_name: "sample",
    started_at: "2026-09-22T10:00:00+00:00",
    ended_at: "2026-09-22T10:00:05+00:00",
    model: "openai/gpt-5-mini",
    prompt_hash: "abc123def456",
    score: 1,
    threshold: 0.8,
    passed: true,
    probes: [{ id: "p1", passed: true, notes: "ok", blocking: false }],
    schema_version: 3,
    suite_run_id: null,
    ...overrides,
  };
}

test("history path is <mirror_home>/eval-history/<name>.jsonl", () => {
  const home = tempHome();
  try {
    const path = historyPath("extraction", { MIRROR_HOME: home });
    assert.equal(path, join(home, "eval-history", "extraction.jsonl"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("history path falls back to the repo-local dir when no mirror home is configured", () => {
  const path = historyPath("extraction", {});
  assert.match(path, /evals[/\\]\.history[/\\]extraction\.jsonl$/);
});

test("append writes one JSONL line per run and creates the directory", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    appendRun(record(), env);
    appendRun(record({ score: 0.5, passed: false }), env);
    const lines = readFileSync(historyPath("sample", env), "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0] as string).score, 1);
    assert.equal(JSON.parse(lines[1] as string).passed, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the persisted record keeps Python's snake_case wire shape", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    appendRun(record(), env);
    const written = JSON.parse(readFileSync(historyPath("sample", env), "utf8").trim());
    assert.deepEqual(Object.keys(written).sort(), [
      "ended_at",
      "eval_name",
      "model",
      "passed",
      "probes",
      "prompt_hash",
      "schema_version",
      "score",
      "started_at",
      "suite_run_id",
      "threshold",
    ]);
    assert.deepEqual(Object.keys(written.probes[0]).sort(), ["blocking", "id", "notes", "passed"]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// database-architect, Plan review: `passed` changed meaning, so the record
// version changes with it. Python's reader builds EvalRunRecord(**line) from
// the same top-level field set, so a v3 line still parses while Python exists.
test("records are written at schema_version 3", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    appendRun(record({ schema_version: 3 }), env);
    const written = JSON.parse(readFileSync(historyPath("sample", env), "utf8").trim());
    assert.equal(written.schema_version, 3);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("the reader accepts both schema 2 and schema 3 records", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    appendRun(record({ schema_version: 2, probes: [{ id: "p", passed: true, notes: "" }] }), env);
    appendRun(record({ schema_version: 3 }), env);
    const history = readHistory("sample", 10, env);
    assert.equal(history.length, 2);
    assert.deepEqual(
      history.map((r) => r.schema_version),
      [3, 2],
      "newest first",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("read returns up to limit records, newest first", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    for (const n of [1, 2, 3, 4]) appendRun(record({ score: n / 10 }), env);
    const history = readHistory("sample", 2, env);
    assert.deepEqual(
      history.map((r) => r.score),
      [0.4, 0.3],
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("read returns nothing when the file does not exist", () => {
  const home = tempHome();
  try {
    assert.deepEqual(readHistory("never-run", 10, { MIRROR_HOME: home }), []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("read skips a malformed trailing line instead of failing the whole read", () => {
  const home = tempHome();
  try {
    const env = { MIRROR_HOME: home };
    appendRun(record(), env);
    const path = historyPath("sample", env);
    writeFileSync(path, `${readFileSync(path, "utf8")}{"eval_name": "sample", "sco\n`, "utf8");
    const history = readHistory("sample", 10, env);
    assert.equal(history.length, 1, "the good record survives the bad line");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// The probe result is the point: a persistence failure must never surface as
// an eval failure or change an exit code.
test("append never raises when the path cannot be written", () => {
  const home = tempHome();
  const blocked = join(home, "not-a-dir");
  writeFileSync(blocked, "i am a file, not a directory", "utf8");
  try {
    assert.doesNotThrow(() => appendRun(record(), { MIRROR_HOME: blocked }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
