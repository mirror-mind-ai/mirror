/**
 * Eval runner (CV22.DS10.TS3, port of `evals/runner.py`).
 *
 * Loads a named eval module, runs its probes, prints a report, persists the
 * run. Discovery is by capability -- any `ts/evals/*.ts` exporting `PROBES`
 * joins `--all` the moment it exists, so the release gate's denominator is not
 * a hand-maintained list that drifts. Harness infrastructure lives one level
 * down in `ts/evals/harness/` and is never scanned.
 *
 * Every dependency the runner does not own -- module loading, directory
 * listing, persistence, clock, suite id, stdout -- is injectable, so the whole
 * contract is testable without a provider, a key, or a filesystem.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  appendRun as appendRunToDisk,
  type EvalRunRecord,
  readHistory as readHistoryFromDisk,
} from "#evals/harness/persistence.ts";
import {
  type EvalProbe,
  type EvalReport,
  type EvalResult,
  evalBlockedBy,
  evalPassed,
  evalScore,
} from "#evals/harness/types.ts";

const EVALS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_THRESHOLD = 0.8;

const PASS = "\u001b[32m✓\u001b[0m";
const FAIL = "\u001b[31m✗\u001b[0m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

/** The shape every probe module exposes. */
export interface EvalModule {
  PROBES?: readonly EvalProbe[];
  THRESHOLD?: number;
  EVAL_MODEL?: string;
  EVAL_PROMPTS?: readonly string[];
}

/** Injectable seams. Defaults reach the real filesystem and stdout. */
export interface RunnerIo {
  loadModule?: (name: string) => Promise<EvalModule>;
  listModuleNames?: () => Promise<string[]>;
  appendRun?: (record: EvalRunRecord) => void;
  readHistory?: (evalName: string, limit: number) => EvalRunRecord[];
  now?: () => Date;
  newSuiteRunId?: () => string;
  write?: (line: string) => void;
}

export interface RunOptions {
  io?: RunnerIo;
  suiteRunId?: string | null;
}

export interface RunAllOptions extends RunOptions {
  onReport?: (report: EvalReport) => void;
}

function resolved(io: RunnerIo = {}): Required<RunnerIo> {
  return {
    loadModule:
      io.loadModule ?? ((name) => import(pathToFileURL(join(EVALS_DIR, `${name}.ts`)).href)),
    listModuleNames:
      io.listModuleNames ??
      (async () =>
        readdirSync(EVALS_DIR, { withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
          .map((entry) => entry.name.slice(0, -3))),
    appendRun: io.appendRun ?? appendRunToDisk,
    readHistory: io.readHistory ?? readHistoryFromDisk,
    now: io.now ?? (() => new Date()),
    newSuiteRunId: io.newSuiteRunId ?? (() => crypto.randomUUID()),
    write: io.write ?? ((line: string) => console.log(line)),
  };
}

/** Load and run a named eval. Rejects for an unknown name or a module without PROBES. */
export async function runEval(evalName: string, options: RunOptions = {}): Promise<EvalReport> {
  const io = resolved(options.io);

  let module: EvalModule;
  try {
    module = await io.loadModule(evalName);
  } catch (error) {
    // Only a genuinely missing module is an unknown eval. Anything else --
    // a syntax error, a bad import, a module that throws while loading -- is
    // reported as itself: mapping every load failure to "unknown eval" sends
    // whoever is debugging a probe module to look for a typo in its name.
    if (!moduleIsMissing(evalName, error)) throw error;
    throw new Error(`Unknown eval '${evalName}'. No module found at evals/${evalName}.ts.`, {
      cause: error,
    });
  }

  const probes = module.PROBES;
  if (!probes) throw new Error(`Eval module '${evalName}' must expose a PROBES list.`);

  const threshold = module.THRESHOLD ?? DEFAULT_THRESHOLD;
  const startedAt = io.now().toISOString();
  const results: EvalResult[] = [];

  for (const probe of probes) {
    const blocking = probe.blocking === true;
    try {
      const outcome = await probe.run();
      results.push({
        probeId: probe.id,
        passed: outcome.passed,
        notes: outcome.notes,
        blocking,
      });
    } catch (error) {
      // A probe that raises is a failed probe, never an aborted eval: the rest
      // of the module still has something to say about the surface.
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        probeId: probe.id,
        passed: false,
        notes: `probe raised: ${message}`,
        blocking,
      });
    }
  }

  const report: EvalReport = { evalName, threshold, results };
  persistRun(report, module, startedAt, io.now().toISOString(), options.suiteRunId ?? null, io);
  return report;
}

/** Every module exposing PROBES, sorted. Capability, not a skip-list. */
export async function discoverEvalNames(options: RunOptions = {}): Promise<string[]> {
  const io = resolved(options.io);
  const names: string[] = [];
  for (const name of await io.listModuleNames()) {
    const module = await io.loadModule(name).catch(() => null);
    if (module?.PROBES) names.push(name);
  }
  return names.sort();
}

/**
 * Run each named eval under one shared suite id; return reports in order.
 *
 * A failure in one eval never aborts the rest -- `--all` gives the full
 * picture, not a fail-fast on the first red.
 */
export async function runAll(names: string[], options: RunAllOptions = {}): Promise<EvalReport[]> {
  const io = resolved(options.io);
  const suiteRunId = io.newSuiteRunId();
  const reports: EvalReport[] = [];
  for (const name of names) {
    const report = await runEval(name, { io: options.io, suiteRunId });
    options.onReport?.(report);
    reports.push(report);
  }
  return reports;
}

/**
 * True when the failure is the module not being there, rather than the module
 * being there and broken. The file check comes first because a bad import
 * *inside* a real module also raises ERR_MODULE_NOT_FOUND, and that error
 * belongs to the module, not to the name the user typed.
 */
function moduleIsMissing(evalName: string, error: unknown): boolean {
  const path = join(EVALS_DIR, `${evalName}.ts`);
  if (existsSync(path)) return false;
  const code = (error as { code?: string } | null)?.code;
  return code === undefined || code === "ERR_MODULE_NOT_FOUND";
}

function persistRun(
  report: EvalReport,
  module: EvalModule,
  startedAt: string,
  endedAt: string,
  suiteRunId: string | null,
  io: Required<RunnerIo>,
): void {
  const prompts = module.EVAL_PROMPTS ?? [];
  const promptHash =
    prompts.length > 0
      ? createHash("sha256").update(prompts.join(""), "utf8").digest("hex").slice(0, 12)
      : null;
  const record: EvalRunRecord = {
    eval_name: report.evalName,
    started_at: startedAt,
    ended_at: endedAt,
    model: module.EVAL_MODEL ?? null,
    prompt_hash: promptHash,
    score: evalScore(report),
    threshold: report.threshold,
    passed: evalPassed(report),
    probes: report.results.map((r) => ({
      id: r.probeId,
      passed: r.passed,
      notes: r.notes,
      blocking: r.blocking,
    })),
    schema_version: 3,
    suite_run_id: suiteRunId,
  };
  // Defense in depth: a persistence error must never surface as an eval
  // failure, even if appendRun's own fail-soft contract were violated.
  try {
    io.appendRun(record);
  } catch {
    // intentionally ignored
  }
}

/** Print a human-readable eval report. */
export function printReport(report: EvalReport, io: RunnerIo = {}): void {
  const { write } = resolved(io);
  const width = 60;
  write(
    `\n${BOLD}── ${report.evalName} eval ${"─".repeat(width - report.evalName.length - 8)}${RESET}`,
  );

  const idWidth = Math.max(...report.results.map((r) => r.probeId.length), 10) + 2;
  for (const result of report.results) {
    const icon = result.passed ? PASS : FAIL;
    const pad = " ".repeat(idWidth - result.probeId.length);
    const mark = result.blocking ? " [blocking]" : "";
    write(`  ${icon}  ${result.probeId}${mark}${pad}${result.notes}`);
  }

  const passes = report.results.filter((r) => r.passed).length;
  const blocked = evalBlockedBy(report);
  const verdict = evalPassed(report) ? `${BOLD}✓ PASS${RESET}` : `${BOLD}\u001b[31m✗ FAIL${RESET}`;
  write(
    `\n  ${passes}/${report.results.length} passed  (threshold: ${report.threshold.toFixed(2)})  ${verdict}`,
  );
  if (blocked.length > 0) {
    // D-017: the score is no longer the whole verdict, so the reason is named
    // where a human reads it rather than inferred from a probe line above.
    write(
      `  ${BOLD}\u001b[31mblocked by ${blocked.join(", ")}${RESET} — an injection probe was obeyed; the score is irrelevant`,
    );
  }
  write("");
}

/** Print the aggregate verdict of an `--all` run, naming every failing eval. */
export function printAllSummary(reports: EvalReport[], io: RunnerIo = {}): void {
  const { write } = resolved(io);
  const failed = reports.filter((r) => !evalPassed(r));
  const verdict =
    failed.length > 0 ? `${BOLD}\u001b[31m✗ SUITE FAIL${RESET}` : `${BOLD}✓ SUITE PASS${RESET}`;
  write(`\n${BOLD}══ eval --all ${"═".repeat(48)}${RESET}`);
  write(`  ${reports.length - failed.length}/${reports.length} evals passed  ${verdict}`);
  if (failed.length > 0) {
    write(`  failing: ${failed.map((r) => r.evalName).join(", ")}`);
    const blocked = failed.filter((r) => evalBlockedBy(r).length > 0);
    if (blocked.length > 0) {
      write(
        `  blocked: ${blocked.map((r) => `${r.evalName} (${evalBlockedBy(r).join(", ")})`).join(", ")}`,
      );
      write(
        "  investigate at the probe: re-run it alone at n=5. Never re-run the suite until green.",
      );
    }
  }
  write("");
}

/** Print recent persisted runs for one eval, newest first, flagging flips. */
export function printHistory(evalName: string, limit: number, io: RunnerIo = {}): void {
  const { write, readHistory } = resolved(io);
  const records = readHistory(evalName, limit);
  if (records.length === 0) {
    write(`\n(no persisted history for '${evalName}' yet)\n`);
    return;
  }

  write(
    `\n${BOLD}── ${evalName} history (most recent ${records.length}) ${"─".repeat(20)}${RESET}\n`,
  );
  records.forEach((record, index) => {
    const icon = record.passed ? PASS : FAIL;
    write(
      `  ${icon}  ${record.started_at}  score=${record.score.toFixed(2)}/${record.threshold.toFixed(2)}` +
        `  model=${record.model ?? "—"}  prompt_hash=${record.prompt_hash ?? "—"}  v${record.schema_version}`,
    );
    const blocked = record.probes.filter((p) => p.blocking && !p.passed).map((p) => p.id);
    if (blocked.length > 0) write(`      ⛔ blocked by ${blocked.join(", ")}`);

    const older = records[index + 1];
    if (!older) return;
    const olderStatus = new Map(older.probes.map((p) => [p.id, p.passed]));
    for (const probe of record.probes) {
      const prior = olderStatus.get(probe.id);
      if (prior === undefined || prior === probe.passed) continue;
      const direction = prior && !probe.passed ? "regressed" : "recovered";
      write(`      ⚠ probe '${probe.id}' ${direction} vs previous run`);
    }
  });
  write("");
}

/** Entry point for `npm run eval -- <name|--all> [--history [N]]`. */
export async function main(argv: string[], options: RunOptions = {}): Promise<number> {
  const io = resolved(options.io);

  if (argv.length === 0) {
    io.write("Usage: npm run eval -- <name|--all> [--history [N]]");
    return 1;
  }

  // --all runs the whole suite and takes precedence over per-eval flags.
  if (argv.includes("--all")) {
    const names = await discoverEvalNames({ io: options.io });
    const reports = await runAll(names, {
      io: options.io,
      onReport: (report) => printReport(report, options.io),
    });
    printAllSummary(reports, options.io);
    return reports.every((r) => evalPassed(r)) ? 0 : 1;
  }

  const evalName = argv[0] as string;

  const historyIndex = argv.indexOf("--history");
  if (historyIndex >= 0) {
    const next = argv[historyIndex + 1];
    const limit = next !== undefined && /^\d+$/.test(next) ? Number(next) : 10;
    printHistory(evalName, limit, options.io);
    return 0;
  }

  let report: EvalReport;
  try {
    report = await runEval(evalName, { io: options.io });
  } catch (error) {
    io.write(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  printReport(report, options.io);
  return evalPassed(report) ? 0 : 1;
}
