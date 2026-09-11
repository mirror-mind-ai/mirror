// The conversation-logger composition root (CV22.DS7.US10 slice F).
//
// Everything the `conversation-logger` subcommands need beyond the database
// is assembled here, once per invocation, from an EXPLICIT environment: the
// clock and id generator, the transcript/session resolution inputs, the Pi
// sessions directory, the pre-write backup, and -- only for the subcommands
// that cross the LLM close tail -- the replay providers and the maintenance
// dependencies built on them.
//
// The providers are loaded lazily. `diagnose-journeys`, `backfill-codex-session`,
// or `session-start --fast` must never fail because a replay fixture is not
// configured, and `switch` or `session-end` must fail loudly (and fall back
// to Python at the routing layer) when it is not: "unconfigured installs keep
// Python fallback" is the plan's live-cutover boundary, and this is where it
// is enforced on the TypeScript side.
//
// Nothing here reads `process.env` or `os.homedir()`; the front door passes
// them in, which is what keeps every test of this module hermetic.

import { backfillPiSessions, resolvePiSessionsDir } from "#conversation/backfill.ts";
import { createCloseHooks, maybeGenerateTitle } from "#conversation/closeTail.ts";
import { runConversationExtraction } from "#conversation/extraction.ts";
import { runExtractionWithAccounting } from "#conversation/extractionRun.ts";
import { type CloseHooks, endConversation, type LoggerDeps } from "#conversation/logger.ts";
import type { MaintenanceDeps } from "#conversation/sessionComposites.ts";
import type { WritableDatabase } from "#db/database.ts";
import { logLlmCall } from "#observability/llmCalls.ts";
import {
  resolveExtractionMaxAttempts,
  resolveExtractionModel,
  resolveMaintenanceMaxExtractions,
  resolveSummarizeEnabled,
  resolveTwoPassEnabled,
} from "#providers/config.ts";
import {
  type EmbeddingProvider,
  LiveEmbeddingProvider,
  loadReplayEmbeddingProvider,
} from "#providers/embedding.ts";
import {
  LiveLlmProvider,
  type LlmProvider,
  type LlmResponse,
  loadReplayLlmProvider,
} from "#providers/llm.ts";
import {
  CONVERSATION_TAIL_EMBEDDING_REPLAY_VAR,
  CONVERSATION_TAIL_TRANSPORT,
  type ProviderTransportMode,
  resolveProviderTransport,
} from "#providers/transport.ts";

/** The environment names the logger runtime reads. */
export type LoggerRuntimeEnv = {
  MIRROR_SESSION_ID?: string;
  CLAUDE_PROJECT_DIR?: string;
  PI_SESSIONS_DIR?: string;
  MIRROR_TS_CONVERSATION_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY?: string;
  /** CV22.DS8.US2 tail-only revert; leaves the deterministic subcommands on TS. */
  MIRROR_TS_CONVERSATION_LLM_TAIL?: string;
  /** Read by the live providers when the close tail runs against a real model. */
  OPENROUTER_API_KEY?: string;
  MEMORY_LLM_TIMEOUT_EXTRACTION?: string;
  MEMORY_LLM_MAX_RETRIES?: string;
  MEMORY_EMBEDDING_MODEL?: string;
  MEMORY_SUMMARIZE?: string;
  MEMORY_TWO_PASS?: string;
  MEMORY_MAINTENANCE_MAX_EXTRACTIONS?: string;
  MEMORY_EXTRACTION_MAX_ATTEMPTS?: string;
  MEMORY_EXTRACTION_MODEL?: string;
};

export interface LoggerRuntimeOptions {
  db: WritableDatabase;
  mirrorHome: string;
  homeDir: string;
  env: LoggerRuntimeEnv;
  deps: LoggerDeps;
  /**
   * Live provider factory, injectable for tests (CV22.DS8.US2).
   *
   * `loadLlm`/`loadEmbeddings` below are REPLAY-path loaders and are not
   * consulted in live mode, so without this seam no test could exercise the
   * close tail against a failing or instrumented live provider -- which is the
   * behavior this story exists to change.
   */
  liveProviders?: (env: LoggerRuntimeEnv) => {
    llm: LlmProvider;
    embeddings: EmbeddingProvider;
  };
  /** Provider loaders, injectable for tests; default to the replay fixtures. */
  loadLlm?: (path: string) => Promise<LlmProvider>;
  loadEmbeddings?: (path: string) => Promise<EmbeddingProvider>;
  /** Monotonic seconds for the maintenance report; defaults to `performance.now()`. */
  monotonic?: () => number;
  /**
   * The dated zip backup `repair-journeys --apply` gates on (CV22.DS7.TS1).
   * Prints its progress through `stdout` and returns the archive path, or
   * null on failure. Absent (tests, unwired callers) means the repair refuses,
   * exactly as Python refuses when `backup()` returns None.
   */
  backup?: (stdout: (line: string) => void) => string | null;
}

/**
 * The close tail is reverted to Python for this invocation.
 *
 * `loggerCli` turns this into the Python fallback, which is why the revert
 * reuses it rather than inventing a second mechanism. Before CV22.DS8.US2 it
 * meant "no replay fixture configured"; it now means an explicit
 * `MIRROR_TS_CONVERSATION_LLM_TAIL=0`, because an unconfigured install goes
 * live.
 */
export class LlmTailUnconfiguredError extends Error {
  constructor(reason: string) {
    super(
      `${reason}; the TypeScript conversation-logger close tail is reverted to the Python fallback`,
    );
    this.name = "LlmTailUnconfiguredError";
  }
}

/**
 * Exactly one of the two close-tail replay fixtures is set (CV22.DS8.US2).
 *
 * Deliberately NOT a subclass of `LlmTailUnconfiguredError`: that one means
 * "use Python", and falling back here would be no safer, because Python has no
 * replay transport and would spend on the live provider too -- just on the
 * other engine, and silently. Someone who set one variable meant to replay,
 * so the only honest answer is to stop and name the missing half.
 */
export class ReplayFixtureIncompleteError extends Error {
  constructor(missing: string, present: string) {
    super(
      `${present} is set but ${missing} is not. The conversation close tail needs BOTH ` +
        "replay fixtures; running with one would reach the live provider and spend real money. " +
        `Set ${missing}, or unset ${present} to run live deliberately.`,
    );
    this.name = "ReplayFixtureIncompleteError";
  }
}

export interface LoggerRuntime {
  readonly deps: LoggerDeps;
  readonly mirrorHome: string;
  readonly homeDir: string;
  readonly claudeProjectDir: string | null;
  readonly environmentSessionId: string | null;
  readonly piSessionsDir: string;
  /** Whether the LLM close tail can run under TypeScript in this invocation. */
  readonly llmTailConfigured: boolean;
  /** Which transport answers the close tail here: python (revert), replay, or live. */
  readonly transportMode: ProviderTransportMode;
  /** The close hooks (extraction + finalization) behind the replay transport. */
  closeHooks(): Promise<CloseHooks>;
  /** The full maintenance wiring, including the real Pi backfill. */
  maintenanceDeps(): Promise<MaintenanceDeps>;
  /** The dated zip backup for the mutating journey repair; see `LoggerRuntimeOptions.backup`. */
  readonly backup: ((stdout: (line: string) => void) => string | null) | null;
}

export function createLoggerRuntime(options: LoggerRuntimeOptions): LoggerRuntime {
  const { db, env, deps } = options;
  const loadLlm = options.loadLlm ?? loadReplayLlmProvider;
  const loadEmbeddings = options.loadEmbeddings ?? loadReplayEmbeddingProvider;
  const llmPath = env.MIRROR_TS_CONVERSATION_LLM_REPLAY;
  const embeddingPath = env[CONVERSATION_TAIL_EMBEDDING_REPLAY_VAR];
  const piSessionsDir = resolvePiSessionsDir(null, env, options.homeDir);

  // One precedence, shared with the router so the two cannot disagree about
  // which transport is live: revert -> replay -> live.
  const transport = resolveProviderTransport(env, CONVERSATION_TAIL_TRANSPORT);
  // The LLM fixture selects replay mode; the embedding fixture is this
  // family's second half. Either one alone is a refusal, never a live call.
  const halfConfiguredReplay =
    transport.mode !== "python" && Boolean(llmPath) !== Boolean(embeddingPath);

  let providers: Promise<{ llm: LlmProvider; embeddings: EmbeddingProvider }> | null = null;
  const loadProviders = () => {
    if (transport.mode === "python") {
      throw new LlmTailUnconfiguredError(`${CONVERSATION_TAIL_TRANSPORT.revertVar}=0`);
    }
    if (halfConfiguredReplay) {
      throw llmPath
        ? new ReplayFixtureIncompleteError(
            CONVERSATION_TAIL_EMBEDDING_REPLAY_VAR,
            CONVERSATION_TAIL_TRANSPORT.replayVar as string,
          )
        : new ReplayFixtureIncompleteError(
            CONVERSATION_TAIL_TRANSPORT.replayVar as string,
            CONVERSATION_TAIL_EMBEDDING_REPLAY_VAR,
          );
    }
    if (transport.mode === "replay" && llmPath && embeddingPath) {
      providers ??= Promise.all([loadLlm(llmPath), loadEmbeddings(embeddingPath)]).then(
        ([llm, embeddings]) => ({ llm, embeddings }),
      );
      return providers;
    }
    // Live. Both providers resolve their config lazily, so a missing key
    // surfaces inside the close tail -- where the extraction driver records a
    // failed attempt -- rather than crashing the session-end hook outright.
    const buildLive =
      options.liveProviders ??
      ((liveEnv: LoggerRuntimeEnv) => ({
        llm: new LiveLlmProvider({ env: liveEnv }),
        embeddings: new LiveEmbeddingProvider({ env: liveEnv }),
      }));
    providers ??= Promise.resolve(buildLive(env));
    return providers;
  };

  // Python's `_make_logger(role, conversation_id)`: one ledger row per
  // successful close-tail call. Cost stays unpriced (see extraction.ts).
  const ledger = (role: string, response: LlmResponse, conversationId: string, prompt: string) =>
    logLlmCall(
      db,
      {
        role,
        model: response.model ?? resolveExtractionModel({ env }),
        prompt,
        response: response.content,
        promptTokens: response.promptTokens ?? null,
        completionTokens: response.completionTokens ?? null,
        latencyMs: response.latencyMs ?? null,
        costUsd: null,
        conversationId,
      },
      { now: deps.nowIso },
    );

  const maxAttempts = resolveExtractionMaxAttempts({ env });
  const runExtraction = async (database: WritableDatabase, conversationId: string) => {
    const { llm, embeddings } = await loadProviders();
    await runExtractionWithAccounting(
      database,
      conversationId,
      (innerDb, id) =>
        runConversationExtraction(innerDb, id, {
          llm,
          embeddings,
          now: deps.nowIso,
          id: deps.newId,
          summarize: resolveSummarizeEnabled({ env }),
          twoPass: resolveTwoPassEnabled({ env }),
          ledger: true,
        }),
      maxAttempts,
    );
  };

  const closeHooks = async (): Promise<CloseHooks> => {
    const { llm } = await loadProviders();
    return createCloseHooks({ llm, onLlmCall: ledger, now: deps.nowIso, runExtraction });
  };

  return {
    deps,
    mirrorHome: options.mirrorHome,
    homeDir: options.homeDir,
    claudeProjectDir: env.CLAUDE_PROJECT_DIR || null,
    environmentSessionId: env.MIRROR_SESSION_ID?.trim() || null,
    piSessionsDir,
    llmTailConfigured: transport.mode !== "python",
    transportMode: transport.mode,
    backup: options.backup ?? null,
    closeHooks,
    async maintenanceDeps(): Promise<MaintenanceDeps> {
      const { llm } = await loadProviders();
      const hooks = createCloseHooks({ llm, onLlmCall: ledger, now: deps.nowIso, runExtraction });
      return {
        closeConversation: (database, conversationId) =>
          endConversation(database, conversationId, { extract: true }, deps, hooks),
        retitleConversation: (database, conversationId) =>
          maybeGenerateTitle(database, conversationId, {
            llm,
            onLlmCall: ledger,
            now: deps.nowIso,
            source: "startup_maintenance",
          }),
        runExtraction,
        backfillPiSessions: (database) =>
          backfillPiSessions(database, { sessionsDir: piSessionsDir }, deps),
        extractionLimit: resolveMaintenanceMaxExtractions({ env }),
        monotonic: options.monotonic,
        now: deps.nowIso,
      };
    },
  };
}
