/**
 * `week plan` — CV22.DS7.US11 plateau 4.
 *
 * Extracts temporal items from free text through the model, warns about
 * near-duplicates already in `tasks`, writes the pending file `week save`
 * consumes, and prints a JSON report.
 *
 * Graded by `ts/test/goldens/week-plan.golden.json`. Three Python behaviours
 * the corpus pins, each of which a tidier implementation would get wrong:
 *
 *   - **The similarity query is `LIKE '%fragment%'`** — a CONTAINS match over
 *     the first 20 code points of the title, with NO wildcard escaping and the
 *     journey argument NOT passed. A `%` or `_` in a title is therefore a live
 *     wildcard that over-matches. The US11 Plan review corrected an earlier
 *     description of this as a prefix query; the SQL is ported as written.
 *   - **A malformed item is skipped, not fatal.** Python wraps
 *     `ExtractedWeekItem(**item_data)` in `try/except Exception: continue`, so
 *     one bad entry does not lose its siblings.
 *   - **The report and the pending file are different shapes.** The report may
 *     carry a `warning` key; the pending file never does, and its bytes are
 *     `json.dumps(..., ensure_ascii=False, indent=2)` with no trailing newline.
 */

import type { Database, WritableDatabase } from "#db/database.ts";
import {
  buildWeekPlanPrompt,
  type WeekPlanClock,
  type WeekPlanJourneyContext,
} from "#planning/promptAssembly.ts";
import { type WeekPendingItem, writePendingItems } from "#planning/weekPending.ts";
import { sliceCodePoints } from "#util/pythonText.ts";

export interface ExtractedWeekItem {
  title: string;
  due_date: string;
  scheduled_at: string | null;
  time_hint: string | null;
  journey: string | null;
  context: string | null;
}

/** Python's `ExtractedWeekItem(**item_data)` inside `try/except: continue`. */
export function parseExtractedWeekItems(parsed: unknown): ExtractedWeekItem[] {
  if (!Array.isArray(parsed)) return [];
  const items: ExtractedWeekItem[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    // `title` and `due_date` have no defaults on the dataclass, so their
    // absence raises and the item is skipped. Every other field defaults to
    // None. An UNKNOWN key also raises (unexpected keyword argument).
    const known = new Set(["title", "due_date", "scheduled_at", "time_hint", "journey", "context"]);
    if (Object.keys(record).some((key) => !known.has(key))) continue;
    if (typeof record.title !== "string" || typeof record.due_date !== "string") continue;
    // `ExtractedWeekItem` is a pydantic model with `extra="forbid"` and no
    // str coercion, so a PRESENT optional field of the wrong type raises and
    // the whole item is skipped -- it does not fall back to null.
    const optionalKeys = ["scheduled_at", "time_hint", "journey", "context"] as const;
    const badOptional = optionalKeys.some(
      (key) =>
        key in record &&
        record[key] !== null &&
        record[key] !== undefined &&
        typeof record[key] !== "string",
    );
    if (badOptional) continue;
    const optional = (value: unknown): string | null => (typeof value === "string" ? value : null);
    items.push({
      title: record.title,
      due_date: record.due_date,
      scheduled_at: optional(record.scheduled_at),
      time_hint: optional(record.time_hint),
      journey: optional(record.journey),
      context: optional(record.context),
    });
  }
  return items;
}

export interface ExistingTask {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
}

/**
 * Python `find_tasks_by_title(title_fragment)` — `LIKE '%fragment%'`, ordered
 * by `created_at DESC`, journey filter unused by this caller.
 *
 * The fragment is NOT escaped, so `%` and `_` inside a title behave as SQL
 * wildcards. Reproduced exactly: this is the query the oracle runs, and the
 * golden pins its over-matching.
 */
export function findTasksByTitle(db: Database, fragment: string): ExistingTask[] {
  return db
    .prepare(
      "SELECT id, title, due_date, status FROM tasks WHERE title LIKE ? ORDER BY created_at DESC",
    )
    .all(`%${fragment}%`) as unknown as ExistingTask[];
}

/** Python: same `due_date`, status not `done`. The FIRST match names the warning. */
export function similarExistingTasks(db: Database, item: ExtractedWeekItem): ExistingTask[] {
  const fragment = sliceCodePoints(item.title, 20);
  return findTasksByTitle(db, fragment).filter(
    (task) => task.due_date === item.due_date && task.status !== "done",
  );
}

export interface WeekPlanDeps {
  /** Returns the model's raw response body for the assembled prompt. */
  complete: (prompt: string) => string;
  /** Python's `_parse_json_response`. */
  parseJson: (raw: string) => unknown;
  clock: WeekPlanClock;
  pendingPath: string;
  print?: (text: string) => void;
}

/** Journey context exactly as `ingest_week_plan` builds it: `content[:200]`. */
export function buildJourneyContext(db: Database): WeekPlanJourneyContext[] {
  const rows = db
    .prepare("SELECT key, content FROM identity WHERE layer = 'journey' ORDER BY rowid")
    .all() as unknown as { key: string; content: string | null }[];
  return rows.map((row) => ({
    slug: row.key,
    description: row.content ? sliceCodePoints(row.content, 200) : "",
  }));
}

export interface WeekPlanResult {
  itemCount: number;
  wrotePendingFile: boolean;
}

export function runWeekPlan(
  db: WritableDatabase,
  text: string,
  deps: WeekPlanDeps,
): WeekPlanResult {
  const print = deps.print ?? ((value: string) => process.stdout.write(value));

  const journeys = buildJourneyContext(db);
  const prompt = buildWeekPlanPrompt(text, journeys, deps.clock);
  const items = parseExtractedWeekItems(deps.parseJson(deps.complete(prompt)));

  if (items.length === 0) {
    print("No temporal items found in the text.\n");
    return { itemCount: 0, wrotePendingFile: false };
  }

  const pending: WeekPendingItem[] = [];
  const reportItems: Record<string, unknown>[] = [];

  for (const item of items) {
    const payload: WeekPendingItem = {
      title: item.title,
      due_date: item.due_date,
      scheduled_at: item.scheduled_at,
      time_hint: item.time_hint,
      journey: item.journey,
      context: item.context,
    };
    pending.push(payload);

    const reportItem: Record<string, unknown> = { ...payload };
    const similar = similarExistingTasks(db, item);
    if (similar.length > 0) {
      reportItem.warning = `Similar item already exists: '${similar[0].title}'`;
    }
    reportItems.push(reportItem);
  }

  writePendingItems(deps.pendingPath, pending);
  // Python: `json.dumps(output, ensure_ascii=False, indent=2)` -- NO
  // sort_keys, so insertion order is the contract, and non-ASCII stays raw.
  // `pythonJsonDumpsIndented` sorts keys and escapes non-ASCII, so it is the
  // wrong helper here despite the name.
  print(`${JSON.stringify({ items: reportItems, pending_file: deps.pendingPath }, null, 2)}\n`);

  return { itemCount: items.length, wrotePendingFile: true };
}
