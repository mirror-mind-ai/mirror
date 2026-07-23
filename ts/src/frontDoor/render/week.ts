// `week view` rendering — the port of `memory.cli.week.cmd_view`'s print
// statements. Business logic (week range, visibility filter, day grouping)
// lives in `tasks/weekView.ts`; this module owns formatting: icons, the
// fixed-width title/time columns, the overdue marker, and the header's
// blank-line quirk (same `print(f"...\n")` + `print()` pattern as
// `render/tasks.ts`'s list header).

import type { Task } from "../../tasks/taskStore.ts";
import {
  addIsoDays,
  computeWeekRange,
  filterVisibleTasks,
  groupTasksByDay,
  toIsoDate,
} from "../../tasks/weekView.ts";

const WEEKDAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `strftime('%d/%m')` for an ISO date string. */
function formatDdMm(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

/** `strftime('%d/%m/%Y')` for an ISO date string. */
function formatDdMmYyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Format one task line: `  {icon} {title:<40}{time_col:>20}{journey}{overdue}`.
 * `scheduled_at` wins the icon regardless of status (even a `done` task with a
 * scheduled time still shows the pin) -- matches Python's ternary chain
 * ordering exactly, not a "status first" reading.
 */
function formatTaskLine(t: Task, todayIso: string): string {
  const icon = t.scheduled_at
    ? "📌"
    : t.status === "done"
      ? "✅"
      : t.status === "doing"
        ? "◐"
        : t.status === "blocked"
          ? "✖"
          : "🔧";

  let timeStr = "";
  if (t.scheduled_at) {
    const scheduled = new Date(t.scheduled_at);
    if (!Number.isNaN(scheduled.getTime())) {
      timeStr = `${pad2(scheduled.getHours())}:${pad2(scheduled.getMinutes())}`;
    }
    // An unparseable scheduled_at leaves timeStr "", matching Python's
    // `except ValueError: time_str = ""`.
  } else if (t.time_hint) {
    timeStr = t.time_hint;
  }

  const overdue =
    !t.scheduled_at && t.due_date && t.due_date < todayIso && t.status !== "done"
      ? " ⚠ overdue"
      : "";
  const journey = t.journey ? `  [${t.journey}]` : "";
  const timeCol = timeStr ? timeStr.padStart(20, " ") : " ".repeat(20);
  return `  ${icon} ${t.title.padEnd(40, " ")}${timeCol}${journey}${overdue}`;
}

/**
 * Render `week view`. `tasks` is the RAW result of `getTasksForWeek` for the
 * range `computeWeekRange(now)` produced -- the two-stage empty check mirrors
 * Python exactly: "No items" tests the raw fetch, "No pending items" tests
 * the post-visibility-filter list, and they print different messages.
 */
export function renderWeekView(tasks: readonly Task[], now: Date): string {
  if (tasks.length === 0) return "No items in the current week.\n";

  const visible = filterVisibleTasks(tasks, now);
  if (visible.length === 0) return "No pending items in the current week.\n";

  const range = computeWeekRange(now);
  const byDay = groupTasksByDay(visible);
  const todayIso = toIsoDate(now);

  const lines: string[] = [`📅 Week ${formatDdMm(range.start)}-${formatDdMmYyyy(range.end)}`, ""];

  for (let offset = 0; offset < 7; offset += 1) {
    const dayIso = addIsoDays(range.start, offset);
    const dayTasks = byDay.get(dayIso);
    if (!dayTasks) continue;

    const marker = dayIso === todayIso ? " (today)" : "";
    lines.push(`━━ ${WEEKDAYS_FULL[offset]} ${formatDdMm(dayIso)}${marker} ━━`);
    for (const t of dayTasks) {
      lines.push(formatTaskLine(t, todayIso));
    }
    lines.push("");
  }

  return lines.map((line) => `${line}\n`).join("");
}
