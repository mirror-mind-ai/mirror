// Journey-path task parser parity port (CV22.DS7.US2).
//
// A faithful TypeScript port of Python `parse_journey_path_tasks` /
// `parse_done_tasks` (`src/memory/cli/tasks.py`). Both functions are pure over
// a markdown string — no database involved — and are used by both `tasks
// import` and `tasks sync`, so this is the **one shared** parser both callers
// use (the `kebab_slug` writer/locator lesson: do not let two callers grow two
// slightly-different copies of the same regex logic).
//
// Kept as one module with two exported functions, mirroring the Python file,
// because the two parsers share the same stage-tracking state machine and are
// always read together.

/** One parsed task payload, matching the Python dict shape exactly. */
export interface ParsedTask {
  title: string;
  stage: string | null;
  status: "todo" | "done";
  journey: string;
}

const STAGE_HEADER_RE = /^###\s+(?:Etapa\s+\d+:\s*)?(.+?)(?:\s*[✅🚧⏸])?$/u;
const CYCLE_HEADER_RE = /^\*\*(.+?)(?:\s*[✅🚧⏸])?\s*:?\*\*/u;
const UNCHECKED_BOX_RE = /^\s*-\s*\[\s*\]\s+(.+)/;
const CHECKED_BOX_RE = /^\s*-\s*\[x\]\s+(.+)/i;
const BOLD_RE = /\*\*(.+?)\*\*/g;

/** Strip Markdown bold markers and a single trailing period from a title. */
function cleanTitle(raw: string): string {
  const unbolded = raw.trim().replace(BOLD_RE, "$1");
  return unbolded.replace(/\.+$/, "");
}

/**
 * Extract pending tasks from unchecked journey-path checkboxes.
 *
 * Reproduces Python `parse_journey_path_tasks`, including the legacy
 * bold-cycle-header branch: a `**...✅**` line resets the current stage to
 * `null` (skipping tasks under it) while a `**...**` line without `✅` is a
 * no-op when a stage is already active. A `###` header carrying `✅` also
 * resets the stage to `null` so a completed stage's checkboxes are skipped.
 */
export function parseJourneyPathTasks(journeyPath: string, journey: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  let currentStage: string | null = null;

  for (const rawLine of journeyPath.split("\n")) {
    const line = rawLine.trim();

    const stageMatch = STAGE_HEADER_RE.exec(line);
    if (stageMatch) {
      if (rawLine.includes("✅")) {
        currentStage = null;
        continue;
      }
      currentStage = stageMatch[1].trim();
    }

    const cycleMatch = CYCLE_HEADER_RE.exec(line);
    if (cycleMatch && rawLine.includes("✅")) {
      currentStage = null;
      continue;
    }
    // else if cycleMatch && currentStage === null: no-op in Python (`pass`) —
    // nothing to do here either.

    const checkboxMatch = UNCHECKED_BOX_RE.exec(rawLine);
    if (checkboxMatch && currentStage !== null) {
      tasks.push({
        title: cleanTitle(checkboxMatch[1]),
        stage: currentStage,
        status: "todo",
        journey,
      });
    }
  }

  return tasks;
}

/**
 * Extract completed tasks from checked journey-path checkboxes.
 *
 * Reproduces Python `parse_done_tasks`: unlike the pending parser, a stage
 * header never resets `currentStage` to `null` on `✅` (there is no
 * "completed stage" skip for already-done tasks), and every checked box is
 * appended regardless of whether a stage has been seen yet.
 */
export function parseDoneTasks(journeyPath: string, journey: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  let currentStage: string | null = null;

  for (const rawLine of journeyPath.split("\n")) {
    const line = rawLine.trim();

    const stageMatch = STAGE_HEADER_RE.exec(line);
    if (stageMatch) {
      currentStage = stageMatch[1].trim();
    }

    const checkboxMatch = CHECKED_BOX_RE.exec(rawLine);
    if (checkboxMatch) {
      tasks.push({
        title: cleanTitle(checkboxMatch[1]),
        stage: currentStage,
        status: "done",
        journey,
      });
    }
  }

  return tasks;
}
