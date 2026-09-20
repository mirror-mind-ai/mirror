// CV22.DS7.US8 plateau 4 — story closure: Validate, Debt Review, Coherence, Done.
//
// Port of the second half of `src/memory/builder/lifecycle.py`.
//
// The four verbs share one shape, and it is the shape a port gets wrong: each
// computes a MISSING-EVIDENCE tuple, and that tuple decides three cursor fields at
// once — `activeCheckpoint`, `pendingConfirmation`, and `lastDeliveryEvent`. So
// "incomplete" is not an error and not a different surface; it is the same surface
// over a different persisted state. A port can render the right card and write the
// wrong three fields, which is why the corpus grades every branch as a sequence.
//
// Two of the four allow EXACT-STATE re-entry to answer their own pending
// confirmation — Review for `navigator_debt_decision`, Coherence for
// `navigator_coherence` — because without it `--decision pending` deadlocks the
// lifecycle: every verb refuses while the confirmation it would resolve stays
// pending. That was found live on another project, not reasoned about. Done allows no
// re-entry at all and refuses any pending confirmation its predecessors left behind.
//
// Until CV22.DS10.TS1 all four ordered a Journey projection refresh after their
// artifact existed. The projection subsystem retired with the Python core, so the
// ordering dance is gone and the cursor write is the whole write.
//
// They live in one module rather than four because they are one state machine over
// one cursor, sharing the missing-evidence idiom and the guard vocabulary. Splitting
// them would duplicate the shared normalizers without separating any concern.

import type { WritableDatabase } from "#db/database.ts";
import { pyStrip, sortByCodePoint } from "#util/pythonText.ts";
import {
  renderCoherenceArtifact,
  renderDoneArtifact,
  renderReviewArtifact,
  renderValidationArtifact,
  writeClosureArtifact,
} from "./artifacts/closureArtifacts.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import { normalizeRequired } from "./cursorTransitions.ts";
import {
  type BuilderDeliveryCursor,
  type CursorWriteDeps,
  getDeliveryCursor,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import { renderLifecycleRibbon } from "./lifecycleRibbon.ts";
import type { ContractDefinition, MethodDefinition } from "./methodDefinition.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `_contract_for`. */
function contractFor(method: MethodDefinition, contractId: string): ContractDefinition {
  const contract = method.contracts.find((candidate) => candidate.id === contractId);
  if (contract === undefined) {
    throw new Error(`method ${method.id} is missing contract ${contractId}`);
  }
  return contract;
}

/**
 * Python `_normalize_validation_choice`.
 *
 * Lowercases and maps `-` to `_` before the membership test, and the refusal lists
 * the allowed values SORTED — so the message is stable regardless of the order the
 * call site declared them in.
 */
function normalizeChoice(value: string, field: string, allowed: readonly string[]): string {
  const normalized =
    typeof value === "string" ? pyStrip(value).toLowerCase().replaceAll("-", "_") : "";
  if (!allowed.includes(normalized)) {
    throw new Error(`${field} must be one of ${sortByCodePoint([...allowed]).join(", ")}`);
  }
  return normalized;
}

/** Python's `tuple(x.strip() for x in items if x.strip())`. */
function normalizedList(items: readonly string[]): string[] {
  return items.map((item) => pyStrip(item)).filter((item) => item !== "");
}

/** Python's `(value or default).strip()`. */
function textOr(value: string | null | undefined, fallback: string): string {
  return pyStrip(value || fallback);
}

/** Python's `x.strip() if x and x.strip() else None`. */
function optionalText(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = pyStrip(value);
  return stripped || null;
}

// --- Validation ------------------------------------------------------------

export interface BuilderValidationReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly automatedChecks: readonly string[];
  readonly checksStatus: string;
  readonly e2eDecision: string;
  readonly e2eEvidence: string | null;
  readonly navigatorValidationRoute: string;
  readonly navigatorAccepted: boolean;
  readonly expectedObservation: string;
  readonly passCondition: string;
  readonly failCondition: string;
  readonly missingEvidence: readonly string[];
  readonly validationContract: ContractDefinition;
  readonly cursor: BuilderDeliveryCursor;
  readonly validationArtifactPath: string | null;
  readonly nextEvent: string;
}

/**
 * Python `_validation_missing_evidence`.
 *
 * Order is behavior: the tuple is rendered as a list, so a port that reorders these
 * produces a different surface. Note the `elif` on acceptance — a MISSING route is
 * reported instead of an unaccepted one, never both.
 */
function validationMissingEvidence(input: {
  checks: readonly string[];
  checksStatus: string;
  e2eDecision: string;
  e2eEvidence: string | null | undefined;
  navigatorValidationRoute: string;
  navigatorAccepted: boolean;
}): string[] {
  const missing: string[] = [];
  if (input.checks.length === 0) missing.push("automated checks are not declared");
  if (input.checksStatus !== "passed") {
    missing.push(`automated checks status is ${input.checksStatus}`);
  }
  const evidence = input.e2eEvidence && pyStrip(input.e2eEvidence) ? input.e2eEvidence : null;
  if (input.e2eDecision === "required" && evidence === null) {
    missing.push("required E2E evidence is missing");
  }
  if (input.e2eDecision === "skipped" && evidence === null) {
    missing.push("skipped E2E requires an explicit reason");
  }
  if (!pyStrip(input.navigatorValidationRoute)) {
    missing.push("Navigator validation route is missing");
  } else if (!input.navigatorAccepted) {
    missing.push("Navigator validation has not been accepted");
  }
  return missing;
}

export interface ValidateOptions {
  readonly journey: string;
  readonly method: MethodDefinition;
  readonly automatedChecks?: readonly string[];
  readonly checksStatus?: string;
  readonly e2eDecision?: string;
  readonly e2eEvidence?: string | null;
  readonly navigatorValidationRoute?: string | null;
  readonly navigatorAccepted?: boolean;
  readonly expectedObservation?: string | null;
  readonly passCondition?: string | null;
  readonly failCondition?: string | null;
  readonly implementationComplete?: boolean;
  readonly validationArtifactPath?: string | null;
}

const PLAN_EVENTS = new Set(["plan_approved", "delivery_story_plan_approved"]);

/** Python `validate_lifecycle_item`. */
export function validateLifecycleItem(
  db: WritableDatabase,
  options: ValidateOptions,
  deps: CursorWriteDeps,
): BuilderValidationReport {
  const journey = normalizeRequired(options.journey, "journey");
  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before validation");
  if (!existing.activeItem) throw new Error("active item is required before validation");
  if (existing.pendingConfirmation && existing.pendingConfirmation !== "navigator_validation") {
    throw new Error(`Validation is blocked: pending confirmation ${existing.pendingConfirmation}.`);
  }
  const navigatorAccepted = options.navigatorAccepted ?? false;
  if (existing.pendingConfirmation === "navigator_validation" && !navigatorAccepted) {
    throw new Error("Validation is blocked: pending Navigator validation acceptance.");
  }
  const lastEvent = existing.lastDeliveryEvent ?? "";
  if (
    !(
      PLAN_EVENTS.has(lastEvent) ||
      lastEvent === "implementation_complete" ||
      lastEvent === "validate"
    )
  ) {
    throw new Error("Validation requires an approved Plan and completed implementation");
  }
  if (PLAN_EVENTS.has(lastEvent) && !(options.implementationComplete ?? false)) {
    throw new Error("Validation requires implementation completion evidence");
  }

  const checks = normalizedList(options.automatedChecks ?? []);
  const checksStatus = normalizeChoice(options.checksStatus ?? "not_run", "checks_status", [
    "passed",
    "failed",
    "not_run",
  ]);
  const e2eDecision = normalizeChoice(options.e2eDecision ?? "not_required", "e2e_decision", [
    "required",
    "not_required",
    "waived",
    "skipped",
  ]);
  const route = textOr(
    options.navigatorValidationRoute,
    "Navigator validates the behavior described by the Plan.",
  );
  const observation = textOr(
    options.expectedObservation,
    "Expected behavior from the Plan is observable.",
  );
  const passText = textOr(options.passCondition, "Navigator accepts the observed behavior.");
  const failText = textOr(options.failCondition, "Navigator cannot observe the planned behavior.");
  const missing = validationMissingEvidence({
    checks,
    checksStatus,
    e2eDecision,
    e2eEvidence: options.e2eEvidence,
    navigatorValidationRoute: route,
    navigatorAccepted,
  });

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method: options.method.id,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: missing.length > 0 ? "after_validation" : null,
      pendingConfirmation: missing.length > 0 ? "navigator_validation" : null,
      lastDeliveryEvent: missing.length > 0 ? "validate" : "validation_passed",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  const report: BuilderValidationReport = {
    journey,
    method: options.method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    automatedChecks: checks,
    checksStatus,
    e2eDecision,
    e2eEvidence: optionalText(options.e2eEvidence),
    navigatorValidationRoute: route,
    navigatorAccepted,
    expectedObservation: observation,
    passCondition: passText,
    failCondition: failText,
    missingEvidence: missing,
    validationContract: contractFor(options.method, "validation_contract"),
    cursor,
    validationArtifactPath: options.validationArtifactPath ?? null,
    nextEvent: "debt_review",
  };
  if (report.validationArtifactPath !== null) {
    writeClosureArtifact(report.validationArtifactPath, renderValidationArtifact(report));
  }
  return report;
}

/** Python `render_validation_checkpoint`. */
export function renderValidationCheckpoint(report: BuilderValidationReport): string {
  const blocked = report.missingEvidence.length > 0;
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("validate"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧪■  VALIDATION CHECKPOINT                      │",
    "│                                                        │",
    cardText("active item"),
    cardText(report.activeItem),
    "│                                                        │",
    cardText("status"),
    cardText(blocked ? "pending_navigator_validation" : "passed"),
    "│                                                        │",
    cardText("automated checks"),
    ...cardPrefixed(
      report.automatedChecks.length > 0
        ? report.automatedChecks
        : ["No automated checks declared."],
      "✓",
    ),
    "│                                                        │",
    cardText("checks status"),
    cardText(report.checksStatus),
    "│                                                        │",
    cardText("e2e decision"),
    cardText(report.e2eDecision),
    "│                                                        │",
    cardText("e2e evidence"),
    ...cardWrapped(report.e2eEvidence || "none"),
    "│                                                        │",
    cardText("navigator validation route"),
    ...cardWrapped(report.navigatorValidationRoute),
    "│                                                        │",
    cardText("navigator accepted"),
    cardText(report.navigatorAccepted ? "yes" : "no"),
    "│                                                        │",
    cardText("expected observation"),
    ...cardWrapped(report.expectedObservation),
    "│                                                        │",
    cardText("pass condition"),
    ...cardWrapped(report.passCondition),
    "│                                                        │",
    cardText("fail condition"),
    ...cardWrapped(report.failCondition),
    "│                                                        │",
    cardText("missing evidence"),
    ...cardPrefixed(blocked ? report.missingEvidence : ["none"], blocked ? "✕" : "✓"),
    "│                                                        │",
    cardText("validation contract"),
    ...cardPrefixed(report.validationContract.rules, "✓"),
    "│                                                        │",
    cardText("validation artifact"),
    ...cardWrapped(report.validationArtifactPath ?? "not materialized"),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped(
      blocked
        ? "Do not move past Validation until missing evidence is resolved."
        : "Validation is complete; Builder may proceed to Debt Review.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("validation_checkpoint", body);
}

// --- Debt Review -----------------------------------------------------------

export interface BuilderReviewReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly debtFindings: readonly string[];
  readonly debtDecision: string;
  readonly deferReason: string | null;
  readonly revisitTrigger: string | null;
  readonly missingDecision: readonly string[];
  readonly debtReviewContract: ContractDefinition;
  readonly cursor: BuilderDeliveryCursor;
  readonly reviewArtifactPath: string | null;
  readonly nextEvent: string;
}

/** Python `_review_missing_decision`. */
function reviewMissingDecision(input: {
  debtDecision: string;
  deferReason: string | null | undefined;
  revisitTrigger: string | null | undefined;
}): string[] {
  const missing: string[] = [];
  if (input.debtDecision === "pending") missing.push("Navigator debt decision is required");
  if (input.debtDecision === "defer") {
    if (!(input.deferReason && pyStrip(input.deferReason))) {
      missing.push("deferred debt requires a reason");
    }
    if (!(input.revisitTrigger && pyStrip(input.revisitTrigger))) {
      missing.push("deferred debt requires a revisit trigger");
    }
  }
  // `pay_now` is never complete here: it must route through a Refactor loop first,
  // so Debt Review cannot be the thing that closes it.
  if (input.debtDecision === "pay_now") {
    missing.push("pay-now debt must route through Refactor before Done");
  }
  return missing;
}

export interface ReviewOptions {
  readonly journey: string;
  readonly method: MethodDefinition;
  readonly debtFindings?: readonly string[];
  readonly debtDecision?: string;
  readonly deferReason?: string | null;
  readonly revisitTrigger?: string | null;
  readonly reviewArtifactPath?: string | null;
}

/** Python `review_lifecycle_item`. */
export function reviewLifecycleItem(
  db: WritableDatabase,
  options: ReviewOptions,
  deps: CursorWriteDeps,
): BuilderReviewReport {
  const journey = normalizeRequired(options.journey, "journey");
  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before review");
  if (!existing.activeItem) throw new Error("active item is required before review");

  const reentering =
    existing.pendingConfirmation === "navigator_debt_decision" &&
    existing.lastDeliveryEvent === "review";
  if (existing.pendingConfirmation && !reentering) {
    throw new Error(`Review is blocked: pending confirmation ${existing.pendingConfirmation}.`);
  }
  if (existing.lastDeliveryEvent !== "validation_passed" && !reentering) {
    throw new Error("Debt Review requires passed Validation");
  }

  const decision = normalizeChoice(options.debtDecision ?? "pending", "debt_decision", [
    "pending",
    "no_action",
    "defer",
    "pay_now",
  ]);
  const findings = normalizedList(options.debtFindings ?? []);
  const missing = reviewMissingDecision({
    debtDecision: decision,
    deferReason: options.deferReason,
    revisitTrigger: options.revisitTrigger,
  });

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method: options.method.id,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: missing.length > 0 ? "review_decision" : null,
      pendingConfirmation: missing.length > 0 ? "navigator_debt_decision" : null,
      lastDeliveryEvent: missing.length > 0 ? "review" : "review_complete",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  const report: BuilderReviewReport = {
    journey,
    method: options.method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    debtFindings: findings,
    debtDecision: decision,
    deferReason: optionalText(options.deferReason),
    revisitTrigger: optionalText(options.revisitTrigger),
    missingDecision: missing,
    debtReviewContract: contractFor(options.method, "debt_review_contract"),
    cursor,
    reviewArtifactPath: options.reviewArtifactPath ?? null,
    nextEvent: "coherence",
  };
  if (report.reviewArtifactPath !== null) {
    writeClosureArtifact(report.reviewArtifactPath, renderReviewArtifact(report));
  }
  return report;
}

/** Python `render_review_checkpoint`. */
export function renderReviewCheckpoint(report: BuilderReviewReport): string {
  const blocked = report.missingDecision.length > 0;
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("debt_review"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🔎■  DEBT REVIEW CHECKPOINT                     │",
    "│                                                        │",
    cardText("active item"),
    cardText(report.activeItem),
    "│                                                        │",
    cardText("status"),
    cardText(blocked ? "pending_debt_decision" : "reviewed"),
    "│                                                        │",
    cardText("debt findings"),
    ...cardPrefixed(
      report.debtFindings.length > 0 ? report.debtFindings : ["No debt findings declared."],
      "△",
    ),
    "│                                                        │",
    cardText("debt decision"),
    cardText(report.debtDecision),
    "│                                                        │",
    cardText("defer reason"),
    ...cardWrapped(report.deferReason || "none"),
    "│                                                        │",
    cardText("revisit trigger"),
    ...cardWrapped(report.revisitTrigger || "none"),
    "│                                                        │",
    cardText("missing decision"),
    ...cardPrefixed(blocked ? report.missingDecision : ["none"], blocked ? "✕" : "✓"),
    "│                                                        │",
    cardText("debt review contract"),
    ...cardPrefixed(report.debtReviewContract.rules, "✓"),
    "│                                                        │",
    cardText("review artifact"),
    ...cardWrapped(report.reviewArtifactPath ?? "not materialized"),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped(
      blocked
        ? "Do not move past Debt Review until the Navigator debt decision is resolved."
        : "Debt Review is complete; Builder may proceed to Done.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("debt_review_checkpoint", body);
}

// --- Coherence -------------------------------------------------------------

export interface BuilderCoherenceReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly processAlignment: string;
  readonly projectAlignment: string;
  readonly productAlignment: string;
  readonly localDifferences: readonly string[];
  readonly missingCoherence: readonly string[];
  readonly coherenceContract: ContractDefinition;
  readonly cursor: BuilderDeliveryCursor;
  readonly coherenceArtifactPath: string | null;
  readonly nextEvent: string;
}

export interface CoherenceOptions {
  readonly journey: string;
  readonly method: MethodDefinition;
  readonly processAlignment?: string | null;
  readonly projectAlignment?: string | null;
  readonly productAlignment?: string | null;
  readonly localDifferences?: readonly string[];
  readonly coherenceArtifactPath?: string | null;
}

/** Python `coherence_lifecycle_item`. */
export function coherenceLifecycleItem(
  db: WritableDatabase,
  options: CoherenceOptions,
  deps: CursorWriteDeps,
): BuilderCoherenceReport {
  const journey = normalizeRequired(options.journey, "journey");
  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before coherence");
  if (!existing.activeItem) throw new Error("active item is required before coherence");

  const reentering =
    existing.pendingConfirmation === "navigator_coherence" &&
    existing.lastDeliveryEvent === "coherence";
  if (existing.pendingConfirmation && !reentering) {
    throw new Error(`Coherence is blocked: pending confirmation ${existing.pendingConfirmation}.`);
  }
  if (existing.lastDeliveryEvent !== "review_complete" && !reentering) {
    throw new Error("Coherence requires completed Debt Review");
  }

  const process = textOr(
    options.processAlignment,
    "Process evidence is aligned with the Ariad lifecycle.",
  );
  const project = textOr(
    options.projectAlignment,
    "Project docs and artifacts reflect the validated change.",
  );
  const product = textOr(
    options.productAlignment,
    "Product behavior matches the accepted validation evidence.",
  );
  const differences = normalizedList(options.localDifferences ?? []);
  // Python `_coherence_missing`: a blank string defaults ABOVE, so the only way to
  // reach these is an argument that was whitespace before the default could apply.
  const missing: string[] = [];
  if (!pyStrip(process)) missing.push("process alignment is missing");
  if (!pyStrip(project)) missing.push("project alignment is missing");
  if (!pyStrip(product)) missing.push("product alignment is missing");

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method: options.method.id,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: missing.length > 0 ? "coherence" : null,
      pendingConfirmation: missing.length > 0 ? "navigator_coherence" : null,
      lastDeliveryEvent: missing.length > 0 ? "coherence" : "coherence_complete",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  const report: BuilderCoherenceReport = {
    journey,
    method: options.method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    processAlignment: process,
    projectAlignment: project,
    productAlignment: product,
    localDifferences: differences,
    missingCoherence: missing,
    coherenceContract: contractFor(options.method, "coherence_contract"),
    cursor,
    coherenceArtifactPath: options.coherenceArtifactPath ?? null,
    nextEvent: "done",
  };
  if (report.coherenceArtifactPath !== null) {
    writeClosureArtifact(report.coherenceArtifactPath, renderCoherenceArtifact(report));
  }
  return report;
}

/** Python `render_coherence_checkpoint`: note the ribbon says `done`, not `coherence`. */
export function renderCoherenceCheckpoint(report: BuilderCoherenceReport): string {
  const blocked = report.missingCoherence.length > 0;
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("done"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        ◉■  COHERENCE CHECKPOINT                        │",
    "│                                                        │",
    cardText("active item"),
    cardText(report.activeItem),
    "│                                                        │",
    cardText("status"),
    cardText(blocked ? "pending_coherence" : "coherent"),
    "│                                                        │",
    cardText("process alignment"),
    ...cardWrapped(report.processAlignment),
    "│                                                        │",
    cardText("project alignment"),
    ...cardWrapped(report.projectAlignment),
    "│                                                        │",
    cardText("product alignment"),
    ...cardWrapped(report.productAlignment),
    "│                                                        │",
    cardText("local guide differences"),
    ...cardPrefixed(report.localDifferences.length > 0 ? report.localDifferences : ["none"], "△"),
    "│                                                        │",
    cardText("missing coherence"),
    ...cardPrefixed(blocked ? report.missingCoherence : ["none"], blocked ? "✕" : "✓"),
    "│                                                        │",
    cardText("coherence contract"),
    ...cardPrefixed(report.coherenceContract.rules, "✓"),
    "│                                                        │",
    cardText("coherence artifact"),
    ...cardWrapped(report.coherenceArtifactPath ?? "not materialized"),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped(
      blocked
        ? "Do not move to Done until coherence gaps are resolved."
        : "Coherence is complete; Builder may proceed to Done.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("coherence_checkpoint", body);
}

// --- Done ------------------------------------------------------------------

export interface BuilderDoneReport {
  readonly journey: string;
  readonly method: string;
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly historyAction: string;
  readonly roadmapUpdate: string;
  readonly nextRecommendation: string;
  readonly missingDone: readonly string[];
  readonly doneContract: ContractDefinition;
  readonly cursor: BuilderDeliveryCursor;
  readonly doneArtifactPath: string | null;
}

export interface DoneOptions {
  readonly journey: string;
  readonly method: MethodDefinition;
  readonly historyAction?: string | null;
  readonly roadmapUpdate?: string | null;
  readonly nextRecommendation?: string | null;
  readonly doneArtifactPath?: string | null;
}

/** Python `done_lifecycle_item`. */
export function doneLifecycleItem(
  db: WritableDatabase,
  options: DoneOptions,
  deps: CursorWriteDeps,
): BuilderDoneReport {
  const journey = normalizeRequired(options.journey, "journey");
  const existing = getDeliveryCursor(db, journey);
  if (existing === null) throw new Error("delivery cursor is required before done");
  if (!existing.activeItem) throw new Error("active item is required before done");
  // No re-entry: Done refuses every pending confirmation, including the ones its own
  // predecessors left behind.
  if (existing.pendingConfirmation) {
    throw new Error(`Done is blocked: pending confirmation ${existing.pendingConfirmation}.`);
  }
  // `review_complete` is accepted DIRECTLY: Coherence is an option, not a
  // precondition. A port that requires `coherence_complete` blocks a legal closure.
  if (
    existing.lastDeliveryEvent !== "review_complete" &&
    existing.lastDeliveryEvent !== "coherence_complete"
  ) {
    throw new Error("Done requires completed Debt Review");
  }

  const history = textOr(
    options.historyAction,
    "History action recorded according to project policy.",
  );
  const roadmap = textOr(options.roadmapUpdate, "Roadmap/story package reflects the closed story.");
  const nextStep = textOr(
    options.nextRecommendation,
    "Inspect pull candidates for the next Ariad movement.",
  );
  const missing: string[] = [];
  if (!pyStrip(history)) missing.push("history action is missing");
  if (!pyStrip(roadmap)) missing.push("roadmap update is missing");
  if (!pyStrip(nextStep)) missing.push("next recommendation is missing");

  const cursor = setDeliveryCursor(
    db,
    {
      journey,
      method: options.method.id,
      activeItem: existing.activeItem,
      activeItemTitle: existing.activeItemTitle,
      activeItemLevel: existing.activeItemLevel,
      activeCheckpoint: missing.length > 0 ? "done" : null,
      pendingConfirmation: missing.length > 0 ? "navigator_done" : null,
      lastDeliveryEvent: missing.length > 0 ? "done" : "done_complete",
      cadenceProfile: existing.cadenceProfile,
      cadenceLimits: existing.cadenceLimits,
      granularityDecision: existing.granularityDecision,
      navigatorFlowUnit: existing.navigatorFlowUnit,
      childWorkItems: existing.childWorkItems,
      aggregateCheckpointStatus: existing.aggregateCheckpointStatus,
    },
    deps,
  );

  const report: BuilderDoneReport = {
    journey,
    method: options.method.id,
    activeItem: existing.activeItem,
    activeItemTitle: existing.activeItemTitle,
    historyAction: history,
    roadmapUpdate: roadmap,
    nextRecommendation: nextStep,
    missingDone: missing,
    doneContract: contractFor(options.method, "done_contract"),
    cursor,
    doneArtifactPath: options.doneArtifactPath ?? null,
  };
  if (report.doneArtifactPath !== null) {
    writeClosureArtifact(report.doneArtifactPath, renderDoneArtifact(report));
  }
  return report;
}

/** Python `render_done_checkpoint`. */
export function renderDoneCheckpoint(report: BuilderDoneReport): string {
  const blocked = report.missingDone.length > 0;
  const body = `${[
    "Delivery",
    renderLifecycleRibbon("done"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🟩■  DONE CHECKPOINT                             │",
    "│                                                        │",
    cardText("active item"),
    cardText(report.activeItem),
    "│                                                        │",
    cardText("status"),
    cardText(blocked ? "pending_done" : "done"),
    "│                                                        │",
    cardText("history action"),
    ...cardWrapped(report.historyAction),
    "│                                                        │",
    cardText("roadmap update"),
    ...cardWrapped(report.roadmapUpdate),
    "│                                                        │",
    cardText("next recommendation"),
    ...cardWrapped(report.nextRecommendation),
    "│                                                        │",
    cardText("missing done"),
    ...cardPrefixed(blocked ? report.missingDone : ["none"], blocked ? "✕" : "✓"),
    "│                                                        │",
    cardText("done contract"),
    ...cardPrefixed(report.doneContract.rules, "✓"),
    "│                                                        │",
    cardText("done artifact"),
    ...cardWrapped(report.doneArtifactPath ?? "not materialized"),
    "│                                                        │",
    cardText("boundary"),
    ...cardWrapped(
      blocked
        ? "Do not close the story until Done gaps are resolved."
        : "Story closure is complete; Builder may recommend the next Pull.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("done_checkpoint", body);
}
