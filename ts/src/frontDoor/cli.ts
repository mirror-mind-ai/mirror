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
import { basename, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapDatabaseIfMissing } from "../db/bootstrap.ts";
import {
  type Database,
  openDatabaseForWrite,
  openDatabaseReadOnly,
  type WritableDatabase,
} from "../db/database.ts";
import { ensureMigratedOnOpen } from "../db/migrateOnOpen.ts";
import { assertSchemaState, SchemaStateError } from "../db/schemaState.ts";
import { allDescriptors, descriptorsByLayer } from "../descriptor/descriptorRead.ts";
import { listJourneysForListCommand } from "../identity/journeyListing.ts";
import { listPersonas } from "../identity/personaListing.ts";
import { setIdentity } from "../identity/setIdentity.ts";
import { IdentityRootExistsError, initUserHome, TemplatesNotFoundError } from "../init/init.ts";
import { JOURNEY_PATH_LAYER } from "../journey/journeyStatus.ts";
import { JourneyNotFoundError } from "../journey/journeyWrite.ts";
import { expandHome } from "../util/paths.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";
import { hasOption, optionValue, stripOptionWithValue } from "./args.ts";
import { runConsultRoute } from "./consultRoute.ts";
import { MirrorHomeNotConfiguredError, resolveDbPath } from "./dbPath.ts";
import { frontDoorLogPath, logFrontDoor } from "./frontDoorLog.ts";
import { applyIdentitySet } from "./identityWrite.ts";
import { applyJourneySetPath } from "./journeyWriteRoute.ts";
import { ensureBackup } from "./liveBackup.ts";
import { nodeVersionError } from "./nodeSupport.ts";
import { renderConversationsListing } from "./render/conversations.ts";
import { renderDescriptorList } from "./render/descriptor.ts";
import { renderDetectPersona } from "./render/detectPersona.ts";
import {
  IdentityEntryNotFoundError,
  identityListRows,
  renderIdentityGet,
  renderIdentityList,
} from "./render/identity.ts";
import { PersonaNotFoundError, renderInspectPersona } from "./render/inspectPersona.ts";
import { renderJourneyStatus, resolveJourneyStatusSlug } from "./render/journeyStatus.ts";
import { renderJourneys } from "./render/journeys.ts";
import { renderListJourneys, renderListPersonas } from "./render/list.ts";
import { renderMemories } from "./render/memories.ts";
import { ConversationNotFoundError, renderRecall } from "./render/recall.ts";
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

/**
 * Prepare a database for TS serving: bootstrap it if the file is absent (TS4),
 * then apply any pending TS-authored forward migration Python cannot (US3
 * migrate-on-open). The steady state is a cheap no-op; a one-time migration is
 * recorded as a redacted `migrate_on_open` event (migration ids + backup file
 * name, never content). Shared by every TS serving path so read and write opens
 * get the same activation before the serving connection is opened.
 */
function ensureDatabaseReady(dbPath: string, command: string | null): void {
  bootstrapDatabaseIfMissing(dbPath);
  const migration = ensureMigratedOnOpen(dbPath);
  if (migration.migrated) {
    logFrontDoor(frontDoorLogPath(dbPath), {
      command,
      route: "ts",
      exitCode: 0,
      detail: `migrate_on_open applied=${migration.appliedIds.join(",")} backup=${
        migration.backupPath ? basename(migration.backupPath) : "none"
      }`,
    });
  }
}

/** Serve a ported read command from the TS core, bootstrapping a missing DB via the TS core first. */
function runTs(argv: readonly string[]): number {
  const command = argv[0];
  const args = argv.slice(1);
  const dbPath = resolveDbPathForCli(args);
  if (dbPath === null) return 2;
  // First-run contract (CV22.DS6.TS4): a missing database means an
  // unbootstrapped install. TS now owns bootstrap — create the directory,
  // schema, and migrations under the cross-process lock — then serve read-only
  // from the fresh file. (This replaces the DS3 stopgap that delegated a
  // missing DB to Python; see docs/project/decisions.md.)
  ensureDatabaseReady(dbPath, command ?? null);
  const db = openDatabaseReadOnly(dbPath);
  try {
    assertSchemaState(db);
    if (command === "detect-persona") process.stdout.write(renderDetectPersona(db, args));
    else if (command === "journeys") process.stdout.write(renderJourneys(db));
    else if (command === "memories") process.stdout.write(renderMemories(db, args));
    else if (command === "identity") return runIdentityRead(db, args);
    else if (command === "descriptor") return runDescriptorRead(db, args);
    else if (command === "list") return runListRead(db, args);
    else if (command === "inspect") return runInspectRead(db, args);
    else if (command === "recall") return runRecallRead(db, args);
    else if (command === "conversations") return runConversationsRead(db, args);
    else if (command === "journey") return runJourneyStatusRead(db, args);
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

/**
 * Serve `identity list` / `identity get` (DS7.US1). `args` excludes the
 * `identity` token itself, e.g. `["list", "--layer", "ego"]` or
 * `["get", "ego", "behavior"]`. `identity set` and `identity edit` never reach
 * here — routed elsewhere (write seam) or to Python (interactive) respectively.
 */
function runIdentityRead(db: Database, args: readonly string[]): number {
  const sub = args[0];
  const rest = stripOptionWithValue(
    stripOptionWithValue(args.slice(1), "--mirror-home"),
    "--db-path",
  );
  if (sub === "list") {
    process.stdout.write(renderIdentityList(identityListRows(db, optionValue(args, "--layer"))));
    return 0;
  }
  // sub === "get" (the only other route.ts-allowed subcommand).
  const [layer, key] = rest;
  if (!layer || !key) {
    console.error("Usage: identity get <layer> <key>");
    return 2;
  }
  try {
    process.stdout.write(renderIdentityGet(db, layer, key));
    return 0;
  } catch (error) {
    if (error instanceof IdentityEntryNotFoundError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/** Serve `descriptor list` (DS7.US1). `descriptor generate` never reaches here. */
function runDescriptorRead(db: Database, args: readonly string[]): number {
  const layer = optionValue(args, "--layer");
  const rows = layer ? descriptorsByLayer(db, layer) : allDescriptors(db);
  process.stdout.write(renderDescriptorList(rows));
  return 0;
}

/** Serve `list personas` / `list journeys` (DS7.US1). `extensions`/`all` never reach here. */
function runListRead(db: Database, args: readonly string[]): number {
  if (args[0] === "personas") {
    process.stdout.write(renderListPersonas(listPersonas(db), hasOption(args, "--verbose")));
    return 0;
  }
  process.stdout.write(renderListJourneys(listJourneysForListCommand(db)));
  return 0;
}

/** Serve `inspect persona <id>` (DS7.US1). Other inspect targets never reach here. */
function runInspectRead(db: Database, args: readonly string[]): number {
  const rest = stripOptionWithValue(
    stripOptionWithValue(args.slice(1), "--mirror-home"),
    "--extensions-root",
  );
  const personaId = rest[0];
  if (!personaId) {
    console.error("Usage: inspect persona <id>");
    return 2;
  }
  try {
    process.stdout.write(renderInspectPersona(db, personaId));
    return 0;
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      // Matches Python: this goes to STDOUT, not stderr.
      process.stdout.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

/** Serve `recall <conv_id> [--limit N]` (DS7.US1). */
function runRecallRead(db: Database, args: readonly string[]): number {
  const limitRaw = optionValue(args, "--limit");
  const limit = limitRaw !== null ? Number(limitRaw) : 50;
  const positionals = stripOptionWithValue(
    stripOptionWithValue(stripOptionWithValue(args, "--limit"), "--mirror-home"),
    "--db-path",
  );
  const convId = positionals[0];
  if (!convId) {
    console.error("Usage: recall <conv_id> [--limit N]");
    return 2;
  }
  try {
    process.stdout.write(renderRecall(db, convId, limit));
    return 0;
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/** Serve `conversations` (plain listing only; DS7.US1). */
function runConversationsRead(db: Database, args: readonly string[]): number {
  const limitRaw = optionValue(args, "--limit");
  process.stdout.write(
    renderConversationsListing(db, {
      limit: limitRaw !== null ? Number(limitRaw) : 20,
      journey: optionValue(args, "--journey"),
      persona: optionValue(args, "--persona"),
    }),
  );
  return 0;
}

/**
 * Serve `journey` status reads (DS7.US1): `journey`, `journey <slug>`,
 * `journey status`, `journey status <slug>`. `journey set-path`/`update` never
 * reach here (routed elsewhere / Python fallback).
 */
function runJourneyStatusRead(db: Database, args: readonly string[]): number {
  const remaining = stripOptionWithValue(stripOptionWithValue(args, "--mirror-home"), "--db-path");
  process.stdout.write(renderJourneyStatus(db, resolveJourneyStatusSlug(remaining)));
  return 0;
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
 * on config failure), bootstrap a missing DB via the TS core, open the
 * backup-gated live-write seam, assert schema state, run `write`, and always
 * close. Schema
 * drift maps to exit 2; every other error propagates for the caller's own
 * handling. Callers do their argument pre-validation before invoking this.
 */
function withLiveWriteDb(argv: readonly string[], write: (db: WritableDatabase) => number): number {
  const dbPath = resolveDbPathForCli(argv.slice(2));
  if (dbPath === null) return 2;
  // Missing DB => unbootstrapped install; TS bootstraps it (CV22.DS6.TS4) and
  // applies any pending TS-authored migration (US3), then the backup-gated
  // live-write seam opens the now-current file.
  ensureDatabaseReady(dbPath, argv[0] ?? null);
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

function isJourneyUpdateWrite(argv: readonly string[]): boolean {
  return argv[0] === "journey" && argv[1] === "update";
}

function isMemorySearch(argv: readonly string[]): boolean {
  return argv[0] === "memories" && argv.includes("--search");
}

function isConsult(argv: readonly string[]): boolean {
  return argv[0] === "consult";
}

function isInit(argv: readonly string[]): boolean {
  return argv[0] === "init";
}

/**
 * Serve `init <user>` (DS7.US1 Slice B). Filesystem-only — no database is
 * opened. Python's argparse defines only the `user` positional (no
 * --mirror-home/--db-path), so none are stripped here.
 *
 * Deliberate divergence: an already-populated identity root or a missing
 * templates root are uncaught exceptions in Python (a raw traceback, exit 1) --
 * not a designed message. This preserves the contract (exit 1, a stderr
 * message naming the failure) without fabricating a fake traceback.
 */
function runInit(argv: readonly string[]): number {
  const user = argv[1];
  if (!user) {
    console.error("Usage: init <user>");
    return 2;
  }
  try {
    const identityRoot = initUserHome(user);
    const mirrorHome = dirname(identityRoot);
    const prints = [
      `Created user home: ${mirrorHome}`,
      `Identity ready at: ${identityRoot}`,
      "\nNext steps:",
      `  1. Add to your .env: MIRROR_HOME=${mirrorHome}`,
      "  2. Run: uv run python -m memory seed",
      "\nYour identity is ready to use. Deepen it over time with:",
      "  uv run python -m memory identity edit user identity",
    ];
    process.stdout.write(prints.map((line) => `${line}\n`).join(""));
    return 0;
  } catch (error) {
    if (error instanceof IdentityRootExistsError || error instanceof TemplatesNotFoundError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/** `consult credits` never logs to llm_calls (Python doesn't either, AI-09) --
 * so it skips the live-write db-open entirely, matching its current
 * read-only-external-API shape. */
function isConsultCredits(argv: readonly string[]): boolean {
  return argv[1] === "credits";
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

/**
 * Route `journey update <slug> <content|-stdin>` to the TS core (DS7.US1 Slice B).
 * A thin wrapper over the already-ported `setIdentity`: Python's own
 * `set_journey_path` is the SAME upsert-identity primitive with a fixed
 * `journey_path` layer, no created/updated verb distinction (always prints
 * "updated", matching Python exactly), and no check that the journey slug
 * itself exists.
 */
function runJourneyUpdateWrite(argv: readonly string[]): number {
  const args = argv.slice(2);
  const positionals = stripOptionWithValue(
    stripOptionWithValue(args, "--db-path"),
    "--mirror-home",
  );
  const slug = positionals[0];
  let content = positionals[1];
  if (!slug || content === undefined) {
    console.error("Usage: journey update <slug> <content|-stdin>");
    return 2;
  }
  if (content === "-") content = readStdinContent();
  return withLiveWriteDb(argv, (db) => {
    setIdentity(db, { id: newId(), layer: JOURNEY_PATH_LAYER, key: slug, content }, nowIso());
    console.error(`Journey path '${slug}' updated.`);
    return 0;
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

/**
 * `consult <model> <question>` logs to llm_calls on a best-effort basis
 * (AI-09). Unlike `runMemorySearch`/`runIdentityWrite`/`runJourneyWrite`,
 * consult's established contract does NOT require a database to exist --
 * it is fundamentally an external-API command, and logging is an added,
 * optional side effect. If a db cannot be resolved, opened, backed up, or
 * schema-checked for any reason, consult must still run; it just logs
 * nothing -- the same fail-soft principle `logLlmCall` applies to the write
 * itself, extended to db resolution.
 */
async function runConsultAskWithDb(argv: readonly string[]): Promise<number> {
  const db = tryOpenDbForConsultLogging(argv);
  try {
    process.stdout.write(await runConsultRoute(db, argv.slice(1)));
    return 0;
  } finally {
    db?.close();
  }
}

export function tryOpenDbForConsultLogging(argv: readonly string[]): WritableDatabase | null {
  let db: WritableDatabase | null = null;
  try {
    // Uses resolveDbPath directly, NOT resolveDbPathForCli -- that wrapper
    // prints a user-facing error on an unconfigured mirror home, which is
    // correct for commands that require a db but wrong here: consult without
    // a configured home must stay completely silent about logging, exactly
    // as it behaved before this CR.
    const dbPath = resolveDbPath(argv.slice(1));
    if (!existsSync(dbPath)) return null;
    db = openDatabaseForWrite(dbPath, ensureBackup(dbPath));
    assertSchemaState(db);
    return db;
  } catch {
    db?.close();
    return null;
  }
}

async function runMemorySearch(argv: readonly string[]): Promise<number> {
  const dbPath = resolveDbPathForCli(argv.slice(1));
  if (dbPath === null) return 2;
  // Missing DB => unbootstrapped install; TS bootstraps it (CV22.DS6.TS4) and
  // applies any pending TS-authored migration (US3) before the backup-gated
  // search read/log path opens it.
  ensureDatabaseReady(dbPath, argv[0] ?? null);
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
  if (isInit(argv)) return runInit(argv);
  if (isIdentityWrite(argv)) return runIdentityWrite(argv);
  if (isJourneyWrite(argv)) return runJourneyWrite(argv);
  if (isJourneyUpdateWrite(argv)) return runJourneyUpdateWrite(argv);
  if (isMemorySearch(argv)) return runMemorySearch(argv);
  if (isConsult(argv)) {
    if (isConsultCredits(argv)) {
      process.stdout.write(await runConsultRoute(null, argv.slice(1)));
      return 0;
    }
    return runConsultAskWithDb(argv);
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
