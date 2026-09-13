// CV22.DS7.US8 plateau 3 — Prepare: read the terrain, decide nothing.
//
// Port of `prepare_lifecycle_item` and `render_prepare_report` from
// `src/memory/builder/lifecycle.py`.
//
// Prepare is the cheapest event in the lifecycle and the easiest to get subtly
// wrong, because almost all of its output is derived from ONE field: the active
// item's level. That field decides whether the story is implementable, whether a
// granularity decision is required, which rule text appears, and whether the next
// event renders as `Plan` or `Expand or Plan`. An unknown level is a third case,
// not an error.
//
// It also writes: the cursor moves to `last_delivery_event=prepare` and clears any
// pending confirmation, which is what lets Plan's `Prepare must be completed`
// guard mean something.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { pyTitle } from "#util/pythonText.ts";
import { cardContextItems, cardPrefixed, cardText, cardWrapped } from "./card.ts";
import { isImplementableByDefault, normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `BuilderPrepareReport`. */
export interface BuilderPrepareReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly activeItemLevel: string | null;
  readonly implementableByDefault: boolean;
  readonly granularityDecisionRequired: boolean;
  readonly contextSummary: readonly string[];
  readonly storyShapeAssessment: string;
  readonly risks: readonly string[];
  readonly applicableRules: readonly string[];
  readonly cursor: BuilderDeliveryCursor;
  readonly nextEvent: string;
}

/** Python `_story_shape_assessment`: three cases, the third being an unknown level. */
function storyShapeAssessment(level: string | null): string {
  if (isImplementableByDefault(level)) {
    return "Pulled item is implementable by default. Plan may define the execution contract.";
  }
  if (level === "delivery_story") {
    return (
      "Pulled item is a Delivery Story. Ariad requires a granularity decision before " +
      "implementation: expand into User/Technical Stories or approve this Delivery Story " +
      "as one coherent implementable story."
    );
  }
  return "Pulled item level is unknown. Treat granularity as requiring Navigator decision.";
}

/** Python `_next_event_rule`. */
function nextEventRule(level: string | null): string {
  return isImplementableByDefault(level)
    ? "Plan is the next event and requires Navigator approval before implementation."
    : "Expand or explicit single-story approval is required before implementation.";
}

/**
 * Python `_context_summary`.
 *
 * Three fixed paths, in Python's order, each reported present or missing. With no
 * project path the whole block collapses to one line — the shape a journey with no
 * configured project renders.
 */
function contextSummary(projectPath: string | null): string[] {
  if (projectPath === null) {
    return ["No project path is configured; Prepare used runtime journey state only."];
  }
  const root = resolve(projectPath);
  return ["README.md", "docs/project/roadmap/index.md", "docs/process/development-guide.md"].map(
    (relativePath) =>
      `${relativePath}: ${existsSync(join(root, relativePath)) ? "present" : "missing"}`,
  );
}

export interface PrepareOptions {
  readonly journey: string;
  readonly method: string;
  readonly projectPath?: string | null;
}

/** Python `prepare_lifecycle_item`. */
export function prepareLifecycleItem(
  db: WritableDatabase,
  options: PrepareOptions,
  deps: CursorWriteDeps,
): BuilderPrepareReport {
  const journey = normalizeRequired(options.journey, "journey");
  const method = normalizeRequired(options.method, "method");

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before prepare");
  if (!existing.activeItem) throw new Error("active item is required before prepare");

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: null,
      pendingConfirmation: null,
      lastDeliveryEvent: "prepare",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  const implementable = isImplementableByDefault(existing.activeItemLevel);
  return {
    journey,
    method,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    activeItemLevel: existing.activeItemLevel,
    implementableByDefault: implementable,
    granularityDecisionRequired: !implementable,
    contextSummary: contextSummary(options.projectPath ?? null),
    storyShapeAssessment: storyShapeAssessment(existing.activeItemLevel),
    risks: [
      "Scope may expand during Plan if the item mixes product and technical work.",
      "Implementation remains blocked until the Plan checkpoint is approved.",
    ],
    applicableRules: [
      "Pull selects active work; Prepare reads terrain.",
      nextEventRule(existing.activeItemLevel),
      "No Plan, Implement, Validation, Review, Coherence, or Done work is executed here.",
    ],
    cursor,
    nextEvent: "plan",
  };
}

/** Python `render_prepare_report`. */
export function renderPrepareReport(report: BuilderPrepareReport): string {
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("prepare"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭  PREPARE FIELD READING                       │",
    "│                                                        │",
    cardText("active item"),
    cardText(`🟦[${report.activeItem}]`),
    cardText(`level: ${report.activeItemLevel ?? "unknown"}`),
    cardText(
      report.implementableByDefault
        ? "implementable: yes"
        : "implementable: requires granularity decision",
    ),
    "│                                                        │",
    cardText("terrain read"),
    ...cardContextItems(report.contextSummary),
    "│                                                        │",
    cardText("story shape"),
    ...cardWrapped(report.storyShapeAssessment),
    "│                                                        │",
    cardText("risks"),
    ...cardPrefixed(report.risks, "✕"),
    "│                                                        │",
    cardText("applicable rules"),
    ...cardPrefixed(report.applicableRules, "✓"),
    "│                                                        │",
    cardText("next event"),
    cardText(report.granularityDecisionRequired ? "Expand or Plan" : pyTitle(report.nextEvent)),
    "│                                                        │",
    cardText("boundary"),
    cardText("Plan was not created."),
    cardText("Implementation remains blocked."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("prepare_field_reading", body);
}
