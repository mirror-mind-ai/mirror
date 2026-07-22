// JSON-first parent-journey resolution (CV22.DS6.US3, decision D1).
//
// The authoritative source for a journey's parent in US3 is the JSON metadata,
// exactly as the Python oracle reads it (`_metadata_dict(metadata)["parent_journey"]`).
// The `identity.parent_journey` column (US2) is a shadow/index — maintained by
// dual-write and migrate-on-open, but NOT trusted for reads yet; making it
// authoritative is deferred to DS7. Keeping resolution in one place lets the
// listing sort and the parent-validation rules agree by construction, and gives
// DS7 a single call site to flip from JSON-first to column-first.

export interface ParentJourneySource {
  /** The first-class column (US2). Present but non-authoritative in US3. */
  parent_journey?: string | null;
  /** The journey identity metadata JSON — the authoritative source in US3. */
  metadata?: string | null;
}

/** Parse the parent journey from JSON metadata (authoritative in US3), or "".
 * Malformed or non-object metadata yields "" without throwing, matching the
 * Python reader's tolerance. */
export function resolveParentJourney(source: ParentJourneySource): string {
  const { metadata } = source;
  if (!metadata) return "";
  let payload: unknown;
  try {
    payload = JSON.parse(metadata);
  } catch {
    return "";
  }
  if (payload === null || typeof payload !== "object") return "";
  const parent = (payload as Record<string, unknown>).parent_journey;
  return typeof parent === "string" ? parent : "";
}
