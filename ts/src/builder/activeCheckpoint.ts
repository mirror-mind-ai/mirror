// CR067 with CR020 — the journey's active checkpoint, shown again without changing it.
//
// A checkpoint surface is printed once, by the command that advances the cursor, and the
// cursor keeps position only, never a checkpoint's evidence. So a lost surface cannot be
// replayed from it; the Navigator chose not to store emissions (option A). This surface
// shows where the cursor stands and where the full record lives: the story package's
// Plan-stage artifacts, each with its state, and its closure records, each marked
// present or missing. The package path is printed once, because record paths are
// longer than a card line.
//
// CR112: `index.md`, `plan.md`, and `test-guide.md` are written as scaffolds and then
// authored, and present-or-missing said nothing about which. Each now carries its
// state -- missing, scaffold, partly authored, authored -- and, while not authored,
// the sections still to write, by their exact heading text. The glyph carries only
// done or not; the word carries the state. Closure records keep present or missing:
// their truth is the seal.

import { type ArtifactVerdict, describeArtifactState } from "./artifacts/scaffoldState.ts";
import { CARD_WIDTH, cardText, cardWrapped } from "./card.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";
import { lifecycleStageOf } from "./lifecycleRefusal.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { NO_ITEM_PULLED_YET, pullExplicitly } from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** The artifacts Plan and Expand scaffold, in the order Plan writes them. */
export const PLAN_STAGE_ARTIFACTS = ["index.md", "plan.md", "test-guide.md"] as const;

/** A story package's closure records, in lifecycle order. */
export const CLOSURE_RECORDS = ["validation.md", "review.md", "coherence.md", "done.md"] as const;

export interface StoryRecords {
  /** The package directory, as the Navigator sees it (project-relative when inside). */
  readonly folder: string;
  /** The Plan-stage artifacts, judged, in `PLAN_STAGE_ARTIFACTS` order. */
  readonly artifacts: readonly ArtifactVerdict[];
  /** The names in `CLOSURE_RECORDS` that exist on disk. */
  readonly present: ReadonlySet<string>;
}

export interface ActiveCheckpointView {
  readonly journey: string;
  readonly cursor: BuilderDeliveryCursor | null;
  /** `null` when no story package can be resolved for the cursor. */
  readonly records: StoryRecords | null;
}

const TO_AUTHOR = "to author: ";
const TO_AUTHOR_INDENT = "  ";

/**
 * The sections still to write, wrapped BETWEEN headings, never inside one, with every
 * row after the first starting under the first heading. A heading cut in two reads as
 * two items: the first render printed `Navigator` over `Validation` (CR112's handoff
 * review). The headings are the scaffold tables' own, all far shorter than a row.
 */
export function toAuthorLines(headers: readonly string[]): string[] {
  const width = CARD_WIDTH - TO_AUTHOR_INDENT.length - TO_AUTHOR.length;
  const rows: string[] = [];
  let row = "";
  headers.forEach((header, index) => {
    const item = index < headers.length - 1 ? `${header},` : header;
    const joined = row === "" ? item : `${row} ${item}`;
    if (row !== "" && joined.length > width) {
      rows.push(row);
      row = item;
    } else {
      row = joined;
    }
  });
  if (row !== "") rows.push(row);
  const hanging = " ".repeat(TO_AUTHOR.length);
  return rows.map((text, index) =>
    cardText(`${TO_AUTHOR_INDENT}${index === 0 ? TO_AUTHOR : hanging}${text}`),
  );
}

function artifactLines(verdict: ArtifactVerdict): string[] {
  const glyph = verdict.state === "authored" ? "✓" : "○";
  return [
    cardText(`${glyph} ${verdict.name} — ${describeArtifactState(verdict.state)}`),
    ...toAuthorLines(verdict.toAuthor),
  ];
}

function recordLines(records: StoryRecords | null): string[] {
  if (records === null) return [cardText("no story package found")];
  return [
    ...cardWrapped(records.folder),
    ...records.artifacts.flatMap(artifactLines),
    ...CLOSURE_RECORDS.map((name) => cardText(`${records.present.has(name) ? "✓" : "○"} ${name}`)),
  ];
}

function positionLines(view: ActiveCheckpointView): string[] {
  const cursor = view.cursor;
  if (cursor === null || !cursor.activeItem) {
    return [
      cardText("active item"),
      cardText(NO_ITEM_PULLED_YET),
      ...cardWrapped(pullExplicitly(view.journey)),
    ];
  }
  const item = cursor.activeItemTitle
    ? `${cursor.activeItem} — ${cursor.activeItemTitle}`
    : cursor.activeItem;
  return [
    cardText("active item"),
    ...cardWrapped(item),
    FRAME_BLANK,
    cardText("last event"),
    cardText(cursor.lastDeliveryEvent ?? "none"),
    FRAME_BLANK,
    cardText("pending confirmation"),
    cardText(cursor.pendingConfirmation ?? "none"),
    FRAME_BLANK,
    cardText("active checkpoint"),
    cardText(cursor.activeCheckpoint ?? "none"),
    FRAME_BLANK,
    cardText("records"),
    ...recordLines(view.records),
  ];
}

export function renderActiveCheckpoint(view: ActiveCheckpointView): string {
  const stage = view.cursor === null ? null : lifecycleStageOf(view.cursor);
  const body = [
    "Delivery",
    ...(stage === null ? [] : [renderLifecycleRibbon(stage)]),
    "",
    FRAME_TOP,
    cardText("       ■  ACTIVE CHECKPOINT"),
    FRAME_BLANK,
    ...positionLines(view),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("Read-only: the cursor and the project files were not changed."),
    FRAME_BOTTOM,
  ].join("\n");
  return wrapAriadSurface("active_checkpoint", `${body}\n`);
}
