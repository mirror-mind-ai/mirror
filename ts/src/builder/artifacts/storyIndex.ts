// CV22.DS7.US8 plateau 3 — the story-package `index.md` scaffolds Expand writes.
//
// Port of the `_render_*_index` half of `src/memory/builder/lifecycle.py`.
//
// These bodies are written into the Navigator's repository and then read by
// humans, by `resolve_story_directory` (which locates a package by the heading
// these render), and by Expand's own candidate-table parser. So they are graded as
// bytes, not as structure: a changed dash, a dropped blank line, or a `—` turned
// into `--` moves a heading out of the grammar that finds it again.
//
// The Delivery Story scaffold is the one that closes the loop: it emits the
// canonical five-column candidate table, which is exactly the shape
// `parseCandidateStories` requires. A port that drifts here produces a package
// whose own Expand refuses it.

import { storyFolderName } from "../storyPaths.ts";
import {
  fill,
  STORY_OUTCOME,
  TECHNICAL_STORY_ACCEPTANCE,
  TECHNICAL_STORY_STATEMENT,
  USER_STORY_ACCEPTANCE,
  USER_STORY_STATEMENT,
} from "./scaffoldSections.ts";

// Every sentence below is a template in `scaffoldSections.ts` (CR112): the reader
// that tells a scaffold from an authored file matches against the same lines these
// writers fill, so neither can drift from the other.

function fillLines(lines: readonly string[], title: string): string {
  return lines.map((line) => fill(line, { title })).join("\n");
}

/** Python `_user_story_statement`. */
export function userStoryStatement(title: string): string {
  return fillLines(USER_STORY_STATEMENT, title);
}

/** Python `_technical_story_statement`. */
export function technicalStoryStatement(title: string): string {
  return fillLines(TECHNICAL_STORY_STATEMENT, title);
}

/** Python `_user_story_outcome`. */
export function userStoryOutcome(title: string): string {
  return fill(STORY_OUTCOME, { title });
}

/** Python `_render_delivery_story_index`. */
export function renderDeliveryStoryIndex(
  code: string,
  title: string,
  recommendedCode: string,
  recommendedTitle: string,
): string {
  const link = `${storyFolderName(recommendedCode, recommendedTitle)}/index.md`;
  return `[< Parent](../index.md)

# ${code} — ${title}

**Status:** 🟡 Planned
**Type:** Delivery Story

---

## Outcome

${title}

## Candidate Stories

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [${recommendedCode}](${link}) | ${recommendedTitle} | User Story | ${userStoryOutcome(recommendedTitle)} | 🟡 Planned |

## Done Condition

The Delivery Story is done when child User/Technical Stories produce a coherent delivery outcome.
`;
}

/** Python `_render_technical_story_index`. */
export function renderTechnicalStoryIndex(code: string, title: string): string {
  return `[< Parent](../index.md)

# ${code} — ${title}

**Status:** 🟡 Planned
**Type:** Technical Story

---

## Technical Story

${technicalStoryStatement(title)}

## Outcome

${userStoryOutcome(title)}

## Acceptance Behavior

\`\`\`text
${fillLines(TECHNICAL_STORY_ACCEPTANCE, title)}
\`\`\`

## Scope

- ${title}

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Navigator-visible validation route plus automated checks.
`;
}

/** Python `_render_user_story_index`. */
export function renderUserStoryIndex(code: string, title: string): string {
  return `[< Parent](../index.md)

# ${code} — ${title}

**Status:** 🟡 Planned
**Type:** User Story

---

## User Story

${userStoryStatement(title)}

## Outcome

${userStoryOutcome(title)}

## Acceptance Behavior

\`\`\`text
${fillLines(USER_STORY_ACCEPTANCE, title)}
\`\`\`

## Scope

- ${title}

## Out Of Scope

- Sibling Delivery Story scope.

## Validation

Navigator-visible validation route plus automated checks.
`;
}

/** Python `_render_story_index`: the level chooses the scaffold. */
export function renderStoryIndex(code: string, title: string, level: string): string {
  return level === "technical_story"
    ? renderTechnicalStoryIndex(code, title)
    : renderUserStoryIndex(code, title);
}
