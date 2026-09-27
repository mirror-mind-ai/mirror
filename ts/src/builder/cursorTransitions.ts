// CV22.DS7.US8 plateau 3 — state shared by every Ariad lifecycle event.
//
// Python keeps Pull, Expand, Prepare, Plan, Approve, Validate, Review, Coherence,
// and Done in one 2,303-line `lifecycle.py`, which is argparse accretion rather
// than design. The port is one module per event over this shared base, so a reader
// looking for what Pull does opens `pull.ts` instead of scrolling past Done.
//
// What belongs here is only what more than one event needs: the normalization
// rules, the level vocabulary, and the Delivery Story ancestor lookup Pull uses to
// decide whether release intent survives a re-pull.

import { pyStrip } from "#util/pythonText.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";

/** Python `_ALLOWED_PULL_LEVELS`, in declaration order — the error message quotes it. */
export const ALLOWED_PULL_LEVELS = ["delivery_story", "user_story", "technical_story"] as const;

/** Python `lifecycle._normalize_required`. */
export function normalizeRequired(value: string | null | undefined, fieldName: string): string {
  const normalized = typeof value === "string" ? pyStrip(value) : "";
  if (!normalized) throw new Error(`${fieldName} must not be empty`);
  return normalized;
}

/** Python `_is_implementable_by_default`: a Delivery Story is never implementable. */
export function isImplementableByDefault(level: string | null): boolean {
  return level === "user_story" || level === "technical_story";
}

/**
 * Python `release_intent.delivery_story_code_for_item`.
 *
 * Finds the first `DS<n>` / `DS-<n>` segment, case-insensitively, and returns the
 * code up to and including it — so `CV22.DS7.US8` belongs to `CV22.DS7`, and a
 * code with no Delivery Story segment belongs to nothing.
 *
 * Lives here rather than in a `releaseIntent.ts` that does not exist yet: Pull is
 * its first caller, and Scope F's release-intent leaf will import it from here
 * instead of growing a second copy.
 */
export function deliveryStoryCodeForItem(itemCode: string | null): string | null {
  if (!itemCode) return null;
  const parts = itemCode
    .split(".")
    .map((part) => pyStrip(part))
    .filter((part) => part !== "");
  for (const [index, part] of parts.entries()) {
    // `re.fullmatch(r"DS-?\d+", part, re.IGNORECASE)`. `\d` is ASCII-only in both
    // engines here: Python's pattern is a `str` pattern without `re.UNICODE`
    // semantics for `fullmatch` on digits it would widen, and JavaScript's `\d`
    // is ASCII by definition. An Arabic-Indic digit matches in neither.
    if (/^DS-?\d+$/i.test(part)) {
      return parts.slice(0, index + 1).join(".");
    }
  }
  return null;
}

/**
 * The cursor fields every lifecycle write carries forward unchanged.
 *
 * Python repeats these five arguments at each call site, and the repetition is
 * where a port silently drops one: omitting `cadence_profile` does not fail, it
 * quietly resets the Navigator's cadence to null on the next Pull.
 */
export function carriedForward(cursor: BuilderDeliveryCursor): {
  cadenceProfile: string | null;
  cadenceLimits: readonly string[];
  navigatorFlowUnit: string | null;
} {
  return {
    cadenceProfile: cursor.cadenceProfile,
    cadenceLimits: cursor.cadenceLimits,
    navigatorFlowUnit: cursor.navigatorFlowUnit,
  };
}
