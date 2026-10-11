/**
 * The `week plan` → `week save` pending-file contract (CV22.DS7.US11).
 *
 * Python writes proposed weekly items to a fixed path in the system temp
 * directory and `week save` consumes them. During the transition either engine
 * may write the file and the other may read it, so the shape here is the
 * contract, not an implementation detail — `ts/parity/week_pending_cross_engine.py`
 * proves both directions on a copy.
 *
 * Parity notes:
 *   - Python: `Path(tempfile.gettempdir()) / "mm_week_pending.json"`, resolved
 *     at import time. Node's `os.tmpdir()` resolves the same TMPDIR on macOS
 *     and Linux; the smoke sets TMPDIR explicitly so both engines agree.
 *   - Python writes `json.dumps(pending, ensure_ascii=False, indent=2)` with NO
 *     trailing newline. `writePendingItems` matches, because the cross-engine
 *     proof compares bytes.
 *   - Every field except `title` and `due_date` is optional and defaults to
 *     null, mirroring `ExtractedWeekItem`.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WeekPendingItem {
  title: string;
  due_date: string;
  scheduled_at: string | null;
  time_hint: string | null;
  journey: string | null;
  context: string | null;
}

/** Python's module-level `PENDING_FILE`, resolved the same way. */
export function defaultPendingPath(): string {
  return join(tmpdir(), "mm_week_pending.json");
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Read the pending file, or `null` when it does not exist.
 *
 * Python distinguishes "no file" (prints `No pending items to save.`) from "an
 * empty list" (prints `✅ 0 items saved:` and still unlinks), so the absent
 * case must stay distinguishable from the empty one.
 */
export function readPendingItems(path: string): WeekPendingItem[] | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((entry) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    return {
      title: typeof record.title === "string" ? record.title : "",
      due_date: typeof record.due_date === "string" ? record.due_date : "",
      scheduled_at: optionalString(record.scheduled_at),
      time_hint: optionalString(record.time_hint),
      journey: optionalString(record.journey),
      context: optionalString(record.context),
    };
  });
}

/** Write the pending file in Python's exact serialization (no trailing newline). */
export function writePendingItems(path: string, items: WeekPendingItem[]): void {
  writeFileSync(path, JSON.stringify(items, null, 2), "utf8");
}

/** Python's `PENDING_FILE.unlink(missing_ok=True)`. */
export function removePendingFile(path: string): void {
  rmSync(path, { force: true });
}
