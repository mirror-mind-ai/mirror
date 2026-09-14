// CV22.DS7.US8 — argv → `build` leaf, in one place.
//
// Two callers need to turn `["plan-item", "--journey", "demo"]` into the right
// `run*` call: the command golden (`ts/test/builder/commands.test.ts`), which
// replays Python's recorded invocations case by case, and the plateau-4 lifecycle
// smoke, which replays a whole ordered lifecycle. They must agree on the parse or
// the smoke would be grading a second, slightly different front door.
//
// This is deliberately NOT the production argv parser. The real one arrives with
// the route at plateau 8, together with the argparse refusal matrix (D3.17): the
// exit-2 cases, the two-level allowlist, and the twenty Workbench leaves refused by
// name. What lives here is only the happy-path mapping the corpora already grade,
// so implementing it early cannot pre-empt the plateau that owns refusal behavior.
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
  runDoneDeliveryStory,
  runDoneItem,
  runInspectMethod,
  runPlanDeliveryStory,
  runPlanItem,
  runPrepareItem,
  runPrepareTemplates,
  runPullCandidates,
  runPullItem,
  runReviewDeliveryStory,
  runReviewItem,
  runSetFlowUnit,
  runSyncCursor,
  runValidateDeliveryStory,
  runValidateItem,
} from "#builder/commands.ts";
import type { WritableDatabase } from "#db/database.ts";

export interface BuilderInvokeDeps {
  /** The clock the cursor writes stamp with. A test pins it; the smoke does not. */
  readonly nowIso: () => string;
  /** `MIRROR_SESSION_ID`, passed in rather than read, as every TS route does. */
  readonly environmentSessionId?: string | null;
  /**
   * US7's Journey projection seam. Absent means no refresh is requested — right
   * for a hermetic test, wrong for the smoke, where a silently dead seam is
   * exactly the defect US7 shipped once already.
   */
  readonly requestProjectionRefresh?: (journey: string) => void;
}

/** Raised for an argv this mapping does not carry, so a gap cannot pass silently. */
export class UnsupportedBuilderArgvError extends Error {}

export function invokeBuilderArgv(
  db: WritableDatabase,
  argv: readonly string[],
  invokeDeps: BuilderInvokeDeps,
): CommandResult {
  const option = (name: string): string | null => {
    const index = argv.indexOf(name);
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
      ...(invokeDeps.requestProjectionRefresh
        ? { requestProjectionRefresh: invokeDeps.requestProjectionRefresh }
        : {}),
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
        localDifferences: appended("--difference"),
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
    default:
      throw new UnsupportedBuilderArgvError(`unsupported argv: ${argv.join(" ")}`);
  }
}
