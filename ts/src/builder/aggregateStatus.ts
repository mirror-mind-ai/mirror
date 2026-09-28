// A Delivery Story's aggregate checkpoint status: its writer, and one of its readers.
//
// `aggregate_checkpoint_status` is an ordered list cell on the delivery cursor,
// one `<checkpoint>:<status>` entry per Delivery Story checkpoint reached: the Plan
// (`plan:pending`, `plan:approved`), then validation, the debt review, coherence,
// and done. `replaceStatus` writes every entry, for the Plan and closure modules.
// `hasDeliveryStoryPlan` is the flow unit's reader (CR105), kept beside the writer
// so the two agree on the Plan's prefix. The other readers still test entries by
// hand: `implementationGuard.ts` and the Plan approval test `plan:approved`, and
// `deliveryStoryClosure.ts` tests the entry each closure step expects.

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
