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

import type { Database } from "#db/database.ts";
import { getIdentityContent } from "#identity/identityRead.ts";
import { getProjectPath } from "#journey/journeyStatus.ts";
import { resolveRuntimeSessionId } from "#mirror/runtimeSession.ts";
import { getActiveOperatingMode } from "#mode/operatingMode.ts";
import { pyRStrip } from "#util/pythonText.ts";
import { getAriadMethod } from "./ariadMethod.ts";
import { getAdoptedMethod } from "./methodAdoption.ts";
import {
  AVAILABLE_METHODS,
  renderAvailableMethod,
  renderJourneyMethodState,
  renderNoActiveJourney,
} from "./methodInspection.ts";
import { inspectPullCandidates, inspectRoadmapSnapshot } from "./pullCandidates.ts";
import { renderPullCandidatesReport, renderRoadmapSnapshotReport } from "./pullCandidatesRender.ts";

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
