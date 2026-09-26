// CV22.DS7.US8 plateau 3 — Plan: the checkpoint that blocks implementation.
//
// Port of `plan_lifecycle_item` and `render_plan_checkpoint` from
// `src/memory/builder/lifecycle.py`.
//
// Three behaviors carry the meaning, and two of them are invisible in the surface:
//
//   1. **The receipt argument is always EXPLICIT.** Plan passes the receipt it
//      resolved — new, or the existing one — which bypasses the cursor's
//      coordinate-change invalidation. That is what lets a freshly recorded receipt
//      survive the very write that records it; passing the KEEP sentinel here would
//      invalidate it on arrival.
//   2. **The generation does NOT advance.** Plan is a checkpoint on the item Pull
//      committed to, and a bump would invalidate the receipt it just wrote.
//   3. **Defaults are per FIELD, not per call.** Every empty argument falls back to
//      its own Python default, so a caller that supplies only `objective` still gets
//      Python's scope, non-goals, acceptance, and validation text.

import { dirname } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { writeStoryPackage } from "./artifacts/planArtifacts.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import { isImplementableByDefault, normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  type PlanPreauthorizationReceipt,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";
import { effectiveNavigatorFlowUnit, FLOW_UNIT_STORY_BY_STORY } from "./flowUnit.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import type { ContractDefinition, MethodDefinition } from "./methodDefinition.ts";
import {
  createPlanPreauthorizationReceipt,
  PREAUTHORIZATION_STOP,
  STORY_PLAN_CONTRACT,
} from "./planPreauthorization.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `BuilderPlanReport`. */
export interface BuilderPlanReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly activeItemLevel: string | null;
  readonly implementableByDefault: boolean;
  readonly objective: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly acceptanceBehavior: readonly string[];
  readonly validationRoute: readonly string[];
  readonly e2eDecision: string;
  readonly planContract: ContractDefinition;
  readonly implementContract: ContractDefinition;
  readonly validationContract: ContractDefinition;
  readonly localRules: readonly string[];
  readonly cursor: BuilderDeliveryCursor;
  readonly planArtifactPath: string | null;
  readonly preauthorizationRecorded: boolean;
  readonly nextEvent: string;
}

/** Python `_contract_for`: a missing contract is a method-definition defect, not a default. */
function contractFor(method: MethodDefinition, contractId: string): ContractDefinition {
  const contract = method.contracts.find((candidate) => candidate.id === contractId);
  if (contract === undefined) {
    throw new Error(`method ${method.id} is missing contract ${contractId}`);
  }
  return contract;
}

/**
 * Python `_cadence_preauthorizes_story_plan`.
 *
 * Keyed on the profile's POLICY, not on its name. `accelerated` is the profile that
 * carries `bounded_story_authority` today, but a method that renames it or adds
 * another profile with the same policy gets the same behavior — which is why the
 * Python test asserts the policy rather than the profile id.
 */
function cadencePreauthorizesStoryPlan(
  method: MethodDefinition,
  cadenceProfile: string | null,
): boolean {
  if (cadenceProfile === null) return false;
  const profile = method.cadenceProfiles.find((candidate) => candidate.id === cadenceProfile);
  return profile !== undefined && profile.planApprovalPolicy === "bounded_story_authority";
}

export interface PlanOptions {
  readonly journey: string;
  readonly method: MethodDefinition;
  readonly objective?: string | null;
  readonly scope?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly acceptanceBehavior?: readonly string[];
  readonly validationRoute?: readonly string[];
  readonly e2eDecision?: string | null;
  readonly localRules?: readonly string[];
  readonly planArtifactPath?: string | null;
  /** The project the package must stay inside (CR079). */
  readonly projectRoot?: string | null;
  readonly preauthorize?: boolean;
  readonly stopBoundary?: string;
}

/** Python `plan_lifecycle_item`. */
export function planLifecycleItem(
  db: WritableDatabase,
  options: PlanOptions,
  deps: CursorWriteDeps,
): BuilderPlanReport {
  const journey = normalizeRequired(options.journey, "journey");
  const method = options.method;

  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before plan");
  if (!existing.activeItem) throw new Error("active item is required before plan");
  if (existing.lastDeliveryEvent !== "prepare") {
    throw new Error("Prepare must be completed before Plan");
  }

  const implementable = isImplementableByDefault(existing.activeItemLevel);
  if (!implementable) {
    throw new Error(
      "Plan requires a User Story or Technical Story; expand the Delivery Story first",
    );
  }

  const stopBoundary = options.stopBoundary ?? PREAUTHORIZATION_STOP;
  const artifactPath = options.planArtifactPath ?? null;
  let flowUnit = existing.navigatorFlowUnit;
  let receipt: PlanPreauthorizationReceipt | null = existing.planPreauthorization;
  const preauthorizationRecorded =
    (options.preauthorize ?? false) ||
    cadencePreauthorizesStoryPlan(method, existing.cadenceProfile);

  if (preauthorizationRecorded) {
    flowUnit = effectiveNavigatorFlowUnit(existing).flowUnit;
    if (flowUnit !== FLOW_UNIT_STORY_BY_STORY) {
      throw new Error("story Plan preauthorization requires story_by_story flow");
    }
    receipt = createPlanPreauthorizationReceipt(
      { ...existing, navigatorFlowUnit: flowUnit },
      {
        method: method.id,
        planContractVersion: STORY_PLAN_CONTRACT,
        stopBoundary,
      },
    );
  }

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method: method.id,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: "after_plan",
      pendingConfirmation: "navigator_approval",
      lastDeliveryEvent: "plan",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: null,
      navigatorFlowUnit: flowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
      cursorGeneration: existing.cursorGeneration,
      planPreauthorization: setTo(receipt),
    },
    deps,
  );

  const report: BuilderPlanReport = {
    journey,
    method: method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    activeItemLevel: existing.activeItemLevel,
    implementableByDefault: implementable,
    objective: options.objective || "Confirm scope, validation route, and implementation contract.",
    scope:
      options.scope && options.scope.length > 0
        ? options.scope
        : ["Implement the smallest coherent slice for the active item."],
    nonGoals:
      options.nonGoals && options.nonGoals.length > 0
        ? options.nonGoals
        : ["Do not silently absorb adjacent roadmap work."],
    acceptanceBehavior:
      options.acceptanceBehavior && options.acceptanceBehavior.length > 0
        ? options.acceptanceBehavior
        : [
            "Given the relevant starting state",
            "When the Navigator exercises the planned behavior",
            "Then the expected observable outcome appears",
            "And important constraints still hold",
          ],
    validationRoute:
      options.validationRoute && options.validationRoute.length > 0
        ? options.validationRoute
        : [
            "Run automated checks required by the local guide.",
            "Provide a Navigator-visible validation route with expected observation and pass/fail condition.",
          ],
    e2eDecision:
      options.e2eDecision || "Decide explicitly before implementation whether E2E is required.",
    planContract: contractFor(method, "plan_contract"),
    implementContract: contractFor(method, "implement_contract"),
    validationContract: contractFor(method, "validation_contract"),
    localRules: options.localRules ?? [],
    cursor,
    planArtifactPath: artifactPath,
    preauthorizationRecorded,
    nextEvent: "implement",
  };

  if (artifactPath !== null) {
    writeStoryPackage(dirname(artifactPath), options.projectRoot, {
      activeItem: report.activeItem,
      activeItemTitle: report.activeItemTitle,
      activeItemLevel: report.activeItemLevel,
      objective: report.objective,
      scope: report.scope,
      nonGoals: report.nonGoals,
      acceptanceBehavior: report.acceptanceBehavior,
      validationRoute: report.validationRoute,
      e2eDecision: report.e2eDecision,
      localRules: report.localRules,
      implementContract: report.implementContract,
      activeCheckpoint: cursor.activeCheckpoint,
      pendingConfirmation: cursor.pendingConfirmation,
    });
  }
  // Unconditional, and after the artifacts: the cursor write was told not to
  // publish, so this is the only refresh for the whole event.
  return report;
}

/** Python `_granularity_message`. */
function granularityMessage(report: BuilderPlanReport): string {
  return report.implementableByDefault
    ? `${report.activeItemLevel ?? "item"} is implementable by default.`
    : "Delivery Story must expand into User Stories and/or Technical Stories before Plan.";
}

/** Python `_plan_next_action`. */
function planNextAction(report: BuilderPlanReport): string {
  return report.preauthorizationRecorded
    ? "Driver completes Plan and consumes bounded authority."
    : "Navigator approves the Plan or requests changes.";
}

/** Python `_plan_boundary`. */
function planBoundary(report: BuilderPlanReport): string {
  return report.preauthorizationRecorded
    ? "No additional Navigator approval turn is expected."
    : "Implementation remains blocked until approval.";
}

/**
 * Python `render_plan_checkpoint`.
 *
 * The four `*_path=` trailer lines are appended OUTSIDE the card and only when an
 * artifact path exists — they are the machine-readable half of the surface, read by
 * the skill rather than by a human, and they print absolute paths (CR082).
 */
export function renderPlanCheckpoint(report: BuilderPlanReport): string {
  const written = report.planArtifactPath !== null;
  const packagePath = written ? dirname(report.planArtifactPath as string) : "not written";
  const indexPath = written ? `${packagePath}/index.md` : "not written";
  const planPath = written ? (report.planArtifactPath as string) : "not written";
  const testGuidePath = written ? `${packagePath}/test-guide.md` : "not written";

  const card = [
    "Delivery",
    renderLifecycleRibbon("plan"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭■  PLAN CHECKPOINT                            │",
    "│                                                        │",
    cardText("item"),
    cardText(`🟦[${report.activeItem}]`),
    cardText(`level: ${report.activeItemLevel ?? "unknown"}`),
    "│                                                        │",
    cardText("story package"),
    ...cardWrapped(written ? packagePath : "not materialized yet"),
    "│                                                        │",
    cardText("artifacts"),
    ...cardWrapped(written ? `index: ${indexPath}` : "index: not written"),
    ...cardWrapped(written ? `plan: ${planPath}` : "plan: not written"),
    ...cardWrapped(written ? `test guide: ${testGuidePath}` : "test guide: not written"),
    "│                                                        │",
    cardText("granularity"),
    ...cardWrapped(granularityMessage(report)),
    "│                                                        │",
    cardText("plan"),
    ...cardWrapped(report.objective),
    "│                                                        │",
    cardText("scope"),
    ...cardPrefixed(report.scope, "✓"),
    "│                                                        │",
    cardText("non-goals"),
    ...cardPrefixed(report.nonGoals, "○"),
    "│                                                        │",
    cardText("acceptance"),
    ...cardPrefixed(report.acceptanceBehavior, "✓"),
    "│                                                        │",
    cardText("validation"),
    ...cardPrefixed(report.validationRoute, "✓"),
    ...cardWrapped(`E2E: ${report.e2eDecision}`),
    "│                                                        │",
    cardText("implementation contract"),
    ...cardWrapped("TDD/characterization tests when behavior is testable."),
    ...cardWrapped("Keep changes scoped to the active story."),
    ...cardPrefixed(report.localRules, "✓"),
    "│                                                        │",
    cardText("approval gate"),
    cardText(`checkpoint: ${report.cursor.activeCheckpoint}`),
    cardText(`pending: ${report.cursor.pendingConfirmation}`),
    "│                                                        │",
    cardText("next action"),
    ...cardWrapped(planNextAction(report)),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped(planBoundary(report)),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n");

  const trailer = written
    ? [
        `story_package_path=${packagePath}\n`,
        `index_artifact_path=${indexPath}\n`,
        `plan_artifact_path=${planPath}\n`,
        `test_guide_artifact_path=${testGuidePath}\n`,
      ].join("")
    : "";
  return wrapAriadSurface("plan_checkpoint", `${card}\n${trailer}`);
}
