// The Journey tree a host renders — CV24.DS3.
//
// A new contract for a named consumer (Mirror Desktop 0.3), not a revival of
// the Journey registry dump CV22.DS10.TS4 retired (`journey-admin-verbs`). Its node rules are
// the removed export's, so a host's sidebar reads the same after it moves to
// this core:
//
//   - `name`: metadata `display_name`, then the content's first `# ` heading,
//     then the key;
//   - `status` and `stage`: the `**Status:**` and `**Stage:**` lines;
//   - `description`: the collapsed body of `## Description` or `## Descrição`;
//   - `parentId`, `projectPath`, `siblingPosition`: from metadata, when present;
//   - siblings ordered by an integer `sibling_position`, then by key, the
//     unpositioned last. `listJourneyOptions` orders by status and name and
//     never reads `sibling_position`; 65 of the Navigator's 81 Journeys carry
//     one, so a tree in that order would reorder a sidebar at migration.
//
// One deliberate difference: the export FAILED on a malformed order or
// hierarchy. This read is a sidebar's only source, so it falls back instead,
// deterministically, and names each fallback in `findings`:
//
//   - `malformed_order`: duplicate, negative or non-integer positions in one
//     sibling set; that set is ordered by key.
//   - `malformed_hierarchy`: a cycle, or a chain deeper than 16; the node where
//     the walk could not continue is shown as a root.
//
// Every Journey appears in the tree exactly once. Pure: the rows are the
// caller's to read.

/** One `journey`-layer identity row, as read from the database. */
export interface JourneyTreeRow {
  key: string;
  content: string | null;
  updated_at: string;
  metadata: string | null;
}

export interface JourneyTreeNode {
  id: string;
  name: string;
  updatedAt: string;
  description?: string;
  status?: string;
  stage?: string;
  parentId?: unknown;
  projectPath?: unknown;
  siblingPosition?: unknown;
  children?: JourneyTreeNode[];
}

export interface JourneyTreeFinding {
  kind: "malformed_order" | "malformed_hierarchy";
  /** The parent whose children were misordered (null for the roots), or the node shown as a root. */
  journeyId: string | null;
}

export interface JourneyTree {
  roots: JourneyTreeNode[];
  findings: JourneyTreeFinding[];
}

/** The export's depth bound: a node whose lineage is longer than this is not attached. */
const MAX_DEPTH = 16;

function metadataOf(raw: string | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function collapse(text: string): string {
  return text.trim().split(/\s+/u).filter(Boolean).join(" ");
}

function nodeOf(row: JourneyTreeRow, meta: Record<string, unknown>): JourneyTreeNode {
  const content = row.content ?? "";
  const title = content.match(/^#\s+(.+)$/m);
  const status = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const stage = content.match(/^\*\*Stage:\*\*\s*(.+)$/m);
  const description = content.match(
    /^## (?:Description|Descrição)\s+([\s\S]+?)(?:\n## |$(?![\s\S]))/m,
  );
  const node: JourneyTreeNode = {
    id: row.key,
    name: (meta.display_name as string) || (title ? (title[1] ?? "").trim() : row.key),
    updatedAt: row.updated_at,
  };
  const optional: Record<string, unknown> = {
    description: description ? collapse(description[1] ?? "") : "",
    status: status ? (status[1] ?? "").trim() : "",
    stage: stage ? (stage[1] ?? "").trim() : "",
    parentId: meta.parent_journey,
    projectPath: meta.project_path,
    siblingPosition: meta.sibling_position,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== null && value !== "")
      (node as unknown as Record<string, unknown>)[key] = value;
  }
  return node;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildJourneyTree(rows: readonly JourneyTreeRow[]): JourneyTree {
  const nodes = new Map<string, JourneyTreeNode>();
  const meta = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const metadata = metadataOf(row.metadata);
    meta.set(row.key, metadata);
    nodes.set(row.key, nodeOf(row, metadata));
  }
  const keys = [...nodes.keys()].sort(byKey);
  const parentOf = (key: string): string | null => {
    const parent = meta.get(key)?.parent_journey;
    return typeof parent === "string" && nodes.has(parent) ? parent : null;
  };
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const key of keys) {
    const parent = parentOf(key);
    if (parent === null) roots.push(key);
    else children.set(parent, [...(children.get(parent) ?? []), key]);
  }

  const findings: JourneyTreeFinding[] = [];
  const order = (ids: string[], parent: string | null): string[] => {
    const explicit = ids
      .map((id) => meta.get(id) ?? {})
      .filter((m) => "sibling_position" in m)
      .map((m) => m.sibling_position);
    const valid = explicit.every(
      (value) => typeof value === "number" && Number.isInteger(value) && value >= 0,
    );
    if (!valid || new Set(explicit).size !== explicit.length) {
      findings.push({ kind: "malformed_order", journeyId: parent });
      return [...ids].sort(byKey);
    }
    const position = (id: string): number => {
      const value = meta.get(id)?.sibling_position;
      return typeof value === "number" ? value : 2 ** 31;
    };
    return [...ids].sort((a, b) => position(a) - position(b) || byKey(a, b));
  };

  const visited = new Set<string>();
  const attach = (key: string, depth: number): JourneyTreeNode => {
    visited.add(key);
    const node: JourneyTreeNode = { ...(nodes.get(key) as JourneyTreeNode) };
    const attached: JourneyTreeNode[] = [];
    if (depth < MAX_DEPTH) {
      for (const child of order(children.get(key) ?? [], key)) {
        if (!visited.has(child)) attached.push(attach(child, depth + 1));
      }
    }
    if (attached.length > 0) node.children = attached;
    return node;
  };

  const tree = order(roots, null).map((key) => attach(key, 0));

  // What the walk could not reach: a cycle, or the rest of a chain cut at the
  // depth bound. Each is started from the node where the walk stopped -- a
  // cycle's smallest key, or the first node past the bound -- never from a
  // Journey merely hanging off one, which is reached from its start.
  for (;;) {
    const unvisited = keys.filter((key) => !visited.has(key));
    if (unvisited.length === 0) break;
    const onCycle = (key: string): boolean => {
      let current = parentOf(key);
      for (let steps = 0; current !== null && steps <= keys.length; steps++) {
        if (current === key) return true;
        if (visited.has(current)) return false;
        current = parentOf(current);
      }
      return false;
    };
    const start = unvisited.find((key) => {
      const parent = parentOf(key);
      return (parent !== null && visited.has(parent)) || onCycle(key);
    }) as string;
    findings.push({ kind: "malformed_hierarchy", journeyId: start });
    tree.push(attach(start, 0));
  }
  return { roots: tree, findings };
}
