import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Database, WritableDatabase } from "#db/database.ts";
import {
  type DoormanDecision,
  decideDoorman,
  doormanPersonas,
  readDoormanSessionState,
  runDoorman,
} from "#mirror/doorman.ts";
import {
  deactivateMirrorState,
  listActiveMirrorJourneys,
  logMirrorResponse,
  runMirrorLoad,
} from "#mirror/orchestration.ts";
import { environmentSessionId, resolveNamedRuntimeSessionId } from "#mirror/runtimeSession.ts";
import {
  activateOperatingMode,
  deactivateOperatingMode,
  getActiveOperatingMode,
  renderModeActivation,
  renderModeStatus,
} from "#mode/operatingMode.ts";
import type { OnProviderCallOutcome } from "#observability/callOutcome.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import { MIRROR_QUERY_TRANSPORT, mirrorQueryTransportFor } from "#providers/transport.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { hasOption, optionValue, stripOptionWithValue } from "./args.ts";

/**
 * A type alias rather than an interface, for the same reason `RouteEnvironment`
 * is one: aliases get an implicit index signature, which is what lets the named
 * variables still be handed to `resolveFamilyProviders`, whose families name
 * their variables as data.
 */
export type MirrorRouteEnvironment = {
  MIRROR_SESSION_ID?: string;
  CLAUDE_CODE_SESSION_ID?: string;
  CODEX_SESSION_ID?: string;
  MEMORY_RECEPTION?: string;
  MIRROR_TS_MIRROR_LLM_REPLAY?: string;
  MIRROR_TS_MIRROR_EMBEDDING_REPLAY?: string;
};

export function isMirrorWrite(argv: readonly string[]): boolean {
  return argv[0] === "mirror" && ["load", "deactivate", "log"].includes(argv[1] ?? "");
}

/**
 * `mirror doorman` is a write surface with its own handle discipline
 * (CV9.DS8.TS2): it is not `isMirrorWrite`, because the front door's shared
 * write seam opens the live-write path -- a database snapshot -- before any
 * route runs, and a doorman turn that owes nothing must never pay that.
 */
export function isMirrorDoorman(argv: readonly string[]): boolean {
  return argv[0] === "mirror" && argv[1] === "doorman";
}

export interface DoormanRouteDeps {
  /** The database, read-only: enough to decide. */
  withReadOnlyDatabase: (read: (db: Database) => DoormanDecision) => DoormanDecision | number;
  /** The database behind the pre-write snapshot: only for a turn that delivers. */
  withLiveWriteDatabase: (
    write: (db: WritableDatabase, dbPath: string) => Promise<number>,
  ) => Promise<number>;
  onReceptionOutcome?: OnProviderCallOutcome;
  /** Content-free: the turn's memory scores, for the front-door log. */
  onMemoryScores?: (scores: readonly number[]) => void;
}

/**
 * `mirror doorman --prompt "<text>" [--session-id <id>]`: the one doorman as a
 * command, for the Pi extension (US5). Prints the block or nothing; exit 0.
 *
 * Two steps on purpose. The decision is read from a read-only handle; the
 * live-write handle -- `VACUUM INTO` first, 95 ms measured on a 53 MB database
 * -- opens only when the decision is `full` or `delta`. The ordinary turn
 * outside Mirror Mode costs a read and nothing else, as the inject hook's does.
 */
export async function runMirrorDoormanRoute(
  argv: readonly string[],
  deps: DoormanRouteDeps,
  env: MirrorRouteEnvironment = process.env,
): Promise<number> {
  const args = argv.slice(2);
  const prompt = optionValue(args, "--prompt");
  if (prompt === null || prompt === undefined) {
    console.error("mirror doorman requires --prompt");
    return 2;
  }
  const sessionId = resolveNamedRuntimeSessionId(
    optionValue(args, "--session-id") ?? null,
    environmentSessionId(env),
  );
  const decided = deps.withReadOnlyDatabase((db) =>
    decideDoorman({
      prompt,
      state: readDoormanSessionState(db, sessionId),
      personas: doormanPersonas(db),
    }),
  );
  if (typeof decided === "number") return decided;
  if (decided.kind === "nothing") return 0;

  // Providers only now: a turn that delivers may embed (delta) or route
  // (full); the turn above resolved none, let alone a key.
  const receptionEnabled = env.MEMORY_RECEPTION !== "0";
  const family = await resolveFamilyProviders(env, mirrorQueryTransportFor(env));
  return deps.withLiveWriteDatabase(async (db, dbPath) => {
    const mirrorHome = dirname(dbPath);
    const rendered = await runDoorman(db, decided, {
      identity: basename(mirrorHome),
      databasePath: dbPath,
      mirrorHome,
      user: basename(mirrorHome),
      sessionId,
      receptionEnabled,
      onReceptionOutcome: deps.onReceptionOutcome,
      llmProvider: receptionEnabled ? family.llm : undefined,
      embeddingProvider: family.embedding,
      onMemoryScores: deps.onMemoryScores,
      newId,
      nowIso,
    });
    process.stdout.write(rendered.stdout);
    process.stderr.write(rendered.stderr);
    return 0;
  });
}

export function isModeWrite(argv: readonly string[]): boolean {
  if (argv[0] !== "mode") return false;
  const args = modePositionals(argv.slice(1));
  return args[0] === "activate" || args[0] === "deactivate";
}

export function mirrorDeactivateMissingSession(argv: readonly string[]): boolean {
  return argv[0] === "mirror" && argv[1] === "deactivate" && !optionValue(argv, "--session-id");
}

export function runMirrorRead(db: Database, args: readonly string[]): number {
  if (args[0] !== "journeys") throw new Error(`Unsupported TS mirror read: ${args[0]}`);
  process.stdout.write(listActiveMirrorJourneys(db));
  return 0;
}

export function runModeRead(db: Database, args: readonly string[]): number {
  const sessionId = optionValue(args, "--session-id");
  process.stdout.write(renderModeStatus(getActiveOperatingMode(db, sessionId)));
  return 0;
}

export async function runMirrorWriteRoute(
  db: WritableDatabase,
  dbPath: string,
  argv: readonly string[],
  env: MirrorRouteEnvironment = process.env,
  options: { onReceptionOutcome?: OnProviderCallOutcome } = {},
): Promise<number> {
  const sub = argv[1];
  const args = argv.slice(2);
  const sessionId = optionValue(args, "--session-id");
  if (sub === "deactivate") {
    deactivateMirrorState(db, sessionId as string, nowIso());
    console.error("Mirror Mode deactivated.");
    return 0;
  }
  if (sub === "log") {
    const summary = stripOptionWithValue(
      stripOptionWithValue(stripOptionWithValue(args, "--session-id"), "--mirror-home"),
      "--db-path",
    )[0];
    if (!summary) {
      console.error("mirror log requires a summary");
      return 2;
    }
    logMirrorResponse(db, {
      summary,
      sessionId,
      environmentSessionId: env.MIRROR_SESSION_ID ?? null,
      muted: existsSync(join(dirname(dbPath), "mute")),
      newId,
      nowIso,
    });
    console.error("Response recorded.");
    return 0;
  }
  const query = optionValue(args, "--query");
  const receptionEnabled = env.MEMORY_RECEPTION !== "0";
  // Built from the same spec `routing.ts` decided with, and only for a query
  // run: a deterministic `mirror load` must not construct a provider, let
  // alone resolve a key (CV22.DS8.US3).
  const family = query ? await resolveFamilyProviders(env, MIRROR_QUERY_TRANSPORT) : null;
  const mirrorHome = dirname(dbPath);
  const rendered = await runMirrorLoad(db, {
    identity: basename(mirrorHome),
    databasePath: dbPath,
    mirrorHome,
    user: basename(mirrorHome),
    persona: optionValue(args, "--persona"),
    journey: optionValue(args, "--journey"),
    query,
    org: hasOption(args, "--org"),
    contextOnly: hasOption(args, "--context-only"),
    sessionId,
    // The harness's variable, whichever runtime set it (CV9.DS8.TS2): the
    // skill's own load on Claude Code or Codex names the session the hooks
    // write. `mirror log` keeps reading `MIRROR_SESSION_ID` alone: its
    // fallback is a guess, and widening that is a CR008 question.
    environmentSessionId: environmentSessionId(env),
    receptionEnabled,
    onReceptionOutcome: options.onReceptionOutcome,
    llmProvider: receptionEnabled ? family?.llm : undefined,
    embeddingProvider: family?.embedding,
    newId,
    nowIso,
  });
  process.stdout.write(rendered.stdout);
  process.stderr.write(rendered.stderr);
  for (const diagnostic of rendered.extensionDiagnostics) {
    process.stderr.write(`warning: extension context ${diagnostic.kind}; continuing.\n`);
  }
  return 0;
}

export function runModeWriteRoute(db: WritableDatabase, argv: readonly string[]): number {
  const rawArgs = argv.slice(1);
  const args = modePositionals(rawArgs);
  const sub = args[0];
  const sessionId = optionValue(rawArgs, "--session-id");
  if (sub === "activate") {
    const mode = args[1];
    if (!mode) {
      console.error("mode activate requires a mode");
      return 2;
    }
    const state = activateOperatingMode(
      db,
      { mode, journey: optionValue(rawArgs, "--journey"), sessionId },
      nowIso(),
    );
    process.stdout.write(renderModeActivation(state));
    return 0;
  }
  deactivateOperatingMode(db, sessionId, nowIso());
  process.stdout.write("Deactivated active mode\n");
  return 0;
}

function modePositionals(args: readonly string[]): string[] {
  return stripOptionWithValue(
    stripOptionWithValue(
      stripOptionWithValue(stripOptionWithValue(args, "--mirror-home"), "--db-path"),
      "--session-id",
    ),
    "--journey",
  );
}
