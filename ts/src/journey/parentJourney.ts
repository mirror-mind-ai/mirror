// Column-first parent-journey resolution (CV22.DS6.US3 rider, activated in
// DS7.US1).
//
// The `identity.parent_journey` column (authored in US2) is now authoritative:
// journeyWrite.ts's `createJourney` writes it atomically alongside the JSON
// metadata (one transaction), so for every row written through that path the
// two agree by construction. The JSON metadata remains the fallback for rows
// the column write hasn't reached — most importantly, any row created or
// modified by a still-unported Python path (Python's schema has no such
// column at all). This is the single call site DS6.US3 reserved for the flip;
// the listing sort and the parent-validation rules both resolve through it, so
// they agree by construction on which source is authoritative.
//
// Known, accepted limitation: `JourneyService.update_metadata_fields` (Python)
// can still change a journey's `parent_journey` in the JSON without touching
// the column — but that path is reachable only from the web server
// (src/memory/web/server.py), outside this migration's CLI/MCP scope. A row
// whose column was once populated and is later changed only through that path
// would read as stale here (non-null column, outdated value) until it is
// ported or re-synced. A null/absent column always falls through to the JSON,
// so this limitation cannot silently drop a parent — only a previously-synced
// value can go stale.

export interface ParentJourneySource {
  /** The first-class column (US2/US3). Authoritative when non-empty. */
  parent_journey?: string | null;
  /** The journey identity metadata JSON — the fallback when the column is absent/null. */
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

/** Resolve a journey's parent: the column when it is a non-empty string, else the JSON fallback. */
export function resolveParentJourney(source: ParentJourneySource): string {
  const column = source.parent_journey;
  if (typeof column === "string" && column) return column;
  return resolveParentJourneyFromMetadata(source.metadata);
}
