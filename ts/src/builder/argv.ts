// CV22.DS7.US8 — validated Builder argv → ported command leaf.
//
// Plateau 8 promotes the mapping used by the command corpus and lifecycle smoke
// into production. `frontDoor/buildRoute.ts` owns validation and argparse-class
// exit-2 refusals; this module owns the single argv-to-command mapping used by
// production, goldens, and smokes so those callers cannot drift.
//
// `--check`, `--debt`, and `--difference` are `action="append"` in `build.py`, so
// every occurrence contributes; `--preauthorize-approval`, `--navigator-accepted`,
// `--implementation-complete`, and `--use-preauthorization` are `store_true`, so
// their PRESENCE is the value — reading either kind as a single option would
// swallow the following token.

import {
  type CommandResult,
  runAdoptMethod,
  runApproveDeliveryStoryPlan,
  runApprovePlan,
  runCancelDeliveryStoryPlanPreauthorization,
  runCancelPlanPreauthorization,
  runCheckImplementation,
  runCoherenceDeliveryStory,
  runCoherenceItem,
  runContinueLifecycle,
  runDoneDeliveryStory,
  runDoneItem,
  runInspectMethod,
  runPlanDeliveryStory,
  runPlanItem,
  runPrepareItem,
  runPrepareTemplates,
  runPullCandidates,
  runPullItem,
  runReleaseIntent,
  runReviewDeliveryStory,
  runReviewItem,
  runSetCadence,
  runSetFlowUnit,
  runSyncCursor,
  runValidateDeliveryStory,
  runValidateItem,
} from "#builder/commands.ts";
import type { Database, WritableDatabase } from "#db/database.ts";

export interface BuilderInvokeDeps {
  /** The clock the cursor writes stamp with. A test pins it; the smoke does not. */
  readonly nowIso: () => string;
  /** `MIRROR_SESSION_ID`, passed in rather than read, as every TS route does. */
  readonly environmentSessionId?: string | null;
}

/** Raised for an argv this mapping does not carry, so a gap cannot pass silently. */
export class UnsupportedBuilderArgvError extends Error {}

/** The three Builder leaves that never write and therefore need no live backup. */
export const READ_ONLY_BUILDER_SUBCOMMANDS = new Set([
  "inspect-method",
  "pull-candidates",
  "check-implementation",
]);

export function invokeReadOnlyBuilderArgv(
  db: Database,
  argv: readonly string[],
  environmentSessionId?: string | null,
): CommandResult {
  const option = (name: string): string | null => {
    const index = argv.lastIndexOf(name);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const positionals = argv.filter(
    (token, index) => index > 0 && !token.startsWith("--") && !argv[index - 1]?.startsWith("--"),
  );
  const shared = {
    method: option("--method") ?? "",
    journey: option("--journey"),
    sessionId: option("--session-id"),
  };
  const context = { db, environmentSessionId: environmentSessionId ?? null };
  if (argv[0] === "inspect-method") {
    return runInspectMethod(context, {
      method: positionals[0] ?? null,
      journey: shared.journey,
      sessionId: shared.sessionId,
    });
  }
  if (argv[0] === "pull-candidates") return runPullCandidates(context, shared);
  if (argv[0] === "check-implementation") return runCheckImplementation(context, shared);
  throw new UnsupportedBuilderArgvError(`unsupported read-only argv: ${argv.join(" ")}`);
}

export function invokeBuilderArgv(
  db: WritableDatabase,
  argv: readonly string[],
  invokeDeps: BuilderInvokeDeps,
): CommandResult {
  const option = (name: string): string | null => {
    const index = argv.lastIndexOf(name);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };
  const appended = (name: string): string[] =>
    argv.flatMap((token, index) => (token === name ? [argv[index + 1] ?? ""] : []));
  const positionals = argv.filter(
    (token, index) => index > 0 && !token.startsWith("--") && !argv[index - 1]?.startsWith("--"),
  );
  const environmentSessionId = invokeDeps.environmentSessionId ?? null;
  const context = { db, environmentSessionId };
  const writeContext = {
    db,
    environmentSessionId,
    deps: {
      nowIso: invokeDeps.nowIso,
    },
  };
  const shared = {
    method: option("--method") ?? "",
    journey: option("--journey"),
    sessionId: option("--session-id"),
  };
  switch (argv[0]) {
    case "inspect-method":
      return runInspectMethod(context, {
        method: positionals[0] ?? null,
        journey: shared.journey,
        sessionId: shared.sessionId,
      });
    case "pull-candidates":
      return runPullCandidates(context, shared);
    case "adopt":
      return runAdoptMethod(writeContext, shared);
    case "prepare-templates":
      return runPrepareTemplates(writeContext, shared);
    case "sync-cursor":
      return runSyncCursor(writeContext, shared);
    case "check-implementation":
      return runCheckImplementation(context, shared);
    case "pull-item":
      return runPullItem(writeContext, {
        ...shared,
        itemCode: option("--item-code") ?? "",
        itemTitle: option("--item-title") ?? "",
        itemLevel: option("--item-level") ?? "",
        whyNow: option("--why-now") ?? "",
      });
    case "prepare-item":
      return runPrepareItem(writeContext, shared);
    case "plan-item":
      return runPlanItem(writeContext, {
        ...shared,
        objective: option("--objective"),
        preauthorizeApproval: argv.includes("--preauthorize-approval"),
        stopAfter: option("--stop-after") ?? "navigator_validation",
      });
    case "approve-plan":
      return runApprovePlan(writeContext, {
        ...shared,
        usePreauthorization: argv.includes("--use-preauthorization"),
      });
    case "cancel-plan-preauthorization":
      return runCancelPlanPreauthorization(writeContext, shared);
    case "validate-item":
      return runValidateItem(writeContext, {
        ...shared,
        checks: appended("--check"),
        checksStatus: option("--checks-status") ?? "not_run",
        e2eDecision: option("--e2e-decision") ?? "not_required",
        e2eEvidence: option("--e2e-evidence"),
        navigatorRoute: option("--navigator-route"),
        navigatorAccepted: argv.includes("--navigator-accepted"),
        expectedObservation: option("--expected-observation"),
        passCondition: option("--pass-condition"),
        failCondition: option("--fail-condition"),
        implementationComplete: argv.includes("--implementation-complete"),
      });
    case "review-item":
      return runReviewItem(writeContext, {
        ...shared,
        debtFindings: appended("--debt"),
        debtDecision: option("--decision") ?? "pending",
        deferReason: option("--defer-reason"),
        revisitTrigger: option("--revisit-trigger"),
      });
    case "coherence-item":
      return runCoherenceItem(writeContext, {
        ...shared,
        processAlignment: option("--process"),
        projectAlignment: option("--project"),
        productAlignment: option("--product"),
        localDifferences: appended("--local-difference"),
      });
    case "done-item":
      return runDoneItem(writeContext, {
        ...shared,
        historyAction: option("--history-action"),
        roadmapUpdate: option("--roadmap-update"),
        nextRecommendation: option("--next-recommendation"),
      });
    // -- the aggregate leaves (plateau 5) ----------------------------------
    case "set-flow-unit":
      // `--unit` ABSENT is the inspect face, so it stays `null` rather than "".
      return runSetFlowUnit(writeContext, { ...shared, unit: option("--unit") });
    case "plan-delivery-story":
      return runPlanDeliveryStory(writeContext, {
        ...shared,
        objective: option("--objective"),
        children: appended("--child"),
        preauthorizeApproval: argv.includes("--preauthorize-approval"),
        stopAfter: option("--stop-after") ?? "navigator_validation",
      });
    case "approve-delivery-story-plan":
      return runApproveDeliveryStoryPlan(writeContext, {
        ...shared,
        usePreauthorization: argv.includes("--use-preauthorization"),
      });
    case "cancel-delivery-story-plan-preauthorization":
      return runCancelDeliveryStoryPlanPreauthorization(writeContext, shared);
    case "validate-delivery-story":
      return runValidateDeliveryStory(writeContext, {
        ...shared,
        summary: option("--summary"),
        navigatorAccepted: argv.includes("--navigator-accepted"),
      });
    case "review-delivery-story":
      return runReviewDeliveryStory(writeContext, {
        ...shared,
        decision: option("--decision"),
        summary: option("--summary"),
      });
    case "coherence-delivery-story":
      return runCoherenceDeliveryStory(writeContext, { ...shared, summary: option("--summary") });
    case "done-delivery-story":
      return runDoneDeliveryStory(writeContext, { ...shared, summary: option("--summary") });
    // -- cadence, release intent, continuation (plateau 6) ------------------
    case "set-cadence":
      return runSetCadence(writeContext, {
        ...shared,
        profile: option("--profile"),
        // `action="append"`, like `--check` and `--debt`.
        limits: appended("--limit"),
      });
    case "release-intent":
      // Absent `--intent` is the inspect face, so it stays `null` rather than "".
      return runReleaseIntent(writeContext, { ...shared, intent: option("--intent") });
    case "continue-lifecycle":
      return runContinueLifecycle(writeContext, {
        ...shared,
        historyAction: option("--history-action"),
        roadmapUpdate: option("--roadmap-update"),
        nextRecommendation: option("--next-recommendation"),
      });
    default:
      throw new UnsupportedBuilderArgvError(`unsupported argv: ${argv.join(" ")}`);
  }
}
