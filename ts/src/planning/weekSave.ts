/**
 * `week save` — CV22.DS7.US11 plateau 1.
 *
 * Reads the pending file `week plan` wrote, creates one task per item with
 * `source="week_plan"`, unlinks the file, and prints Python's receipt.
 *
 * This leaf crosses NO provider seam. CR068 found it recorded in `routing.ts`
 * as "LLM-gated and reassigned to US5", which is false: `save_week_items`
 * reads the file and calls `add_task`, already ported in DS7.US2. It therefore
 * flips ungated, unlike its `week plan` sibling.
 *
 * Parity notes (pinned by `ts/test/goldens/week-save.golden.json`):
 *   - the time suffix is `" at HH:MM"` from `scheduled_at`, ELSE
 *     `" (time_hint)"`, else empty — `scheduled_at` wins when both are set;
 *   - an unparseable `scheduled_at` hits Python's `except ValueError` and
 *     yields NO suffix, while the row still stores the unparseable string;
 *   - the file is unlinked AFTER the loop, so a mid-loop failure leaves
 *     partial tasks and the file in place. Preserved deliberately;
 *   - `✅ {n} items saved:` is printed even when n is 0 (empty list), but the
 *     absent file prints `No pending items to save.` and writes nothing.
 */

import type { WritableDatabase } from "#db/database.ts";
import {
  defaultPendingPath,
  readPendingItems,
  removePendingFile,
  type WeekPendingItem,
} from "#planning/weekPending.ts";
import { createTask } from "#tasks/taskStore.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

export interface WeekSaveOptions {
  pendingPath?: string;
  print?: (line: string) => void;
}

export interface WeekSaveResult {
  savedCount: number;
  hadPendingFile: boolean;
}

/**
 * Python's `datetime.fromisoformat(scheduled_at).strftime("%H:%M")`, guarded by
 * `except ValueError`. Node's Date parser is more permissive than
 * `fromisoformat`, so this validates the shape explicitly rather than trusting
 * `new Date(...)` — otherwise TS would render a time where Python renders none.
 */
function timeSuffix(item: WeekPendingItem): string {
  if (item.scheduled_at) {
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(
      item.scheduled_at,
    );
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const y = Number(year);
      const mo = Number(month);
      const d = Number(day);
      const h = Number(hour);
      const mi = Number(minute);
      const sec = second === undefined ? 0 : Number(second);
      const valid =
        mo >= 1 &&
        mo <= 12 &&
        d >= 1 &&
        d <= new Date(Date.UTC(y, mo, 0)).getUTCDate() &&
        h <= 23 &&
        mi <= 59 &&
        sec <= 59;
      if (valid) return ` at ${hour}:${minute}`;
    }
    return "";
  }
  if (item.time_hint) return ` (${item.time_hint})`;
  return "";
}

export function runWeekSave(db: WritableDatabase, options: WeekSaveOptions = {}): WeekSaveResult {
  const pendingPath = options.pendingPath ?? defaultPendingPath();
  const print = options.print ?? ((line: string) => console.log(line));

  const pending = readPendingItems(pendingPath);
  if (pending === null) {
    print("No pending items to save.");
    return { savedCount: 0, hadPendingFile: false };
  }

  const created = pending.map((item) =>
    createTask(
      db,
      {
        title: item.title,
        journey: item.journey ?? undefined,
        dueDate: item.due_date ?? undefined,
        scheduledAt: item.scheduled_at ?? undefined,
        timeHint: item.time_hint ?? undefined,
        context: item.context ?? undefined,
        source: "week_plan",
      },
      newId(),
      nowIso(),
    ),
  );

  removePendingFile(pendingPath);

  print(`✅ ${created.length} items saved:`);
  created.forEach((task, index) => {
    const item = pending[index];
    const journey = task.journey ? ` [${task.journey}]` : "";
    print(
      `  ○ \`${task.id.slice(0, 8)}\` ${task.title} - ${task.due_date}${timeSuffix(item)}${journey}`,
    );
  });

  return { savedCount: created.length, hadPendingFile: true };
}
