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
//   3. **The scaffold is composed here, from one vocabulary (CR111 D3).** Plan fills
//      `PRODUCT_PLAN` with the caller's title, else the title Pull recorded, else the
//      item's code (D5), and names the siblings the caller read from the roadmap as
//      Non-Goals. A caller may set only the objective (`--objective`). Python took each
//      section as an argument and fell back, per field, to a second set of sentences
//      no product path wrote; the recorded corpus graded that set.
//
// CR111: the card prints what the runtime knows, and no section of the plan. It used
// to print the scaffold's sentences as the plan -- scope, acceptance, validation,
// checked off -- even over a plan.md a person had written. It now names the story
// files, each with its state and the sections it still needs, in the rows `build show`
// prints, judged once here, right after the write, so the command and the recorded
// corpus print the same card.

import { dirname } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { STORY_SCOPED_COMMIT_RULE, writeStoryPackage } from "./artifacts/planArtifacts.ts";
import {
  fill,
  fillPlanVocabulary,
  type PlanVocabulary,
  PRODUCT_PLAN,
  SIBLING_NON_GOAL,
} from "./artifacts/scaffoldSections.ts";
import type { ArtifactVerdict } from "./artifacts/scaffoldState.ts";
import { judgeStoryFiles, storyFileLines } from "./artifacts/storyFiles.ts";
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
import { LifecycleRefusal, refuseIfAlreadyComplete } from "./lifecycleRefusal.ts";
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
  readonly planContract: ContractDefinition;
  readonly implementContract: ContractDefinition;
  readonly validationContract: ContractDefinition;
  readonly localRules: readonly string[];
  readonly cursor: BuilderDeliveryCursor;
  readonly planArtifactPath: string | null;
  /**
   * The package's `index.md`, `plan.md`, and `test-guide.md`, judged right after Plan
   * wrote what was missing (CR111); `null` when the journey has no project, so nothing
   * was written.
   */
  readonly storyFiles: readonly ArtifactVerdict[] | null;
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
  /** `--objective`: the one section a caller may write. Authored by construction. */
  readonly objective?: string | null;
  /**
   * The item's title as the roadmap names it. Without one, the scaffold takes the
   * title Pull recorded on the cursor, and only then the item's code (CR111 D5).
   */
  readonly title?: string | null;
  /** The titles of the item's siblings in the roadmap, named as Non-Goals. */
  readonly siblings?: readonly string[];
  readonly localRules?: readonly string[];
  readonly planArtifactPath?: string | null;
  /** The project the package must stay inside (CR079). */
  readonly projectRoot?: string | null;
  readonly preauthorize?: boolean;
  readonly stopBoundary?: string;
}

/**
 * The sentences Plan writes where no file exists: `PRODUCT_PLAN`, filled with the
 * caller's title, else the title Pull recorded, else the item's code (CR111 D5), with
 * the roadmap's siblings as Non-Goals and the caller's objective when it gave one.
 */
function composeScaffold(
  options: PlanOptions,
  recordedTitle: string | null,
  code: string,
): PlanVocabulary {
  const vocabulary = fillPlanVocabulary(PRODUCT_PLAN, {
    title: options.title || recordedTitle || code,
  });
  const siblings = (options.siblings ?? []).map((sibling) =>
    fill(SIBLING_NON_GOAL, { title: sibling }),
  );
  return {
    ...vocabulary,
    objective: options.objective || vocabulary.objective,
    nonGoals: siblings.length > 0 ? siblings : vocabulary.nonGoals,
  };
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
  refuseIfAlreadyComplete("plan", existing);
  if (existing.lastDeliveryEvent !== "prepare") {
    throw new LifecycleRefusal("plan", "not_reached", "Prepare must be completed before Plan");
  }

  const implementable = isImplementableByDefault(existing.activeItemLevel);
  if (!implementable) {
    throw new LifecycleRefusal(
      "plan",
      "not_reached",
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

  const report: Omit<BuilderPlanReport, "storyFiles"> = {
    journey,
    method: method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    activeItemLevel: existing.activeItemLevel,
    implementableByDefault: implementable,
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
    const scaffold = composeScaffold(options, existing.activeItemTitle, existing.activeItem);
    writeStoryPackage(dirname(artifactPath), options.projectRoot, {
      activeItem: report.activeItem,
      activeItemTitle: report.activeItemTitle,
      activeItemLevel: report.activeItemLevel,
      ...scaffold,
      localRules: report.localRules,
      implementContract: report.implementContract,
      activeCheckpoint: cursor.activeCheckpoint,
      pendingConfirmation: cursor.pendingConfirmation,
    });
  }
  // Judged after the write, so the verdict describes the files as they now stand:
  // the scaffold Plan just wrote, or the file a person wrote before it (CR111).
  const storyFiles = artifactPath === null ? null : judgeStoryFiles(dirname(artifactPath));
  return { ...report, storyFiles };
}

/** Python `_granularity_message`. */
function granularityMessage(report: BuilderPlanReport): string {
  return report.implementableByDefault
    ? `${report.activeItemLevel ?? "item"} is implementable by default.`
    : "Delivery Story must expand into User Stories and/or Technical Stories before Plan.";
}

/**
 * Python `_plan_next_action`, told by the file (CR111). The words are the skill's:
 * the Driver authors and presents, the Navigator approves. None of them names passing
 * the structural check as the goal. With no project nothing was written, so there is
 * no file to name and the line stays what it was.
 */
function planNextAction(report: BuilderPlanReport): string {
  if (report.storyFiles === null) {
    return report.preauthorizationRecorded
      ? "Driver completes Plan and consumes bounded authority."
      : "Navigator approves the Plan or requests changes.";
  }
  const authored = report.storyFiles.find((file) => file.name === "plan.md")?.state === "authored";
  if (report.preauthorizationRecorded) {
    return authored
      ? "Driver consumes bounded authority."
      : "Driver authors plan.md, then consumes bounded authority.";
  }
  return authored
    ? "Navigator reads plan.md and approves it or requests changes."
    : "Driver authors plan.md and presents it; the Navigator approves it or requests changes.";
}

/** The story files block: `build show`'s rows for the same files, or why there are none. */
function storyFilesBlock(report: BuilderPlanReport): string[] {
  return report.storyFiles === null
    ? cardWrapped("not written: the journey has no project path")
    : report.storyFiles.flatMap(storyFileLines);
}

/** Python `_plan_boundary`. */
function planBoundary(report: BuilderPlanReport): string {
  return report.preauthorizationRecorded
    ? "No additional Navigator approval turn is expected."
    : "Implementation remains blocked until approval.";
}

/**
 * Python `render_plan_checkpoint`, without the plan (CR111).
 *
 * The card prints no section of the plan: not the objective, scope, non-goals,
 * acceptance, or validation, which it used to fill from the scaffold's sentences.
 * In their place it names the story files, each with its state and the sections it
 * still needs, in the rows `build show` prints. The implementation contract stays:
 * its lines are Ariad's rules and the project's own, true whatever the plan says.
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
    cardText("story files"),
    ...storyFilesBlock(report),
    "│                                                        │",
    cardText("granularity"),
    ...cardWrapped(granularityMessage(report)),
    "│                                                        │",
    cardText("implementation contract"),
    ...cardWrapped("TDD/characterization tests when behavior is testable."),
    ...cardWrapped("Keep changes scoped to the active story."),
    ...cardWrapped(STORY_SCOPED_COMMIT_RULE),
    // A project without a guide adds nothing, not the card's usual `none` (CR019).
    ...(report.localRules.length > 0 ? cardPrefixed(report.localRules, "✓") : []),
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
