/**
 * Durable eval run history (CV22.DS10.TS3, port of `evals/persistence.py`).
 *
 * Each run is appended as one JSONL record under
 * `<mirror_home>/eval-history/<eval_name>.jsonl` -- the same directory, file
 * names, and field set the Python harness wrote, so a TypeScript run lands
 * beneath the Python runs already there and `--history` trends across the
 * cutover instead of starting a second log.
 *
 * Persistence is deliberately fail-soft: an eval's report and exit code must
 * never depend on whether the history write succeeded.
 *
 * Retention rule (CV22.DS10.TS3): **deleting a module never deletes its
 * measurements.** `scene.jsonl`, `routing.jsonl`, and `retrieval.jsonl` stay on
 * disk after their modules retire, and `--history <name>` still renders them,
 * because a history read opens a file rather than a module.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type DbPathEnv, resolveMirrorHome } from "#frontDoor/dbPath.ts";

/** Repo-local fallback for a checkout with no configured mirror home. */
const FALLBACK_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), ".history");

/** One persisted probe verdict inside a run record. */
export interface EvalProbeRecord {
  id: string;
  passed: boolean;
  notes: string;
  /** Present from schema 3; absent in Python-era records. */
  blocking?: boolean;
}

/**
 * One persisted eval run. Field names are snake_case because this is a wire
 * contract with the Python-era log, not an internal type.
 *
 * `model`/`prompt_hash` are null for a genuinely prompt-free eval -- a
 * distinguishable state from "hash unchanged", not a blank hash.
 *
 * `suite_run_id` correlates the per-eval records written by one `--all`
 * invocation; null for a standalone run.
 *
 * `schema_version` is **3** for records written under blocking semantics
 * (CV22.DS10.TS3). Versions 2 and 3 share a top-level field set and differ in
 * what `passed` means: at 2 it was `score >= threshold`; at 3 it also accounts
 * for failed blocking probes. Python's reader builds `EvalRunRecord(**line)`
 * from the same fields, so it keeps parsing v3 lines for as long as it exists.
 */
export interface EvalRunRecord {
  eval_name: string;
  started_at: string;
  ended_at: string;
  model: string | null;
  prompt_hash: string | null;
  score: number;
  threshold: number;
  passed: boolean;
  probes: EvalProbeRecord[];
  schema_version: number;
  suite_run_id: string | null;
}

/**
 * Resolve the JSONL history file for one eval.
 *
 * Prefers `<mirror_home>/eval-history/` through the same resolver the front
 * door uses (MIRROR_HOME wins; MIRROR_USER derives `~/.mirror-minds/<user>`
 * with the legacy `~/.mirror/<user>` fallback), so the harness cannot silently
 * open a second log beside the Python records. Falls back to the gitignored
 * repo-local `ts/evals/.history/` when no mirror home is configured.
 */
export function historyPath(evalName: string, env: DbPathEnv = process.env): string {
  let base: string;
  try {
    base = join(resolveMirrorHome(env), "eval-history");
  } catch {
    base = FALLBACK_DIR;
  }
  return join(base, `${evalName}.jsonl`);
}

/**
 * Append one run to its eval's history file. Never throws.
 *
 * A persistence failure (unwritable path, disk issue) must never affect the
 * eval's own report or exit code -- the probe result is the point.
 */
export function appendRun(record: EvalRunRecord, env: DbPathEnv = process.env): void {
  try {
    const path = historyPath(record.eval_name, env);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Swallowed by contract. The report is the product of a run; the log is not.
  }
}

/**
 * Return up to `limit` most-recent records, newest first.
 *
 * Tolerates a malformed line (a crash mid-write) by skipping it rather than
 * failing the whole read, and accepts both schema 2 and schema 3 records.
 */
export function readHistory(
  evalName: string,
  limit = 10,
  env: DbPathEnv = process.env,
): EvalRunRecord[] {
  const path = historyPath(evalName, env);
  if (!existsSync(path)) return [];
  const records: EvalRunRecord[] = [];
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as EvalRunRecord);
    } catch {
      // Skip the bad line; the good records around it still trend.
    }
  }
  return records.reverse().slice(0, limit);
}
