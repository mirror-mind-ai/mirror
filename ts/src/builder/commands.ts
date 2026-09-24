// CV22.DS7.US8 plateau 1 — `build inspect-method` and `build pull-candidates`,
// end to end.
//
// Port of `cmd_inspect_method`, `cmd_pull_candidates`, and the shared guards
// `_reject_unknown_method`, `_resolve_builder_journey`, `_require_adopted_method`
// from `src/memory/cli/build.py`.
//
// Nothing is routed here. These return a `CommandResult` rather than writing to
// the process, so plateau 8's front door wires them and the tests can grade
// stdout, stderr, and the exit code without a subprocess.
//
// `build check-implementation` is deliberately absent: it calls
// `assert_implementation_allowed`, which reads the delivery cursor, so it belongs
// with the cursor in plateau 2 rather than being half-ported here.
//
// The refusal taxonomy measured at plateau 1 applies directly (D3.17). Everything
// in this module is CLASS B: a domain refusal at exit 1 whose `Error: …` text is a
// byte-exact parity obligation. Class A — argparse's own exit 2 with usage text —
// happens before any of this runs and is the front door's business.
//
// One ordering detail no surface reveals but every refusal depends on: the guards
// run method-first, then journey resolution, then journey existence, then
// adoption. So `pull-candidates --method bogus` with no journey reports the
// METHOD error, and the same command with a valid method but no resolvable
// journey reports the JOURNEY error. A port that resolves the journey first
// reports the wrong one.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database, WritableDatabase } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { getProjectPath } from "#journey/journeyStatus.ts";
import { resolveRuntimeSessionId } from "#mirror/runtimeSession.ts";
import { getActiveOperatingMode } from "#mode/operatingMode.ts";
import { PROGRAM } from "#util/program.ts";
import { pyRStrip } from "#util/pythonText.ts";
import { approvePlanCheckpoint, renderPlanApproval } from "./approve.ts";
import { getAriadMethod } from "./ariadMethod.ts";
import {
  existingArtifact,
  type MaterializedArtifact,
  materializedArtifact,
  renderArtifactsMaterializedSurface,
} from "./artifacts/artifactSurfaces.ts";
import { CARD_WIDTH, cardText, wrapPlainText } from "./card.ts";
import {
  coherenceLifecycleItem,
  doneLifecycleItem,
  renderCoherenceCheckpoint,
  renderDoneCheckpoint,
  renderReviewCheckpoint,
  renderValidationCheckpoint,
  reviewLifecycleItem,
  validateLifecycleItem,
} from "./closure.ts";
import {
  type CursorWriteDeps,
  getDeliveryCursor,
  renderDeliveryCursorSyncReport,
  setDeliveryCursor,
} from "./deliveryCursor.ts";
import {
  closureArtifactManifest,
  coherenceDeliveryStory,
  type DeliveryStoryClosureReport,
  doneDeliveryStory,
  renderDeliveryStoryClosureReport,
  reviewDeliveryStory,
  validateDeliveryStory,
} from "./deliveryStoryClosure.ts";
import {
  approveDeliveryStoryPlan,
  cancelDeliveryStoryPlanPreauthorization,
  planDeliveryStoryCheckpoint,
  renderDeliveryStoryImplementationStarted,
  renderDeliveryStoryPlanReport,
  renderPlanPreauthorizationMismatch,
  renderPlanPreauthorizationRecorded,
} from "./deliveryStoryPlan.ts";
import { renderDeliveryStoryReadyReport } from "./deliveryStoryReady.ts";
import { inspectAuthoredClosure } from "./deliveryStoryRoadmapClosure.ts";
import { ExpandBlockedError, expandDeliveryStory, renderExpandBlocked } from "./expand.ts";
import {
  inspectNavigatorFlowUnit,
  renderFlowUnitScopeConfirmationReport,
  renderNavigatorFlowUnitReport,
  setNavigatorFlowUnit,
} from "./flowUnit.ts";
import {
  assertImplementationAllowed,
  ImplementationBlockedError,
  renderImplementationGuardAllowed,
  renderImplementationGuardBlocked,
} from "./implementationGuard.ts";
import { getAdoptedMethod, setAdoptedMethod } from "./methodAdoption.ts";
import {
  AVAILABLE_METHODS,
  renderAvailableMethod,
  renderJourneyMethodState,
  renderMethodAdoptionReport,
  renderNoActiveJourney,
} from "./methodInspection.ts";
import { planLifecycleItem, renderPlanCheckpoint } from "./plan.ts";
import { PlanPreauthorizationMismatch } from "./planPreauthorization.ts";
import { prepareLifecycleItem, renderPrepareReport } from "./prepare.ts";
import { pullLifecycleItem, renderPullReport } from "./pull.ts";
import { inspectPullCandidates, inspectRoadmapSnapshot } from "./pullCandidates.ts";
import {
  renderProjectPositionReport,
  renderPullCandidatesReport,
  renderRoadmapSnapshotReport,
} from "./pullCandidatesRender.ts";
import {
  inspectReleaseIntent,
  renderReleaseIntentReport,
  setReleaseIntent,
} from "./releaseIntent.ts";
import {
  createStoryDirectory,
  resolveStoryDirectory,
  StoryPackageAmbiguityError,
} from "./storyPaths.ts";
import {
  approveStoryPlanWithPreauthorization,
  cancelStoryPlanPreauthorization,
  renderStoryImplementationStarted,
  renderStoryPlanPreauthorizationMismatch,
  renderStoryPlanPreauthorizationRecorded,
  renderStoryPreauthorizationAlreadyConsumed,
} from "./storyPlanPreauthorization.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";
import { prepareMethodTemplates, renderTemplatePreparationReport } from "./templateGeneration.ts";

/** What a `build` leaf produced, without touching the process. */
export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Python `print(text)` — the value PLUS the newline `print` adds.
 *
 * Every renderer here already ends in `\n`, so each surface leaves a blank line
 * behind it and the stream ends with TWO newlines. That is not a quirk worth
 * smoothing: it is the byte a shell sees, and reproducing the expression Python
 * passes to `print` while forgetting `print` itself is one byte short on every
 * invocation. Measured against the real CLI in a subprocess, not reasoned about.
 */
function printed(text: string): string {
  return `${text}\n`;
}

const IDENTITY_JOURNEY_LAYER = "journey";

export interface BuilderCommandContext {
  readonly db: Database;
  /** `MIRROR_SESSION_ID`, passed in rather than read, as every TS route does. */
  readonly environmentSessionId?: string | null;
}

/** The context the writing leaves need: a writable handle and a clock. */
export interface BuilderWriteContext {
  readonly db: WritableDatabase;
  readonly environmentSessionId?: string | null;
  readonly deps: CursorWriteDeps;
}

/** Python's `print(message, file=sys.stderr); sys.exit(1)` pair. */
function refuse(message: string): CommandResult {
  return { stdout: "", stderr: printed(message), exitCode: 1 };
}

/** Python `_reject_unknown_method`. */
function rejectUnknownMethod(method: string): CommandResult | null {
  if (method === "ariad") return null;
  return refuse(
    `Error: Builder method '${method}' not found. Available methods: ${AVAILABLE_METHODS.join(", ")}`,
  );
}

/**
 * Python `_resolve_builder_journey`: the explicit `--journey`, else the journey of
 * an ACTIVE BUILDER MODE for the resolved session. A journey attached to any
 * other mode does not count.
 */
function resolveBuilderJourney(
  context: BuilderCommandContext,
  options: { journey: string | null; sessionId: string | null; action: string },
): { journey: string } | CommandResult {
  if (options.journey) return { journey: options.journey };
  const resolvedSessionId = resolveRuntimeSessionId(
    context.db,
    options.sessionId,
    context.environmentSessionId ?? null,
  );
  const activeMode = getActiveOperatingMode(context.db, resolvedSessionId);
  if (activeMode && activeMode.mode === "Builder Mode" && activeMode.journey) {
    return { journey: activeMode.journey };
  }
  return refuse(
    `Error: Builder method ${options.action} requires a journey. ` +
      "Activate Builder Mode for a journey or pass --journey.",
  );
}

function isCommandResult(value: unknown): value is CommandResult {
  return typeof value === "object" && value !== null && "exitCode" in value;
}

/** Python's `mem.get_identity("journey", slug)` existence guard. */
function requireJourney(db: Database, journey: string): CommandResult | null {
  const content = getIdentityContent(db, IDENTITY_JOURNEY_LAYER, journey);
  if (content) return null;
  return refuse(`Error: journey '${journey}' not found.`);
}

/** Python `_require_adopted_method`. */
function requireAdoptedMethod(db: Database, journey: string, method: string): CommandResult | null {
  if (getAdoptedMethod(db, journey) === method) return null;
  return refuse(
    `Error: journey '${journey}' has not adopted Ariad yet. ` +
      `Run: ${PROGRAM} build adopt --journey ${journey} --method ariad`,
  );
}

/**
 * Python `cmd_inspect_method`.
 *
 * Three shapes, and the order of the branches is the behavior:
 *
 *   * `--journey X` given -> that journey's state, after an existence check. The
 *     positional method is IGNORED in this branch, so `inspect-method ariad
 *     --journey j` renders the journey state rather than the method definition.
 *   * no positional method -> the active Builder journey's state if one exists,
 *     else the no-active-journey card. Never an error.
 *   * a positional method -> the built-in definition, or a Class B refusal.
 */
export function runInspectMethod(
  context: BuilderCommandContext,
  options: { method?: string | null; journey?: string | null; sessionId?: string | null } = {},
): CommandResult {
  const method = options.method ?? null;
  const journey = options.journey ?? null;

  if (journey) {
    const missing = requireJourney(context.db, journey);
    if (missing) return missing;
    return {
      stdout: printed(renderJourneyMethodState(journey, getAdoptedMethod(context.db, journey))),
      stderr: "",
      exitCode: 0,
    };
  }

  if (method === null) {
    const resolvedSessionId = resolveRuntimeSessionId(
      context.db,
      options.sessionId ?? null,
      context.environmentSessionId ?? null,
    );
    const activeMode = getActiveOperatingMode(context.db, resolvedSessionId);
    if (activeMode && activeMode.mode === "Builder Mode" && activeMode.journey) {
      return {
        stdout: printed(
          renderJourneyMethodState(
            activeMode.journey,
            getAdoptedMethod(context.db, activeMode.journey),
          ),
        ),
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: printed(renderNoActiveJourney()), stderr: "", exitCode: 0 };
  }

  const unknown = rejectUnknownMethod(method);
  if (unknown) return unknown;
  return { stdout: printed(renderAvailableMethod(getAriadMethod())), stderr: "", exitCode: 0 };
}

/** Python `_surfaces_for_trigger`: the surfaces a DSL route declares for a trigger. */
export function surfacesForTrigger(trigger: string): readonly string[] {
  for (const route of getAriadMethod().surfaceRoutes) {
    if (route.trigger === trigger) return route.surfaces;
  }
  return [];
}

/**
 * Python `cmd_pull_candidates`.
 *
 * Which surfaces appear is decided by the DSL, not by the command: the
 * `show_roadmap` surface route names them, so removing `roadmap_snapshot` from
 * `ariadMethod.ts` would drop that block from this output. That indirection is
 * the method DSL doing its job and is preserved.
 *
 * The join is Python's exactly: each part is `rstrip()`ed, joined with a single
 * newline, and ONE trailing newline is added — so two surfaces are separated by
 * the newline that ends the first one, with no blank line between them.
 */
export function runPullCandidates(
  context: BuilderCommandContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "pull candidates inspection",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;

  const projectPath = getProjectPath(context.db, journey);
  const root = projectPath || null;
  const surfaces = surfacesForTrigger("show_roadmap");
  const rendered: string[] = [];
  const candidatesReport = inspectPullCandidates(root, { journey, method: options.method });
  if (surfaces.includes("roadmap_snapshot")) {
    rendered.push(
      renderRoadmapSnapshotReport(
        inspectRoadmapSnapshot(root, { journey, method: options.method }),
        { candidates: candidatesReport.candidates },
      ),
    );
  }
  if (surfaces.includes("pull_candidates")) {
    rendered.push(renderPullCandidatesReport(candidatesReport));
  }
  return {
    stdout: printed(`${rendered.map((part) => pyRStrip(part)).join("\n")}\n`),
    stderr: "",
    exitCode: 0,
  };
}

/**
 * Python `cmd_adopt_method`.
 *
 * `already_adopted` is computed BEFORE the write, so re-adopting Ariad reports
 * "was already adopted" while a first adoption reports "is now adopted" — and
 * switching from another method reports "is now", because the comparison is
 * against the method being adopted rather than against any adoption at all.
 */
export function runAdoptMethod(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "adoption",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;

  const alreadyAdopted = getAdoptedMethod(context.db, journey) === options.method;
  const adoption = setAdoptedMethod(context.db, journey, options.method, context.deps.nowIso);
  return {
    stdout: printed(
      renderMethodAdoptionReport(adoption.journey, adoption.method, { alreadyAdopted }),
    ),
    stderr: "",
    exitCode: 0,
  };
}

/**
 * Python `cmd_prepare_templates`.
 *
 * The only leaf in this plateau that writes into the user's repository, and the
 * only one with a fifth guard: a journey with no `project_path` is refused rather
 * than defaulted, because there is nowhere safe to write.
 */
export function runPrepareTemplates(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "template preparation",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;

  const projectPath = getProjectPath(context.db, journey);
  if (!projectPath) {
    return refuse(
      `Error: journey '${journey}' has no project_path configured. ` +
        "Set a project path before preparing Ariad templates.",
    );
  }

  const report = prepareMethodTemplates(projectPath, { journey, method: getAriadMethod() });
  return { stdout: printed(renderTemplatePreparationReport(report)), stderr: "", exitCode: 0 };
}

/**
 * Python `cmd_sync_cursor`.
 *
 * The written cursor is fixed, not derived: `last_delivery_event` is always
 * `template_preparation` and `cadence_profile` always `stepwise`, and no active
 * item is inferred. Running it on a journey that already has a cursor therefore
 * RESETS those two fields while carrying the generation forward — which is the
 * cursor's own carry-forward rule, not something this command decides.
 */
export function runSyncCursor(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "cursor sync",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;

  const cursor = setDeliveryCursor(
    context.db,
    {
      journey,
      method: options.method,
      lastDeliveryEvent: "template_preparation",
      cadenceProfile: "stepwise",
    },
    context.deps,
  );
  return { stdout: printed(renderDeliveryCursorSyncReport(cursor)), stderr: "", exitCode: 0 };
}

/**
 * Python `cmd_check_implementation`.
 *
 * The only leaf whose REFUSAL prints a surface on stdout rather than a message on
 * stderr: a blocked guard renders `IMPLEMENTATION_GUARD` to stdout and still exits
 * 1. A port that routes the block through the ordinary `refuse` helper loses the
 * surface the transport protocol requires to be rendered verbatim.
 */
export function runCheckImplementation(
  context: BuilderCommandContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "implementation check",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;

  try {
    const cursor = assertImplementationAllowed(context.db, journey);
    return {
      stdout: printed(renderImplementationGuardAllowed(cursor)),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    if (!(error instanceof ImplementationBlockedError)) throw error;
    return {
      stdout: printed(renderImplementationGuardBlocked(error.message)),
      stderr: "",
      exitCode: 1,
    };
  }
}

// --- plateau 3: the story-lifecycle leaves ---------------------------------
//
// Port of `cmd_pull_item`, `cmd_prepare_item`, `cmd_plan_item`, `cmd_approve_plan`,
// and `cmd_cancel_story_plan_preauthorization`.
//
// These are the first leaves whose guard chain has a FIFTH link: after method,
// journey resolution, journey existence, and adoption comes
// `_require_delivery_cursor`. Its position matters — two refusals that look like
// they belong to the lifecycle (`active item is required before prepare`, the
// Delivery Story project-path error) sit BEHIND it, so a port that checks the
// cursor last reports the wrong refusal for a journey that never ran `sync-cursor`.
//
// `pull-item` is also the only leaf here that composes: it runs Pull, then Prepare
// unconditionally, then for a Delivery Story it runs Expand and renders the
// composite `DELIVERY_STORY_READY` surface INSTEAD of the Pull and Prepare
// surfaces. Emitting all three is a duplicate-surface defect no renderer-level test
// can see.

/** Python `_require_delivery_cursor`. */
function requireDeliveryCursor(db: Database, journey: string): CommandResult | null {
  if (getDeliveryCursor(db, journey) !== null) return null;
  return refuse(
    `Error: journey '${journey}' has no Builder delivery cursor. ` +
      `Run: ${PROGRAM} build sync-cursor --journey ${journey} --method ariad`,
  );
}

/** The four guards every lifecycle leaf runs, in Python's order. */
function lifecycleGuards(
  context: BuilderCommandContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    action: string;
    requireCursor: boolean;
  },
): { journey: string } | CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;

  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: options.action,
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;

  const missing = requireJourney(context.db, journey);
  if (missing) return missing;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;
  if (options.requireCursor) {
    const noCursor = requireDeliveryCursor(context.db, journey);
    if (noCursor) return noCursor;
  }
  return { journey };
}

/** Python's `except ValueError as exc: print(f"Error: {exc}", file=sys.stderr)`. */
function refuseValueError(error: unknown): CommandResult {
  if (error instanceof StoryPackageAmbiguityError || error instanceof ExpandBlockedError)
    throw error;
  return refuse(`Error: ${(error as Error).message}`);
}

/** Python `_canonical_package_path`: resolve the authored package, else create it. */
function canonicalPackagePath(
  projectPath: string | null,
  cursor: { activeItem: string | null; activeItemTitle: string | null } | null,
): string | null {
  const activeItem = cursor?.activeItem ?? null;
  if (!projectPath || !activeItem) return null;
  const resolved = resolveStoryDirectory(projectPath, activeItem);
  if (resolved !== null) return resolved;
  return createStoryDirectory(projectPath, activeItem, cursor?.activeItemTitle || activeItem);
}

/** Python `_artifact_existence`: sampled BEFORE the write, or preservation is invisible. */
function artifactExistence(planPath: string | null): Map<string, boolean> {
  const existence = new Map<string, boolean>();
  if (planPath === null) return existence;
  const directory = dirname(planPath);
  for (const path of [join(directory, "index.md"), planPath, join(directory, "test-guide.md")]) {
    existence.set(path, existsSync(path));
  }
  return existence;
}

/** Python `_plan_package_artifacts`. */
function planPackageArtifacts(
  planPath: string | null,
  existedBefore: Map<string, boolean>,
): MaterializedArtifact[] {
  if (planPath === null) return [];
  const directory = dirname(planPath);
  const triple: [string, string][] = [
    ["story index", join(directory, "index.md")],
    ["plan", planPath],
    ["test guide", join(directory, "test-guide.md")],
  ];
  return triple.map(([kind, path]) =>
    existedBefore.get(path) === true
      ? existingArtifact(kind, path)
      : materializedArtifact(kind, path, { existedBefore: false }),
  );
}

/** Python `_print_artifacts_materialized`: no artifacts means NO surface, not an empty one. */
function artifactsSurface(options: {
  context: string;
  artifacts: readonly MaterializedArtifact[];
  projectPath: string | null;
  boundary: string;
}): string {
  if (options.artifacts.length === 0) return "";
  return printed(
    renderArtifactsMaterializedSurface({
      context: options.context,
      artifacts: options.artifacts,
      projectPath: options.projectPath,
      boundary: options.boundary,
    }),
  );
}

/**
 * Python `_MIRROR_LOCAL_IMPLEMENTATION_RULES`.
 *
 * Mirror Mind's own conventions, injected into every generated Plan — including
 * plans for other projects, where `uv run` is false. Reproduced; CR019 owns it.
 */
const MIRROR_LOCAL_IMPLEMENTATION_RULES = [
  "Use uv run for Python commands and tests.",
  "Do not use git add .; commit only story-scoped files.",
  "Use descriptive English commit messages explaining why.",
] as const;

/**
 * Python `_roadmap_plan_context`.
 *
 * Derives the Plan's default prose from the roadmap: the active candidate's own
 * title leaf, and SIBLING titles as explicit non-goals. The sibling query is
 * prefix-based on the code's first segment, which is why a Delivery Story's own
 * parent can appear among them (CR019).
 */
function roadmapPlanContext(
  projectPath: string | null,
  cursor: { activeItem: string | null } | null,
): {
  objective: string;
  scope: string[];
  nonGoals: string[];
  acceptanceBehavior: string[];
  validationRoute: string[];
  e2eDecision: string;
} {
  const activeItem = cursor?.activeItem ?? null;
  let titleParts: string[] = [];
  let siblings: string[] = [];
  if (projectPath && activeItem) {
    const candidates = inspectPullCandidates(projectPath, {
      journey: "",
      method: "ariad",
    }).candidates;
    const active = candidates.find((candidate) => candidate.code === activeItem);
    if (active) {
      titleParts = active.title
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      const prefix = String(activeItem).split(".")[0] ?? "";
      siblings = candidates
        .filter(
          (candidate) => candidate.code !== activeItem && candidate.code.startsWith(`${prefix}.`),
        )
        .map((candidate) => (candidate.title.split("/").at(-1) ?? "").trim());
    }
  }
  const title = titleParts.at(-1) ?? String(activeItem ?? "the active item");
  const siblingNonGoals = siblings.map(
    (sibling) => `Do not implement sibling roadmap item: ${sibling}.`,
  );
  return {
    objective: `Plan the smallest coherent, testable slice for ${title}.`,
    scope: [
      `Deliver ${title} as an observable slice.`,
      "Keep the implementation narrow enough to validate at the Plan-defined checkpoint.",
    ],
    nonGoals:
      siblingNonGoals.length > 0
        ? siblingNonGoals
        : ["Do not silently absorb adjacent roadmap work."],
    acceptanceBehavior: [
      `Given the starting state needed for ${title}`,
      `When the Navigator exercises ${title}`,
      "Then the planned observable behavior is visible",
      "And out-of-scope sibling roadmap items remain untouched",
    ],
    validationRoute: [
      "Run automated tests that cover the planned behavior.",
      "Provide a Navigator-visible route with expected observation, pass condition, and fail condition.",
    ],
    e2eDecision:
      "required unless Navigator explicitly accepts a narrower fixture-level validation route",
  };
}

/** Python `cmd_pull_item`. */
export function runPullItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    itemCode: string;
    itemTitle: string;
    itemLevel: string;
    whyNow: string;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, { ...options, action: "pull", requireCursor: true });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  let pullReport: ReturnType<typeof pullLifecycleItem>;
  try {
    pullReport = pullLifecycleItem(
      context.db,
      {
        journey,
        method: options.method,
        item: {
          code: options.itemCode,
          title: options.itemTitle,
          level: options.itemLevel,
          whyNow: options.whyNow,
        },
      },
      context.deps,
    );
  } catch (error) {
    return refuseValueError(error);
  }

  const projectPath = getProjectPath(context.db, journey);
  // Prepare runs unconditionally, and OUTSIDE the try above: Python lets a Prepare
  // failure raise rather than reporting it as a Pull refusal.
  const prepareReport = prepareLifecycleItem(
    context.db,
    { journey, method: options.method, projectPath },
    context.deps,
  );

  if (options.itemLevel === "delivery_story") {
    if (!projectPath) {
      return refuse("Error: Delivery Story expansion requires project_path.");
    }
    let expandReport: ReturnType<typeof expandDeliveryStory>;
    try {
      expandReport = expandDeliveryStory(
        context.db,
        { journey, method: options.method, projectPath },
        context.deps,
      );
    } catch (error) {
      if (error instanceof ExpandBlockedError || error instanceof StoryPackageAmbiguityError) {
        // The refusal renders a SURFACE on stdout and still exits 1.
        return {
          stdout: printed(renderExpandBlocked(options.itemCode, error.message)),
          stderr: "",
          exitCode: 1,
        };
      }
      return refuseValueError(error);
    }
    const stdout =
      printed(
        renderDeliveryStoryReadyReport({
          pull: pullReport,
          prepare: prepareReport,
          expand: expandReport,
        }),
      ) +
      artifactsSurface({
        context: `Expand — ${expandReport.deliveryStory}`,
        artifacts: expandReport.materializedArtifacts,
        projectPath,
        boundary: "Files were materialized only. No Plan or implementation was executed.",
      });
    return { stdout, stderr: "", exitCode: 0 };
  }

  return {
    stdout: printed(renderPullReport(pullReport)) + printed(renderPrepareReport(prepareReport)),
    stderr: "",
    exitCode: 0,
  };
}

/** Python `cmd_prepare_item`. */
export function runPrepareItem(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const guarded = lifecycleGuards(context, { ...options, action: "prepare", requireCursor: true });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = prepareLifecycleItem(
      context.db,
      { journey, method: options.method, projectPath },
      context.deps,
    );
    return { stdout: printed(renderPrepareReport(report)), stderr: "", exitCode: 0 };
  } catch (error) {
    return refuseValueError(error);
  }
}

/** Python `cmd_plan_item`. */
export function runPlanItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    objective?: string | null;
    preauthorizeApproval?: boolean;
    stopAfter?: string;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, { ...options, action: "plan", requireCursor: true });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const projectPath = getProjectPath(context.db, journey);
  const cursor = getDeliveryCursor(context.db, journey);
  const planPath = canonicalPackagePath(projectPath, cursor);
  const planArtifactPath = planPath === null ? null : join(planPath, "plan.md");
  const existedBefore = artifactExistence(planArtifactPath);
  const planContext = roadmapPlanContext(projectPath, cursor);

  try {
    const report = planLifecycleItem(
      context.db,
      {
        journey,
        method: getAriadMethod(),
        objective: options.objective || planContext.objective,
        scope: planContext.scope,
        nonGoals: planContext.nonGoals,
        acceptanceBehavior: planContext.acceptanceBehavior,
        validationRoute: planContext.validationRoute,
        e2eDecision: planContext.e2eDecision,
        localRules: [...MIRROR_LOCAL_IMPLEMENTATION_RULES],
        planArtifactPath,
        preauthorize: options.preauthorizeApproval ?? false,
        stopBoundary: options.stopAfter ?? "navigator_validation",
      },
      context.deps,
    );
    const authority = report.preauthorizationRecorded
      ? printed(renderStoryPlanPreauthorizationRecorded(report.cursor))
      : "";
    const stdout =
      printed(renderPlanCheckpoint(report)) +
      authority +
      artifactsSurface({
        context: `Plan — ${report.activeItem}`,
        artifacts: planPackageArtifacts(report.planArtifactPath, existedBefore),
        projectPath,
        boundary:
          "Plan artifacts were materialized. Implementation remains blocked until approval.",
      });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    return refuseValueError(error);
  }
}

/**
 * Python `cmd_approve_plan`.
 *
 * Note the guard chain: approval does NOT require a delivery cursor up front — the
 * lifecycle call reports that itself — so a journey with no cursor reports
 * `delivery cursor is required before plan approval`, not the `sync-cursor` hint.
 */
export function runApprovePlan(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    usePreauthorization?: boolean;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "plan approval",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  try {
    if (options.usePreauthorization === true) {
      const cursor = getDeliveryCursor(context.db, journey);
      const projectPath = getProjectPath(context.db, journey);
      const packagePath = canonicalPackagePath(projectPath, cursor);
      const report = approveStoryPlanWithPreauthorization(
        context.db,
        {
          journey,
          method: options.method,
          planArtifactPath: packagePath === null ? null : join(packagePath, "plan.md"),
        },
        context.deps,
      );
      if (report.status === "already_approved") {
        return {
          stdout: printed(renderStoryPreauthorizationAlreadyConsumed(report.cursor)),
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout:
          printed(renderPlanApproval(report.cursor)) +
          printed(renderStoryImplementationStarted(report.cursor)),
        stderr: "",
        exitCode: 0,
      };
    }
    const cursor = approvePlanCheckpoint(
      context.db,
      { journey, method: options.method },
      context.deps,
    );
    return { stdout: printed(renderPlanApproval(cursor)), stderr: "", exitCode: 0 };
  } catch (error) {
    if (error instanceof PlanPreauthorizationMismatch) {
      // Exit 0, not 1: a mismatch is a bounded fallback to ordinary approval, and
      // the surface says so. Treating it as a failure would tell the Navigator the
      // command broke.
      const cursor = getDeliveryCursor(context.db, journey);
      return {
        stdout: printed(
          renderStoryPlanPreauthorizationMismatch({
            activeItem: cursor?.activeItem ?? null,
            reason: error.reason,
          }),
        ),
        stderr: "",
        exitCode: 0,
      };
    }
    return refuseValueError(error);
  }
}

/**
 * Python `cmd_cancel_story_plan_preauthorization`.
 *
 * The one leaf that skips the journey-existence check: Python's version never calls
 * `get_identity`, so a nonexistent journey reaches the adoption guard instead.
 */
export function runCancelPlanPreauthorization(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;
  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "story Plan preauthorization cancellation",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;

  try {
    const cursor = cancelStoryPlanPreauthorization(
      context.db,
      { journey, method: options.method },
      context.deps,
    );
    return {
      stdout: printed(
        renderStoryPlanPreauthorizationMismatch({
          activeItem: cursor.activeItem,
          reason: "navigator_cancelled",
        }),
      ),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return refuseValueError(error);
  }
}

// --- plateau 4: the closure leaves -----------------------------------------
//
// Port of `cmd_validate_item`, `cmd_review_item`, `cmd_coherence_item`, and
// `cmd_done_item`.
//
// Their refusal shape differs from every other lifecycle leaf: a blocked lifecycle
// call renders IMPLEMENTATION_GUARD on STDOUT and exits 1, rather than printing
// `Error: …` to stderr. Routing these through `refuse` would lose a surface the
// transport protocol requires to be rendered verbatim — the same trap
// `check-implementation` set at plateau 2.
//
// Two of them emit a SECOND, CLI-only surface on the complete path:
// `debt_review_started` after a passed Validation, and `done_closure_confirmation`
// after a `no_action` Debt Review with nothing missing. Those two exist only here, not
// in `lifecycle.py`, so the module-level corpus cannot see them.
//
// `done-item` additionally prints the project position after its checkpoint, which is
// the Navigator's "where are we now" view and reads the roadmap a second time.

/** Python `_mini_card_text`. */
function miniCardText(text: string): string {
  return cardText(text);
}

/**
 * Python `_mini_card_wrapped`.
 *
 * The NON-chunking wrapper: an over-long word overflows its row instead of being
 * split, unlike `cardWrapped`. Python keeps two `_wrap_plain_text` behaviors across
 * ten modules and this is one of the non-chunking ones, so the flag is explicit.
 */
function miniCardWrapped(text: string): string[] {
  return wrapPlainText(text, { width: CARD_WIDTH, chunkLongWords: false }).map(cardText);
}

/** Python `_render_debt_review_handoff`: a CLI-only surface with its own ribbon literal. */
// --- cadence, release intent, continuation (plateau 6) ----------------------

/** Python `cmd_set_cadence`'s allowed set, checked in the CLI rather than the DSL. */
const CADENCE_PROFILES = ["stepwise", "checkpoint", "accelerated", "autonomous"];

/**
 * Python `cmd_set_cadence`.
 *
 * No module: the whole leaf is the CLI function, and its guard ORDER is unlike
 * every other leaf here — method, then the PROFILE, then the autonomous-limits
 * rule, and only then journey resolution and adoption. So an unknown profile
 * against a journey that cannot be resolved reports the profile, not the journey.
 * The corpus pins that with `set_cadence_profile_guard_precedes_journey`.
 *
 * It also writes the cursor directly rather than through a lifecycle verb, which
 * is why it carries every other field forward by hand: cadence is a Navigator
 * preference, not a lifecycle transition.
 */
export function runSetCadence(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    profile?: string | null;
    limits?: readonly string[];
  },
): CommandResult {
  const unknown = rejectUnknownMethod(options.method);
  if (unknown) return unknown;
  const profile = options.profile ?? "";
  const limits = options.limits ?? [];
  if (!CADENCE_PROFILES.includes(profile)) {
    return refuse(
      "Error: cadence profile must be one of stepwise, checkpoint, accelerated, autonomous",
    );
  }
  if (profile === "autonomous" && limits.length === 0) {
    return refuse("Error: autonomous cadence requires at least one --limit");
  }
  const resolved = resolveBuilderJourney(context, {
    journey: options.journey ?? null,
    sessionId: options.sessionId ?? null,
    action: "cadence profile update",
  });
  if (isCommandResult(resolved)) return resolved;
  const journey = resolved.journey;
  const notAdopted = requireAdoptedMethod(context.db, journey, options.method);
  if (notAdopted) return notAdopted;
  const cursor = getDeliveryCursor(context.db, journey);
  if (cursor === null) {
    // Its own message, not `_require_delivery_cursor`'s.
    return refuse(`Error: journey '${journey}' has no Builder delivery cursor.`);
  }
  const updated = setDeliveryCursor(
    context.db,
    {
      journey,
      method: options.method,
      activeItem: cursor.activeItem,
      activeItemTitle: cursor.activeItemTitle,
      activeItemLevel: cursor.activeItemLevel,
      activeCheckpoint: cursor.activeCheckpoint,
      pendingConfirmation: cursor.pendingConfirmation,
      lastDeliveryEvent: cursor.lastDeliveryEvent,
      cadenceProfile: profile,
      cadenceLimits: limits,
      granularityDecision: cursor.granularityDecision,
      navigatorFlowUnit: cursor.navigatorFlowUnit,
      childWorkItems: cursor.childWorkItems,
      aggregateCheckpointStatus: cursor.aggregateCheckpointStatus,
    },
    context.deps,
  );
  return { stdout: printed(renderDeliveryCursorSyncReport(updated)), stderr: "", exitCode: 0 };
}

/** Python `cmd_release_intent`: set with `--intent`, inspect without it. */
export function runReleaseIntent(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    intent?: string | null;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "Delivery Story release intent",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const intent = options.intent ?? null;
  try {
    const report =
      intent === null
        ? inspectReleaseIntent(context.db, { journey: guarded.journey, method: options.method })
        : setReleaseIntent(
            context.db,
            { journey: guarded.journey, method: options.method, intent },
            context.deps,
          );
    return { stdout: printed(renderReleaseIntentReport(report)), stderr: "", exitCode: 0 };
  } catch (error) {
    return refuseValueError(error);
  }
}

/**
 * Python `cmd_continue_lifecycle`.
 *
 * Also CLI-only, and narrower than its name suggests: the ONLY continuation it can
 * perform is crossing Done from a completed Debt Review or Coherence. Everything
 * else is one of five refusals, each rendering IMPLEMENTATION_GUARD on stdout with
 * exit 1 rather than an `Error:` line on stderr.
 *
 * Two shapes reproduced deliberately. It accepts `--process`, `--project`,
 * `--product`, and `--difference` and IGNORES all four — it never runs Coherence,
 * despite taking Coherence's evidence. And unlike `done-item`, which prints the
 * roadmap snapshot after closing, it prints its checkpoint and stops. Both are
 * parity-bound; both have cases.
 */
export function runContinueLifecycle(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    historyAction?: string | null;
    roadmapUpdate?: string | null;
    nextRecommendation?: string | null;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "lifecycle continuation",
    requireCursor: true,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;
  const cursor = getDeliveryCursor(context.db, journey);
  if (cursor === null) {
    return refuse("Error: delivery cursor is required before continuation");
  }
  const blocked = (reason: string): CommandResult => ({
    stdout: printed(renderImplementationGuardBlocked(reason)),
    stderr: "",
    exitCode: 1,
  });
  const profile = cursor.cadenceProfile || "stepwise";
  if (profile === "stepwise") {
    return blocked("Stepwise cadence does not continue automatically.");
  }
  if (profile === "autonomous" && cursor.cadenceLimits.length === 0) {
    return blocked("Autonomous cadence requires explicit limits.");
  }
  if (cursor.pendingConfirmation) {
    return blocked(`Continuation is blocked: pending confirmation ${cursor.pendingConfirmation}.`);
  }
  const projectPath = getProjectPath(context.db, journey);
  const planPath = closureArtifactPath(projectPath, cursor, "plan.md");
  if (!["review_complete", "coherence_complete"].includes(cursor.lastDeliveryEvent ?? "")) {
    return blocked(
      `No bypassable continuation is available after ${cursor.lastDeliveryEvent || "none"}.`,
    );
  }
  if (!(options.historyAction && options.roadmapUpdate && options.nextRecommendation)) {
    return blocked("Done requires history, roadmap, and next-step evidence.");
  }
  const report = doneLifecycleItem(
    context.db,
    {
      journey,
      method: getAriadMethod(),
      historyAction: options.historyAction,
      roadmapUpdate: options.roadmapUpdate,
      nextRecommendation: options.nextRecommendation,
      doneArtifactPath: planPath === null ? null : join(dirname(planPath), "done.md"),
    },
    context.deps,
  );
  return { stdout: printed(renderDoneCheckpoint(report)), stderr: "", exitCode: 0 };
}

// --- Delivery Story leaves (plateau 5) --------------------------------------
//
// The aggregate leaves differ from their story-level twins in three CLI-visible
// ways, all reproduced here:
//
//   * no CLI cursor guard — `lifecycleGuards` runs with `requireCursor: false`,
//     so a missing cursor surfaces the MODULE's message, not the CLI's;
//   * refusals are ordinary stderr lines (`Error: …`, exit 1), never the
//     IMPLEMENTATION_GUARD surface the story closure leaves print on stdout;
//   * `approve-delivery-story-plan` prints the mismatch surface and exits **0**,
//     because a refused authority is a normal Navigator-facing outcome rather than
//     a failure — the ordinary Plan gate is still there.

/** Python `cmd_set_flow_unit`: inspect with no `--unit`, select with one. */
export function runSetFlowUnit(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    unit?: string | null;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "navigator flow unit",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const unit = options.unit ?? null;
  try {
    if (unit === null) {
      const report = inspectNavigatorFlowUnit(context.db, {
        journey: guarded.journey,
        method: options.method,
      });
      return { stdout: printed(renderNavigatorFlowUnitReport(report)), stderr: "", exitCode: 0 };
    }
    const report = setNavigatorFlowUnit(
      context.db,
      { journey: guarded.journey, method: options.method, flowUnit: unit },
      context.deps,
    );
    return {
      stdout: printed(renderFlowUnitScopeConfirmationReport(report)),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return refuseValueError(error);
  }
}

/** Python `cmd_plan_delivery_story`. */
export function runPlanDeliveryStory(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    objective?: string | null;
    children?: readonly string[];
    preauthorizeApproval?: boolean;
    stopAfter?: string;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "Delivery Story Plan",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;
  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  const planPath = closureArtifactPath(projectPath, cursor, "plan.md");
  try {
    const report = planDeliveryStoryCheckpoint(
      context.db,
      {
        journey,
        method: options.method,
        objective: options.objective ?? "",
        childWorkItems: options.children ?? [],
        planArtifactPath: planPath,
        preauthorize: options.preauthorizeApproval ?? false,
        stopBoundary: options.stopAfter ?? "navigator_validation",
      },
      context.deps,
    );
    const receipt = options.preauthorizeApproval
      ? printed(renderPlanPreauthorizationRecorded(report))
      : "";
    return {
      stdout:
        printed(renderDeliveryStoryPlanReport(report)) +
        receipt +
        artifactsSurface({
          context: `Delivery Story Plan — ${report.cursor.activeItem || "active item"}`,
          artifacts: report.materializedArtifacts,
          projectPath,
          boundary:
            "Plan artifacts were materialized. Implementation remains blocked until approval.",
        }),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return refuseValueError(error);
  }
}

/** Python `cmd_approve_delivery_story_plan`. */
export function runApproveDeliveryStoryPlan(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    usePreauthorization?: boolean;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "Delivery Story Plan approval",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;
  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = approveDeliveryStoryPlan(
      context.db,
      {
        journey,
        method: options.method,
        planArtifactPath: closureArtifactPath(projectPath, cursor, "plan.md"),
        usePreauthorization: options.usePreauthorization ?? false,
      },
      context.deps,
    );
    // A repeat consumption returns after the card: no artifacts, no handoff.
    if (report.status === "already_approved") {
      return { stdout: printed(renderDeliveryStoryPlanReport(report)), stderr: "", exitCode: 0 };
    }
    const started = report.implementationStarted
      ? printed(renderDeliveryStoryImplementationStarted(report))
      : "";
    return {
      stdout:
        printed(renderDeliveryStoryPlanReport(report)) +
        artifactsSurface({
          context: `Delivery Story Plan Approval — ${report.cursor.activeItem || "active item"}`,
          artifacts: report.materializedArtifacts,
          projectPath,
          boundary:
            "Plan approval artifacts were materialized. Implementation may proceed under the approved plan.",
        }) +
        started,
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    if (error instanceof PlanPreauthorizationMismatch) {
      // Re-read: the mismatch path invalidated the receipt, so the card reports the
      // cursor as it stands now.
      const current = getDeliveryCursor(context.db, journey);
      return {
        stdout: printed(
          renderPlanPreauthorizationMismatch({
            activeItem: current?.activeItem ?? null,
            reason: error.reason,
          }),
        ),
        stderr: "",
        exitCode: 0,
      };
    }
    return refuseValueError(error);
  }
}

/** Python `cmd_cancel_delivery_story_plan_preauthorization`. */
export function runCancelDeliveryStoryPlanPreauthorization(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "Delivery Story Plan preauthorization cancellation",
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  try {
    const cursor = cancelDeliveryStoryPlanPreauthorization(
      context.db,
      { journey: guarded.journey, method: options.method },
      context.deps,
    );
    return {
      stdout: printed(
        renderPlanPreauthorizationMismatch({
          activeItem: cursor.activeItem,
          reason: "navigator_cancelled",
        }),
      ),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return refuseValueError(error);
  }
}

/** The four aggregate closure leaves share everything but their call and artifact. */
function runDeliveryStoryClosure(
  context: BuilderWriteContext,
  options: { method: string; journey?: string | null; sessionId?: string | null },
  spec: {
    action: string;
    kind: string;
    filename: string;
    label: string;
    run: (journey: string, artifactPath: string | null) => DeliveryStoryClosureReport;
    preflight?: (journey: string, projectPath: string | null) => CommandResult | null;
    trailer?: (report: DeliveryStoryClosureReport, projectPath: string | null) => string;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: spec.action,
    requireCursor: false,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;
  const projectPath = getProjectPath(context.db, journey);
  try {
    const refusal = spec.preflight?.(journey, projectPath) ?? null;
    if (refusal !== null) return refusal;
    const cursor = getDeliveryCursor(context.db, journey);
    const artifactPath = closureArtifactPath(projectPath, cursor, spec.filename);
    const existedBefore = artifactPath !== null && existsSync(artifactPath);
    const report = spec.run(journey, artifactPath);
    return {
      stdout:
        printed(renderDeliveryStoryClosureReport(report)) +
        artifactsSurface({
          context: `Delivery Story ${spec.label} — ${report.cursor.activeItem || "active item"}`,
          artifacts: closureArtifactManifest(spec.kind, artifactPath, existedBefore),
          projectPath,
          boundary: `${spec.label} artifact was materialized.`,
        }) +
        (spec.trailer?.(report, projectPath) ?? ""),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return refuseValueError(error);
  }
}

/** Python `cmd_validate_delivery_story`. */
export function runValidateDeliveryStory(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    summary?: string | null;
    navigatorAccepted?: boolean;
  },
): CommandResult {
  return runDeliveryStoryClosure(context, options, {
    action: "Delivery Story validation",
    kind: "validation",
    filename: "validation.md",
    label: "Validation",
    run: (journey, artifactPath) =>
      validateDeliveryStory(
        context.db,
        {
          journey,
          method: options.method,
          summary: options.summary ?? "",
          navigatorAccepted: options.navigatorAccepted ?? false,
          artifactPath,
        },
        context.deps,
      ),
    // Same CLI-only mini-card the story-level Validate prints, on the same
    // condition: a passed validation offers Debt Review.
    trailer: (report) =>
      report.status === "passed" ? printed(renderDebtReviewHandoff(report.cursor.activeItem)) : "",
  });
}

/** Python `cmd_review_delivery_story`. */
export function runReviewDeliveryStory(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    decision?: string | null;
    summary?: string | null;
  },
): CommandResult {
  return runDeliveryStoryClosure(context, options, {
    action: "Delivery Story debt review",
    kind: "review",
    filename: "review.md",
    label: "Review",
    run: (journey, artifactPath) =>
      reviewDeliveryStory(
        context.db,
        {
          journey,
          method: options.method,
          decision: options.decision ?? "",
          summary: options.summary ?? "",
          artifactPath,
        },
        context.deps,
      ),
    // Keyed off the REQUESTED decision, as Python is — not off the report.
    trailer: (report) =>
      options.decision === "no_action"
        ? printed(renderDoneClosureConfirmation(report.cursor.activeItem))
        : "",
  });
}

/** Python `cmd_coherence_delivery_story`. */
export function runCoherenceDeliveryStory(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    summary?: string | null;
  },
): CommandResult {
  return runDeliveryStoryClosure(context, options, {
    action: "Delivery Story coherence",
    kind: "coherence",
    filename: "coherence.md",
    label: "Coherence",
    run: (journey, artifactPath) =>
      coherenceDeliveryStory(
        context.db,
        { journey, method: options.method, summary: options.summary ?? "", artifactPath },
        context.deps,
      ),
  });
}

/**
 * Python `cmd_done_delivery_story`.
 *
 * The preflight runs BEFORE any artifact path is derived or any cursor is written,
 * so a refused Done leaves the project exactly as it was. Its message is the `; `
 * join of the issues, which is why the preflight's ORDER is behavior.
 */
export function runDoneDeliveryStory(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    summary?: string | null;
  },
): CommandResult {
  return runDeliveryStoryClosure(context, options, {
    action: "Delivery Story Done",
    kind: "done",
    filename: "done.md",
    label: "Done",
    preflight: (journey, projectPath) => {
      if (!projectPath) {
        return refuse("Error: project path is required before Delivery Story Done");
      }
      const cursor = getDeliveryCursor(context.db, journey);
      if (cursor === null || !cursor.activeItem) {
        return refuse("Error: active Delivery Story is required before Done");
      }
      const authored = inspectAuthoredClosure(projectPath, {
        deliveryStory: cursor.activeItem,
        childWorkItems: cursor.childWorkItems,
      });
      if (!authored.ready) {
        return refuse(
          `Error: authored roadmap is not ready for Delivery Story Done: ${authored.issues.join("; ")}`,
        );
      }
      return null;
    },
    run: (journey, artifactPath) =>
      doneDeliveryStory(
        context.db,
        { journey, method: options.method, summary: options.summary ?? "", artifactPath },
        context.deps,
      ),
    // Python `_print_roadmap_snapshot_at_done_end`: the roadmap is read AGAIN, after
    // the write, so the position reflects the Delivery Story that just closed.
    trailer: (report, projectPath) =>
      printed(
        renderProjectPositionReport(
          inspectRoadmapSnapshot(projectPath, { journey: report.journey, method: options.method }),
          {
            candidates: inspectPullCandidates(projectPath, {
              journey: report.journey,
              method: options.method,
            }).candidates,
            justMoved: `🟩[${report.deliveryStory}] ${report.deliveryStoryTitle || "Delivery Story"} closed`,
          },
        ),
      ),
  });
}

function renderDebtReviewHandoff(activeItem: string | null): string {
  const body = `${[
    "Delivery",
    "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ Plan → ✓ Implement → ✓ Validate → ◉ Debt Review → ○ Done",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🔎  DEBT REVIEW STARTED                        │",
    "│                                                        │",
    miniCardText("What changed?"),
    ...miniCardWrapped(
      "Validation was accepted. Before closure, review whether any relevant technical debt remains.",
    ),
    "│                                                        │",
    miniCardText("Active item"),
    miniCardText(activeItem || "active item"),
    "│                                                        │",
    miniCardText("Navigator check"),
    // The Portuguese fragment is Python's, in an otherwise English surface.
    // Reproduced, not corrected: changing it is a product change.
    ...miniCardWrapped(
      "If there is no relevant debt to address now, I can record this as sem ação necessária and continue toward closure.",
    ),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("debt_review_started", body);
}

/** Python `_render_done_closure_confirmation`. */
function renderDoneClosureConfirmation(activeItem: string | null): string {
  const body = `${[
    "Delivery",
    "Delivery Flow: ✓ Pull → ✓ Prepare → ✓ Expand → ✓ Plan → ✓ Implement → ✓ Validate → ✓ Debt Review → ◉ Done",
    "",
    "╭────────────────────────────────────────────────────────╮",
    "│        🧭  DONE CLOSURE CONFIRMATION                  │",
    "│                                                        │",
    miniCardText("My understanding"),
    ...miniCardWrapped(
      "Debt review found no relevant action to take now. The story is ready to close.",
    ),
    "│                                                        │",
    miniCardText("Active item"),
    miniCardText(activeItem || "active item"),
    "│                                                        │",
    miniCardText("Before I close"),
    ...miniCardWrapped("Is there anything else to do in this story before Done?"),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("done_closure_confirmation", body);
}

/** Python's `except ValueError: print(render_implementation_guard_blocked(...)); sys.exit(1)`. */
function blockedSurface(error: unknown): CommandResult {
  return {
    stdout: printed(renderImplementationGuardBlocked((error as Error).message)),
    stderr: "",
    exitCode: 1,
  };
}

/** The closure leaves' shared artifact path: the Plan package's sibling file. */
function closureArtifactPath(
  projectPath: string | null,
  cursor: { activeItem: string | null; activeItemTitle: string | null } | null,
  filename: string,
): string | null {
  const packagePath = canonicalPackagePath(projectPath, cursor);
  return packagePath === null ? null : join(packagePath, filename);
}

/** Python `cmd_validate_item`. */
export function runValidateItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    checks?: readonly string[];
    checksStatus?: string;
    e2eDecision?: string;
    e2eEvidence?: string | null;
    navigatorRoute?: string | null;
    navigatorAccepted?: boolean;
    expectedObservation?: string | null;
    passCondition?: string | null;
    failCondition?: string | null;
    implementationComplete?: boolean;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "validation",
    requireCursor: true,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = validateLifecycleItem(
      context.db,
      {
        journey,
        method: getAriadMethod(),
        automatedChecks: options.checks ?? [],
        checksStatus: options.checksStatus ?? "not_run",
        e2eDecision: options.e2eDecision ?? "not_required",
        e2eEvidence: options.e2eEvidence ?? null,
        navigatorValidationRoute: options.navigatorRoute ?? null,
        navigatorAccepted: options.navigatorAccepted ?? false,
        expectedObservation: options.expectedObservation ?? null,
        passCondition: options.passCondition ?? null,
        failCondition: options.failCondition ?? null,
        implementationComplete: options.implementationComplete ?? false,
        validationArtifactPath: closureArtifactPath(projectPath, cursor, "validation.md"),
      },
      context.deps,
    );
    const handoff =
      report.missingEvidence.length === 0
        ? printed(renderDebtReviewHandoff(report.cursor.activeItem))
        : "";
    return {
      stdout: printed(renderValidationCheckpoint(report)) + handoff,
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return blockedSurface(error);
  }
}

/** Python `cmd_review_item`. */
export function runReviewItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    debtFindings?: readonly string[];
    debtDecision?: string;
    deferReason?: string | null;
    revisitTrigger?: string | null;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "debt review",
    requireCursor: true,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = reviewLifecycleItem(
      context.db,
      {
        journey,
        method: getAriadMethod(),
        debtFindings: options.debtFindings ?? [],
        debtDecision: options.debtDecision ?? "pending",
        deferReason: options.deferReason ?? null,
        revisitTrigger: options.revisitTrigger ?? null,
        reviewArtifactPath: closureArtifactPath(projectPath, cursor, "review.md"),
      },
      context.deps,
    );
    // Only `no_action` WITH nothing missing offers closure. A completed `defer` does
    // not, which is the distinction the second surface carries.
    const confirmation =
      report.debtDecision === "no_action" && report.missingDecision.length === 0
        ? printed(renderDoneClosureConfirmation(report.cursor.activeItem))
        : "";
    return {
      stdout: printed(renderReviewCheckpoint(report)) + confirmation,
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return blockedSurface(error);
  }
}

/** Python `cmd_coherence_item`. */
export function runCoherenceItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    processAlignment?: string | null;
    projectAlignment?: string | null;
    productAlignment?: string | null;
    localDifferences?: readonly string[];
  },
): CommandResult {
  const guarded = lifecycleGuards(context, {
    ...options,
    action: "coherence",
    requireCursor: true,
  });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = coherenceLifecycleItem(
      context.db,
      {
        journey,
        method: getAriadMethod(),
        processAlignment: options.processAlignment ?? null,
        projectAlignment: options.projectAlignment ?? null,
        productAlignment: options.productAlignment ?? null,
        localDifferences: options.localDifferences ?? [],
        coherenceArtifactPath: closureArtifactPath(projectPath, cursor, "coherence.md"),
      },
      context.deps,
    );
    return { stdout: printed(renderCoherenceCheckpoint(report)), stderr: "", exitCode: 0 };
  } catch (error) {
    return blockedSurface(error);
  }
}

/** Python `cmd_done_item`, including the project position it prints afterwards. */
export function runDoneItem(
  context: BuilderWriteContext,
  options: {
    method: string;
    journey?: string | null;
    sessionId?: string | null;
    historyAction?: string | null;
    roadmapUpdate?: string | null;
    nextRecommendation?: string | null;
  },
): CommandResult {
  const guarded = lifecycleGuards(context, { ...options, action: "done", requireCursor: true });
  if (isCommandResult(guarded)) return guarded;
  const journey = guarded.journey;

  const cursor = getDeliveryCursor(context.db, journey);
  const projectPath = getProjectPath(context.db, journey);
  try {
    const report = doneLifecycleItem(
      context.db,
      {
        journey,
        method: getAriadMethod(),
        historyAction: options.historyAction ?? null,
        roadmapUpdate: options.roadmapUpdate ?? null,
        nextRecommendation: options.nextRecommendation ?? null,
        doneArtifactPath: closureArtifactPath(projectPath, cursor, "done.md"),
      },
      context.deps,
    );
    // Python `_print_roadmap_snapshot_at_done_end`: the roadmap is read again, after
    // the write, so the position reflects the story that just closed.
    const position = renderProjectPositionReport(
      inspectRoadmapSnapshot(projectPath, { journey, method: options.method }),
      {
        candidates: inspectPullCandidates(projectPath, { journey, method: options.method })
          .candidates,
        justMoved: `🟩[${report.activeItem}] ${report.activeItemTitle || "Story"} closed`,
      },
    );
    return {
      stdout: printed(renderDoneCheckpoint(report)) + printed(position),
      stderr: "",
      exitCode: 0,
    };
  } catch (error) {
    return blockedSurface(error);
  }
}
