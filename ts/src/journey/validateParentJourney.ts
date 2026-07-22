// Port of `JourneyService._validate_parent_journey` (src/memory/services/journey.py).
//
// Pure over resolved journey rows — the DB seam supplies them, keeping this the
// decision core. Enforces the four hierarchy rules in Python's exact order and
// with Python's exact messages, so the front door and any future write route
// reject an invalid parent identically to the Python oracle. Parent information
// is read JSON-first (decision D1) via `resolveParentJourney`, the same resolver
// the listing sort uses, so validation and listing can never disagree.

/** Raised when a proposed parent_journey violates a hierarchy rule. */
export class ParentJourneyValidationError extends Error {}

/** One journey with its resolved (JSON-first) parent; "" when it has none. */
export interface JourneyParentRow {
  key: string;
  parentJourney: string;
}

/**
 * Validate a proposed `parentJourney` for `journey` against all known journey
 * rows. No-op when the parent is empty. Otherwise enforces, in order:
 *   1. a journey cannot be its own parent;
 *   2. the parent must exist;
 *   3. the parent must not itself have a parent (single-level nesting);
 *   4. a journey that already has children cannot also gain a parent.
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
  const parent = rows.find((row) => row.key === parentJourney);
  if (!parent) {
    throw new ParentJourneyValidationError(`Parent journey '${parentJourney}' not found`);
  }
  if (parent.parentJourney) {
    throw new ParentJourneyValidationError("Only one hierarchy level is supported");
  }
  if (journey && rows.some((row) => row.key !== journey && row.parentJourney === journey)) {
    throw new ParentJourneyValidationError(
      "Journeys with child journeys cannot also have a parent",
    );
  }
}
