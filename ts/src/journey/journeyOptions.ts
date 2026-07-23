// Journey listing parity port (CV22.DS2.US3).
//
// A faithful TypeScript port of Python `JourneyService.list_journey_options` +
// `_sort_journey_options` (`src/memory/services/journey.py`). The logic is pure
// over the `journey` identity rows: it derives each journey's display name,
// status, and parent from row content/metadata, then orders roots-then-children
// with a stable, deterministic comparator. Reading the rows out of the SQLite
// seam belongs to the caller, keeping this the pure decision core.

import { resolveParentJourney } from "./parentJourney.ts";

/** One `journey`-layer identity row, as read from the DB. */
export interface JourneyIdentityRow {
  key: string;
  content: string;
  metadata?: string | null;
  /** The first-class parent column (US2). Authoritative when non-empty as of
   * the DS7.US1 rider (resolveParentJourney reads it column-first); the JSON
   * in `metadata` remains the fallback for rows the column hasn't reached. */
  parent_journey?: string | null;
}

/** A journey option DTO with hierarchy metadata, mirroring the Python output. */
export interface JourneyOption {
  id: string;
  name: string;
  status: string;
  parent_journey: string;
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
    parent_journey: resolveParentJourney(row),
  };
}

/** A roots-then-children split of journey-like items keyed by `parent_journey`. */
export interface JourneyHierarchy<T> {
  roots: T[];
  childrenByParent: Map<string, T[]>;
}

/**
 * Split items into roots and children by `parent_journey`, preserving input
 * order within each group. An item whose parent is empty or absent from the set
 * is a root. Shared by the journey sort and the journey renderer so the
 * roots-then-children bucketing lives in exactly one place.
 */
export function groupJourneysByParent<T extends { id: string; parent_journey: string }>(
  items: readonly T[],
): JourneyHierarchy<T> {
  const knownIds = new Set(items.map((item) => item.id));
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    const parent = item.parent_journey || "";
    if (parent && knownIds.has(parent)) {
      const bucket = childrenByParent.get(parent);
      if (bucket) bucket.push(item);
      else childrenByParent.set(parent, [item]);
    } else {
      roots.push(item);
    }
  }
  return { roots, childrenByParent };
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
  const { roots, childrenByParent } = groupJourneysByParent(options);

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
    ordered.push(...[...(childrenByParent.get(root.id) ?? [])].sort(compare));
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
