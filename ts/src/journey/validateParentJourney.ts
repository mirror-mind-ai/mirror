// Port of `JourneyService._validate_parent_journey` (src/memory/services/journey.py).
//
// Pure over resolved journey rows — the DB seam supplies them, keeping this the
// decision core. Walks complete ancestry in Python's exact order and with
// Python's exact messages, so the front door and every parent write route
// reject an invalid parent identically to the Python oracle. Parent information
// is read from mixed-engine-authoritative metadata (CR050) via
// `resolveParentJourney`, the same resolver the listing sort uses, so validation
// and listing can never disagree.

/** Raised when a proposed parent_journey violates a hierarchy rule. */
export class ParentJourneyValidationError extends Error {}

/** One journey with its CR050 metadata-authoritative parent; "" when it has none. */
export interface JourneyParentRow {
  key: string;
  parentJourney: string;
}

/**
 * Validate a proposed `parentJourney` for `journey` against all known journey
 * rows. No-op when the parent is empty. Otherwise enforce the released
 * arbitrary-depth boundary: the proposed parent must exist, its full ancestry
 * must not reach the journey being moved, and that ancestry must not already
 * contain a cycle. A missing legacy ancestor safely ends the walk, matching
 * Python's tolerant read behavior.
 */
export function validateParentJourney(
  journey: string | null,
  parentJourney: string | null,
  rows: readonly JourneyParentRow[],
): void {
  if (!parentJourney) return;
  if (journey && parentJourney === journey) {
    throw new ParentJourneyValidationError("parent_journey cannot be the journey itself");
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  let current = byKey.get(parentJourney);
  if (!current) {
    throw new ParentJourneyValidationError(`Parent journey '${parentJourney}' not found`);
  }

  const visited = new Set<string>();
  while (current) {
    if (journey && current.key === journey) {
      throw new ParentJourneyValidationError("parent_journey would create a cycle");
    }
    if (visited.has(current.key)) {
      throw new ParentJourneyValidationError("Parent lineage contains an existing cycle");
    }
    visited.add(current.key);
    if (!current.parentJourney) return;
    current = byKey.get(current.parentJourney);
  }
}
