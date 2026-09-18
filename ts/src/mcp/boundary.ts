// The guard boundary around the wired MCP registry (CV22.DS9.TS1).
//
// Placement is the whole design. Validation lives in a WRAPPER rather than inside the
// tools, because the parity golden calls the tool functions directly: the tools stay
// Python-faithful -- `recall_conversation` with `limit=0` still returns the whole
// transcript, as the oracle does and `mcp-tools.golden.json` records -- while the registry
// a client reaches refuses the same arguments. DS9's D4 asked for the divergence to be
// visible on both sides rather than one silently overwriting the other, and this is what
// makes that possible.
//
// Both controls the threat model assigns to TS1 sit here:
//
//   * argument bounds (items 1-2, exfiltration shapes) -- `limit=0` returning an entire
//     transcript is the cheapest one the surface offers;
//   * the spend decision (item 3, denial of wallet) -- applied only to the tools that can
//     reach a provider, because a wallet guard has no business refusing a free read.

import type { Database } from "#db/database.ts";
import { decideSpend, PAID_TOOLS, readSpendState, type SpendPolicy } from "./guards.ts";
import type { Tool, ToolRegistry } from "./registry.ts";
import { buildRegistry } from "./registry.ts";

/** Per-tool argument bounds. A table, not a JSON-Schema validator: seven declarations
 * do not earn one, and the rules a schema cannot express (the caps) are the point. */
interface ArgumentRules {
  /** Inclusive upper bound for `limit`, when the tool takes one. */
  limitMax?: number;
  /** Inclusive upper bound for the length of `query`, when the tool takes one. */
  queryMaxLength?: number;
}

const QUERY_MAX_LENGTH = 4_000;

const RULES: Record<string, ArgumentRules> = {
  // Caps chosen an order of magnitude above any plausible agent request, so they bound
  // abuse without ever shaping legitimate use.
  search_memories: { limitMax: 50, queryMaxLength: QUERY_MAX_LENGTH },
  list_conversations: { limitMax: 100 },
  recall_conversation: { limitMax: 200 },
  mirror_context: { queryMaxLength: QUERY_MAX_LENGTH },
  detect_persona: { queryMaxLength: QUERY_MAX_LENGTH },
};

export interface GuardOptions {
  db: Database;
  policy: SpendPolicy;
  /** Where the refusal line goes. Defaults to stderr, the client's log for this server. */
  warn?: (line: string) => void;
  /** Injectable clock for the window, used by tests. */
  now?: () => Date;
}

/**
 * Python's `int(...)` tolerance, bounded.
 *
 * `int("5")` and `int(5)` both succeed in Python and clients do send the string form, so
 * that stays. `int(5.9)` also succeeds -- it truncates -- but a fractional limit from an
 * agent is a mistake worth naming rather than silently rounding, and no oracle behaviour
 * depends on it reaching the tool: the boundary refuses before the tool is entered.
 */
function boundedLimit(value: unknown, max: number): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) return null;
  return numeric;
}

function received(value: unknown): string {
  // Numbers and short scalars are safe to quote back; agent-authored TEXT is not -- the
  // refusal travels into the model's context and into the client's log (RS005).
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return String(value);
  if (typeof value === "string") return Number.isNaN(Number(value)) ? "a non-numeric value" : value;
  return "a value of the wrong type";
}

/**
 * Validate one call's arguments. Throws the refusal, which `protocol.ts` turns into an
 * `isError` result -- a readable failure the session survives, never a protocol error.
 *
 * Argument refusals are deliberately NOT terminal: unlike a spend refusal, the right
 * response is to correct the value and call again, so the text states the valid range and
 * says nothing about retrying.
 */
function validateArguments(tool: string, args: unknown): void {
  const rules = RULES[tool];
  if (!rules) return;
  const record =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  if (rules.limitMax !== undefined && record.limit !== undefined && record.limit !== null) {
    if (boundedLimit(record.limit, rules.limitMax) === null) {
      throw new Error(
        `${tool}: limit must be an integer from 1 to ${rules.limitMax} (received ${received(record.limit)})`,
      );
    }
  }

  if (rules.queryMaxLength !== undefined && typeof record.query === "string") {
    // Embedding cost is proportional to tokens, so an unbounded query is unbounded spend
    // in a single call -- the rate guard alone would not catch it.
    const length = [...record.query].length;
    if (length > rules.queryMaxLength) {
      throw new Error(
        `${tool}: query must be at most ${rules.queryMaxLength} characters (received ${length})`,
      );
    }
  }
}

/**
 * Wrap a wired registry with argument validation and, for the provider-crossing tools, the
 * spend decision.
 *
 * `tools/list` is untouched: the declarations a client caches are the contract US1 froze,
 * and a guard is server behaviour, not a change to what the surface offers.
 */
export function guardedRegistry(inner: ToolRegistry, options: GuardOptions): ToolRegistry {
  const warn = options.warn ?? ((line: string) => process.stderr.write(`${line}\n`));
  const now = options.now ?? (() => new Date());

  const guard = (tool: Tool): Tool => ({
    ...tool,
    handler: async (args: unknown) => {
      validateArguments(tool.name, args);
      if (PAID_TOOLS.includes(tool.name)) {
        const decision = decideSpend(
          tool.name,
          readSpendState(options.db, options.policy, now()),
          options.policy,
        );
        if (!decision.allow) {
          // Metadata only: the tool and the reason, never the arguments.
          warn(`guard refused tool=${tool.name} reason=${decision.reason}`);
          throw new Error(decision.text);
        }
      }
      return await tool.handler(args);
    },
  });

  const list = inner.list.map(guard);
  const extras = [...inner.byName.values()].filter((tool) => !inner.list.includes(tool)).map(guard);
  return buildRegistry(list, extras);
}
