// Journey association diagnosis and repair (CV22.DS7.US10 slice E).
//
// Ports `diagnose_journey_associations` and
// `_print_journey_association_findings` from
// `src/memory/cli/conversation_logger.py`.
//
// `diagnose-journeys` is read-only. `repair-journeys --apply` is the one
// genuinely MUTATING repair in this story: it rewrites the `journey` column of
// conversations the user never explicitly assigned. Python gates it behind a
// database backup and refuses to proceed if the backup fails, which is a safety
// property, not an implementation detail -- it is ported as a hard refusal.

import {
  firstUserMessage,
  inferJourneyForConversation,
  journeyAliases,
} from "#conversation/journeyInference.ts";
import type { WritableDatabase } from "#db/database.ts";

export interface JourneyFinding {
  conversation_id: string;
  journey: string;
  reason: string;
  title: string;
  started_at: string;
  message_count: number;
}

export interface DiagnoseOptions {
  limit?: number | null;
  apply?: boolean;
  /**
   * Create a database backup and return its path, or null on failure. Required
   * whenever `apply` is set; a null return refuses the repair.
   */
  backup?: () => string | null;
}

/**
 * Find, and optionally repair, journeyless conversations with a high-confidence
 * match.
 *
 * The findings list is identical in both modes: `apply` changes whether they are
 * written, never which conversations qualify. That is what makes the dry run a
 * trustworthy preview of the mutation.
 */
export function diagnoseJourneyAssociations(
  db: WritableDatabase,
  options: DiagnoseOptions = {},
): JourneyFinding[] {
  const aliases = journeyAliases(db);
  const limit = options.limit ?? null;
  const baseSql =
    "SELECT id, title, started_at FROM conversations WHERE journey IS NULL ORDER BY started_at DESC";
  const rows = (
    limit === null ? db.prepare(baseSql).all() : db.prepare(`${baseSql} LIMIT ?`).all(limit)
  ) as Record<string, unknown>[];

  const findings: JourneyFinding[] = [];
  for (const row of rows) {
    const conversationId = String(row.id);
    const title = typeof row.title === "string" ? row.title : null;
    const { journey, reason } = inferJourneyForConversation(
      title,
      firstUserMessage(db, conversationId),
      aliases,
    );
    if (!journey) continue;

    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?")
      .get(conversationId) as Record<string, unknown>;
    findings.push({
      conversation_id: conversationId,
      journey,
      reason: reason ?? "high-confidence match",
      title: title ?? "",
      started_at: String(row.started_at),
      message_count: Number(countRow.count ?? 0),
    });
  }

  if (options.apply && findings.length > 0) {
    if (!options.backup) {
      throw new Error("Database backup failed; refusing to repair conversations.");
    }
    const backupPath = options.backup();
    if (backupPath === null) {
      throw new Error("Database backup failed; refusing to repair conversations.");
    }
    for (const finding of findings) {
      db.prepare("UPDATE conversations SET journey = ? WHERE id = ?").run(
        finding.journey,
        finding.conversation_id,
      );
    }
  }

  return findings;
}

/** Python's `_print_journey_association_findings`. */
export function renderJourneyFindings(findings: JourneyFinding[], applied: boolean): string {
  const label = applied ? "Repaired" : "Repair candidates";
  const lines = [`${label}: ${findings.length}`];
  for (const finding of findings) {
    lines.push(
      `- ${finding.conversation_id} -> ${finding.journey} ` +
        `(${finding.reason}; ${finding.message_count} messages; ` +
        `${finding.started_at}; ${finding.title})`,
    );
  }
  return `${lines.join("\n")}\n`;
}
