#!/usr/bin/env node
//
// Front-door entry: route a command to the TS core or the frozen Python engine,
// dispatch reads/writes, and log the outcome. Argument parsing lives in
// `args.ts`, DB-path resolution in `dbPath.ts`, and the read renderers in
// `render/`. The module is importable (the entry guard at the bottom runs
// `main` only when invoked directly), so its pieces can be tested in-process.
//
// Working-directory invariant: the production skills invoke this front door by
// its relative path (`node ts/src/frontDoor/cli.ts …`), which only resolves
// from the repository root — so the process cwd is the repo root by
// construction. The Python fallback inherits that cwd and runs
// `uv run python -m memory`; uv walks upward to find the root `pyproject.toml`.
// Invoking by an absolute path from an unrelated directory is unsupported. See
// the TS front-door section of docs/process/troubleshooting.md.
//
// node:sqlite emits an ExperimentalWarning at import; the skills pass
// NODE_OPTIONS=--no-warnings to keep it off stdout/stderr.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  openDatabaseForWrite,
  openDatabaseReadOnly,
  type WritableDatabase,
} from "../db/database.ts";
import { assertSchemaState, SchemaStateError } from "../db/schemaState.ts";
import { JourneyNotFoundError } from "../journey/journeyWrite.ts";
import { expandHome } from "../util/paths.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";
import { optionValue, stripOptionWithValue } from "./args.ts";
import { runConsultRoute } from "./consultRoute.ts";
import { MirrorHomeNotConfiguredError, resolveDbPath } from "./dbPath.ts";
import { frontDoorLogPath, logFrontDoor } from "./frontDoorLog.ts";
import { applyIdentitySet } from "./identityWrite.ts";
import { applyJourneySetPath } from "./journeyWriteRoute.ts";
import { ensureBackup } from "./liveBackup.ts";
import { nodeVersionError } from "./nodeSupport.ts";
import { renderDetectPersona } from "./render/detectPersona.ts";
import { renderJourneys } from "./render/journeys.ts";
import { renderMemories } from "./render/memories.ts";
import { type FrontDoorEngine, routeMemoryCommand } from "./routing.ts";
import { runMemorySearchRoute } from "./searchRoute.ts";

/**
 * Resolve the database path for a CLI invocation, mapping a configuration
 * failure (no home/env resolvable) to a printed error and null — callers
 * translate null into exit code 2.
 */
function resolveDbPathForCli(args: readonly string[]): string | null {
  try {
    return resolveDbPath(args);
  } catch (error) {
    if (error instanceof MirrorHomeNotConfiguredError) {
      console.error(`Mirror TS front door: ${error.message}`);
      return null;
    }
    throw error;
  }
}

/**
 * Default ceiling for a fallback Python command. Generous on purpose —
 * unported commands include LLM extraction and consult — but finite, so a
 * process blocked on stdin or a hung network call cannot hang the session
 * forever. Tests override via MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS.
 */
const DEFAULT_PYTHON_TIMEOUT_MS = 10 * 60 * 1000;

function pythonTimeoutMs(): number {
  const raw = Number(process.env.MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PYTHON_TIMEOUT_MS;
}

function fallbackPython(argv: readonly string[]): number {
  const explicitDbPath = optionValue(argv, "--db-path");
  const pythonArgv = stripOptionWithValue(argv, "--db-path");
  const result = spawnSync("uv", ["run", "python", "-m", "memory", ...pythonArgv], {
    cwd: process.cwd(),
    env: explicitDbPath ? { ...process.env, DB_PATH: expandHome(explicitDbPath) } : process.env,
    stdio: "inherit",
    timeout: pythonTimeoutMs(),
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error(
        "Mirror TS front door: could not spawn `uv` — the Python fallback needs uv on PATH. " +
          "Install it (https://docs.astral.sh/uv/) or fix PATH for the runtime that launched this session.",
      );
    } else if (code === "ETIMEDOUT") {
      console.error(
        `Mirror TS front door: Python fallback timed out after ${pythonTimeoutMs()}ms ` +
          `(command: memory ${pythonArgv.join(" ")}). The process was terminated; ` +
          "if this command legitimately runs longer, raise MIRROR_FRONTDOOR_PYTHON_TIMEOUT_MS.",
      );
    } else {
      console.error(`Mirror TS front door: Python fallback failed to run: ${result.error.message}`);
    }
    return 1;
  }
  return typeof result.status === "number" ? result.status : 1;
}

/** Serve a ported read command from the TS core, or self-heal a missing DB via Python. */
function runTs(argv: readonly string[]): number {
  const command = argv[0];
  const args = argv.slice(1);
  const dbPath = resolveDbPathForCli(args);
  if (dbPath === null) return 2;
  // First-run contract: a missing database means an unbootstrapped install.
  // Delegate to Python, which creates the directory, schema, and migrations and
  // answers — the same self-heal a new user got before the DS3 cutover (see
  // docs/project/decisions.md). TS only serves an existing database.
  if (!existsSync(dbPath)) return fallbackPython(argv);
  const db = openDatabaseReadOnly(dbPath);
  try {
    assertSchemaState(db);
    if (command === "detect-persona") process.stdout.write(renderDetectPersona(db, args));
    else if (command === "journeys") process.stdout.write(renderJourneys(db));
    else if (command === "memories") process.stdout.write(renderMemories(db, args));
    else throw new Error(`Unsupported TS route: ${command}`);
    return 0;
  } catch (error) {
    if (error instanceof SchemaStateError) {
      console.error(`Mirror TS front door: ${error.message}`);
      return 2;
    }
    throw error;
  } finally {
    db.close();
  }
}

function readStdinContent(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/**
 * Shared skeleton for the sanctioned live-write commands: resolve the DB (exit 2
 * on config failure), self-heal a missing DB via Python, open the backup-gated
 * live-write seam, assert schema state, run `write`, and always close. Schema
 * drift maps to exit 2; every other error propagates for the caller's own
 * handling. Callers do their argument pre-validation before invoking this.
 */
function withLiveWriteDb(argv: readonly string[], write: (db: WritableDatabase) => number): number {
  const dbPath = resolveDbPathForCli(argv.slice(2));
  if (dbPath === null) return 2;
  // Missing DB => unbootstrapped install; let Python bootstrap and write.
  if (!existsSync(dbPath)) return fallbackPython(argv);
  const db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
  try {
    assertSchemaState(db);
    return write(db);
  } catch (error) {
    if (error instanceof SchemaStateError) {
      console.error(`Mirror TS front door: ${error.message}`);
      return 2;
    }
    throw error;
  } finally {
    db.close();
  }
}

function isIdentityWrite(argv: readonly string[]): boolean {
  return argv[0] === "identity" && argv[1] === "set";
}

/**
 * Route `identity set <layer> <key> --content ... | stdin` to the TS core. Mirrors
 * the Python `identity set` interface and output, but writes through the sanctioned
 * live-write seam after a backup, reusing the ported `setIdentity`.
 */
function runIdentityWrite(argv: readonly string[]): number {
  const args = argv.slice(2);
  const positionals = stripOptionWithValue(
    stripOptionWithValue(stripOptionWithValue(args, "--content"), "--db-path"),
    "--mirror-home",
  );
  const layer = positionals[0];
  const key = positionals[1];
  if (!layer || !key) {
    console.error("identity set requires <layer> <key>");
    return 2;
  }
  const content = optionValue(args, "--content") ?? readStdinContent();
  if (!content.trim()) {
    console.error("Error: content is empty.");
    return 1;
  }
  return withLiveWriteDb(argv, (db) => {
    const outcome = applyIdentitySet(db, { layer, key, content, id: newId(), nowIso: nowIso() });
    process.stdout.write(`\u2713 ${outcome.layer}/${outcome.key} ${outcome.action}\n`);
    return 0;
  });
}

function isJourneyWrite(argv: readonly string[]): boolean {
  return argv[0] === "journey" && argv[1] === "set-path";
}

function isMemorySearch(argv: readonly string[]): boolean {
  return argv[0] === "memories" && argv.includes("--search");
}

function isConsult(argv: readonly string[]): boolean {
  return argv[0] === "consult";
}

/**
 * Route `journey set-path <slug> <path>` to the TS core. Normalizes the path like
 * Python (`Path.expanduser().resolve()`), writes through the live-write seam after a
 * backup via the ported setProjectPath, and mirrors Python's output: the resolved
 * path on stdout, a status line on stderr, and a not-found error + exit 1.
 */
function runJourneyWrite(argv: readonly string[]): number {
  const args = argv.slice(2);
  const positionals = stripOptionWithValue(
    stripOptionWithValue(args, "--db-path"),
    "--mirror-home",
  );
  const slug = positionals[0];
  const rawPath = positionals[1];
  if (!slug || !rawPath) {
    console.error("Usage: journey set-path <slug> <path>");
    return 2;
  }
  return withLiveWriteDb(argv, (db) => {
    try {
      const resolved = applyJourneySetPath(db, slug, rawPath, nowIso());
      console.error(`project_path set for '${slug}': ${resolved}`);
      process.stdout.write(`${resolved}\n`);
      return 0;
    } catch (error) {
      if (error instanceof JourneyNotFoundError) {
        console.error(`Error: journey '${slug}' not found.`);
        return 1;
      }
      throw error;
    }
  });
}

/** Best-effort log path from the same resolver; null when unconfigured. */
function resolveLogPath(argv: readonly string[]): string | null {
  try {
    return frontDoorLogPath(resolveDbPath(argv));
  } catch {
    return null;
  }
}

async function runMemorySearch(argv: readonly string[]): Promise<number> {
  const dbPath = resolveDbPathForCli(argv.slice(1));
  if (dbPath === null) return 2;
  if (!existsSync(dbPath)) return fallbackPython(argv);
  const db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
  try {
    assertSchemaState(db);
    process.stdout.write(await runMemorySearchRoute(db, argv.slice(1)));
    return 0;
  } catch (error) {
    if (error instanceof SchemaStateError) {
      console.error(`Mirror TS front door: ${error.message}`);
      return 2;
    }
    throw error;
  } finally {
    db.close();
  }
}

async function dispatch(argv: readonly string[], engine: FrontDoorEngine): Promise<number> {
  if (engine === "python") return fallbackPython(argv);
  if (isIdentityWrite(argv)) return runIdentityWrite(argv);
  if (isJourneyWrite(argv)) return runJourneyWrite(argv);
  if (isMemorySearch(argv)) return runMemorySearch(argv);
  if (isConsult(argv)) {
    process.stdout.write(await runConsultRoute(argv.slice(1)));
    return 0;
  }
  return runTs(argv);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const nodeError = nodeVersionError(process.versions.node);
  if (nodeError) {
    console.error(nodeError);
    return 1;
  }
  const decision = routeMemoryCommand(argv);
  const logPath = resolveLogPath(argv);
  try {
    const exitCode = await dispatch(argv, decision.engine);
    logFrontDoor(logPath, { command: decision.command, route: decision.engine, exitCode });
    return exitCode;
  } catch (error) {
    // Metadata-only: the error's name/category, never argument values.
    const detail = error instanceof Error ? error.name : "unknown error";
    logFrontDoor(logPath, {
      command: decision.command,
      route: decision.engine,
      exitCode: 1,
      detail,
    });
    throw error;
  }
}

// Run only when invoked as the CLI entry, not when imported (keeps the module
// importable for tests and tooling).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
