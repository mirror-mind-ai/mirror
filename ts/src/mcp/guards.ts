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
 * Decide whether one paid call may proceed. Pure: no clock, no database.
 *
 * The refusal TEXT is produced here rather than at the call site because it is the control,
 * not decoration -- an agent that reads "try again later" retries, and the retry is the
 * loop the guard exists to stop. Keeping it here keeps it under test.
 *
 * Shape (prompt-engineer lens): lead with the fact, name the alternative, name the human
 * who can lift the bound, and put the instruction LAST, because what comes last is what a
 * model follows in the moment. No reset time: that is true, and telling a model when to
 * come back invites it to plan a retry. The window belongs in the docs, for the human.
 */
export function decideSpend(tool: string, state: SpendState, policy: SpendPolicy): SpendDecision {
  if (policy.dailyUsdCeiling !== null && state.usdLast24h >= policy.dailyUsdCeiling) {
    return {
      allow: false,
      reason: "daily_ceiling",
      text:
        `${tool} is over the MCP spend ceiling the user set for today. ` +
        `Ask the user before continuing. Do not retry this tool.`,
    };
  }
  if (state.callsInWindow >= policy.rateLimit) {
    return {
      allow: false,
      reason: "rate_limit",
      text:
        `${tool} is rate-limited (${policy.rateLimit} calls in ${policy.windowMinutes} minutes). ` +
        `Use a filter instead — journey, layer, or type — or ask the user to raise ` +
        `MIRROR_MCP_EMBED_RATE_LIMIT. Do not retry this tool.`,
    };
  }
  return { allow: true };
}
