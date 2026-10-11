/**
 * The one cost authority for model-in-the-loop spend (AI-09 / CV9.E2.S13),
 * ported from `memory/intelligence/cost.py` for CV22.DS8.US1.
 *
 * Token counts arrive with every provider response; prices are a static table;
 * cost is a pure function of the two. Keeping this in one place is deliberate --
 * scattering cost math across call sites is exactly the failure the audit warns
 * about.
 *
 * CR040 deliberately did NOT port this: consult always logs the real fetched
 * generation cost, so a static estimate would have been dead code. The live
 * search embedding has no fetched figure -- Python prices that ledger row from
 * this table -- so the port becomes load-bearing the moment the live provider
 * lands. Graded against `ts/test/goldens/cost.golden.json`.
 *
 * Prices are **estimated** published list prices (USD per 1K tokens) for the
 * pinned models, and drift over time. Update this table whenever the model pins
 * change (AI-06 / CV9.E2.S12), on both engines in the same commit. An unknown
 * model yields `null` -- never a silent `0` -- so unpriced spend stays visibly
 * unpriced rather than looking free.
 */

export interface ModelPrice {
  /** USD per 1K prompt tokens. */
  readonly promptPer1k: number;
  /** USD per 1K completion tokens. */
  readonly completionPer1k: number;
}

/** Estimated OpenRouter list prices (USD / 1K tokens). Verify on every pin change. */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  // Extraction pin -- google/gemini-2.5-flash-lite: ~$0.10/M in, ~$0.40/M out.
  "google/gemini-2.5-flash-lite": { promptPer1k: 0.0001, completionPer1k: 0.0004 },
  // Embedding pin -- openai/text-embedding-3-small: ~$0.02/M, no completion side.
  "openai/text-embedding-3-small": { promptPer1k: 0.00002, completionPer1k: 0.0 },
};

/**
 * Estimate the USD cost of one call from its model and token usage.
 *
 * Returns `null` when the model is not in the price table or when prompt usage
 * is missing -- both mean the cost is genuinely unknown, and `null` keeps it out
 * of any sum rather than understating spend as `0`. Missing completion tokens
 * are treated as zero completion (some providers omit the field on empty
 * completions, and every embedding call omits it by nature).
 *
 * `undefined` is folded into Python's `None`: TS call sites carry
 * `number | null | undefined`, and both absences must mean "unknown", never
 * "zero tokens".
 *
 * The arithmetic mirrors Python's operation order exactly -- `(prompt / 1000) *
 * price + (completion / 1000) * price` -- because the golden asserts bit-equal
 * doubles, not an epsilon.
 */
export function computeCost(
  model: string,
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): number | null {
  const price = MODEL_PRICES[model];
  if (price === undefined || promptTokens === null || promptTokens === undefined) return null;
  const completion = completionTokens ?? 0;
  return (promptTokens / 1000) * price.promptPer1k + (completion / 1000) * price.completionPer1k;
}
