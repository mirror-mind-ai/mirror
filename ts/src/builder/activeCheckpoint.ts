// CR067 with CR020 — the journey's active checkpoint, shown again without changing it.
//
// A checkpoint surface is printed once, by the command that advances the cursor, and the
// cursor keeps position only, never a checkpoint's evidence. So a lost surface cannot be
// replayed from it; the Navigator chose not to store emissions (option A). This surface
// shows where the cursor stands and where the full record lives: the story package's
// Plan and closure records, each marked present or missing. The package path is printed
// once, because record paths are longer than a card line.

import { cardText, cardWrapped } from "./card.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";
import { lifecycleStageOf } from "./lifecycleRefusal.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { NO_ITEM_PULLED_YET, pullExplicitly } from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

/** A story package's Plan and closure records, in lifecycle order. */
export const STORY_RECORDS = [
  "plan.md",
  "validation.md",
  "review.md",
  "coherence.md",
  "done.md",
] as const;

export interface StoryRecords {
  /** The package directory, as the Navigator sees it (project-relative when inside). */
  readonly folder: string;
  /** The names in `STORY_RECORDS` that exist on disk. */
  readonly present: ReadonlySet<string>;
}

export interface ActiveCheckpointView {
  readonly journey: string;
  readonly cursor: BuilderDeliveryCursor | null;
  /** `null` when no story package can be resolved for the cursor. */
  readonly records: StoryRecords | null;
}

function recordLines(records: StoryRecords | null): string[] {
  if (records === null) return [cardText("no story package found")];
  return [
    ...cardWrapped(records.folder),
    ...STORY_RECORDS.map((name) => cardText(`${records.present.has(name) ? "✓" : "○"} ${name}`)),
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
