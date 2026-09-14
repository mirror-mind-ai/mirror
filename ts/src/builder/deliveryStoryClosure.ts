// CV22.DS7.US8 plateau 5 — aggregate closure: Validate, Debt Review, Coherence, Done.
//
// Port of `src/memory/builder/delivery_story_closure.py`.
//
// The story-level closure in `closure.ts` decides three cursor fields from a
// missing-evidence tuple. This one decides them from an ORDERED STATUS LIST: each
// verb requires a specific `aggregate_checkpoint_status` entry and writes its own,
// and `replaceStatus` appends rather than replacing in place — so the same set can
// carry different bytes, and the cursor's compare-and-swap matches bytes.
//
// Four guard shapes, in Python's order, and the order is the behavior:
//
//   * every verb first requires a Delivery Story cursor, under `delivery_story`
//     flow, with an active item AND child work packages;
//   * Validate then requires `plan:approved`;
//   * Review requires `validation:passed` — exact, not a prefix;
//   * Coherence and Done require a `debt_review:review:` PREFIX, so any decision
//     (`no_action`, `defer`, `pay_now`) satisfies them. Done therefore accepts a
//     reviewed state directly: DS-level Coherence is an option, not a precondition,
//     exactly as at story level.
//
// Two inherited shapes are reproduced rather than repaired, and both have corpus
// cases so a tidier port fails:
//
//   * `_ribbon` has no `coherence` branch, so the Coherence surface renders the
//     DONE ribbon by fall-through;
//   * the artifacts are written UNCONDITIONALLY (CR079), so an authored
//     `validation.md` is replaced by scaffold.
//
// Done is also the only verb that does not route through the shared cursor update:
// it writes `coherence:coherent` and `done:done` in one write, which is what lets
// its surface truthfully say coherence was checked inside Done.

import type { WritableDatabase } from "#db/database.ts";
import { pyStrip } from "#util/pythonText.ts";
import {
  existingArtifact,
  type MaterializedArtifact,
  materializedArtifact,
} from "./artifacts/artifactSurfaces.ts";
import { writeDeliveryStoryClosureArtifact } from "./artifacts/deliveryStoryArtifacts.ts";
import { cardText, cardWrapped } from "./card.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { replaceStatus } from "./deliveryStoryPlan.ts";
import { FLOW_UNIT_DELIVERY_STORY } from "./flowUnit.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

export interface DeliveryStoryClosureReport {
  readonly journey: string;
  readonly method: string;
  readonly deliveryStory: string;
  readonly deliveryStoryTitle: string | null;
  readonly childWorkItems: readonly string[];
  readonly checkpoint: string;
  readonly status: string;
  readonly summary: string;
  readonly cursor: BuilderDeliveryCursor;
  readonly artifactPath: string | null;
}

/** Python `_require_delivery_story_cursor`. */
function requireDeliveryStoryCursor(db: WritableDatabase, journey: string): BuilderDeliveryCursor {
  const cursor = getDeliveryCursor(db, journey);
  if (cursor === null) {
    throw new Error("delivery cursor is required before Delivery Story closure");
  }
  if (cursor.activeItemLevel !== "delivery_story") {
    throw new Error("Delivery Story closure requires an active Delivery Story");
  }
  if (cursor.navigatorFlowUnit !== FLOW_UNIT_DELIVERY_STORY) {
    throw new Error("Delivery Story closure requires navigator_flow_unit=delivery_story");
  }
  if (!cursor.activeItem) {
    throw new Error("active Delivery Story is required before Delivery Story closure");
  }
  if (cursor.childWorkItems.length === 0) {
    throw new Error("Delivery Story closure requires child work packages");
  }
  return cursor;
}

/** Python `_require_status`: an EXACT `checkpoint:status` entry. */
function requireStatus(cursor: BuilderDeliveryCursor, checkpoint: string, status: string): void {
  const expected = `${checkpoint}:${status}`;
  if (!cursor.aggregateCheckpointStatus.includes(expected)) {
    throw new Error(`Delivery Story ${checkpoint} requires aggregate status ${expected}`);
  }
}

/** Python `_require_prefix`: any entry under `checkpoint:prefix`. */
function requirePrefix(
  cursor: BuilderDeliveryCursor,
  checkpoint: string,
  prefixStatus: string,
): void {
  const prefix = `${checkpoint}:${prefixStatus}`;
  if (!cursor.aggregateCheckpointStatus.some((item) => item.startsWith(prefix))) {
    throw new Error(`Delivery Story ${checkpoint} requires aggregate status starting ${prefix}`);
  }
}

interface UpdateOptions {
  readonly journey: string;
  readonly method: string;
  readonly cursor: BuilderDeliveryCursor;
  readonly event: string;
  readonly activeCheckpoint: string | null;
  readonly pendingConfirmation: string | null;
  readonly checkpoint: string;
  readonly status: string;
}

/** Python `_update_cursor`. */
function updateCursor(
  db: WritableDatabase,
  options: UpdateOptions,
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const { cursor } = options;
  return setDeliveryCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      activeItem: cursor.activeItem,
      activeItemTitle: cursor.activeItemTitle,
      activeItemLevel: cursor.activeItemLevel,
      activeCheckpoint: options.activeCheckpoint,
      pendingConfirmation: options.pendingConfirmation,
      lastDeliveryEvent: options.event,
      cadenceProfile: cursor.cadenceProfile,
      cadenceLimits: cursor.cadenceLimits,
      granularityDecision: cursor.granularityDecision,
      navigatorFlowUnit: cursor.navigatorFlowUnit,
      childWorkItems: cursor.childWorkItems,
      aggregateCheckpointStatus: replaceStatus(
        cursor.aggregateCheckpointStatus,
        options.checkpoint,
        options.status,
      ),
      refreshProjection: false,
    },
    deps,
  );
}

/** Python `_report`: the summary falls back to `none` when blank. */
function buildReport(options: {
  journey: string;
  method: string;
  cursor: BuilderDeliveryCursor;
  checkpoint: string;
  status: string;
  summary: string;
  updated: BuilderDeliveryCursor;
  artifactPath: string | null;
}): DeliveryStoryClosureReport {
  return {
    journey: options.journey,
    method: options.method,
    deliveryStory: options.cursor.activeItem || "none",
    deliveryStoryTitle: options.cursor.activeItemTitle,
    childWorkItems: options.cursor.childWorkItems,
    checkpoint: options.checkpoint,
    status: options.status,
    summary: pyStrip(options.summary) || "none",
    cursor: options.updated,
    artifactPath: options.artifactPath,
  };
}

function persistArtifact(report: DeliveryStoryClosureReport): void {
  writeDeliveryStoryClosureArtifact(report.artifactPath, {
    deliveryStory: report.deliveryStory,
    childWorkItems: report.childWorkItems,
    checkpoint: report.checkpoint,
    status: report.status,
    summary: report.summary,
    boundary: boundaryFor(report),
  });
}

/**
 * The artifact manifest the CLI prints, sampled BEFORE the write.
 *
 * Exported because the leaf needs the same existence reading the surface reports,
 * and sampling it after the write makes `created` and `updated` indistinguishable.
 */
export function closureArtifactManifest(
  kind: string,
  path: string | null,
  existedBefore: boolean,
): readonly MaterializedArtifact[] {
  if (path === null) return [];
  return [
    existedBefore
      ? existingArtifact(kind, path)
      : materializedArtifact(kind, path, { existedBefore: false }),
  ];
}

export interface ValidateDeliveryStoryOptions {
  readonly journey: string;
  readonly method: string;
  readonly summary: string;
  readonly navigatorAccepted?: boolean;
  readonly artifactPath?: string | null;
}

/** Python `validate_delivery_story`. */
export function validateDeliveryStory(
  db: WritableDatabase,
  options: ValidateDeliveryStoryOptions,
  deps: CursorWriteDeps,
): DeliveryStoryClosureReport {
  const cursor = requireDeliveryStoryCursor(db, options.journey);
  requireStatus(cursor, "plan", "approved");
  const accepted = options.navigatorAccepted ?? false;
  const status = accepted ? "passed" : "pending_navigator_validation";
  const updated = updateCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      cursor,
      event: accepted ? "delivery_story_validation_complete" : "delivery_story_validation",
      activeCheckpoint: accepted ? null : "delivery_story_validation",
      pendingConfirmation: accepted ? null : "navigator_delivery_story_validation",
      checkpoint: "validation",
      status,
    },
    deps,
  );
  const report = buildReport({
    journey: options.journey,
    method: options.method,
    cursor,
    checkpoint: "validation",
    status,
    summary: options.summary,
    updated,
    artifactPath: options.artifactPath ?? null,
  });
  persistArtifact(report);
  deps.requestProjectionRefresh?.(options.journey);
  return report;
}

export interface ReviewDeliveryStoryOptions {
  readonly journey: string;
  readonly method: string;
  readonly decision: string;
  readonly summary: string;
  readonly artifactPath?: string | null;
}

/** Python `review_delivery_story`. */
export function reviewDeliveryStory(
  db: WritableDatabase,
  options: ReviewDeliveryStoryOptions,
  deps: CursorWriteDeps,
): DeliveryStoryClosureReport {
  const cursor = requireDeliveryStoryCursor(db, options.journey);
  requireStatus(cursor, "validation", "passed");
  if (!["no_action", "defer", "pay_now"].includes(options.decision)) {
    throw new Error("Delivery Story debt decision must be no_action, defer, or pay_now");
  }
  const status = `review:${options.decision}`;
  const updated = updateCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      cursor,
      event: "delivery_story_review_complete",
      activeCheckpoint: null,
      pendingConfirmation: null,
      checkpoint: "debt_review",
      status,
    },
    deps,
  );
  const report = buildReport({
    journey: options.journey,
    method: options.method,
    cursor,
    checkpoint: "debt_review",
    status,
    summary: options.summary,
    updated,
    artifactPath: options.artifactPath ?? null,
  });
  persistArtifact(report);
  deps.requestProjectionRefresh?.(options.journey);
  return report;
}

export interface CoherenceDeliveryStoryOptions {
  readonly journey: string;
  readonly method: string;
  readonly summary: string;
  readonly artifactPath?: string | null;
}

/** Python `coherence_delivery_story`. */
export function coherenceDeliveryStory(
  db: WritableDatabase,
  options: CoherenceDeliveryStoryOptions,
  deps: CursorWriteDeps,
): DeliveryStoryClosureReport {
  const cursor = requireDeliveryStoryCursor(db, options.journey);
  requirePrefix(cursor, "debt_review", "review:");
  const updated = updateCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      cursor,
      event: "delivery_story_coherence_complete",
      activeCheckpoint: null,
      pendingConfirmation: null,
      checkpoint: "coherence",
      status: "coherent",
    },
    deps,
  );
  const report = buildReport({
    journey: options.journey,
    method: options.method,
    cursor,
    checkpoint: "coherence",
    status: "coherent",
    summary: options.summary,
    updated,
    artifactPath: options.artifactPath ?? null,
  });
  persistArtifact(report);
  deps.requestProjectionRefresh?.(options.journey);
  return report;
}

export interface DoneDeliveryStoryOptions {
  readonly journey: string;
  readonly method: string;
  readonly summary: string;
  readonly artifactPath?: string | null;
}

/**
 * Python `done_delivery_story`.
 *
 * The only verb that writes TWO statuses in one write — `coherence:coherent` then
 * `done:done` — and therefore the only one that does not go through
 * `updateCursor`. Note what it does NOT do: the authored-roadmap preflight lives in
 * the CLI, ahead of this call, so the module can be driven in a test without a
 * project on disk.
 */
export function doneDeliveryStory(
  db: WritableDatabase,
  options: DoneDeliveryStoryOptions,
  deps: CursorWriteDeps,
): DeliveryStoryClosureReport {
  const cursor = requireDeliveryStoryCursor(db, options.journey);
  requirePrefix(cursor, "debt_review", "review:");
  let statuses = replaceStatus(cursor.aggregateCheckpointStatus, "coherence", "coherent");
  statuses = replaceStatus(statuses, "done", "done");
  const updated = setDeliveryCursor(
    db,
    {
      journey: options.journey,
      method: options.method,
      activeItem: cursor.activeItem,
      activeItemTitle: cursor.activeItemTitle,
      activeItemLevel: cursor.activeItemLevel,
      activeCheckpoint: null,
      pendingConfirmation: null,
      lastDeliveryEvent: "delivery_story_done_complete",
      cadenceProfile: cursor.cadenceProfile,
      cadenceLimits: cursor.cadenceLimits,
      granularityDecision: cursor.granularityDecision,
      navigatorFlowUnit: cursor.navigatorFlowUnit,
      childWorkItems: cursor.childWorkItems,
      aggregateCheckpointStatus: statuses,
      refreshProjection: false,
    },
    deps,
  );
  const report = buildReport({
    journey: options.journey,
    method: options.method,
    cursor,
    checkpoint: "done",
    status: "done",
    summary: options.summary,
    updated,
    artifactPath: options.artifactPath ?? null,
  });
  persistArtifact(report);
  deps.requestProjectionRefresh?.(options.journey);
  return report;
}

// --- surfaces ---------------------------------------------------------------

const RIBBON_VALIDATION =
  "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ◉ Validate → ○ Debt Review → ○ Done";
const RIBBON_DEBT_REVIEW =
  "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ✓ Validate → ◉ Debt Review → ○ Done";
const RIBBON_DONE =
  "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ DS Plan → ✓ Implement → ✓ Validate → ✓ Debt Review → ◉ Done";

/**
 * Python `_ribbon`.
 *
 * `coherence` has NO branch in Python, so it falls through to the Done ribbon and a
 * Coherence checkpoint renders `◉ Done`. Adding the missing branch is prettier and
 * fails `delivery_story_flow_happy_path`.
 */
function ribbon(checkpoint: string): string {
  if (checkpoint === "validation") return RIBBON_VALIDATION;
  if (checkpoint === "debt_review") return RIBBON_DEBT_REVIEW;
  return RIBBON_DONE;
}

/** Python `_boundary`. */
function boundaryFor(report: DeliveryStoryClosureReport): string {
  if (report.checkpoint === "validation" && report.status !== "passed") {
    return "Do not proceed to DS-level Debt Review until Navigator validation is accepted.";
  }
  if (report.checkpoint === "done") {
    return "Delivery Story closure is complete; push and release remain separate hard gates.";
  }
  return "No push or release action is authorized by this checkpoint.";
}

const WHAT_HAPPENED: Record<string, string> = {
  validation: "What was validated?",
  debt_review: "What was reviewed?",
  coherence: "What was checked?",
  done: "What was completed?",
};

const STATE_HEADING: Record<string, string> = {
  validation: "Navigator validation",
  debt_review: "Debt decision",
  coherence: "Coherence state",
  done: "Done state",
};

/** Python `_state_summary`. */
function stateSummary(report: DeliveryStoryClosureReport): string {
  if (report.checkpoint === "validation") {
    return report.status === "passed"
      ? "Navigator accepted validation."
      : "Awaiting Navigator validation acceptance.";
  }
  if (report.checkpoint === "debt_review") return report.status.replaceAll("review:", "");
  return report.status.replaceAll("_", " ");
}

/** Python `_next_movement`. */
function nextMovement(report: DeliveryStoryClosureReport): string {
  if (report.checkpoint === "validation") {
    return report.status === "passed"
      ? "Proceed to DS-level Debt Review."
      : "Accept validation before DS-level Debt Review.";
  }
  if (report.checkpoint === "debt_review") return "Proceed to DS-level Done.";
  if (report.checkpoint === "coherence") {
    return "Coherence is now checked inside Done for DS-level flow.";
  }
  if (report.checkpoint === "done") return "Delivery Story closure is complete.";
  return boundaryFor(report);
}

/** Python `_active_delivery`. */
function activeDelivery(report: DeliveryStoryClosureReport): string {
  const title = report.deliveryStoryTitle ? ` — ${report.deliveryStoryTitle}` : "";
  return `🟦[${report.deliveryStory}]${title}`;
}

/** Python `render_delivery_story_closure_report`. */
export function renderDeliveryStoryClosureReport(report: DeliveryStoryClosureReport): string {
  const doneCoherence =
    report.checkpoint === "done"
      ? [
          "│                                                        │",
          cardText("Coherence check"),
          ...cardWrapped(
            "Closure coherence passed: Done materialization, roadmap state, artifacts, and next-pull readiness were checked as part of Done.",
          ),
          "│                                                        │",
        ]
      : [];
  const body = [
    "Delivery",
    ribbon(report.checkpoint),
    "",
    "╭────────────────────────────────────────────────────────╮",
    cardText(`       🧪  DELIVERY STORY ${report.checkpoint.replaceAll("_", " ").toUpperCase()}`),
    "│                                                        │",
    cardText(WHAT_HAPPENED[report.checkpoint] ?? "What happened?"),
    ...cardWrapped(activeDelivery(report)),
    "│                                                        │",
    cardText("Evidence summary"),
    ...cardWrapped(report.summary),
    "│                                                        │",
    cardText(STATE_HEADING[report.checkpoint] ?? "State"),
    ...cardWrapped(stateSummary(report)),
    "│                                                        │",
    ...doneCoherence,
    cardText("Next movement"),
    ...cardWrapped(nextMovement(report)),
    "╰────────────────────────────────────────────────────────╯",
  ];
  return wrapAriadSurface("delivery_story_closure_checkpoint", `${body.join("\n")}\n`);
}
