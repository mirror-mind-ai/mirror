// CV22.DS7.US8 plateau 3 — Pull: the Navigator's commitment to an item.
//
// Port of `pull_lifecycle_item` and `render_pull_report` from
// `src/memory/builder/lifecycle.py`.
//
// Pull looks like a simple write and is not. Three carry-forward rules decide what
// survives it, and each one is invisible until it is wrong:
//
//   1. **Child work items and aggregate status reset only when the ITEM CHANGED.**
//      A first Pull (no prior active item) and a re-pull of the same code keep
//      them; pulling a different code drops them. A port that always resets loses
//      an expanded Delivery Story's children on a re-pull; one that never resets
//      carries the previous story's children into the new one, which is how a
//      Delivery Story ends up reporting siblings that belong to its predecessor.
//   2. **The generation always advances**, even for a re-pull of the same item.
//      It is what invalidates a pending authority receipt bound to the old
//      generation, so "pull the same thing again" is a real state change.
//   3. **Release intent survives only inside the same Delivery Story.** It is
//      keyed to the DS ancestor, so pulling a child of the same DS keeps it and
//      pulling into a different DS clears both fields explicitly.

import type { WritableDatabase } from "#db/database.ts";
import { pyTitle } from "#util/pythonText.ts";
import { cardText, cardWrapped } from "./card.ts";
import {
  ALLOWED_PULL_LEVELS,
  carriedForward,
  deliveryStoryCodeForItem,
  normalizeRequired,
} from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { titleLeaf } from "./storyPaths.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `BuilderLifecycleItem`. */
export interface BuilderLifecycleItem {
  readonly code: string;
  readonly title: string;
  readonly level: string;
  readonly whyNow: string;
}

/** Python `BuilderPullReport`. */
export interface BuilderPullReport {
  readonly journey: string;
  readonly method: string;
  readonly item: BuilderLifecycleItem;
  readonly cursor: BuilderDeliveryCursor;
  readonly nextEvent: string;
}

/**
 * Python `_normalize_item`.
 *
 * Field order is behavior: an empty code is reported before an empty title, and
 * the level VOCABULARY check runs after all four fields are non-empty, so a blank
 * level says "must not be empty" rather than listing the allowed values.
 */
function normalizeItem(item: BuilderLifecycleItem): BuilderLifecycleItem {
  const code = normalizeRequired(item.code, "item code");
  const title = normalizeRequired(item.title, "item title");
  const level = normalizeRequired(item.level, "item level");
  const whyNow = normalizeRequired(item.whyNow, "why now");
  if (!(ALLOWED_PULL_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`item level must be one of ${ALLOWED_PULL_LEVELS.join(", ")}`);
  }
  return { code, title, level, whyNow };
}

export interface PullOptions {
  readonly journey: string;
  readonly method: string;
  readonly item: BuilderLifecycleItem;
}

/** Python `pull_lifecycle_item`. */
export function pullLifecycleItem(
  db: WritableDatabase,
  options: PullOptions,
  deps: CursorWriteDeps,
): BuilderPullReport {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");
  const item = normalizeItem(options.item);

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) {
    throw new Error("delivery cursor is required before pull");
  }

  const itemChanged = existing.activeItem !== null && existing.activeItem !== item.code;
  const preserveReleaseIntent =
    existing.releaseIntentDeliveryStory === deliveryStoryCodeForItem(item.code);

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method,
      activeItem: item.code,
      activeItemTitle: item.title,
      activeItemLevel: item.level,
      activeCheckpoint: null,
      pendingConfirmation: null,
      lastDeliveryEvent: "pull",
      ...carriedForward(existing),
      childWorkItems: itemChanged ? [] : existing.childWorkItems,
      aggregateCheckpointStatus: itemChanged ? [] : existing.aggregateCheckpointStatus,
      cursorGeneration: existing.cursorGeneration + 1,
      // Explicit, not KEEP: Pull is one of the few writes that may CLEAR release
      // intent, and the sentinel would preserve exactly what must be dropped.
      releaseIntentDeliveryStory: setTo(
        preserveReleaseIntent ? existing.releaseIntentDeliveryStory : null,
      ),
      releaseIntent: setTo(preserveReleaseIntent ? existing.releaseIntent : null),
    },
    deps,
  );

  return { journey, method, item, cursor, nextEvent: "prepare" };
}

/** Python `_cv_title`: the HEAD of a `/`-chained title, where `title_leaf` takes the tail. */
function cvTitle(title: string): string {
  return (title.split("/")[0] ?? "").trim();
}

/** Python `render_pull_report`. */
export function renderPullReport(report: BuilderPullReport): string {
  const codeParts = report.item.code.split(".");
  const cvCode = codeParts[0] ?? report.item.code;
  const dsCode = codeParts.length > 1 ? (codeParts[codeParts.length - 1] ?? "") : report.item.code;
  const title = titleLeaf(report.item.title);
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("pull"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🟪■  DELIVERY STORY ACTIVATED                   │",
    "│                                                        │",
    cardText(title),
    "│                                                        │",
    cardText("source"),
    cardText("roadmap candidate"),
    "│                                                        │",
    cardText("roadmap placement"),
    cardText(`🟪[${cvCode}] ${cvTitle(report.item.title)}`),
    cardText(`  └─ 🟦[${dsCode}] ${title}`),
    "│                                                        │",
    cardText("intent"),
    ...cardWrapped(report.item.whyNow),
    "│                                                        │",
    cardText("commitment"),
    cardText("pulled into active Delivery Work"),
    cardText(`active item: ${report.cursor.activeItem ?? "none"}`),
    "│                                                        │",
    cardText("next event"),
    cardText(pyTitle(report.nextEvent)),
    "│                                                        │",
    cardText("boundary"),
    cardText("Prepare was not executed automatically."),
    cardText("Plan and later lifecycle work were not executed."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  // Every level renders the DELIVERY STORY ACTIVATED card, including a User Story.
  // Reproduced: the grammar is Python's, and changing it is a product decision.
  return wrapAriadSurface("delivery_story_identified", body);
}
