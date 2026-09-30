// CV22.DS7.US8 plateau 3 — bounded authority for conditional Plan approval.
//
// Port of `src/memory/builder/plan_preauthorization.py`.
//
// This is the security-sensitive module of the plateau. A receipt lets the Driver
// approve its own Plan once, without another Navigator turn, so every property
// that bounds it is load-bearing:
//
//   * the receipt is **payload-free** — it carries coordinates and a hash, never
//     Plan prose, so it cannot smuggle scope past the Navigator;
//   * it is **generation-bound**, so any cursor movement invalidates it;
//   * it is **single-use**, consumed atomically by a compare-and-swap;
//   * a mismatch **falls back to ordinary approval** rather than failing open.
//
// The fingerprint is an equality test on authority. If the two engines
// canonicalize its payload differently, a receipt Python recorded cannot be
// consumed by TypeScript — the Navigator is asked to approve a Plan they already
// authorized, which is the safe direction but still a defect. It never fails the
// other way, because a hash mismatch can only refuse.

import { createHash } from "node:crypto";

import type { WritableDatabase } from "#db/database.ts";
import { pythonJsonDumpsCanonical } from "#util/pyGenerators.ts";
import { pyStrip, sortByCodePoint } from "#util/pythonText.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  DeliveryCursorConflict,
  type PlanPreauthorizationReceipt,
  setDeliveryCursor,
  setTo,
} from "./deliveryCursor.ts";

/** Python module constants. */
export const PREAUTHORIZATION_POLICY = "exact_scope";
export const PREAUTHORIZATION_STOP = "navigator_validation";
export const DELIVERY_STORY_PLAN_CONTRACT = "delivery_story_plan@1";
export const STORY_PLAN_CONTRACT = "story_plan@1";

/** Python `STORY_PLAN_REQUIRED_SECTIONS`, in declaration order. */
export const STORY_PLAN_REQUIRED_SECTIONS = [
  "Scope",
  "Non-Goals",
  "Acceptance Behavior",
  "Validation Route",
  "Implementation Contract",
] as const;

/**
 * The sections a Plan approval requires authored, on either route (CR112): every
 * placeholder section of the story scaffold and every section the Plan contract
 * requires, in the order the plan file has them, so a refusal lists them as the reader
 * will find them. One list, so the ordinary and the preauthorized route cannot hold a
 * plan to different rules. A placeholder section counts until it is authored; a
 * required `default` section counts until it is not empty or pending.
 */
export const PLAN_APPROVAL_SECTIONS: readonly string[] = [
  ...PLAN_SECTIONS.filter(
    (section) =>
      section.kind === "placeholder" ||
      (STORY_PLAN_REQUIRED_SECTIONS as readonly string[]).includes(section.header),
  ).map((section) => section.header),
  ...STORY_PLAN_REQUIRED_SECTIONS.filter(
    (header) => !PLAN_SECTIONS.some((section) => section.header === header),
  ),
];

/** Python `PlanPreauthorizationMismatch`. */
export class PlanPreauthorizationMismatch extends Error {
  readonly reason: string;
  /**
   * For `plan_incomplete`, the sections still to author (CR112). The surface names
   * them; the receipt keeps only the reason token, so a persisted cursor reads back as
   * it always did.
   */
  readonly sections: readonly string[];

  constructor(reason: string, sections: readonly string[] = []) {
    super(reason);
    this.name = "PlanPreauthorizationMismatch";
    this.reason = reason;
    this.sections = sections;
  }
}

export interface ScopeFingerprintInput {
  readonly journey: string;
  readonly method: string;
  readonly cursorGeneration: number;
  readonly activeItem: string;
  readonly activeItemLevel: string;
  readonly flowUnit: string;
  readonly childWorkItems: readonly string[];
  readonly planContractVersion: string;
  readonly stopBoundary: string;
}

/** Python `scope_fingerprint`: sha256 over canonical sorted-compact ASCII JSON. */
export function scopeFingerprint(input: ScopeFingerprintInput): string {
  const payload = {
    journey: input.journey,
    method: input.method,
    cursor_generation: input.cursorGeneration,
    active_item: input.activeItem,
    active_item_level: input.activeItemLevel,
    flow_unit: input.flowUnit,
    child_work_items: [...input.childWorkItems],
    plan_contract_version: input.planContractVersion,
    policy: PREAUTHORIZATION_POLICY,
    stop_boundary: input.stopBoundary,
  };
  return createHash("sha256").update(pythonJsonDumpsCanonical(payload), "utf8").digest("hex");
}

/**
 * Python `canonical_child_scope`: compare as a SET, store deterministically.
 *
 * Sorted and de-duplicated, so child ORDER is presentational while addition or
 * removal is a mismatch — the distinction the Delivery Story flow depends on.
 */
export function canonicalChildScope(items: readonly string[]): string[] {
  const trimmed = new Set<string>();
  for (const item of items) {
    const normalized = pyStrip(item);
    if (normalized) trimmed.add(normalized);
  }
  return sortByCodePoint([...trimmed]);
}

export interface CreateReceiptOptions {
  readonly method: string;
  readonly planContractVersion: string;
  readonly childWorkItems?: readonly string[];
  readonly stopBoundary?: string;
}

/** Python `create_plan_preauthorization_receipt`. */
export function createPlanPreauthorizationReceipt(
  cursor: BuilderDeliveryCursor,
  options: CreateReceiptOptions,
): PlanPreauthorizationReceipt {
  if (!cursor.activeItem || !cursor.activeItemLevel || !cursor.navigatorFlowUnit) {
    throw new Error("complete active Plan coordinates are required");
  }
  const stopBoundary = options.stopBoundary ?? PREAUTHORIZATION_STOP;
  if (stopBoundary !== PREAUTHORIZATION_STOP) {
    throw new Error("unsupported Plan preauthorization stop boundary");
  }
  const children = canonicalChildScope(options.childWorkItems ?? []);
  return {
    journey: cursor.journey,
    method: options.method,
    cursorGeneration: cursor.cursorGeneration,
    activeItem: cursor.activeItem,
    activeItemLevel: cursor.activeItemLevel,
    flowUnit: cursor.navigatorFlowUnit,
    childWorkItems: children,
    planContractVersion: options.planContractVersion,
    policy: PREAUTHORIZATION_POLICY,
    stopBoundary,
    scopeFingerprint: scopeFingerprint({
      journey: cursor.journey,
      method: options.method,
      cursorGeneration: cursor.cursorGeneration,
      activeItem: cursor.activeItem,
      activeItemLevel: cursor.activeItemLevel,
      flowUnit: cursor.navigatorFlowUnit,
      childWorkItems: children,
      planContractVersion: options.planContractVersion,
      stopBoundary,
    }),
    status: "pending",
    reason: null,
  };
}

export interface MismatchInput {
  readonly journey: string;
  readonly method: string;
  readonly flowUnit: string;
  readonly childWorkItems: readonly string[];
  readonly planContractVersion: string;
  readonly unfilledSections?: readonly string[];
}

/**
 * Python `plan_preauthorization_mismatch_reason`: ONE bounded reason, or null.
 *
 * The checks run in Python's order and the FIRST failure wins, because the reason
 * is Navigator-visible: a receipt that is both stale and cross-level reports
 * `cursor_generation_changed`, not `active_item_changed`. The fingerprint is
 * verified last, after the fields it hashes, so a tampered receipt whose fields
 * still agree is caught by the hash rather than by a field comparison.
 */
export function planPreauthorizationMismatchReason(
  cursor: BuilderDeliveryCursor,
  input: MismatchInput,
): string | null {
  const receipt = cursor.planPreauthorization;
  if (receipt === null) return "authorization_missing";
  if (receipt.status !== "pending") return receipt.reason || "authorization_not_pending";

  const expectedChildren = canonicalChildScope(input.childWorkItems);
  const checks: [boolean, string][] = [
    [receipt.journey === input.journey, "journey_changed"],
    [receipt.method === input.method, "method_changed"],
    [receipt.cursorGeneration === cursor.cursorGeneration, "cursor_generation_changed"],
    [receipt.activeItem === cursor.activeItem, "active_item_changed"],
    [receipt.activeItemLevel === cursor.activeItemLevel, "active_item_level_changed"],
    // Python's chained comparison: the receipt, the cursor, and the caller's flow
    // unit must ALL agree, not just the receipt and the caller.
    [
      receipt.flowUnit === cursor.navigatorFlowUnit && cursor.navigatorFlowUnit === input.flowUnit,
      "flow_unit_changed",
    ],
    [sameScope(receipt.childWorkItems, expectedChildren), "child_scope_changed"],
    [receipt.planContractVersion === input.planContractVersion, "plan_contract_changed"],
    [receipt.policy === PREAUTHORIZATION_POLICY, "policy_changed"],
    [receipt.stopBoundary === PREAUTHORIZATION_STOP, "stop_boundary_changed"],
  ];
  for (const [matches, reason] of checks) {
    if (!matches) return reason;
  }

  const expectedFingerprint = scopeFingerprint({
    journey: receipt.journey,
    method: receipt.method,
    cursorGeneration: receipt.cursorGeneration,
    activeItem: receipt.activeItem,
    activeItemLevel: receipt.activeItemLevel,
    flowUnit: receipt.flowUnit,
    childWorkItems: receipt.childWorkItems,
    planContractVersion: receipt.planContractVersion,
    stopBoundary: receipt.stopBoundary,
  });
  if (receipt.scopeFingerprint !== expectedFingerprint) return "scope_fingerprint_changed";
  if ((input.unfilledSections ?? []).length > 0) return "plan_incomplete";
  return null;
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/**
 * Python `invalidate_plan_preauthorization`.
 *
 * Swallows a `DeliveryCursorConflict` and returns the cursor unchanged: this runs
 * on a refusal path, and failing to record WHY authority was refused must not turn
 * a clean refusal into an error.
 */
export function invalidatePlanPreauthorization(
  db: WritableDatabase,
  cursor: BuilderDeliveryCursor,
  reason: string,
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const receipt = cursor.planPreauthorization;
  if (receipt === null || receipt.status !== "pending") return cursor;
  try {
    return setDeliveryCursor(
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
        planPreauthorization: setTo({ ...receipt, status: "invalidated", reason }),
        expectedCursor: cursor,
      },
      deps,
    );
  } catch (error) {
    if (error instanceof DeliveryCursorConflict) return cursor;
    throw error;
  }
}

// `unfilledPlanSectionsFor` and `levelTwoSections` live in `artifacts/scaffoldState.ts`
// since CR112, beside the rule that also recognizes a scaffold's own sentences.
export { unfilledPlanSectionsFor } from "./artifacts/scaffoldState.ts";

import { PLAN_SECTIONS } from "./artifacts/scaffoldSections.ts";
