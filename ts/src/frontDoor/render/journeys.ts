// `journeys` rendering: read journey options, enrich with stage/description,
// format the roots-then-children hierarchy. Extracted from cli.ts (CR002).

import type { Database } from "../../db/database.ts";
import {
  type JourneyIdentityRow,
  type JourneyOption,
  listJourneyOptions,
} from "../../journey/journeyOptions.ts";
import { identityRows } from "./identityRows.ts";

/** A journey option enriched with the display-only stage and description. */
export interface JourneyDisplayRow extends JourneyOption {
  stage: string;
  description: string;
}

const STATUS_ICONS: Record<string, string> = { active: "🚧", completed: "✅", paused: "⏸" };

/** Read journeys and enrich each with its stage (from journey_path) and description. */
export function journeyRows(db: Database): JourneyDisplayRow[] {
  const options = listJourneyOptions(
    identityRows(db, "journey") as unknown as JourneyIdentityRow[],
  );
  return options.map((option) => {
    const ident = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("journey", option.id);
    const content = typeof ident?.content === "string" ? ident.content : "";
    const desc = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("**"));
    const journeyPath = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get("journey_path", option.id);
    const pathContent = typeof journeyPath?.content === "string" ? journeyPath.content : "";
    const stage =
      pathContent.match(/\*\*(?:Current stage|Etapa atual):\*\*\s*(.+)/)?.[1]?.trim() ?? "—";
    return { ...option, stage, description: (desc ?? "").slice(0, 80) };
  });
}

/** Format one journey (root or child) into display lines. */
export function renderJourney(row: JourneyDisplayRow, child = false): string[] {
  const icon = STATUS_ICONS[row.status] ?? "•";
  const prefix = child ? "  └─ " : "";
  const detailIndent = child ? "       " : "  ";
  const lines = [
    `${prefix}${icon} **${row.id}** (${row.status})`,
    `${detailIndent}Stage: ${row.stage}`,
  ];
  if (row.description) lines.push(`${detailIndent}${row.description}`);
  lines.push("");
  return lines;
}

/** Render the full `journeys` listing, roots each immediately followed by children. */
export function renderJourneys(db: Database): string {
  const rows = journeyRows(db);
  if (rows.length === 0) return "No journeys found.\n";
  const known = new Set(rows.map((row) => row.id));
  const children = new Map<string, JourneyDisplayRow[]>();
  const roots: JourneyDisplayRow[] = [];
  for (const row of rows) {
    if (row.parent_journey && known.has(row.parent_journey)) {
      const bucket = children.get(row.parent_journey);
      if (bucket) bucket.push(row);
      else children.set(row.parent_journey, [row]);
    } else {
      roots.push(row);
    }
  }
  const lines: string[] = [];
  for (const row of roots) {
    lines.push(...renderJourney(row));
    for (const child of children.get(row.id) ?? []) lines.push(...renderJourney(child, true));
  }
  return lines.join("\n");
}
