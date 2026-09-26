// CV22.DS7.US8 plateau 3 — the three files Plan materializes.
//
// Port of `_write_story_package` and its renderers from
// `src/memory/builder/lifecycle.py`.
//
// `writeStoryPackage` is the preservation rule in code: `if not path.exists()`, per
// FILE, so a package where a Driver authored `plan.md` but not `test-guide.md` gets
// the guide created and the plan left alone. A port that writes unconditionally
// destroys authored work silently, in someone else's git history — the worst defect
// available in this story, and the subject of CR004/CR015/CR079.
//
// The generated `plan.md` is also read back by
// `unfilledPlanSectionsFor`, so its `## ` headings are a contract with the authority
// module, not decoration: rename one and a freshly scaffolded Plan reads as
// incomplete forever.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ContractDefinition } from "../methodDefinition.ts";
import { requireProjectRoot, writeBuilderArtifact } from "./artifactWriter.ts";

/** Python `_markdown_list`: an empty list renders the literal fallback line. */
export function markdownList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None declared.";
}

/** Python `_user_story_statement` / `_technical_story_statement`, shared with Expand. */
import { technicalStoryStatement, userStoryStatement } from "./storyIndex.ts";

/** The subset of the Plan report these renderers read. */
export interface PlanArtifactInput {
  readonly activeItem: string;
  readonly activeItemTitle: string | null;
  readonly activeItemLevel: string | null;
  readonly objective: string;
  readonly scope: readonly string[];
  readonly nonGoals: readonly string[];
  readonly acceptanceBehavior: readonly string[];
  readonly validationRoute: readonly string[];
  readonly e2eDecision: string;
  readonly localRules: readonly string[];
  readonly implementContract: ContractDefinition;
  readonly activeCheckpoint: string | null;
  readonly pendingConfirmation: string | null;
}

/** Python `_render_story_index_artifact`. */
export function renderStoryIndexArtifact(report: PlanArtifactInput): string {
  // `"technical_story".replace("_", " ").title()` -> `Technical Story`; a null level
  // becomes the literal `Story`.
  const storyType = (report.activeItemLevel ?? "story")
    .replaceAll("_", " ")
    .replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const title = report.activeItemTitle ?? report.activeItem;
  const statement =
    report.activeItemLevel === "technical_story"
      ? technicalStoryStatement(title)
      : userStoryStatement(title);
  return `[< Parent](../index.md)

# ${report.activeItem} — ${title}

**Status:** 🟡 Planned
**Type:** ${storyType}

---

## Outcome

${report.objective}

## Story Statement

${statement}

## Acceptance Behavior

\`\`\`text
${report.acceptanceBehavior.join("\n")}
\`\`\`

## Scope

${markdownList(report.scope)}

## Out Of Scope

${markdownList(report.nonGoals)}

## Validation

${markdownList(report.validationRoute)}

---

## Artifacts

- [Plan](plan.md)
- [Test Guide](test-guide.md)
`;
}

/** Python `_render_plan_artifact`. */
export function renderPlanArtifact(report: PlanArtifactInput): string {
  const localRules = report.localRules.map((rule) => `- ${rule}`).join("\n") || "- None declared.";
  const stopConditions = report.implementContract.stopConditions
    .map((condition) => `- ${condition}`)
    .join("\n");
  return `# Plan — ${report.activeItem}

## Objective

${report.objective}

## Scope

${markdownList(report.scope)}

## Non-Goals

${markdownList(report.nonGoals)}

## Acceptance Behavior

\`\`\`text
${report.acceptanceBehavior.join("\n")}
\`\`\`

## Validation Route

${markdownList(report.validationRoute)}

E2E decision: ${report.e2eDecision}

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to \`${report.activeItem}\`.
${localRules}

## Stop Conditions

${stopConditions}

## Approval Gate

- active checkpoint: \`${report.activeCheckpoint}\`
- pending confirmation: \`${report.pendingConfirmation}\`
- implementation remains blocked until Navigator approval.
`;
}

/** Python `_render_test_guide_artifact`. */
export function renderTestGuideArtifact(report: PlanArtifactInput): string {
  return `[< Story](index.md)

# Test Guide — ${report.activeItem}

## Automated Validation

${markdownList(report.validationRoute)}

## E2E Decision

${report.e2eDecision}

## Navigator Validation

Provide the Navigator-visible route with expected observation, pass condition, and fail condition before the story can pass Validation.

## Validation Evidence

Pending implementation and validation.
`;
}

/**
 * Python `_write_story_package`.
 *
 * The directory is created unconditionally, the FILES conditionally. Both halves
 * matter: a missing directory would make the whole package fail, while an existing
 * file must survive untouched.
 */
export function writeStoryPackage(
  directory: string,
  projectRoot: string | null | undefined,
  report: PlanArtifactInput,
): void {
  const root = requireProjectRoot(projectRoot, directory);
  mkdirSync(directory, { recursive: true });
  const artifacts: [string, string][] = [
    [join(directory, "index.md"), renderStoryIndexArtifact(report)],
    [join(directory, "plan.md"), renderPlanArtifact(report)],
    [join(directory, "test-guide.md"), renderTestGuideArtifact(report)],
  ];
  for (const [path, content] of artifacts) {
    writeBuilderArtifact({ path, content, policy: "create-only", projectRoot: root });
  }
}
