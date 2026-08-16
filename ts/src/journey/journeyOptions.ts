// Journey listing parity port (CV22.DS2.US3).
//
// A faithful TypeScript port of Python `JourneyService.list_journey_options` +
// `_sort_journey_options` (`src/memory/services/journey.py`). The logic is pure
// over the `journey` identity rows: it derives each journey's display name,
// status, and parent from row content/metadata, then orders every descendant in
// bounded depth-first order. Reading the rows out of the SQLite
// seam belongs to the caller, keeping this the pure decision core.

import { resolveParentJourney } from "./parentJourney.ts";

/** One `journey`-layer identity row, as read from the DB. */
export interface JourneyIdentityRow {
  key: string;
  content: string;
  metadata?: string | null;
  /** Migration 017's derived parent projection. Metadata remains semantic
   * authority while Python and TS can both write parentage (CR050). */
  parent_journey?: string | null;
}

/** A journey option DTO with hierarchy metadata, mirroring the Python output. */
export interface JourneyOption {
  id: string;
  name: string;
  status: string;
  parent_journey: string;
  depth: number;
  lineage: string[];
}

type UnorderedJourneyOption = Omit<JourneyOption, "depth" | "lineage">;

/** Build the unordered option fields for a single journey row. */
function toOption(row: JourneyIdentityRow): UnorderedJourneyOption {
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
 * is a root. The depth-first sorter consumes this index; renderers consume the
 * resulting ordered projection and must not reconstruct a shallower hierarchy.
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
 * Order every option in bounded depth-first hierarchy order, mirroring the
 * released Python `_sort_journey_options` oracle.
 *
 * Roots (no parent, or a parent absent from the set) and every sibling set are
 * sorted by `(status !== "active", name.toLowerCase())`. A visited set makes
 * malformed legacy cycles bounded; a final sorted pass starts each rootless
 * component so corrupt rows remain visible exactly once.
 */
function sortJourneyOptions(options: UnorderedJourneyOption[]): JourneyOption[] {
  const { roots, childrenByParent } = groupJourneysByParent(options);

  const compare = (a: UnorderedJourneyOption, b: UnorderedJourneyOption): number => {
    const aInactive = a.status !== "active" ? 1 : 0;
    const bInactive = b.status !== "active" ? 1 : 0;
    if (aInactive !== bInactive) return aInactive - bInactive;
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  };

  const ordered: JourneyOption[] = [];
  const visited = new Set<string>();

  const appendBranch = (item: UnorderedJourneyOption, lineage: string[]): void => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    const currentLineage = [...lineage, item.id];
    ordered.push({ ...item, depth: lineage.length, lineage: currentLineage });
    for (const child of [...(childrenByParent.get(item.id) ?? [])].sort(compare)) {
      appendBranch(child, currentLineage);
    }
  };

  for (const root of [...roots].sort(compare)) appendBranch(root, []);
  for (const unvisited of [...options].sort(compare)) {
    if (!visited.has(unvisited.id)) appendBranch(unvisited, []);
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
