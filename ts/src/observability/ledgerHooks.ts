/**
 * The two `llm_calls` ledger hooks every provider-crossing leaf wires
 * (CV22.DS8.US3).
 *
 * Python has one authority for this — `build_llm_logger(store, role=...)` —
 * and every call site passes through it. TypeScript grew three hand-written
 * copies instead (search, extraction, the close tail), and they did not stay
 * equal: US1 priced the search embedding row and left extraction's unpriced,
 * which only surfaced when a live smoke run reported 7 of 10 rows priced. US3
 * would have added six more copies.
 *
 * So: one builder per shape, options for what genuinely differs between call
 * sites (role, conversation/session attribution, the pipeline's clock, an
 * explicit env for the model pins), and pricing that cannot be forgotten
 * because it is not a per-call-site decision any more.
 *
 * What every row here shares with Python's logger:
 *
 * - **bodies are withheld** unless `MEMORY_LOG_LLM_CALLS=full`, which
 *   `logLlmCall` already enforces;
 * - **cost is the static estimate** from the one cost authority. A chat or
 *   embedding call has no generation id to fetch a real cost for, so the
 *   estimate IS the cost of record. Consult is the exception and logs
 *   directly: it fetches a real figure and falls back to the estimate;
 * - **an unknown model prices to `null`**, never `0`, so unpriced spend stays
 *   visibly unpriced;
 * - **a failed round trip still lands a row.** No usage comes back, so it is
 *   unpriced — but money may already have been spent, and a vanished row
 *   would hide it.
 *
 * Under replay no usage comes back either, so every row this writes is
 * unpriced and every existing golden is unchanged.
 */

import type { WritableDatabase } from "#db/database.ts";
import { logLlmCall } from "#observability/llmCalls.ts";
import {
  type ModelPinOptions,
  resolveEmbeddingModel,
  resolveExtractionModel,
} from "#providers/config.ts";
import { computeCost } from "#providers/cost.ts";
import type { EmbeddingAttemptInfo } from "#providers/embedding.ts";
import type { LlmResponse } from "#providers/llm.ts";

export interface LedgerContext {
  /**
   * The orchestration's clock, not the wall clock: an injected `now` must
   * stamp every row the pipeline writes, the ledger included.
   */
  now?: () => string;
  conversationId?: string | null;
  sessionId?: string | null;
  /** Explicit env for the model pins, when the caller holds one. */
  env?: Record<string, string | undefined>;
}

/** What a chat call reports back to the ledger. */
export type ChatLedgerHook = (response: LlmResponse, prompt: string) => void;

/**
 * One priced row per successful chat call, as Python's `build_llm_logger`
 * writes it. `model` echoes the response's model, falling back to the
 * extraction pin — which is what Python logs.
 */
export function chatLedgerHook(
  db: WritableDatabase,
  role: string,
  context: LedgerContext = {},
): ChatLedgerHook {
  const pins: ModelPinOptions = context.env ? { env: context.env } : {};
  return (response, prompt) => {
    const model = response.model ?? resolveExtractionModel(pins);
    logLlmCall(
      db,
      {
        role,
        model,
        prompt,
        response: response.content,
        promptTokens: response.promptTokens ?? null,
        completionTokens: response.completionTokens ?? null,
        latencyMs: response.latencyMs ?? null,
        costUsd: computeCost(
          model,
          response.promptTokens ?? null,
          response.completionTokens ?? null,
        ),
        conversationId: context.conversationId ?? null,
        sessionId: context.sessionId ?? null,
      },
      context.now ? { now: context.now } : {},
    );
  };
}

/**
 * One row per embedding ROUND TRIP, wired to `generateEmbeddingSafely`'s
 * `onAttempt`. "A vector is not text", so `response` is always empty; the
 * input text rides the same body-withholding rule as every other row.
 */
export function embeddingLedgerHook(
  db: WritableDatabase,
  context: LedgerContext = {},
): (info: EmbeddingAttemptInfo) => void {
  const pins: ModelPinOptions = context.env ? { env: context.env } : {};
  return (info) => {
    const model = resolveEmbeddingModel(pins);
    logLlmCall(
      db,
      {
        role: "embedding",
        model,
        prompt: info.text,
        response: "",
        latencyMs: info.latencyMs,
        promptTokens: info.promptTokens,
        // An embedding has no completion side; Python prices it the same way.
        costUsd: computeCost(model, info.promptTokens, null),
        conversationId: context.conversationId ?? null,
        sessionId: context.sessionId ?? null,
      },
      context.now ? { now: context.now } : {},
    );
  };
}
