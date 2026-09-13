// CV22.DS7.US8 plateau 4 — the four files story closure writes.
//
// Port of `_render_validation_artifact`, `_render_review_artifact`,
// `_render_coherence_artifact`, and `_render_done_artifact` from
// `src/memory/builder/lifecycle.py`.
//
// Unlike Plan's story package, these are written UNCONDITIONALLY by their verbs —
// there is no `if not path.exists()` guard anywhere in the closure path. That is
// CR079, and it has already destroyed a 235-line authored `validation.md` and a
// 146-line one a story later. The port reproduces it: `writeClosureArtifact` below
// overwrites on purpose, and the corpus sequence
// `closure_overwrites_authored_artifacts` records it happening. Adding a guard here
// would be a silent product change that makes the CR unfindable, which is worse than
// the defect.
//
// Each body's `## ` headings are also the shape a human reassembles by hand after an
// overwrite, so they are graded as bytes rather than as structure.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { markdownList } from "./planArtifacts.ts";

/** Python `_render_validation_artifact`. */
export function renderValidationArtifact(report: {
  activeItem: string;
  automatedChecks: readonly string[];
  checksStatus: string;
  e2eDecision: string;
  e2eEvidence: string | null;
  navigatorValidationRoute: string;
  navigatorAccepted: boolean;
  expectedObservation: string;
  passCondition: string;
  failCondition: string;
  missingEvidence: readonly string[];
}): string {
  return `# Validation — ${report.activeItem}

## Status

${report.missingEvidence.length > 0 ? "Blocked" : "Passed"}

## Automated Checks

${markdownList(
  report.automatedChecks.length > 0 ? report.automatedChecks : ["No automated checks declared."],
)}

Checks status: ${report.checksStatus}

## E2E

Decision: ${report.e2eDecision}

Evidence: ${report.e2eEvidence || "none"}

## Navigator Validation

Route: ${report.navigatorValidationRoute}

Navigator accepted: ${report.navigatorAccepted ? "yes" : "no"}

Expected observation: ${report.expectedObservation}

Pass condition: ${report.passCondition}

Fail condition: ${report.failCondition}

## Missing Evidence

${markdownList(report.missingEvidence.length > 0 ? report.missingEvidence : ["none"])}
`;
}

/** Python `_render_review_artifact`. */
export function renderReviewArtifact(report: {
  activeItem: string;
  debtFindings: readonly string[];
  debtDecision: string;
  deferReason: string | null;
  revisitTrigger: string | null;
  missingDecision: readonly string[];
}): string {
  return `# Review — ${report.activeItem}

## Status

${report.missingDecision.length > 0 ? "Pending debt decision" : "Reviewed"}

## Debt Findings

${markdownList(
  report.debtFindings.length > 0 ? report.debtFindings : ["No debt findings declared."],
)}

## Debt Decision

${report.debtDecision}

## Defer Reason

${report.deferReason || "none"}

## Revisit Trigger

${report.revisitTrigger || "none"}

## Missing Decision

${markdownList(report.missingDecision.length > 0 ? report.missingDecision : ["none"])}
`;
}

/** Python `_render_coherence_artifact`. */
export function renderCoherenceArtifact(report: {
  activeItem: string;
  processAlignment: string;
  projectAlignment: string;
  productAlignment: string;
  localDifferences: readonly string[];
  missingCoherence: readonly string[];
}): string {
  return `# Coherence — ${report.activeItem}

## Status

${report.missingCoherence.length > 0 ? "Pending coherence" : "Coherent"}

## Process Alignment

${report.processAlignment}

## Project Alignment

${report.projectAlignment}

## Product Alignment

${report.productAlignment}

## Local Guide Differences

${markdownList(report.localDifferences.length > 0 ? report.localDifferences : ["none"])}

## Missing Coherence

${markdownList(report.missingCoherence.length > 0 ? report.missingCoherence : ["none"])}
`;
}

/** Python `_render_done_artifact`. */
export function renderDoneArtifact(report: {
  activeItem: string;
  historyAction: string;
  roadmapUpdate: string;
  nextRecommendation: string;
  missingDone: readonly string[];
}): string {
  return `# Done — ${report.activeItem}

## Status

${report.missingDone.length > 0 ? "Pending Done" : "Done"}

## History Action

${report.historyAction}

## Roadmap Update

${report.roadmapUpdate}

## Next Recommendation

${report.nextRecommendation}

## Missing Done

${markdownList(report.missingDone.length > 0 ? report.missingDone : ["none"])}
`;
}

/**
 * Write a closure artifact the way Python writes it: parents created, content
 * replaced.
 *
 * Deliberately NOT guarded by an existence check. See the module comment: the
 * overwrite is CR079's subject, reproducing it is this port's job, and a guard added
 * here would diverge from the engine being replaced.
 */
export function writeClosureArtifact(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
