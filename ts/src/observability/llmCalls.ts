/**
 * LLM call observability logging (AI-09, CV9.E2.S13/S14), scoped to the
 * consult path only -- see CR040 plan for why the broader Python
 * `build_llm_logger` six-call-site retrofit (extraction, task-extraction,
 * consolidation, shadow, journal) is explicitly out of scope here.
 *
 * Deliberately does NOT port `compute_cost`/`MODEL_PRICES`: consult always
 * logs the real fetched generation cost, never a static per-token estimate --
 * none of consult's models are in Python's 2-entry price table either.
 */

import type { WritableDatabase } from "../db/database.ts";
import { type LogLlmCallsMode, resolveLogLlmCallsMode } from "../providers/config.ts";
import { newId, nowIso } from "../util/pyGenerators.ts";

export interface LogLlmCallInput {
  role: string;
  model: string;
  prompt: string;
  response: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  costUsd?: number | null;
  conversationId?: string | null;
  sessionId?: string | null;
}

export interface LogLlmCallOptions {
  mode?: LogLlmCallsMode;
  now?: () => string;
  id?: () => string;
}

/**
 * Insert one row into `llm_calls`, mirroring Python's `log_llm_call` column
 * order exactly. Fail-soft by design: a logging failure is swallowed, never
 * propagated -- "observability must never break the pipeline it observes"
 * (the same principle behind Python's build_llm_logger try/except).
 *
 * In `metadata` mode (the default) prompt/response are written as empty
 * strings, never the real bodies -- consult's prompt carries identity
 * context, so withholding it by default is a security property, not a
 * formatting choice. Only explicit `full` mode persists bodies.
 */
export function logLlmCall(
  db: WritableDatabase,
  input: LogLlmCallInput,
  options: LogLlmCallOptions = {},
): void {
  const mode = options.mode ?? resolveLogLlmCallsMode();
  if (mode === "off") return;
  const withBodies = mode === "full";
  try {
    db.prepare(
      `INSERT INTO llm_calls (
        id, role, model, prompt, response,
        prompt_tokens, completion_tokens, latency_ms, cost_usd,
        conversation_id, session_id, called_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      (options.id ?? newId)(),
      input.role,
      input.model,
      withBodies ? input.prompt : "",
      withBodies ? input.response : "",
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      input.latencyMs ?? null,
      input.costUsd ?? null,
      input.conversationId ?? null,
      input.sessionId ?? null,
      (options.now ?? nowIso)(),
    );
  } catch {
    // Fail-soft: never let observability break the caller.
  }
}

export interface LlmCallSummaryBucket {
  bucket: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
  unpriced: number;
}

export interface LlmCallSummary {
  byRole: LlmCallSummaryBucket[];
  byWeek: LlmCallSummaryBucket[];
  total: LlmCallSummaryBucket;
}

/**
 * Aggregate spend by role and by week, plus an overall total. Mirrors
 * Python's `get_llm_call_summary`: `SUM(cost_usd)` skips NULLs, so an
 * all-unpriced bucket reports `costUsd: null` with a non-zero `unpriced`
 * count -- unpriced spend stays visibly unpriced, never summed as 0.
 *
 * Shipped without a CLI renderer (no TS `inspect` command exists -- see
 * CR040 plan) because it operates on real data once logLlmCall ships, and is
 * independently tested; an unconsumed but tested query is not dead code.
 */
export function getLlmCallSummary(
  db: WritableDatabase,
  options: { since?: string } = {},
): LlmCallSummary {
  const where = options.since ? "WHERE called_at >= ?" : "";
  const params = options.since ? [options.since] : [];

  const aggregate = (bucketExpr: string, order: string): LlmCallSummaryBucket[] => {
    const rows = db
      .prepare(
        `SELECT ${bucketExpr} AS bucket,
                COUNT(*) AS calls,
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                SUM(cost_usd) AS cost_usd,
                SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
         FROM llm_calls
         ${where}
         GROUP BY bucket
         ORDER BY ${order}`,
      )
      .all(...params);
    return rows.map((row) => ({
      bucket: String(row.bucket),
      calls: Number(row.calls),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
      unpriced: Number(row.unpriced),
    }));
  };

  const byRole = aggregate("role", "bucket");
  const byWeek = aggregate("strftime('%Y-W%W', called_at)", "bucket DESC");

  const priced = byRole.map((b) => b.costUsd).filter((cost): cost is number => cost !== null);
  const total: LlmCallSummaryBucket = {
    bucket: "TOTAL",
    calls: byRole.reduce((sum, b) => sum + b.calls, 0),
    promptTokens: byRole.reduce((sum, b) => sum + b.promptTokens, 0),
    completionTokens: byRole.reduce((sum, b) => sum + b.completionTokens, 0),
    costUsd: priced.length > 0 ? priced.reduce((sum, cost) => sum + cost, 0) : null,
    unpriced: byRole.reduce((sum, b) => sum + b.unpriced, 0),
  };

  return { byRole, byWeek, total };
}
