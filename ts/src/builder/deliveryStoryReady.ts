// CV22.DS7.US8 plateau 3 — the post-Pull orientation for a Delivery Story.
//
// Port of `render_delivery_story_ready_report` and its helpers from
// `src/memory/builder/lifecycle.py`.
//
// This is the only surface composed from THREE reports — Pull, Prepare, and Expand —
// which is why it lives in its own module rather than inside any one event. The CLI
// renders it instead of the Pull and Prepare surfaces when the pulled item is a
// Delivery Story, so a port that emits all three has a duplicate-surface defect no
// renderer-level test can see.
//
// Its ribbon is also its own: `DS Plan` rather than `Plan`, from a stage list that
// exists nowhere else.

import { basename, dirname } from "node:path";
import { kebabSlug } from "#util/slug.ts";
import { cardPrefixed, cardText, cardWrapped } from "./card.ts";
import { cvTitle } from "./cursorTransitions.ts";
import type { BuilderExpandReport } from "./expand.ts";
import type { BuilderPrepareReport } from "./prepare.ts";
import type { BuilderPullReport } from "./pull.ts";
import { titleLeaf } from "./storyPaths.ts";
import { wrapAriadSurface } from "./surfaceProtocol.ts";

/** Python `_delivery_story_flow_ribbon`: the Delivery-Story-level stage labels. */
export function deliveryStoryFlowRibbon(current: string): string {
  const stages: [string, string][] = [
    ["pull", "Pull"],
    ["prepare", "Prepare"],
    ["expand", "Expand"],
    ["plan", "DS Plan"],
    ["implement", "Implement"],
    ["validate", "Validate"],
    ["debt_review", "Debt Review"],
    ["done", "Done"],
  ];
  const index = stages.findIndex(([stage]) => stage === current);
  if (index === -1) throw new Error(`unknown Delivery Story lifecycle stage: ${current}`);
  const parts = stages.map(([, label], position) => {
    const marker = position < index ? "✓" : position === index ? "◉" : "○";
    return `${marker} ${label}`;
  });
  return `Delivery Flow: ${parts.join(" → ")}`;
}

/** Python `_prepare_finding`. */
function prepareFinding(report: BuilderPrepareReport): string {
  return report.granularityDecisionRequired
    ? "Delivery Story requires a granularity decision before implementation."
    : "Pulled story is implementable after Plan approval.";
}

/**
 * Python `_materialized_summary`.
 *
 * Three chained guesses at what a materialized path IS, in Python's order, then a
 * de-duplication that preserves first appearance. The last branch falls back to the
 * folder NAME, which is why an unexpected layout degrades into something readable
 * rather than failing.
 */
function materializedSummary(report: BuilderExpandReport): string[] {
  if (report.materializedPaths.length === 0) return ["none"];
  const deliveryStorySlug = kebabSlug(report.deliveryStory.toLowerCase());
  const recommendedLeaf = report.recommendedStory.split(".").at(-1) ?? report.recommendedStory;
  const recommendedSlug = kebabSlug(recommendedLeaf.toLowerCase());
  const summaries: string[] = [];
  for (const path of report.materializedPaths) {
    const parentName = basename(dirname(path));
    if (parentName === deliveryStorySlug) {
      summaries.push("DS package");
    } else if (parentName.endsWith(recommendedSlug)) {
      summaries.push(`${recommendedLeaf} package`);
    } else if (path.includes(report.deliveryStory.toLowerCase().replaceAll(".", "-"))) {
      summaries.push("DS package");
    } else {
      summaries.push(parentName);
    }
  }
  const deduped: string[] = [];
  for (const summary of summaries) {
    if (!deduped.includes(summary)) deduped.push(summary);
  }
  return deduped;
}

/**
 * Python `_flow_unit_recommendation`.
 *
 * `max(1, len(materialized_artifacts) - 1)` — the artifact list carries the DS
 * package plus one entry per child, so subtracting one counts children, and the
 * floor keeps a single-child Delivery Story from reading as zero.
 */
function flowUnitRecommendation(report: BuilderExpandReport): string {
  const childCount = Math.max(1, report.materializedArtifacts.length - 1);
  return childCount <= 1
    ? "delivery_story — recommended"
    : "delivery_story — recommended unless you want separate Navigator validation for each child story";
}

/** Python `_flow_unit_recommendation_rationale`. */
function flowUnitRecommendationRationale(report: BuilderExpandReport): string {
  const childCount = Math.max(1, report.materializedArtifacts.length - 1);
  return childCount <= 1
    ? "The Delivery Story appears coherent enough to plan, implement, and validate as one Navigator-facing unit while keeping the child story as a traceable work package."
    : "The child work packages appear to support one Delivery Story outcome. Use story_by_story only if each child needs separate Navigator checkpoints.";
}

/** Python `render_delivery_story_ready_report`. */
export function renderDeliveryStoryReadyReport(reports: {
  pull: BuilderPullReport;
  prepare: BuilderPrepareReport;
  expand: BuilderExpandReport;
}): string {
  const { pull, prepare, expand } = reports;
  const codeParts = pull.item.code.split(".");
  const cvCode = codeParts[0] ?? pull.item.code;
  const dsCode = codeParts.length > 1 ? (codeParts.at(-1) ?? "") : pull.item.code;
  const title = titleLeaf(pull.item.title);
  const recommendedLeaf = expand.recommendedStory.split(".").at(-1) ?? expand.recommendedStory;
  const body = `${[
    "Delivery",
    deliveryStoryFlowRibbon("expand"),
    "",
    "╭────────────────────────────────────────────────────────╮",
    cardText(`🧭 ${pull.item.code} READY`),
    "│                                                        │",
    cardText("What was pulled?"),
    ...cardWrapped(title),
    "│                                                        │",
    cardText("Where are we in the roadmap?"),
    cardText(`🟪[${cvCode}] ${cvTitle(pull.item.title)}`),
    cardText(`  └─ 🟦[${dsCode}] ${title}`),
    "│                                                        │",
    cardText("What did Prepare find?"),
    ...cardWrapped(prepareFinding(prepare)),
    "│                                                        │",
    cardText("What was materialized?"),
    ...cardPrefixed(materializedSummary(expand), "✓"),
    "│                                                        │",
    cardText("What is recommended next?"),
    cardText(`🟩[${recommendedLeaf}] ${expand.recommendedStoryTitle}`),
    "│                                                        │",
    cardText("Recommended flow unit"),
    ...cardWrapped(flowUnitRecommendation(expand)),
    "│                                                        │",
    cardText("Why this recommendation?"),
    ...cardWrapped(flowUnitRecommendationRationale(expand)),
    "│                                                        │",
    cardText("What can we do now?"),
    ...cardPrefixed(
      [
        `confirm ${recommendedLeaf} and continue story_by_story`,
        "choose delivery_story as the flow unit",
        "inspect generated story packages",
      ],
      "-",
    ),
    "│                                                        │",
    ...cardWrapped("Choose the next flow unit when ready."),
    "╰────────────────────────────────────────────────────────╯",
  ].join("\n")}\n`;
  return wrapAriadSurface("delivery_story_ready", body);
}
