// Wallet guards for the MCP surface (CV22.DS9.TS1).
//
// This module has no oracle. Nothing here exists in Python: US1, US2, and TS2 were ports
// graded by byte equality, and this is deliberate divergence, argued from the DS9 threat
// model (item 3, denial of wallet) and sized from measured spend.
//
// What it guards, and why that shape:
//
//   * The risk is RATE, not dollars. Measured on the author's ledger, an embedding costs
//     ~$0.000002 and the whole account spent $0.0001 on embeddings in seven days -- one
//     dollar is ~500,000 calls. A USD ceiling that bites would have to be set at cents.
//     What a runaway agent loop actually does is exhaust the provider's rate limit (whose
//     429s then land on the user's OTHER work), stall at ~2s per call, and fill its own
//     context. So the rate guard is the control and the ceiling is an opt-in backstop.
//
//   * State lives in the `llm_calls` ledger, not in this process. A user runs several MCP
//     clients at once; a per-process counter is a belief, not a ceiling.
//
//   * The count is attributed. Extraction embeds every memory it creates, so a session
//     close writes dozens of embedding rows in a minute. Counting all of them would refuse
//     the agent because the USER ended a conversation -- so only rows marked as this
//     surface's are counted.
//
//   * The decision is pure and the ledger read is at the edge, so the policy is testable
//     against synthetic states and the refusal text is under test rather than in a comment.

import type { Database } from "#db/database.ts";

/**
 * The `llm_calls.session_id` value marking a call made by the MCP surface.
 *
 * One fact in one column (D2). The first draft encoded the tool too
 * (`mcp:search_memories`), to honour the AI-19 rider's "per-tool" phrasing; measured, that
 * granularity buys nothing -- both paid tools cost one embedding per call and a global cap
 * bounds the harm identically -- so it was rejected as two facts in one column. If per-tool
 * attribution is ever needed it is a real column with a real migration, not a delimiter.
 *
 * `session_id` is the right column: free text, semantically "the session that made the
 * call", and null on every one of the 225 embedding rows that existed when this was
 * written, so the marker collides with nothing. It also makes MCP spend filterable in
 * `inspect llm-calls --session mcp`, which is the operator's view of this surface.
 */
export const MCP_LEDGER_SESSION = "mcp";

/** The tools whose calls cross an embedding provider, and are therefore counted. */
export const PAID_TOOLS: readonly string[] = ["search_memories", "mirror_context"];

export interface SpendPolicy {
  /** Max attributed embedding calls inside the window. */
  rateLimit: number;
  /** Sliding window, in minutes. */
  windowMinutes: number;
  /** Trailing-24h USD ceiling, or null for none (the default). */
  dailyUsdCeiling: number | null;
}

/** What the ledger says about this surface right now. */
export interface SpendState {
  /** Attributed embedding calls inside the window. */
  callsInWindow: number;
  /** Attributed spend over the trailing 24h. Unpriced rows contribute 0. */
  usdLast24h: number;
}

export type SpendDecision =
  | { allow: true }
  | { allow: false; reason: "rate_limit" | "daily_ceiling"; text: string };

export const DEFAULT_SPEND_POLICY: SpendPolicy = {
  // A human-driven session rarely sustains three searches a minute; a loop at the measured
  // ~2s per search reaches thirty inside one minute. The gap between the two is where this
  // number lives.
  rateLimit: 30,
  windowMinutes: 10,
  dailyUsdCeiling: null,
};

/**
 * The unmetered way to use each paid tool, named in its own refusal.
 *
 * Per tool, because the advice has to be advice the refused tool can actually take:
 * `mirror_context` has no layer or type filter, and telling an agent to use one is how it
 * learns that refusal text is noise.
 */
const UNMETERED_ALTERNATIVE: Record<string, string> = {
  search_memories:
    "Filtered calls — journey, layer, or type, with no query — are not metered and still work.",
  mirror_context: "Calling it without a query is not metered and still returns the context.",
};

function alternativeFor(tool: string): string {
  return UNMETERED_ALTERNATIVE[tool] ?? "Calls that do not carry a query are not metered.";
}

/**
 * Decide whether one paid call may proceed. Pure: no clock, no database.
 *
 * The refusal TEXT is produced here rather than at the call site because it is the control,
 * not decoration. Keeping it here keeps it under test -- and the E2E is what tests the part
 * a unit test cannot: whether a real model obeys it.
 *
 * Shape (prompt-engineer lens): lead with the fact, name the unmetered alternative, name
 * the human who can lift the bound, instruction LAST because what comes last is what a
 * model follows in the moment. Never a timed invitation: an agent told when to come back
 * plans to come back, and the return is the loop.
 *
 * Two corrections came from the first E2E (2026-09-19), and both are the loop working:
 *
 *   * "Use a filter instead" was read by the model as "the error message suggests a way
 *     around the limit", and it then admitted it did not know whether filtered calls
 *     counted. A refusal that reads as a loophole hint teaches bypass in the server's own
 *     voice. Saying plainly that filters are NOT METERED is the truth, grants nothing the
 *     tool schema did not already expose, and removes the evasion framing.
 *
 *   * "Do not retry this tool" was read as "this call will not succeed": the agent moved
 *     to the next topic and was refused four more times. The stop is now scoped to the
 *     paid mode (another QUERY) and gated on the human rather than on nothing.
 */
export function decideSpend(tool: string, state: SpendState, policy: SpendPolicy): SpendDecision {
  const stop = `Do not send another query to this tool until the user replies.`;
  if (policy.dailyUsdCeiling !== null && state.usdLast24h >= policy.dailyUsdCeiling) {
    return {
      allow: false,
      reason: "daily_ceiling",
      text:
        `${tool} is over the MCP spend ceiling the user set for today. ` +
        `${alternativeFor(tool)} Ask the user before continuing. ${stop}`,
    };
  }
  if (state.callsInWindow >= policy.rateLimit) {
    return {
      allow: false,
      reason: "rate_limit",
      text:
        `${tool} is rate-limited (${policy.rateLimit} query searches in ${policy.windowMinutes} minutes). ` +
        `${alternativeFor(tool)} Ask the user to raise MIRROR_MCP_EMBED_RATE_LIMIT if you ` +
        `need more. ${stop}`,
    };
  }
  return { allow: true };
}

/** The env slice the tunables read. `process.env` satisfies it. */
export interface SpendPolicyEnv {
  MIRROR_MCP_EMBED_RATE_LIMIT?: string;
  MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES?: string;
  MIRROR_MCP_DAILY_USD_CEILING?: string;
}

function positiveNumber(name: string, raw: string, integer: boolean): number {
  const value = Number(raw);
  const valid = Number.isFinite(value) && value > 0 && (!integer || Number.isInteger(value));
  if (!valid) {
    throw new Error(
      `${name} must be a positive ${integer ? "integer" : "number"}; got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

/**
 * Read the tunables, failing loudly on anything malformed.
 *
 * A typo in `.env` takes the MCP surface down with a named reason in the client's log
 * rather than silently reverting to a default -- the DS8 rule. Silently unguarded while the
 * user believes otherwise is the worse of the two failures.
 */
export function policyFromEnv(env: SpendPolicyEnv): SpendPolicy {
  const rateLimitRaw = env.MIRROR_MCP_EMBED_RATE_LIMIT;
  const windowRaw = env.MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES;
  const ceilingRaw = env.MIRROR_MCP_DAILY_USD_CEILING;
  return {
    rateLimit:
      rateLimitRaw === undefined
        ? DEFAULT_SPEND_POLICY.rateLimit
        : positiveNumber("MIRROR_MCP_EMBED_RATE_LIMIT", rateLimitRaw, true),
    windowMinutes:
      windowRaw === undefined
        ? DEFAULT_SPEND_POLICY.windowMinutes
        : positiveNumber("MIRROR_MCP_EMBED_RATE_WINDOW_MINUTES", windowRaw, true),
    dailyUsdCeiling:
      ceilingRaw === undefined
        ? DEFAULT_SPEND_POLICY.dailyUsdCeiling
        : positiveNumber("MIRROR_MCP_DAILY_USD_CEILING", ceilingRaw, false),
  };
}

/**
 * Read what the ledger says about this surface: attributed calls inside the window and
 * attributed spend over the trailing 24 hours.
 *
 * Cross-process by construction -- the state is rows, not memory, so a second MCP client
 * shares the count rather than getting its own budget. One indexed-enough `SELECT` per paid
 * call on a read-only WAL handle, which blocks nothing (measured at 552 rows: sub-
 * millisecond; revisit if the table passes ~100k).
 *
 * `SUM(cost_usd)` skips NULLs, so a failed attempt contributes zero to the ceiling while
 * still counting against the rate -- which is the right way round: a failing loop still
 * hammers the provider, but it did not demonstrably spend.
 */
export function readSpendState(
  db: Database,
  policy: SpendPolicy,
  now: Date = new Date(),
): SpendState {
  const windowStart = isoFrom(now, policy.windowMinutes);
  const dayStart = isoFrom(now, 24 * 60);
  const row = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN called_at >= ? THEN 1 END) AS calls_in_window,
         COALESCE(SUM(CASE WHEN called_at >= ? THEN cost_usd END), 0) AS usd_last_24h
       FROM llm_calls
       WHERE session_id = ? AND role = 'embedding' AND called_at >= ?`,
    )
    .get(windowStart, dayStart, MCP_LEDGER_SESSION, dayStart);
  return {
    callsInWindow: Number(row?.calls_in_window ?? 0),
    usdLast24h: Number(row?.usd_last_24h ?? 0),
  };
}

/**
 * `called_at` is microsecond ISO UTC on both engines (`nowIso` -> `toMicrosecondIso`), and
 * this bound is compared lexically against it. A millisecond `toISOString()` sorts
 * correctly against microsecond values because the prefix is identical up to the
 * fractional digits and the comparison is `>=` on a lower bound.
 */
function isoFrom(now: Date, minutesAgo: number): string {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString();
}
