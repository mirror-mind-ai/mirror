// A Delivery Story's aggregate checkpoint status: how it is written, and what it says.
//
// `aggregate_checkpoint_status` is an ordered list cell on the delivery cursor,
// one `<checkpoint>:<status>` entry per Delivery Story checkpoint reached: the Plan
// (`plan:pending`, `plan:approved`), then validation, the debt review, coherence,
// and done. The Plan and closure modules write it; the flow unit reads it to know
// whether the Delivery Story's Plan is recorded (CR105). Both live here so the
// entry format has one home.

/**
 * Python `_replace_status`.
 *
 * Keep every entry whose prefix differs, then APPEND. Shared by
 * `deliveryStoryPlan.ts` and `deliveryStoryClosure.ts`, which need the identical
 * rule: the order is part of the serialized cell a compare-and-swap matches on.
 */
export function replaceStatus(
  existing: readonly string[],
  checkpoint: string,
  status: string,
): string[] {
  const prefix = `${checkpoint}:`;
  return [...existing.filter((item) => !item.startsWith(prefix)), `${checkpoint}:${status}`];
}

/**
 * Whether the Delivery Story's Plan is recorded: pending approval, approved, or
 * followed by any later checkpoint, since each of those is reached through it.
 */
export function hasDeliveryStoryPlan(statuses: readonly string[]): boolean {
  return statuses.some((item) => item.startsWith("plan:"));
}
