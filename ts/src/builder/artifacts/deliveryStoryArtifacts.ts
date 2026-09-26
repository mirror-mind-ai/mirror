// CV22.DS7.US8 plateau 5 — the Delivery Story package and the closure artifacts.
//
// Port of `_write_delivery_story_package` / `_render_*_artifact` in
// `delivery_story_plan.py` and `_write_artifact` / `_render_artifact` in
// `delivery_story_closure.py`.
//
// Two OPPOSITE file rules live here, and the difference is deliberate in Python:
//
//   * the Plan package preserves — `index.md`, `plan.md`, and `test-guide.md` are
//     written only when absent, so Expand-generated or hand-authored content
//     survives Plan and approval alike;
//   * the closure artifacts OVERWRITE — `validation.md`, `review.md`,
//     `coherence.md`, and `done.md` are rewritten on every call. That is CR079, the
//     same defect story closure carries, and it is reproduced rather than repaired:
//     adding the "obvious" existence guard here fails the corpus on purpose.
//
// The manifest each writer returns reports the REAL disk action, which is what the
// artifact writer says it did, because the ARTIFACTS_MATERIALIZED surface must match
// what happened rather than what was intended (CR079). The package is a scaffold,
// written only where absent; the closure artifact is a sealed record.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pySplitLines, pyStrip } from "#util/pythonText.ts";
import {
  existingArtifact,
  type MaterializedArtifact,
  materializedArtifact,
} from "./artifactSurfaces.ts";
import {
  type ArtifactOutcome,
  requireProjectRoot,
  writeBuilderArtifact,
} from "./artifactWriter.ts";

/** What the renderers need from a Delivery Story Plan report. */
export interface DeliveryStoryArtifactInput {
  readonly journey: string;
  readonly method: string;
  readonly deliveryStory: string;
  readonly deliveryStoryTitle: string | null;
  readonly childWorkItems: readonly string[];
  readonly objective: string;
}

const FLOW_UNIT_DELIVERY_STORY = "delivery_story";

/** Python's `"\n".join(f"- {item}" for item in items) or "- none"`. */
function childList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n") || "- none";
}

/** Python `_PLAN_CONTRACT_SECTIONS`, with the guidance text that becomes the placeholder. */
const PLAN_CONTRACT_SECTIONS: readonly (readonly [string, string])[] = [
  ["Scope", "name what this Delivery Story delivers across its child work packages."],
  ["Non-Goals", "name what is explicitly out of scope for this Delivery Story."],
  [
    "Acceptance Behavior",
    "describe the aggregate observable outcome, using Given/When/Then when practical.",
  ],
  [
    "Validation Route",
    "describe how the aggregate delivery is validated, including whether E2E is required.",
  ],
  [
    "Implementation Contract",
    "record the constraints for child work: TDD for behavior changes, changes scoped to " +
      "this Delivery Story's children, and no silent scope absorption.",
  ],
];

/** Python `_placeholder_line`. */
export function placeholderLine(guidance: string): string {
  return `Pending — ${guidance}`;
}

/**
 * Python `_unfilled_plan_sections_for` in `delivery_story_plan.py`.
 *
 * NOT `planPreauthorization.unfilledPlanSectionsFor`, and the difference is an
 * authority boundary rather than a detail. The Delivery Story check carries two
 * conditions the story-level one does not:
 *
 *   * the section body CONTAINS this section's exact scaffold line
 *     (`Pending — <guidance>`) anywhere, not only at the start of a line;
 *   * the casefolded body contains `placeholder` ANYWHERE, where the story-level
 *     rule only matches it at the start of a line.
 *
 * So the DS rule is strictly broader, and reusing the story helper would consume a
 * preauthorization receipt against a Plan Python still calls unfilled — authority
 * granted where Python refuses it. Graded by
 * `delivery_story_preauthorization_refuses_prose_placeholder`.
 */
export function unfilledDeliveryStoryPlanSections(planPath: string | null): string[] {
  const headers = PLAN_CONTRACT_SECTIONS.map(([header]) => header);
  if (planPath === null || !existsSync(planPath)) return headers;
  const sections = levelTwoSections(readFileSync(planPath, "utf8"));
  const throwaway = new Set(["todo", "tbd", "...", "n/a", "none"]);
  const unfilled: string[] = [];
  for (const [header, guidance] of PLAN_CONTRACT_SECTIONS) {
    const body = pyStrip(sections.get(header) ?? "");
    const normalized = body.toLowerCase();
    const lines = pySplitLines(body)
      .map((line) => pyStrip(line).toLowerCase())
      .filter((line) => line !== "");
    if (
      !body ||
      body.includes(placeholderLine(guidance)) ||
      lines.some((line) => line.startsWith("pending")) ||
      lines.some((line) => throwaway.has(line)) ||
      normalized.includes("placeholder")
    ) {
      unfilled.push(header);
    }
  }
  return unfilled;
}

/**
 * Python `_level_two_sections` — the DS copy.
 *
 * `setdefault` semantics: a repeated `## Scope` appends to the first section.
 */
function levelTwoSections(planText: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of planText.split("\n")) {
    if (line.startsWith("## ")) {
      current = pyStrip(line.slice(3));
      if (!sections.has(current)) sections.set(current, []);
    } else if (current !== null) {
      sections.get(current)?.push(line);
    }
  }
  return new Map([...sections].map(([header, lines]) => [header, lines.join("\n")]));
}

/** Python `_render_plan_artifact`. */
export function renderDeliveryStoryPlanArtifact(report: DeliveryStoryArtifactInput): string {
  const contractSections = PLAN_CONTRACT_SECTIONS.map(
    ([header, guidance]) => `## ${header}\n\n${placeholderLine(guidance)}`,
  ).join("\n\n");
  return `# Delivery Story Plan — ${report.deliveryStory}

**Journey:** ${report.journey}
**Method:** ${report.method}
**Navigator Flow Unit:** ${FLOW_UNIT_DELIVERY_STORY}

## Delivery Story

${report.deliveryStoryTitle || "Untitled Delivery Story"}

## Objective

${report.objective}

## Child Work Packages

${childList(report.childWorkItems)}

${contractSections}

---

_Approval and lifecycle state are tracked by the Builder runtime, not duplicated in this plan._
`;
}

/** Python `_render_index_artifact`. */
export function renderDeliveryStoryIndexArtifact(report: DeliveryStoryArtifactInput): string {
  const title = report.deliveryStoryTitle || report.deliveryStory;
  return `[< Parent](../index.md)

# ${report.deliveryStory} — ${title}

**Status:** 🟡 Planned
**Type:** Delivery Story

---

## Outcome

${report.objective}

## Child Work Packages

${childList(report.childWorkItems)}

## Done Condition

The Delivery Story is done when its child work packages produce a coherent delivery outcome.

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
`;
}

/** Python `_render_test_guide_artifact`. */
export function renderDeliveryStoryTestGuideArtifact(report: DeliveryStoryArtifactInput): string {
  return `[< Story](index.md)

# Test Guide — ${report.deliveryStory}

## Aggregate Validation

Pending aggregate Delivery Story validation across child work packages.

## Child Work Packages

${childList(report.childWorkItems)}

## Navigator Validation

Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the Delivery Story can pass aggregate Validation.

## Validation Evidence

Pending implementation and validation.
`;
}

/**
 * Python `_write_delivery_story_package`.
 *
 * Insert-if-absent for all three files, and the manifest order is
 * `index → plan → test guide` regardless of which one was created.
 */
export function writeDeliveryStoryPackage(
  planPath: string,
  report: DeliveryStoryArtifactInput,
  projectRoot: string | null | undefined,
): readonly MaterializedArtifact[] {
  const parent = dirname(planPath);
  const root = requireProjectRoot(projectRoot, planPath);
  const write = (kind: string, path: string, content: string): MaterializedArtifact =>
    writeBuilderArtifact({ path, content, policy: "create-only", projectRoot: root }) === "existing"
      ? existingArtifact(kind, path)
      : materializedArtifact(kind, path, { existedBefore: false });
  // Written plan first, as before: the plan is the artifact the other two describe.
  const plan = write("plan", planPath, renderDeliveryStoryPlanArtifact(report));
  const index = write(
    "story index",
    join(parent, "index.md"),
    renderDeliveryStoryIndexArtifact(report),
  );
  const testGuide = write(
    "test guide",
    join(parent, "test-guide.md"),
    renderDeliveryStoryTestGuideArtifact(report),
  );
  return [index, plan, testGuide];
}

/** What the closure artifact renderer needs from a DS closure report. */
export interface DeliveryStoryClosureArtifactInput {
  readonly deliveryStory: string;
  readonly childWorkItems: readonly string[];
  readonly checkpoint: string;
  readonly status: string;
  readonly summary: string;
  readonly boundary: string;
}

/** Python `_render_artifact` in `delivery_story_closure.py`. */
export function renderDeliveryStoryClosureArtifact(
  report: DeliveryStoryClosureArtifactInput,
): string {
  // Python's `str.title()` over a `_`-to-space checkpoint name: `debt_review`
  // becomes `Debt Review`.
  const title = report.checkpoint
    .replaceAll("_", " ")
    .replace(
      /[A-Za-z]+('[A-Za-z]*)?/g,
      (word) => word[0].toUpperCase() + word.slice(1).toLowerCase(),
    );
  return `# ${title} — ${report.deliveryStory}

## Status

${report.status}

## Summary

${report.summary}

## Child Work Packages

${report.childWorkItems.map((item) => `- ${item}`).join("\n") || "- none"}

## Boundary

${report.boundary}
`;
}

/**
 * A Delivery Story closure record: created sealed, rewritten while its seal holds,
 * and otherwise preserved (CR079). Null when the story has no package to write to.
 */
export function writeDeliveryStoryClosureArtifact(
  path: string | null,
  report: DeliveryStoryClosureArtifactInput,
  projectRoot: string | null | undefined,
): ArtifactOutcome | null {
  if (path === null) return null;
  return writeBuilderArtifact({
    path,
    content: renderDeliveryStoryClosureArtifact(report),
    policy: "sealed-record",
    projectRoot: requireProjectRoot(projectRoot, path),
  });
}
