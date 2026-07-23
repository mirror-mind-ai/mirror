// `journey status` rendering — the port of memory.cli.journey.cmd_status and
// main()'s positional-argument dispatch quirk.

import type { Database } from "../../db/database.ts";
import {
  allJourneyKeys,
  getJourneyStatusEntries,
  type JourneyStatusEntry,
  type ReadTextFile,
} from "../../journey/journeyStatus.ts";

/**
 * Port of the slug-resolution branch in `journey.main()`. This reproduces a
 * real, verified Python quirk rather than the "obvious" reading: only
 * `remaining.length >= 2 && remaining[0] === "status"` treats `remaining[1]`
 * as the slug. A bare `["status"]` (length 1, nothing after it) falls through
 * to the generic `remaining[0] if remaining else None` branch — so the
 * literal token "status" itself becomes the requested journey slug, NOT a
 * request to show every journey. To see every journey, the caller must pass
 * no positional tokens at all. Verified against the live oracle.
 */
export function resolveJourneyStatusSlug(remaining: readonly string[]): string | null {
  if (remaining.length >= 2 && remaining[0] === "status") return remaining[1];
  return remaining.length > 0 ? remaining[0] : null;
}

/** Render one journey's status block (identity / journey path / memories / conversations). */
function renderJourneyStatusEntry(entry: JourneyStatusEntry): string[] {
  const prints: string[] = [`=== journey: ${entry.journeyId} ===`];
  if (entry.identity) {
    prints.push("\n--- identity ---");
    prints.push(entry.identity);
  }
  if (entry.journeyPath) {
    prints.push("\n--- journey path ---");
    prints.push(entry.journeyPath);
  }
  if (entry.recentMemories.length > 0) {
    prints.push(`\n--- recent memories (${entry.recentMemories.length}) ---`);
    for (const memory of entry.recentMemories) {
      prints.push(`  [${memory.created_at.slice(0, 10)}] ${memory.title}`);
    }
  } else {
    prints.push("\n--- recent memories ---");
    prints.push("  No recent memories.");
  }
  if (entry.recentConversations.length > 0) {
    prints.push(`\n--- recent conversations (${entry.recentConversations.length}) ---`);
    for (const conversation of entry.recentConversations) {
      prints.push(
        `  [${conversation.started_at.slice(0, 10)}] ${conversation.title || "(untitled)"}`,
      );
    }
  } else {
    prints.push("\n--- recent conversations ---");
    prints.push("  No recent conversations.");
  }
  prints.push("");
  return prints;
}

/**
 * Render `journey status` for a resolved slug (or every journey when `slug`
 * is null). A non-existent slug is NOT an error — it renders an
 * identity-less, path-less, empty-history block, matching the Python oracle
 * (`get_journey_status` never validates the slug exists).
 */
export function renderJourneyStatus(
  db: Database,
  slug: string | null,
  readTextFile?: ReadTextFile,
): string {
  const keys = slug !== null ? [slug] : allJourneyKeys(db);
  const entries = getJourneyStatusEntries(db, keys, readTextFile);
  const prints: string[] = [];
  for (const entry of entries) prints.push(...renderJourneyStatusEntry(entry));
  return prints.map((line) => `${line}\n`).join("");
}
