// `list personas` / `list journeys` rendering — the port of the personas/journeys
// branches of memory.cli.inspect.cmd_list. `list extensions`/`list all` touch the
// extension catalog and stay on Python (bound to CV22.DS7.TS1).

import type { JourneyListRow } from "../../identity/journeyListing.ts";
import type { PersonaListRow } from "../../identity/personaListing.ts";

/** Render `list personas` (and the personas branch of `--verbose`). */
export function renderListPersonas(rows: PersonaListRow[], verbose: boolean): string {
  const prints: string[] = ["=== PERSONAS ==="];
  if (rows.length === 0) {
    prints.push("  (none)");
  } else {
    for (const row of rows) {
      if (!verbose) {
        prints.push(`  ${row.key}`);
        continue;
      }
      const keywordsStr =
        row.routingKeywords.length > 0 ? row.routingKeywords.join(", ") : "(none)";
      prints.push(`  ${row.key}`);
      prints.push(`    version: ${row.version}`);
      prints.push(`    routing_keywords: ${keywordsStr}`);
    }
  }
  return prints.map((line) => `${line}\n`).join("");
}

/** Render `list journeys`. */
export function renderListJourneys(rows: JourneyListRow[]): string {
  const prints: string[] = ["=== JOURNEYS ==="];
  if (rows.length === 0) {
    prints.push("  (none)");
  } else {
    for (const row of rows) {
      const suffix = row.description ? `: ${row.description}` : "";
      prints.push(`  [${row.status}] ${row.key}${suffix}`);
    }
  }
  return prints.map((line) => `${line}\n`).join("");
}
