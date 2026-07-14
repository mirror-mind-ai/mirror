// `journeys` rendering: read journey options, enrich with stage/description,
// format the roots-then-children hierarchy. Extracted from cli.ts (CR002).

import type { Database } from "../../db/database.ts";
import { optionalString, requireString } from "../../db/rowDecode.ts";
import {
  groupJourneysByParent,
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

/** Read the `content` column of an identity layer keyed by identity key. */
function contentByKey(db: Database, layer: string): Map<string, string> {
  return new Map(
    identityRows(db, layer).map((row) => [
      requireString(row, "key"),
      optionalString(row, "content") ?? "",
    ]),
  );
}

/**
 * Read journeys and enrich each with its stage (from journey_path) and
 * description. Two queries total (journey + journey_path layers), not the
 * former 1 + 2N: the journey content is loaded once into a map and the stage
 * layer once, instead of a per-journey pair of lookups.
 */
export function journeyRows(db: Database): JourneyDisplayRow[] {
  const journeyContent = contentByKey(db, "journey");
  const stageContent = contentByKey(db, "journey_path");
  const identityForOptions: JourneyIdentityRow[] = identityRows(db, "journey").map((row) => ({
    key: requireString(row, "key"),
    content: optionalString(row, "content") ?? "",
    metadata: optionalString(row, "metadata"),
  }));
  return listJourneyOptions(identityForOptions).map((option) => {
    const desc = (journeyContent.get(option.id) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("**"));
    const stage =
      (stageContent.get(option.id) ?? "")
        .match(/\*\*(?:Current stage|Etapa atual):\*\*\s*(.+)/)?.[1]
        ?.trim() ?? "—";
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
  const { roots, childrenByParent } = groupJourneysByParent(rows);
  const lines: string[] = [];
  for (const row of roots) {
    lines.push(...renderJourney(row));
    for (const child of childrenByParent.get(row.id) ?? [])
      lines.push(...renderJourney(child, true));
  }
  return lines.join("\n");
}
