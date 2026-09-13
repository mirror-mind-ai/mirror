// CV22.DS7.US8 plateau 2 — the Builder delivery cursor.
//
// Port of `src/memory/builder/delivery_cursor.py`. This is the row the whole D2
// decision is about, so the contract is narrower than "behaves the same":
//
//   **TypeScript must write the bytes Python would write for the same state.**
//
// Not as a tidiness preference. `setDeliveryCursor` with an `expectedCursor`
// writes through a compare-and-swap whose WHERE clause matches on STRING
// EQUALITY of the serialized metadata. A cursor stored with different bytes for
// the same state cannot be swapped by the other engine, so a
// `MIRROR_TS_BUILD=0` revert would fail on its first lifecycle write instead of
// falling back cleanly — the revert would corrupt exactly when it is needed.
// Hence `pythonJsonDumps` (Python's `", "`/`": "` separators) rather than
// `JSON.stringify`, `ensure_ascii=False` so `ação` stays raw UTF-8, and the key
// order of Python's `_serialize_cursor` dict reproduced literally.
//
// Python's `object()` sentinels for "argument absent" become a discriminated
// type here. `_KEEP_PREAUTHORIZATION` and `_KEEP_RELEASE_INTENT` distinguish
// three cases that a nullable field cannot: keep what is stored, set a value, or
// explicitly clear it. Collapsing them would silently drop a pending
// authorization receipt on every unrelated cursor write.
//
// Every read is lenient by design. A malformed payload — bad JSON, an array, a
// missing method, a negative generation, a boolean where an int belongs, a
// `delivery_story` receipt with no children — reads as ABSENT rather than
// raising. Validating more strictly turns an old row into a crash; validating
// less turns a corrupt row into authority.

import type { Database, WritableDatabase } from "#db/database.ts";
import {
  compareAndSwapRuntimeSessionMetadata,
  getRuntimeSession,
  upsertRuntimeSession,
} from "#mirror/runtimeSession.ts";
import { pythonJsonDumps } from "#util/pyGenerators.ts";

const CURSOR_SESSION_PREFIX = "__builder_delivery_cursor__:";

/** Python `DeliveryCursorConflict`. */
export class DeliveryCursorConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryCursorConflict";
  }
}

/** Python `PlanPreauthorizationReceipt`. */
export interface PlanPreauthorizationReceipt {
  readonly journey: string;
  readonly method: string;
  readonly cursorGeneration: number;
  readonly activeItem: string;
  readonly activeItemLevel: string;
  readonly flowUnit: string;
  readonly childWorkItems: readonly string[];
  readonly planContractVersion: string;
  readonly policy: string;
  readonly stopBoundary: string;
  readonly scopeFingerprint: string;
  readonly status: string;
  readonly reason: string | null;
}

/** Python `BuilderDeliveryCursor`. */
export interface BuilderDeliveryCursor {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string | null;
  readonly activeItemTitle: string | null;
  readonly activeItemLevel: string | null;
  readonly activeCheckpoint: string | null;
  readonly pendingConfirmation: string | null;
  readonly lastDeliveryEvent: string | null;
  readonly cadenceProfile: string | null;
  readonly cadenceLimits: readonly string[];
  readonly granularityDecision: string | null;
  readonly navigatorFlowUnit: string | null;
  readonly childWorkItems: readonly string[];
  readonly aggregateCheckpointStatus: readonly string[];
  readonly cursorGeneration: number;
  readonly planPreauthorization: PlanPreauthorizationReceipt | null;
  readonly releaseIntentDeliveryStory: string | null;
  readonly releaseIntent: string | null;
}

/**
 * Python's `_KEEP_*` sentinels, as a type.
 *
 * `{ kind: "keep" }` is the absent argument, `{ kind: "set" }` an explicit value
 * including `null`. The distinction is load-bearing: an unrelated write must
 * PRESERVE a pending receipt, while `plan_preauthorization=None` must clear it.
 */
export type Keepable<T> = { readonly kind: "keep" } | { readonly kind: "set"; readonly value: T };

export const KEEP = { kind: "keep" } as const;

export function setTo<T>(value: T): Keepable<T> {
  return { kind: "set", value };
}

const ALLOWED_RELEASE_INTENTS = new Set(["planned", "none", "undecided"]);
const ALLOWED_RECEIPT_STATUSES = new Set(["pending", "consumed", "invalidated"]);

/** Python `_session_id`. */
export function cursorSessionId(journey: string): string {
  return `${CURSOR_SESSION_PREFIX}${journey}`;
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${fieldName} must not be empty`);
  return normalized;
}

/** Python `_normalize_optional`: strip, and an empty result is `None`. */
function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

/** Python `_normalize_optional_tuple`: drop entries that normalize away. */
function normalizeOptionalTuple(values: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const item = normalizeOptional(value);
    if (item !== null) normalized.push(item);
  }
  return normalized;
}

/** Python `_optional_string`: non-strings read as absent. */
function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

/** Python `_optional_string_tuple`: non-lists read as empty; non-strings drop. */
function optionalStringTuple(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) normalized.push(item.trim());
  }
  return normalized;
}

/**
 * Python `_normalize_nonnegative_int`.
 *
 * The `boolean` guard is REDUNDANT in JavaScript and kept deliberately:
 * `Number.isInteger(true)` is already `false`, whereas Python's `True` IS an
 * `int` and needs the explicit `isinstance(value, bool)` check to be rejected.
 * Mutation testing confirmed the redundancy — removing the guard stayed green —
 * so it documents why Python has a check that looks superfluous here, rather
 * than claiming coverage it does not have.
 */
function normalizeNonNegativeInt(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean" || !Number.isInteger(value) || value < 0) {
    throw new Error("cursor_generation must be a non-negative integer");
  }
  return value;
}

/** Python `_optional_nonnegative_int`: anything invalid reads as 0, no throw. */
function optionalNonNegativeInt(value: unknown): number {
  if (typeof value === "boolean" || typeof value !== "number") return 0;
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

/** Python `_normalize_release_intent`: refuses an unknown value. */
function normalizeReleaseIntent(value: string | null): string | null {
  const normalized = normalizeOptional(value);
  if (normalized === null) return null;
  if (!ALLOWED_RELEASE_INTENTS.has(normalized)) {
    throw new Error("release_intent must be planned, none, or undecided");
  }
  return normalized;
}

/** Python `_optional_release_intent`: an unknown value READS as absent. */
function optionalReleaseIntent(value: unknown): string | null {
  const normalized = optionalString(value);
  return normalized !== null && ALLOWED_RELEASE_INTENTS.has(normalized) ? normalized : null;
}

/**
 * Python `_deserialize_preauthorization`: one composite guard, so any single
 * defect drops the whole receipt.
 */
function deserializePreauthorization(value: unknown): PlanPreauthorizationReceipt | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const strings = {
    journey: optionalString(record.journey),
    method: optionalString(record.method),
    activeItem: optionalString(record.active_item),
    activeItemLevel: optionalString(record.active_item_level),
    flowUnit: optionalString(record.flow_unit),
    planContractVersion: optionalString(record.plan_contract_version),
    policy: optionalString(record.policy),
    stopBoundary: optionalString(record.stop_boundary),
    scopeFingerprint: optionalString(record.scope_fingerprint),
  };
  const generation = record.cursor_generation;
  const status = optionalString(record.status) ?? "pending";
  const reason = optionalString(record.reason);
  const children = optionalStringTuple(record.child_work_items);
  const generationInvalid =
    typeof generation === "boolean" ||
    typeof generation !== "number" ||
    !Number.isInteger(generation) ||
    generation < 0;
  if (
    Object.values(strings).some((item) => item === null) ||
    generationInvalid ||
    (strings.flowUnit === "delivery_story" && children.length === 0) ||
    !ALLOWED_RECEIPT_STATUSES.has(status)
  ) {
    return null;
  }
  return {
    journey: strings.journey ?? "",
    method: strings.method ?? "",
    cursorGeneration: generation as number,
    activeItem: strings.activeItem ?? "",
    activeItemLevel: strings.activeItemLevel ?? "",
    flowUnit: strings.flowUnit ?? "",
    childWorkItems: children,
    planContractVersion: strings.planContractVersion ?? "",
    policy: strings.policy ?? "",
    stopBoundary: strings.stopBoundary ?? "",
    scopeFingerprint: strings.scopeFingerprint ?? "",
    status,
    reason,
  };
}

/**
 * Python `_serialize_cursor`. The key ORDER is the byte contract, so it is
 * written out literally rather than derived from the interface.
 */
export function serializeCursor(cursor: BuilderDeliveryCursor): string {
  return pythonJsonDumps({
    method: cursor.method,
    active_item: cursor.activeItem,
    active_item_title: cursor.activeItemTitle,
    active_item_level: cursor.activeItemLevel,
    active_checkpoint: cursor.activeCheckpoint,
    pending_confirmation: cursor.pendingConfirmation,
    last_delivery_event: cursor.lastDeliveryEvent,
    cadence_profile: cursor.cadenceProfile,
    cadence_limits: cursor.cadenceLimits,
    granularity_decision: cursor.granularityDecision,
    navigator_flow_unit: cursor.navigatorFlowUnit,
    child_work_items: cursor.childWorkItems,
    aggregate_checkpoint_status: cursor.aggregateCheckpointStatus,
    cursor_generation: cursor.cursorGeneration,
    plan_preauthorization:
      cursor.planPreauthorization === null ? null : serializeReceipt(cursor.planPreauthorization),
    release_intent_delivery_story: cursor.releaseIntentDeliveryStory,
    release_intent: cursor.releaseIntent,
  });
}

/** Python's `asdict(receipt)` — dataclass field order. */
function serializeReceipt(receipt: PlanPreauthorizationReceipt): Record<string, unknown> {
  return {
    journey: receipt.journey,
    method: receipt.method,
    cursor_generation: receipt.cursorGeneration,
    active_item: receipt.activeItem,
    active_item_level: receipt.activeItemLevel,
    flow_unit: receipt.flowUnit,
    child_work_items: receipt.childWorkItems,
    plan_contract_version: receipt.planContractVersion,
    policy: receipt.policy,
    stop_boundary: receipt.stopBoundary,
    scope_fingerprint: receipt.scopeFingerprint,
    status: receipt.status,
    reason: receipt.reason,
  };
}

/** Python `get_delivery_cursor`. */
export function getDeliveryCursor(db: Database, journey: string): BuilderDeliveryCursor | null {
  const normalizedJourney = normalizeRequired(journey, "journey");
  const session = getRuntimeSession(db, cursorSessionId(normalizedJourney));
  if (!session?.active || !session.metadata) return null;
  let data: unknown;
  try {
    data = JSON.parse(session.metadata);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const method = optionalString(record.method);
  if (method === null) return null;
  return {
    journey: normalizedJourney,
    method,
    activeItem: optionalString(record.active_item),
    activeItemTitle: optionalString(record.active_item_title),
    activeItemLevel: optionalString(record.active_item_level),
    activeCheckpoint: optionalString(record.active_checkpoint),
    pendingConfirmation: optionalString(record.pending_confirmation),
    lastDeliveryEvent: optionalString(record.last_delivery_event),
    cadenceProfile: optionalString(record.cadence_profile),
    cadenceLimits: optionalStringTuple(record.cadence_limits),
    granularityDecision: optionalString(record.granularity_decision),
    navigatorFlowUnit: optionalString(record.navigator_flow_unit),
    childWorkItems: optionalStringTuple(record.child_work_items),
    aggregateCheckpointStatus: optionalStringTuple(record.aggregate_checkpoint_status),
    cursorGeneration: optionalNonNegativeInt(record.cursor_generation),
    planPreauthorization: deserializePreauthorization(record.plan_preauthorization),
    releaseIntentDeliveryStory: optionalString(record.release_intent_delivery_story),
    releaseIntent: optionalReleaseIntent(record.release_intent),
  };
}

export interface SetDeliveryCursorOptions {
  readonly journey: string;
  readonly method: string;
  readonly activeItem?: string | null;
  readonly activeItemTitle?: string | null;
  readonly activeItemLevel?: string | null;
  readonly activeCheckpoint?: string | null;
  readonly pendingConfirmation?: string | null;
  readonly lastDeliveryEvent?: string | null;
  readonly cadenceProfile?: string | null;
  readonly cadenceLimits?: readonly string[];
  readonly granularityDecision?: string | null;
  readonly navigatorFlowUnit?: string | null;
  readonly childWorkItems?: readonly string[];
  readonly aggregateCheckpointStatus?: readonly string[];
  readonly cursorGeneration?: number | null;
  readonly planPreauthorization?: Keepable<PlanPreauthorizationReceipt | null>;
  readonly expectedCursor?: BuilderDeliveryCursor | null;
  readonly releaseIntentDeliveryStory?: Keepable<string | null>;
  readonly releaseIntent?: Keepable<string | null>;
  readonly refreshProjection?: boolean;
}

export interface CursorWriteDeps {
  readonly nowIso: () => string;
  /** US7's seam, reused unchanged. Absent means no projection is requested. */
  readonly requestProjectionRefresh?: (journey: string) => void;
}

/**
 * Python `set_delivery_cursor`.
 *
 * Two subtleties a port loses:
 *
 *   * `cursor_generation=None` with an EXISTING row carries the stored
 *     generation forward; with no row it normalizes to 0. So an ordinary write
 *     never resets the generation, and only an explicit value bumps it.
 *   * receipt invalidation runs ONLY when the receipt argument was absent. A
 *     write that sets the receipt explicitly is trusted as-is, which is how a
 *     freshly recorded receipt survives the very write that records it.
 */
export function setDeliveryCursor(
  db: WritableDatabase,
  options: SetDeliveryCursorOptions,
  deps: CursorWriteDeps,
): BuilderDeliveryCursor {
  const normalizedJourney = normalizeRequired(options.journey, "journey");
  const normalizedMethod = normalizeRequired(options.method, "method");
  const previous = getDeliveryCursor(db, normalizedJourney);

  const generationGiven =
    options.cursorGeneration !== undefined && options.cursorGeneration !== null;
  const resolvedGeneration =
    !generationGiven && previous !== null
      ? previous.cursorGeneration
      : normalizeNonNegativeInt(options.cursorGeneration ?? null);

  const receiptArgument = options.planPreauthorization ?? KEEP;
  const receiptWasExplicit = receiptArgument.kind === "set";
  const resolvedReceipt = receiptWasExplicit
    ? receiptArgument.value
    : (previous?.planPreauthorization ?? null);

  const releaseStoryArgument = options.releaseIntentDeliveryStory ?? KEEP;
  const resolvedReleaseStory =
    releaseStoryArgument.kind === "set"
      ? releaseStoryArgument.value
      : (previous?.releaseIntentDeliveryStory ?? null);

  const releaseIntentArgument = options.releaseIntent ?? KEEP;
  const resolvedReleaseIntent =
    releaseIntentArgument.kind === "set"
      ? releaseIntentArgument.value
      : (previous?.releaseIntent ?? null);

  let cursor: BuilderDeliveryCursor = {
    journey: normalizedJourney,
    method: normalizedMethod,
    activeItem: normalizeOptional(options.activeItem),
    activeItemTitle: normalizeOptional(options.activeItemTitle),
    activeItemLevel: normalizeOptional(options.activeItemLevel),
    activeCheckpoint: normalizeOptional(options.activeCheckpoint),
    pendingConfirmation: normalizeOptional(options.pendingConfirmation),
    lastDeliveryEvent: normalizeOptional(options.lastDeliveryEvent),
    cadenceProfile: normalizeOptional(options.cadenceProfile),
    cadenceLimits: normalizeOptionalTuple(options.cadenceLimits),
    granularityDecision: normalizeOptional(options.granularityDecision),
    navigatorFlowUnit: normalizeOptional(options.navigatorFlowUnit),
    childWorkItems: normalizeOptionalTuple(options.childWorkItems),
    aggregateCheckpointStatus: normalizeOptionalTuple(options.aggregateCheckpointStatus),
    cursorGeneration: resolvedGeneration,
    planPreauthorization: resolvedReceipt,
    releaseIntentDeliveryStory: normalizeOptional(resolvedReleaseStory),
    releaseIntent: normalizeReleaseIntent(resolvedReleaseIntent),
  };

  if (!receiptWasExplicit) {
    cursor = {
      ...cursor,
      planPreauthorization: invalidateForCoordinateChange(previous, cursor),
    };
  }

  const metadata = serializeCursor(cursor);
  const now = deps.nowIso();

  if (options.expectedCursor !== undefined && options.expectedCursor !== null) {
    if (options.expectedCursor.journey !== normalizedJourney) {
      throw new Error("expected cursor journey does not match");
    }
    const swapped = compareAndSwapRuntimeSessionMetadata(
      db,
      cursorSessionId(normalizedJourney),
      { expectedMetadata: serializeCursor(options.expectedCursor), metadata },
      now,
    );
    if (!swapped) {
      throw new DeliveryCursorConflict("delivery cursor changed before atomic update");
    }
  } else {
    upsertRuntimeSession(
      db,
      cursorSessionId(normalizedJourney),
      {
        interface: "builder_delivery_cursor",
        journey: normalizedJourney,
        active: true,
        metadata,
      },
      now,
    );
  }

  const refresh = options.refreshProjection ?? true;
  if (refresh && !projectedWorkEqual(projectedActiveWork(previous), projectedActiveWork(cursor))) {
    deps.requestProjectionRefresh?.(normalizedJourney);
  }
  return cursor;
}

/** Python `clear_delivery_cursor`. */
export function clearDeliveryCursor(
  db: WritableDatabase,
  journey: string,
  deps: CursorWriteDeps,
): void {
  const normalizedJourney = normalizeRequired(journey, "journey");
  const previous = getDeliveryCursor(db, normalizedJourney);
  upsertRuntimeSession(
    db,
    cursorSessionId(normalizedJourney),
    {
      interface: "builder_delivery_cursor",
      journey: normalizedJourney,
      active: false,
      metadata: null,
    },
    deps.nowIso(),
  );
  if (projectedActiveWork(previous) !== null) {
    deps.requestProjectionRefresh?.(normalizedJourney);
  }
}

/**
 * Python `_projected_active_work`: the four fields the Journey projection
 * actually shows. `None` when there is no active item, so a cursor without one
 * never requests a refresh — and note the `or "active"` default, which makes a
 * missing `last_delivery_event` indistinguishable from the literal `"active"`.
 */
export function projectedActiveWork(
  cursor: BuilderDeliveryCursor | null,
): readonly [string, string | null, string | null, string] | null {
  if (cursor === null || cursor.activeItem === null) return null;
  return [
    cursor.activeItem,
    cursor.activeCheckpoint,
    cursor.pendingConfirmation,
    cursor.lastDeliveryEvent || "active",
  ];
}

function projectedWorkEqual(
  left: readonly (string | null)[] | null,
  right: readonly (string | null)[] | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Python `_invalidate_for_coordinate_change`: a PENDING receipt is invalidated
 * with the FIRST matching reason, in Python's order. A consumed or invalidated
 * receipt is left alone, and child scope compares as a SET — so reordering
 * children is not a change, while adding or removing one is.
 */
export function invalidateForCoordinateChange(
  previous: BuilderDeliveryCursor | null,
  current: BuilderDeliveryCursor,
): PlanPreauthorizationReceipt | null {
  const receipt = current.planPreauthorization;
  if (previous === null || receipt === null || receipt.status !== "pending") return receipt;
  let reason: string | null = null;
  if (previous.cursorGeneration !== current.cursorGeneration) {
    reason = "cursor_generation_changed";
  } else if (previous.activeItem !== current.activeItem) {
    reason = "active_item_changed";
  } else if (previous.activeItemLevel !== current.activeItemLevel) {
    reason = "active_item_level_changed";
  } else if (previous.navigatorFlowUnit !== current.navigatorFlowUnit) {
    reason = "flow_unit_changed";
  } else if (!sameSet(previous.childWorkItems, current.childWorkItems)) {
    reason = "child_scope_changed";
  }
  if (reason === null) return receipt;
  return { ...receipt, status: "invalidated", reason };
}

/** Python `set(a) != set(b)`. */
function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}
