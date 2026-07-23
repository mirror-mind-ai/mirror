// `list journeys` read primitives — the port of the journey branch of
// memory.cli.inspect.cmd_list (`_extract_status` / `_extract_description`).
//
// Deliberately NOT reused from journey/journeyOptions.ts: that module ports a
// different Python method (`list_journey_options`, behind the `journeys`
// top-level command) with a full-line status regex and no description
// truncation. This command's Python source (memory.cli.inspect) extracts a
// single \w+ status word, tries a Portuguese "## Descrição" heading before an
// English "## Description" fallback (two separate searches, not one
// alternation — order matters when content could contain both), and caps the
// description at 120 chars, not 150. Porting it as its own function keeps the
// two Python call sites' independent behavior independently reproduced.

import type { Database } from "../db/database.ts";
import { optionalString, requireString } from "../db/rowDecode.ts";

export interface JourneyListRow {
  key: string;
  status: string;
  description: string;
}

/** Port of `_extract_status`: the first `**Status:** <word>`, or "unknown". */
function extractStatus(content: string): string {
  const match = content.match(/\*\*Status:\*\*\s*(\w+)/);
  return match ? match[1] : "unknown";
}

/**
 * Port of `_extract_description`: try a Portuguese "## Descrição" section
 * first, then an English "## Description" section, ending at a blank line or
 * the next heading; trimmed and capped at 120 chars.
 */
function extractDescription(content: string): string {
  const pt = content.match(/## Descrição\s*\n+(.+?)(?:\n\n|\n##)/s);
  const match = pt ?? content.match(/## Description\s*\n+(.+?)(?:\n\n|\n##)/s);
  return match ? match[1].trim().slice(0, 120) : "";
}

/** Port of `mem.get_identity(layer="journey")`, pre-sorted by key (Python re-sorts a no-op). */
export function listJourneysForListCommand(db: Database): JourneyListRow[] {
  return db
    .prepare("SELECT key, content FROM identity WHERE layer = 'journey' ORDER BY key")
    .all()
    .map((row) => {
      const content = optionalString(row, "content") ?? "";
      return {
        key: requireString(row, "key"),
        status: extractStatus(content),
        description: extractDescription(content),
      };
    });
}
