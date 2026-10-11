// CR067 with CR020 — a refused lifecycle request, rendered where the cursor stands.
//
// Every refusal of the story closure commands used to render the Implement guard, so a
// refused Coherence placed the item five stages back and claimed implementation was
// blocked. This surface takes the stage from the cursor, gives the refusal's own reason,
// prints the literal command that shows the active checkpoint, and closes on what did
// not change. `IMPLEMENTATION_GUARD` stays with `check-implementation`, the one
// condition it was written for.

import { cardText, cardWrapped } from "./card.ts";
import { lifecycleStageOf } from "./cursorPosition.ts";
import type { BuilderDeliveryCursor } from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { NO_ITEM_PULLED_YET, showCheckpoint } from "./scopePhrases.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

const FRAME_TOP = "╭────────────────────────────────────────────────────────╮";
const FRAME_BOTTOM = "╰────────────────────────────────────────────────────────╯";
const FRAME_BLANK = "│                                                        │";

export interface CheckpointRefusal {
  /** The command that was refused, as typed: `validate-item`, `continue-lifecycle`. */
  readonly request: string;
  readonly reason: string;
  readonly journey: string;
  /** The cursor as it stands; a refusal never changed it. */
  readonly cursor: BuilderDeliveryCursor | null;
}

/** The cursor on one line: the item, its last event, and what it waits on. */
function cursorLine(cursor: BuilderDeliveryCursor | null): string {
  if (cursor === null || !cursor.activeItem) return NO_ITEM_PULLED_YET;
  const event = cursor.lastDeliveryEvent ?? "none";
  const pending = cursor.pendingConfirmation ?? "none";
  return `${cursor.activeItem} · last event ${event} · pending ${pending}`;
}

export function renderCheckpointRefused(refusal: CheckpointRefusal): string {
  const stage = refusal.cursor === null ? null : lifecycleStageOf(refusal.cursor);
  const body = [
    "Delivery",
    ...(stage === null
      ? []
      : [renderLifecycleRibbon(stage, refusal.cursor?.activeItemLevel ?? null)]),
    "",
    FRAME_TOP,
    cardText("       ■  REQUEST REFUSED"),
    FRAME_BLANK,
    cardText("request"),
    cardText(refusal.request),
    FRAME_BLANK,
    cardText("reason"),
    ...cardWrapped(refusal.reason),
    FRAME_BLANK,
    cardText("cursor"),
    ...cardWrapped(cursorLine(refusal.cursor)),
    FRAME_BLANK,
    cardText("to see the checkpoint"),
    ...cardWrapped(showCheckpoint(refusal.journey)),
    FRAME_BLANK,
    cardText("boundary"),
    ...cardWrapped("Refused before any change: the cursor and the project files are as they were."),
    FRAME_BOTTOM,
  ].join("\n");
  return wrapAriadSurface("checkpoint_refused", `${body}\n`);
}
