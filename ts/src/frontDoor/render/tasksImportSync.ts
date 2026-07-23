// `tasks import|sync|sync-config` rendering — the port of
// `memory.cli.tasks_cmd`'s corresponding print statements.

import type {
  ImportJourneyResult,
  SyncConfigOutcome,
  SyncJourneyOutcome,
} from "../tasksImportSyncRoute.ts";

/**
 * Render `tasks import`. The total line's leading blank line reproduces
 * Python's `print(f"\n📋 Total: {total} tasks imported")` -- a literal `\n`
 * at the START of the f-string this time (contrast the tasks-list header,
 * whose blank line trails).
 */
export function renderTasksImport(results: readonly ImportJourneyResult[]): string {
  const lines: string[] = [];
  let total = 0;
  for (const r of results) {
    lines.push(`🧭 ${r.journey}: ${r.created.length} tasks imported`);
    for (const t of r.created) {
      lines.push(`  ○ \`${t.id}\` ${t.title}`);
    }
    total += r.created.length;
  }
  if (total === 0) {
    lines.push("No new tasks found in journey paths.");
  } else {
    lines.push("", `📋 Total: ${total} tasks imported`);
  }
  return lines.map((line) => `${line}\n`).join("");
}

/** Render the "No journey has sync configured." early-return. */
export function renderTasksSyncNoJourneysConfigured(): string {
  return "No journey has sync configured.\n";
}

/** Render one journey's `tasks sync` outcome. */
export function renderTasksSyncOutcome(outcome: SyncJourneyOutcome): string {
  if (outcome.kind === "no_sync_file") {
    return `⚠️  ${outcome.journey}: no sync file configured\n`;
  }
  if (outcome.kind === "error") {
    return `❌ ${outcome.journey}: ${outcome.message}\n`;
  }
  const r = outcome.result;
  return (
    `🔄 ${outcome.journey} (← ${outcome.syncFile})\n` +
    `   +${r.created} new | ✓${r.completed} completed | =${r.unchanged} unchanged\n`
  );
}

/** Render `tasks sync-config`. */
export function renderTasksSyncConfig(outcome: SyncConfigOutcome): string {
  const lines: string[] = [];
  if (!outcome.fileExisted) {
    lines.push(`⚠️  File not found: ${outcome.resolvedPath}`);
    lines.push("   Configuring it anyway; the file can be created later.");
  }
  lines.push(`🔗 ${outcome.journey} → ${outcome.resolvedPath}`);
  return lines.map((line) => `${line}\n`).join("");
}
