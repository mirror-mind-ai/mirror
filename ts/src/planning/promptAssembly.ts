/**
 * Prompt assembly for the CV22.DS7.US11 content & planning tail.
 *
 * Each function reproduces, byte for byte, the string Python sends for its
 * role. US10 established why this matters: replay resolves a fixture by role
 * alone, so a TS prompt that drifted from the oracle would replay happily and
 * the divergence would only surface at the DS8 live cutover, against real
 * users. `ts/test/goldens/prompt-assembly.golden.json` pins a SHA-256 of each
 * assembled prompt, generated from the Python source.
 *
 * Temperatures live here too, unused under replay, because DS8's live mode
 * must inherit them rather than rediscover them: journal 0.3, week plan 0.2,
 * descriptor 0.2.
 */

import {
  DESCRIPTOR_PROMPT,
  JOURNAL_CLASSIFICATION_PROMPT,
  WEEK_PLAN_PROMPT,
} from "#extraction/prompts.ts";
import { pyFormat, sliceCodePoints } from "#util/pythonText.ts";

/** Python's `temperature=` per role, carried for the DS8 live cutover. */
export const JOURNAL_TEMPERATURE = 0.3;
export const WEEK_PLAN_TEMPERATURE = 0.2;
export const DESCRIPTOR_TEMPERATURE = 0.2;

/** `JOURNAL_CLASSIFICATION_PROMPT + content` (`classify_journal_entry`). */
export function buildJournalClassificationPrompt(content: string): string {
  return JOURNAL_CLASSIFICATION_PROMPT + content;
}

/** `DESCRIPTOR_PROMPT.format(layer=, key=) + content` (`generate_descriptor`). */
export function buildDescriptorPrompt(content: string, layer: string, key: string): string {
  return pyFormat(DESCRIPTOR_PROMPT, { layer, key }) + content;
}

export interface WeekPlanJourneyContext {
  /** The journey slug. */
  slug: string;
  /**
   * The journey's identity content, ALREADY truncated to 200 code points by
   * `TaskService.ingest_week_plan`. This function truncates again to 100, as
   * `extract_week_plan` does -- the description passes through two different
   * caps and only the second one reaches the model.
   */
  description: string;
}

/**
 * Python's `journeys_text`: one `- **slug**: description[:100]` line per
 * journey, or the literal `(no active journeys)` when the list is empty.
 *
 * The slice is by CODE POINT (`sliceCodePoints`), not UTF-16 unit -- the divergence
 * class US10 found in `generateTitle`. A journey description with an emoji or
 * a non-BMP character before position 100 would otherwise cut differently in
 * the two engines and silently change the prompt bytes.
 */
export function buildWeekPlanJourneysText(journeys: readonly WeekPlanJourneyContext[]): string {
  if (journeys.length === 0) return "(no active journeys)";
  return journeys.map((j) => `- **${j.slug}**: ${sliceCodePoints(j.description, 100)}`).join("\n");
}

export interface WeekPlanClock {
  /** `now.strftime("%Y-%m-%d")`. */
  today: string;
  /** `["Monday", ... "Sunday"][now.weekday()]` — Monday-first, unlike JS. */
  weekday: string;
}

const PY_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Python's reference date, from an injected clock.
 *
 * `datetime.now()` is LOCAL time and `weekday()` is Monday-indexed, while
 * JavaScript's `getDay()` is Sunday-indexed. Both are reproduced here rather
 * than approximated, and the clock is injected so the golden can freeze it --
 * the prompt embeds the date, so an assembly that read the real clock would
 * fail the digest on any day but the one the corpus was generated.
 */
export function weekPlanClock(now: Date): WeekPlanClock {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const pythonWeekday = (now.getDay() + 6) % 7;
  return { today: `${year}-${month}-${day}`, weekday: PY_WEEKDAYS[pythonWeekday] };
}

/** `WEEK_PLAN_PROMPT.format(today=, weekday=, journeys=) + text` (`extract_week_plan`). */
export function buildWeekPlanPrompt(
  text: string,
  journeys: readonly WeekPlanJourneyContext[],
  clock: WeekPlanClock,
): string {
  return (
    pyFormat(WEEK_PLAN_PROMPT, {
      today: clock.today,
      weekday: clock.weekday,
      journeys: buildWeekPlanJourneysText(journeys),
    }) + text
  );
}
