// `conversations` (plain listing) rendering — the port of the summary print
// loop in memory.cli.conversations.main. The metadata-lifecycle/backfill flags
// on the same Python command are out of scope (see routing.ts) and never reach
// this renderer.

import {
  type ListRecentConversationsFilters,
  listRecentConversationSummaries,
} from "../../conversation/listing.ts";
import type { Database } from "../../db/database.ts";

/** Render the `conversations` plain listing. */
export function renderConversationsListing(
  db: Database,
  filters: ListRecentConversationsFilters,
): string {
  const summaries = listRecentConversationSummaries(db, filters);
  if (summaries.length === 0) return "No conversations found.\n";
  const prints: string[] = [];
  for (const summary of summaries) {
    const title = summary.title || "(untitled)";
    const date = summary.started_at ? summary.started_at.slice(0, 10) : "?";
    const journeyStr = summary.journey ? ` [${summary.journey}]` : "";
    const personaStr = summary.persona ? ` \u25c7 ${summary.persona}` : "";
    prints.push(
      `**${date}** | \`${summary.id.slice(0, 8)}\`${journeyStr}${personaStr} ` +
        `(${summary.message_count} msgs)`,
    );
    prints.push(`  ${title}`);
    prints.push("");
  }
  return prints.map((line) => `${line}\n`).join("");
}
