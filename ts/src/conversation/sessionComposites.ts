// Session lifecycle composites (CV22.DS7.US10 slice D).
//
// Ports `session_start`, `session_start_fast`, `session_maintenance`,
// `close_stale_orphans`, `retitle_pending_conversations`, and
// `_reset_session_orientation` from `src/memory/cli/conversation_logger.py`.
//
// These are the composites Pi runs at session boundaries, and their REPORT is
// the user-visible surface: Pi prints it. Parity is therefore string-exact in
// grammar, labels, order, and the warning tails — everything except the
// elapsed seconds, which are wall-clock and cannot be byte-stable across runs
// or cores.
//
// The clock is injected rather than read (Navigator decision 2, 2026-09-03):
// tests pin durations, and cross-core comparison normalizes the timing token
// only after validating its exact grammar, so a re-worded or re-punctuated
// report still fails. Freezing real timings would have faked the evidence
// instead of isolating it.

import {
  countCarriedOverConversations,
  countConversationsWithExtractionStatus,
  countQuarantinedConversations,
  extractPending,
} from "#conversation/extractionDriver.ts";
import { setMute } from "#conversation/logger.ts";
import type { WritableDatabase } from "#db/database.ts";
import { GLOBAL_STICKY_DEFAULTS_SESSION_ID } from "#mirror/runtimeSession.ts";
import { deactivateOperatingMode } from "#mode/operatingMode.ts";
import { nowIso } from "#util/pyGenerators.ts";

/** Python's `close_stale_orphans` default. */
export const STALE_ORPHAN_THRESHOLD_MINUTES = 30;
/** Python's `retitle_pending_conversations` default. */
export const RETITLE_LIMIT = 5;

export interface MaintenanceDeps {
  /** Close one conversation through the full close tail. Throwing is isolated. */
  closeConversation: (db: WritableDatabase, conversationId: string) => Promise<void> | void;
  /** Improve one ended conversation's title; returns true when it changed. */
  retitleConversation: (db: WritableDatabase, conversationId: string) => Promise<boolean> | boolean;
  /** The DS5 orchestration behind replay, as the driver already injects it. */
  runExtraction: (db: WritableDatabase, conversationId: string) => void;
  /** Slice E supplies the real implementation; maintenance only needs a count. */
  backfillPiSessions?: (db: WritableDatabase) => Promise<number> | number;
  /** Monotonic seconds, injected so report timings are pinnable. */
  monotonic?: () => number;
  now?: () => string;
}

/**
 * Python's `_reset_session_orientation`: a new runtime session starts from
 * intention, not stale mode or journey context.
 */
export function resetSessionOrientation(db: WritableDatabase, now: () => string = nowIso): void {
  deactivateOperatingMode(db, null, now());
  db.prepare("DELETE FROM runtime_sessions WHERE session_id = ?").run(
    GLOBAL_STICKY_DEFAULTS_SESSION_ID,
  );
}

/** Conversation ids bound to an active runtime session. */
function activeConversationIds(db: WritableDatabase): Set<string> {
  const rows = db
    .prepare(
      "SELECT conversation_id FROM runtime_sessions WHERE active = 1 AND conversation_id IS NOT NULL",
    )
    .all() as Record<string, unknown>[];
  return new Set(rows.map((row) => String(row.conversation_id)));
}

/** Python's `get_open_conversations_idle_since`. */
function openConversationsIdleSince(db: WritableDatabase, threshold: string): string[] {
  const rows = db
    .prepare(
      `SELECT c.id FROM conversations c
        WHERE c.ended_at IS NULL
          AND (
            (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id) < ?
            OR NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
          )`,
    )
    .all(threshold) as Record<string, unknown>[];
  return rows.map((row) => String(row.id));
}

/**
 * Python's `close_stale_orphans`: end open conversations idle longer than the
 * threshold, skipping any still bound to an active runtime session.
 *
 * The count increments even when closing raises: `ended_at` is written before
 * the tail, so the orphan IS closed and an extraction failure must not stop the
 * loop or under-report the work. That asymmetry is deliberate in Python.
 *
 * KNOWN UNBOUNDED SPEND (registered for Debt Review): AI-05 caps extraction per
 * maintenance run, but this loop has no cap on orphan count and each orphan
 * runs the full close tail. Ported as-is; naming it here so DS8 prices it.
 */
export async function closeStaleOrphans(
  db: WritableDatabase,
  deps: Pick<MaintenanceDeps, "closeConversation" | "now"> & { thresholdMinutes?: number },
): Promise<number> {
  const thresholdMinutes = deps.thresholdMinutes ?? STALE_ORPHAN_THRESHOLD_MINUTES;
  const now = deps.now ?? nowIso;
  const threshold = new Date(Date.parse(now()) - thresholdMinutes * 60_000).toISOString();

  const active = activeConversationIds(db);
  let count = 0;
  for (const conversationId of openConversationsIdleSince(db, threshold)) {
    if (active.has(conversationId)) continue;
    try {
      await deps.closeConversation(db, conversationId);
    } catch {
      // The orphan is closed regardless; a failed tail must not stop the loop.
    }
    count += 1;
  }
  return count;
}

/**
 * Python's `retitle_pending_conversations`: opportunistically improve a small
 * batch of ended conversation titles at startup.
 */
export async function retitlePendingConversations(
  db: WritableDatabase,
  deps: Pick<MaintenanceDeps, "retitleConversation"> & { limit?: number },
): Promise<number> {
  const limit = deps.limit ?? RETITLE_LIMIT;
  if (limit <= 0) return 0;

  let candidates: string[];
  try {
    const scanLimit = Math.max(limit * 10, 50);
    const rows = db
      .prepare(
        `SELECT c.id
           FROM conversations c
          WHERE c.ended_at IS NOT NULL
            AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user')
            AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'assistant')
          ORDER BY c.ended_at DESC, c.started_at DESC
          LIMIT ?`,
      )
      .all(scanLimit) as Record<string, unknown>[];
    candidates = rows.map((row) => String(row.id));
  } catch {
    return 0;
  }

  let changed = 0;
  for (const conversationId of candidates) {
    if (changed >= limit) break;
    try {
      if (await deps.retitleConversation(db, conversationId)) changed += 1;
    } catch {
      // Python swallows per-conversation failures and continues the batch.
    }
  }
  return changed;
}

interface TimedStep {
  label: string;
  count: number;
  elapsed: number;
}

async function timedStep(
  label: string,
  monotonic: () => number,
  run: () => Promise<number> | number,
): Promise<TimedStep> {
  const started = monotonic();
  const count = await run();
  return { label, count, elapsed: monotonic() - started };
}

/** Python's `%.1f` seconds rendering inside the report. */
function formatElapsed(elapsed: number): string {
  return elapsed.toFixed(1);
}

/**
 * Python's `session_maintenance`: four timed steps in a fixed order, then the
 * warning tails. The step order is behavior, not presentation — closing stale
 * orphans first is what makes their conversations eligible for the extraction
 * step in the same run.
 */
export async function sessionMaintenance(
  db: WritableDatabase,
  deps: MaintenanceDeps,
): Promise<string> {
  const monotonic = deps.monotonic ?? (() => performance.now() / 1000);

  const steps: TimedStep[] = [
    await timedStep("Closed stale conversations", monotonic, () =>
      closeStaleOrphans(db, {
        closeConversation: deps.closeConversation,
        now: deps.now,
        thresholdMinutes: STALE_ORPHAN_THRESHOLD_MINUTES,
      }),
    ),
    await timedStep("Backfilled Pi sessions", monotonic, () => deps.backfillPiSessions?.(db) ?? 0),
    await timedStep("Retitled pending conversations", monotonic, () =>
      retitlePendingConversations(db, { retitleConversation: deps.retitleConversation }),
    ),
    await timedStep("Extracted pending conversations", monotonic, () =>
      extractPending(db, { runExtraction: deps.runExtraction }),
    ),
  ];

  const parts = ["Conversation maintenance complete."];
  for (const step of steps) {
    parts.push(`${step.label}: ${step.count} (${formatElapsed(step.elapsed)}s)`);
  }

  const quarantined = countQuarantinedConversations(db);
  if (quarantined) {
    parts.push(`⚠ ${quarantined} conversation(s) quarantined after repeated extraction failure`);
  }
  const parseFailed = countConversationsWithExtractionStatus(db, "parse_failed");
  if (parseFailed) {
    parts.push(`⚠ ${parseFailed} conversation(s) with unreadable model output (parse_failed)`);
  }
  const carriedOver = countCarriedOverConversations(db);
  if (carriedOver) {
    parts.push(
      `${carriedOver} conversation(s) carried over to the next run ` +
        "(maintenance extraction budget)",
    );
  }
  return parts.join("\n");
}

/** Python's `session_start_fast`: unmute and reorient, defer the expensive work. */
export function sessionStartFast(db: WritableDatabase, mirrorHome: string, now = nowIso): string {
  setMute(false, mirrorHome);
  resetSessionOrientation(db, now);
  return "Conversation logging ACTIVE. Maintenance deferred.";
}

/** Python's `session_start`: unmute, reorient, then run full maintenance. */
export async function sessionStart(
  db: WritableDatabase,
  mirrorHome: string,
  deps: MaintenanceDeps,
): Promise<string> {
  setMute(false, mirrorHome);
  resetSessionOrientation(db, deps.now ?? nowIso);
  const maintenance = await sessionMaintenance(db, deps);
  return ["Conversation logging ACTIVE.", maintenance].join("\n");
}
