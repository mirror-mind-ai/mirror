// `week view` business logic parity port (CV22.DS7.US2 slice 3b).
//
// A faithful port of the non-printing logic inside `cmd_view`
// (`src/memory/cli/week.py`): computing the Monday-Sunday week window around
// "now", filtering out tasks scheduled in the past that aren't done, and
// grouping/sorting the rest by calendar day. Rendering (icons, columns,
// headers) is a separate concern in `frontDoor/render/week.ts`.
//
// `now` is always injected as a `Date` constructed via the LOCAL constructor
// form (`new Date(y, m, d, h, mi)`), never `Date.UTC`/an ISO `Z` string --
// Python's `datetime.now()` is naive local time, and JS's local constructor
// stores the same literal calendar/clock fields with no timezone conversion,
// so the two agree on any machine regardless of its system timezone. The same
// applies to parsing `scheduled_at` ("YYYY-MM-DDTHH:MM", no offset): per the
// JS Date spec, a date-TIME string without a designator parses as local time
// (unlike a bare date string, which parses as UTC midnight -- a real
// asymmetry, avoided here because `scheduled_at` always carries the `T`).

import type { Task } from "./taskStore.ts";

export interface WeekRange {
  /** ISO date (YYYY-MM-DD), Monday of the week containing `now`. */
  start: string;
  /** ISO date (YYYY-MM-DD), the Sunday six days after `start`. */
  end: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format y/m(1-based)/d as an ISO date string. */
export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** Add `days` (may be negative) to an ISO date string, DST-safe (calendar-only, no time component). */
export function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  return formatIsoDate(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}

/** The local calendar date (YYYY-MM-DD) of a `Date`, ignoring its time-of-day. */
export function toIsoDate(date: Date): string {
  return formatIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * The Monday-Sunday week containing `now`, mirroring Python's
 * `start = today - timedelta(days=today.weekday())`. JS `getDay()` is
 * Sunday=0..Saturday=6; Python's `weekday()` is Monday=0..Sunday=6, so the
 * conversion is `(getDay() + 6) % 7`.
 */
export function computeWeekRange(now: Date): WeekRange {
  const pythonWeekday = (now.getDay() + 6) % 7;
  const todayIso = toIsoDate(now);
  const start = addIsoDays(todayIso, -pythonWeekday);
  const end = addIsoDays(start, 6);
  return { start, end };
}

/**
 * Drop tasks that are scheduled in the past and not done, matching Python's
 * `if t.scheduled_at and t.status != "done": ... if sched < now: continue`.
 * An unparseable `scheduled_at` is NOT excluded (Python's `except ValueError:
 * pass` falls through to keep the task) -- reproduced here by only excluding
 * on a successfully-parsed, strictly-earlier instant.
 */
export function filterVisibleTasks(tasks: readonly Task[], now: Date): Task[] {
  const visible: Task[] = [];
  for (const t of tasks) {
    if (t.scheduled_at && t.status !== "done") {
      const schedMs = new Date(t.scheduled_at).getTime();
      if (!Number.isNaN(schedMs) && schedMs < now.getTime()) {
        continue;
      }
    }
    visible.push(t);
  }
  return visible;
}

/**
 * Sort key mirroring Python's `(scheduled_at or "99", time_hint or "zz",
 * title)` tuple: a scheduled task sorts before any unscheduled one (any real
 * ISO datetime string is lexically less than the "99" sentinel), then by
 * time-hint, then alphabetically by title.
 */
function compareByDaySortKey(a: Task, b: Task): number {
  const aKey = [a.scheduled_at ?? "99", a.time_hint ?? "zz", a.title];
  const bKey = [b.scheduled_at ?? "99", b.time_hint ?? "zz", b.title];
  for (let i = 0; i < aKey.length; i += 1) {
    if (aKey[i] !== bKey[i]) return aKey[i] < bKey[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Group tasks by calendar day (`due_date`, falling back to `scheduled_at`'s
 * date portion), sorting each day's bucket by the (scheduled_at, time_hint,
 * title) key. A task with neither `due_date` nor `scheduled_at` has no day
 * and is dropped -- matching Python's `if day:` guard (in practice this never
 * happens for a task `getTasksForWeek` actually returned, since its WHERE
 * clause already requires one of the two to be in range).
 */
export function groupTasksByDay(tasks: readonly Task[]): Map<string, Task[]> {
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    const day = t.due_date || (t.scheduled_at ? t.scheduled_at.slice(0, 10) : null);
    if (!day) continue;
    const bucket = byDay.get(day);
    if (bucket) bucket.push(t);
    else byDay.set(day, [t]);
  }
  for (const bucket of byDay.values()) {
    bucket.sort(compareByDaySortKey);
  }
  return byDay;
}
