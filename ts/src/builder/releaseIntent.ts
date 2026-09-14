// CV22.DS7.US8 plateau 6 — Delivery Story release intent.
//
// Port of `src/memory/builder/release_intent.py`.
//
// Release intent is the only Builder state that belongs to an ANCESTOR rather than
// to the active item: it is stored as a pair — the intent and the Delivery Story
// code it was recorded against — so moving to a story under a different Delivery
// Story makes the inspect face report `not_recorded` instead of inheriting the
// previous decision. Two cursor fields, one meaning.
//
// The boundary itself is derived from the active item's CODE by
// `deliveryStoryCodeForItem` (already ported for the cursor), so a story whose code
// carries no `DS<n>` segment has nothing to record against and is refused.
//
// `not_recorded` is a RENDERED value, never a stored one: the cursor holds `null`,
// and the surface distinguishes "nothing was decided" from the explicit decision
// `none`. Collapsing the two would erase the difference between an open question
// and an answered one, which is the whole point of the `undecided` value existing
// beside them.

import type { Database, WritableDatabase } from "#db/database.ts";
import { pyStrip } from "#util/pythonText.ts";
import { cardText, cardWrapped } from "./card.ts";
import { deliveryStoryCodeForItem } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `RELEASE_INTENTS`. */
export const RELEASE_INTENTS = ["planned", "none", "undecided"] as const;

export interface ReleaseIntentReport {
  readonly journey: string;
  readonly method: string;
  readonly deliveryStory: string;
  readonly intent: string;
  readonly cursor: BuilderDeliveryCursor;
  /** False when the pair already said this, which the surface renders as `inspected`. */
  readonly changed: boolean;
}

/** Python `_active_delivery_story`: cursor, method match, then the DS ancestor. */
function activeDeliveryStory(
  db: Database,
  journey: string,
  method: string,
): { cursor: BuilderDeliveryCursor; deliveryStory: string } {
  const cursor = getDeliveryCursor(db, journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before release intent");
  }
  if (cursor.method !== method) {
    throw new Error("active Builder method does not match release intent method");
  }
  const deliveryStory = deliveryStoryCodeForItem(cursor.activeItem);
  if (deliveryStory === null) {
    throw new Error("active Delivery Story boundary is required for release intent");
  }
  return { cursor, deliveryStory };
}

/** Python `set_release_intent`. */
export function setReleaseIntent(
  db: WritableDatabase,
  options: { journey: string; method: string; intent: string },
  deps: CursorWriteDeps,
): ReleaseIntentReport {
  const normalized = pyStrip(options.intent).toLowerCase();
  if (!(RELEASE_INTENTS as readonly string[]).includes(normalized)) {
    throw new Error("release intent must be planned, none, or undecided");
  }
  // Value first, then the cursor: an unknown intent is refused even with no cursor.
  const { cursor, deliveryStory } = activeDeliveryStory(db, options.journey, options.method);
  const changed = !(
    cursor.releaseIntentDeliveryStory === deliveryStory && cursor.releaseIntent === normalized
  );
  const updated = setDeliveryCursor(
    db,
    {
      journey: cursor.journey,
      method: cursor.method,
      activeItem: cursor.activeItem,
      activeItemTitle: cursor.activeItemTitle,
      activeItemLevel: cursor.activeItemLevel,
      activeCheckpoint: cursor.activeCheckpoint,
      pendingConfirmation: cursor.pendingConfirmation,
      lastDeliveryEvent: cursor.lastDeliveryEvent,
      cadenceProfile: cursor.cadenceProfile,
      cadenceLimits: cursor.cadenceLimits,
      granularityDecision: cursor.granularityDecision,
      navigatorFlowUnit: cursor.navigatorFlowUnit,
      childWorkItems: cursor.childWorkItems,
      aggregateCheckpointStatus: cursor.aggregateCheckpointStatus,
      cursorGeneration: cursor.cursorGeneration,
      releaseIntentDeliveryStory: { kind: "set", value: deliveryStory },
      releaseIntent: { kind: "set", value: normalized },
    },
    deps,
  );
  return {
    journey: options.journey,
    method: options.method,
    deliveryStory,
    intent: normalized,
    cursor: updated,
    changed,
  };
}

/** Python `inspect_release_intent`. */
export function inspectReleaseIntent(
  db: Database,
  options: { journey: string; method: string },
): ReleaseIntentReport {
  const { cursor, deliveryStory } = activeDeliveryStory(db, options.journey, options.method);
  const recorded =
    cursor.releaseIntentDeliveryStory === deliveryStory && cursor.releaseIntent
      ? cursor.releaseIntent
      : "not_recorded";
  return {
    journey: options.journey,
    method: options.method,
    deliveryStory,
    intent: recorded,
    cursor,
    changed: false,
  };
}

const MEANING: Record<string, string> = {
  planned: "This Delivery Story is expected to create a release boundary if completed coherently.",
  none: "This Delivery Story is not expected to create a release boundary.",
  undecided: "Release intent is intentionally unresolved and may be revisited later.",
  not_recorded: "No release intent has been recorded for this Delivery Story.",
};

/** Python `render_release_intent_report`. */
export function renderReleaseIntentReport(report: ReleaseIntentReport): string {
  const meaning = MEANING[report.intent];
  if (meaning === undefined) {
    // Python indexes the dict directly, so an unknown intent is a KeyError there.
    throw new Error(`unknown release intent: ${report.intent}`);
  }
  const body = [
    "Delivery",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🚦  DELIVERY STORY RELEASE INTENT               │",
    "│                                                        │",
    cardText("Delivery Story"),
    ...cardWrapped(report.deliveryStory),
    "│                                                        │",
    cardText("Intent"),
    ...cardWrapped(report.intent),
    "│                                                        │",
    cardText("Meaning"),
    ...cardWrapped(meaning),
    "│                                                        │",
    cardText("Action"),
    ...cardWrapped(report.changed ? "recorded" : "inspected"),
    "│                                                        │",
    cardText("Authority boundary"),
    ...cardWrapped(
      "Release intent does not authorize commit, push, tag creation, stable promotion, release publication, or remote mutation.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("release_intent", `${body.join("\n")}\n`);
}
