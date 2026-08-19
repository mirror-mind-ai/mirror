import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Database, WritableDatabase } from "#db/database.ts";
import {
  deactivateMirrorState,
  listActiveMirrorJourneys,
  logMirrorResponse,
  runMirrorLoad,
} from "#mirror/orchestration.ts";
import {
  activateOperatingMode,
  deactivateOperatingMode,
  getActiveOperatingMode,
  renderModeActivation,
  renderModeStatus,
} from "#mode/operatingMode.ts";
import { loadReplayEmbeddingProvider } from "#providers/embedding.ts";
import { loadReplayLlmProvider } from "#providers/llm.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";
import { hasOption, optionValue, stripOptionWithValue } from "./args.ts";

export interface MirrorRouteEnvironment {
  MIRROR_SESSION_ID?: string;
  MEMORY_RECEPTION?: string;
  MIRROR_TS_MIRROR_LLM_REPLAY?: string;
  MIRROR_TS_MIRROR_EMBEDDING_REPLAY?: string;
}

export function isMirrorWrite(argv: readonly string[]): boolean {
  return argv[0] === "mirror" && ["load", "deactivate", "log"].includes(argv[1] ?? "");
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
  const llmReplay = env.MIRROR_TS_MIRROR_LLM_REPLAY;
  const embeddingReplay = env.MIRROR_TS_MIRROR_EMBEDDING_REPLAY;
  const receptionEnabled = env.MEMORY_RECEPTION !== "0";
  const rendered = await runMirrorLoad(db, {
    identity: basename(dirname(dbPath)),
    persona: optionValue(args, "--persona"),
    journey: optionValue(args, "--journey"),
    query,
    org: hasOption(args, "--org"),
    contextOnly: hasOption(args, "--context-only"),
    sessionId,
    environmentSessionId: env.MIRROR_SESSION_ID ?? null,
    receptionEnabled,
    llmProvider:
      query && receptionEnabled && llmReplay ? await loadReplayLlmProvider(llmReplay) : undefined,
    embeddingProvider:
      query && embeddingReplay ? await loadReplayEmbeddingProvider(embeddingReplay) : undefined,
    newId,
    nowIso,
  });
  process.stdout.write(rendered.stdout);
  process.stderr.write(rendered.stderr);
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
