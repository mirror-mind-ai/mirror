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
import { type EmbeddingProvider, loadReplayEmbeddingProvider } from "#providers/embedding.ts";
import { type LlmProvider, type LlmResponse, loadReplayLlmProvider } from "#providers/llm.ts";

/** The environment names the logger runtime reads. */
export type LoggerRuntimeEnv = {
  MIRROR_SESSION_ID?: string;
  CLAUDE_PROJECT_DIR?: string;
  PI_SESSIONS_DIR?: string;
  MIRROR_TS_CONVERSATION_LLM_REPLAY?: string;
  MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY?: string;
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

export class LlmTailUnconfiguredError extends Error {
  constructor(missing: string) {
    super(
      `${missing} is required for the TypeScript conversation-logger close tail; ` +
        "unconfigured installs keep the Python fallback",
    );
    this.name = "LlmTailUnconfiguredError";
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
  const embeddingPath = env.MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY;
  const piSessionsDir = resolvePiSessionsDir(null, env, options.homeDir);

  let providers: Promise<{ llm: LlmProvider; embeddings: EmbeddingProvider }> | null = null;
  const loadProviders = () => {
    if (!llmPath) throw new LlmTailUnconfiguredError("MIRROR_TS_CONVERSATION_LLM_REPLAY");
    if (!embeddingPath) {
      throw new LlmTailUnconfiguredError("MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY");
    }
    providers ??= Promise.all([loadLlm(llmPath), loadEmbeddings(embeddingPath)]).then(
      ([llm, embeddings]) => ({ llm, embeddings }),
    );
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
    llmTailConfigured: Boolean(llmPath && embeddingPath),
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
