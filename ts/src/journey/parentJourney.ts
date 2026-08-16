// Mixed-engine parent-journey resolution (RS008/CR050).
//
// Python v0.31.9 stores the semantic parent in identity.metadata and remains
// runtime authority for the unported Workspace/web parent writer. TS migration
// 017's `identity.parent_journey` column is therefore only a derived projection
// while both engines can write: Python can move or unparent a journey without
// updating that column. Reading the column as authority or fallback would then
// resurrect stale structure.
//
// Every supported TS parent writer still updates metadata and the projection
// atomically. A future column-authority flip requires every parent writer to be
// on TS plus a separate decision; until then all TS readers use this one
// metadata-only resolver and column/metadata disagreement is drift to diagnose,
// never something a read silently repairs.

export interface ParentJourneySource {
  /** Migration 017's derived projection. Not semantic authority during mixed-engine operation. */
  parent_journey?: string | null;
  /** The semantic journey metadata written by both Python and TS. */
  metadata?: string | null;
}

/** Parse the parent journey out of JSON metadata; "" on malformed/non-object
 * metadata or a non-string value, matching the Python reader's tolerance. */
function resolveParentJourneyFromMetadata(metadata: string | null | undefined): string {
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

/** Resolve a journey's parent from the mixed-engine semantic authority. */
export function resolveParentJourney(source: ParentJourneySource): string {
  return resolveParentJourneyFromMetadata(source.metadata);
}
