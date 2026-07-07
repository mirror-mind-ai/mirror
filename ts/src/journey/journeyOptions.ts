// Journey listing parity port (CV22.DS2.US3).
//
// A faithful TypeScript port of Python `JourneyService.list_journey_options` +
// `_sort_journey_options` (`src/memory/services/journey.py`). The logic is pure
// over the `journey` identity rows: it derives each journey's display name,
// status, and parent from row content/metadata, then orders roots-then-children
// with a stable, deterministic comparator. Reading the rows out of the SQLite
// seam belongs to the caller, keeping this the pure decision core.

/** One `journey`-layer identity row, as read from the DB. */
export interface JourneyIdentityRow {
  key: string;
  content: string;
  metadata?: string | null;
}

/** A journey option DTO with hierarchy metadata, mirroring the Python output. */
export interface JourneyOption {
  id: string;
  name: string;
  status: string;
  parent_journey: string;
}

/** Parse the parent journey out of an identity row's JSON metadata, or "". */
function parentJourney(metadata: string | null | undefined): string {
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

/** Build the option DTO for a single journey row (name/status/parent extraction). */
function toOption(row: JourneyIdentityRow): JourneyOption {
  const content = row.content || "";
  // Python: content.split("\n")[0].strip().lstrip("# ").strip()
  const firstLine = (content.split("\n")[0] ?? "")
    .trim()
    .replace(/^[# ]+/, "")
    .trim();
  const statusMatch = content.match(/\*\*Status:\*\*\s*([^\n]+)/);
  const status = statusMatch ? statusMatch[1].trim() : "unknown";
  return {
    id: row.key,
    name: firstLine || row.key,
    status,
    parent_journey: parentJourney(row.metadata),
  };
}

/**
 * Order options roots-then-children, mirroring `_sort_journey_options`.
 *
 * Roots (no parent, or a parent absent from the set) are sorted by
 * `(status !== "active", name.toLowerCase())`; each root is immediately followed
 * by its children sorted the same way. `Array.prototype.sort` is stable, so ties
 * preserve the incoming `ORDER BY key` order, matching Python's stable `sorted`.
 */
function sortJourneyOptions(options: JourneyOption[]): JourneyOption[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  const children = new Map<string, JourneyOption[]>();
  const roots: JourneyOption[] = [];
  for (const option of options) {
    const parent = option.parent_journey || "";
    if (parent && byId.has(parent)) {
      const bucket = children.get(parent);
      if (bucket) bucket.push(option);
      else children.set(parent, [option]);
    } else {
      roots.push(option);
    }
  }

  const compare = (a: JourneyOption, b: JourneyOption): number => {
    const aInactive = a.status !== "active" ? 1 : 0;
    const bInactive = b.status !== "active" ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  };

  const ordered: JourneyOption[] = [];
  for (const root of [...roots].sort(compare)) {
    ordered.push(root);
    ordered.push(...[...(children.get(root.id) ?? [])].sort(compare));
  }
  return ordered;
}

/**
 * Return all journeys as option DTOs with hierarchy metadata, reproducing the
 * Python oracle. `rows` must arrive in the DB's `ORDER BY key` order (as
 * `get_identity_by_layer` returns them) so stable-sort tie-breaks match Python.
 */
export function listJourneyOptions(rows: readonly JourneyIdentityRow[]): JourneyOption[] {
  return sortJourneyOptions(rows.map(toOption));
}
