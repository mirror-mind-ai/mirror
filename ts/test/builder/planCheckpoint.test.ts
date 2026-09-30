// CR111 — the Plan checkpoint prints what the runtime knows, and no section of the plan.
//
// The card used to print the scaffold's sentences as the plan -- scope, acceptance, and
// validation, checked off -- even over a plan.md a person had written, while the
// artifacts card under it said "existing plan — authored". Each test runs the real Plan
// over a scratch story package and reads the card the command would print.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import test from "node:test";
import { renderActiveCheckpoint } from "#builder/activeCheckpoint.ts";
import { fill, PLAN_SECTIONS } from "#builder/artifacts/scaffoldSections.ts";
import { judgeStoryFiles, storyFileLines } from "#builder/artifacts/storyFiles.ts";
import { getDeliveryCursor } from "#builder/deliveryCursor.ts";
import { renderPlanCheckpoint } from "#builder/plan.ts";
import {
  planStory,
  removeStoryWorlds,
  STORY_PACKAGE,
  type StoryWorld,
  storyWorld,
} from "#helpers/storyWorld.ts";

test.after(removeStoryWorlds);

const TITLE = "Enter an address";

/** The card's rows, each without its frame, trailing space trimmed. */
function rows(card: string): string[] {
  return card
    .split("\n")
    .filter((line) => line.startsWith("│ "))
    .map((line) => line.slice(2, -1).trimEnd());
}

/** The rows of the block under `header`, up to the next blank row. */
function block(card: string, header: string): string[] {
  const all = rows(card);
  const start = all.indexOf(header);
  if (start === -1) return [];
  const end = all.indexOf("", start);
  return all.slice(start + 1, end === -1 ? undefined : end);
}

/** The card's frame lines for the block under `header`, verbatim. */
function framedBlock(card: string, header: string): string[] {
  const framed = card.split("\n").filter((line) => line.startsWith("│ "));
  const start = framed.findIndex((line) => line.slice(2, -1).trimEnd() === header);
  if (start === -1) return [];
  const end = framed.findIndex((line, index) => index > start && line.slice(2, -1).trim() === "");
  return framed.slice(start + 1, end);
}

/** One sentence per block row run: rows joined, so a wrapped sentence reads whole. */
function prose(card: string): string {
  return rows(card)
    .map((row) => row.trim())
    .join(" ")
    .replace(/\s+/gu, " ");
}

/** A plan.md a person wrote before Plan, every required section present. */
const AUTHORED_PLAN = `# Plan — CV1.DS1.US1

## Objective

Take an address at checkout.

## Scope

- Street, number, and postcode.

## Non-Goals

- Autocomplete.

## Acceptance Behavior

Given a valid address, the order shows it.

## Validation Route

- Enter 1 Main St; expect it on the confirmation page.

## Implementation Contract

- TDD.
`;

function nextAction(card: string): string {
  return block(card, "next action").join(" ");
}

test("CR111: the card prints no placeholder sentence, and none of the plan's blocks", () => {
  const w = storyWorld();
  const card = renderPlanCheckpoint(planStory(w));
  const text = prose(card);
  const sentences = PLAN_SECTIONS.filter((section) => section.kind === "placeholder")
    .flatMap((section) => section.lines)
    .filter((line) => !line.startsWith("```"))
    .map((line) =>
      fill(line, { title: TITLE })
        .replace(/^- /u, "")
        .replace(/^E2E decision: /u, ""),
    );
  assert.ok(sentences.length > 0, "the model holds the placeholder sentences");
  for (const sentence of sentences) {
    assert.ok(!text.includes(sentence), `the card prints "${sentence}"`);
  }
  for (const header of ["plan", "scope", "non-goals", "acceptance", "validation"]) {
    assert.ok(!rows(card).includes(header), `the card has a ${header} block`);
  }
});

test("CR111: the story files rows are the rows build show prints for the same package", () => {
  const w = storyWorld();
  const report = planStory(w);
  const card = renderPlanCheckpoint(report);
  const files = judgeStoryFiles(dirname(w.plan));
  assert.deepEqual(framedBlock(card, "story files"), files.flatMap(storyFileLines));

  const cursor = getDeliveryCursor(w.db, "demo");
  const show = renderActiveCheckpoint({
    journey: "demo",
    cursor,
    records: { folder: STORY_PACKAGE, artifacts: files, present: new Set() },
  });
  assert.ok(show.includes(framedBlock(card, "story files").join("\n")));
});

test("CR111: the card says what each file is, and what it still needs", () => {
  const scaffold = storyWorld();
  assert.deepEqual(block(renderPlanCheckpoint(planStory(scaffold)), "story files"), [
    "○ index.md — scaffold",
    "  to author: Story Statement, Outcome,",
    "             Acceptance Behavior",
    "○ plan.md — scaffold",
    "  to author: Objective, Scope, Acceptance Behavior,",
    "             Validation Route",
    "○ test-guide.md — scaffold",
    "  to author: Automated Validation,",
    "             Navigator Validation",
  ]);

  const written = storyWorld();
  writeFileSync(written.plan, AUTHORED_PLAN, "utf8");
  const authoredRows = block(renderPlanCheckpoint(planStory(written)), "story files");
  assert.ok(authoredRows.includes("✓ plan.md — authored"), authoredRows.join("\n"));

  const objective = storyWorld();
  const report = planStory(objective, { objective: "Take an address at checkout." });
  const planVerdict = report.storyFiles?.find((file) => file.name === "plan.md");
  assert.equal(planVerdict?.state, "partly_authored");
  assert.deepEqual(planVerdict?.toAuthor, ["Scope", "Acceptance Behavior", "Validation Route"]);

  const noProject = storyWorld();
  const unwritten = planStory(noProject, { withoutProject: true });
  assert.equal(unwritten.storyFiles, null);
  const unwrittenCard = renderPlanCheckpoint(unwritten);
  // The handoff review (finding 2): one reason, stated once, on the package row.
  assert.deepEqual(block(unwrittenCard, "story package"), [
    "none: the journey has no project path",
  ]);
  assert.deepEqual(block(unwrittenCard, "story files"), ["none written"]);
});

test("CR111 review: with no project, an --objective given is said to be recorded nowhere", () => {
  const w = storyWorld();
  const report = planStory(w, {
    withoutProject: true,
    objective: "Take an address at checkout.",
  });
  const card = renderPlanCheckpoint(report);
  assert.equal(
    block(card, "story files").join(" "),
    "none written, so the --objective given was recorded nowhere",
  );
  // Not echoed as plan content: the card still prints no section of the plan.
  assert.ok(!prose(card).includes("Take an address at checkout."));
});

test("CR111: the next action follows the file and the route", () => {
  const cases: {
    name: string;
    prepare: (w: StoryWorld) => void;
    preauthorize: boolean;
    withoutProject?: boolean;
    expected: string;
  }[] = [
    {
      name: "ordinary, not authored",
      prepare: () => {},
      preauthorize: false,
      expected:
        "Driver authors plan.md and presents it; the Navigator approves it or requests changes.",
    },
    {
      name: "ordinary, authored",
      prepare: (w) => writeFileSync(w.plan, AUTHORED_PLAN, "utf8"),
      preauthorize: false,
      expected: "Navigator reads plan.md and approves it or requests changes.",
    },
    {
      name: "preauthorized, not authored",
      prepare: () => {},
      preauthorize: true,
      expected: "Driver authors plan.md, then consumes bounded authority.",
    },
    {
      name: "preauthorized, authored",
      prepare: (w) => writeFileSync(w.plan, AUTHORED_PLAN, "utf8"),
      preauthorize: true,
      expected: "Driver consumes bounded authority.",
    },
    {
      name: "ordinary, no project",
      prepare: () => {},
      preauthorize: false,
      withoutProject: true,
      expected: "Navigator approves the Plan or requests changes.",
    },
    {
      name: "preauthorized, no project",
      prepare: () => {},
      preauthorize: true,
      withoutProject: true,
      expected: "Driver completes Plan and consumes bounded authority.",
    },
  ];
  for (const scenario of cases) {
    const w = storyWorld();
    scenario.prepare(w);
    const card = renderPlanCheckpoint(
      planStory(w, {
        preauthorize: scenario.preauthorize,
        withoutProject: scenario.withoutProject ?? false,
      }),
    );
    assert.equal(nextAction(card), scenario.expected, scenario.name);
  }
});
