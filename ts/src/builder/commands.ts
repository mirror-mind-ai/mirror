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
import { renderDeliveryStoryReadyReport } from "./deliveryStoryReady.ts";
import { ExpandBlockedError, expandDeliveryStory, renderExpandBlocked } from "./expand.ts";
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
      `Run: uv run python -m memory build adopt --journey ${journey} --method ariad`,
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
      `Run: uv run python -m memory build sync-cursor --journey ${journey} --method ariad`,
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
