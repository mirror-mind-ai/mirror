// CR082 with CR009 — no marked surface prints an absolute path inside the project.
//
// Ariad surfaces are transported verbatim into replies, handoffs, and committed
// documents, so a path a card prints resolved carries the owner's home directory, and a
// card cuts it into 54-column chunks where the root's length decides. These walks run
// every command that prints a path or reports a write, through the front door, in a
// project under a short `/tmp` root, so the root's first card chunk holds all of it and
// a search for the root cannot be fooled by the chunking it is testing.
//
// The four `*_path=` lines Plan prints are the agent's. They stay absolute, and they
// print below the surface's end marker, where the transport rule does not reach (D1).
//
// CR009: every report of a write names the project's folder and the journey on one row,
// so a Navigator can tell from the card alone where the files went. The world's
// project folder is `project`, and its journey is `demo`.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CARD_WIDTH, cardWrapped } from "#builder/card.ts";
import { authorPlan, authorStoryIndex } from "#helpers/authorScaffold.ts";
import {
  type BuilderRun,
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

/** Every world's root starts with this, and it fits on one card row with room to spare. */
const ROOT_MARK = "/tmp/builder-world-";

const DS1_INDEX = `# CV1.DS1 — Checkout address

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |
| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |
`;

/** A project with one Delivery Story to deliver and one for each way Expand refuses. */
function world(): BuilderWorld {
  return builderWorld({
    files: {
      "docs/project/roadmap/index.md": "# Roadmap\n",
      "docs/project/roadmap/cv1/index.md": "# CV1 — Checkout\n\n**Status:** 🟢 Active\n",
      "docs/project/roadmap/cv1/ds1/index.md": DS1_INDEX,
      "docs/project/roadmap/cv1/ds2/index.md":
        "# CV1.DS2 — Checkout payment\n\n**Status:** 🟡 Planned\n\n## Candidate Stories\n\n" +
        "| Family | Scope |\n|--------|-------|\n| cards | pay by card |\n",
      "docs/project/roadmap/cv1/claim/index.md":
        "# CV1.DS3.US1 — Gift wrap\n\n**Status:** 🟡 Planned\n",
      "docs/project/roadmap/cv1/dup-a/index.md": "# CV1.DS4 — Receipts\n\n**Status:** 🟡 Planned\n",
      "docs/project/roadmap/cv1/dup-b/index.md": "# CV1.DS4 — Receipts\n\n**Status:** 🟡 Planned\n",
    },
  });
}

const PACKAGE = "docs/project/roadmap/cv1/ds1/cv1-ds1-us1-enter-an-address";
const TARGET = "project: project · journey: demo";

const CLOSURE_LABELS: Readonly<Record<string, string>> = {
  VALIDATION_CHECKPOINT: "validation artifact",
  DEBT_REVIEW_CHECKPOINT: "review artifact",
  COHERENCE_CHECKPOINT: "coherence artifact",
  DONE_CHECKPOINT: "done artifact",
};

interface Surface {
  readonly id: string;
  readonly rows: readonly string[];
}

/** The marked surfaces in `stdout`, each with its lines, and the lines outside any. */
function split(stdout: string): { surfaces: Surface[]; outside: string[] } {
  const surfaces: Surface[] = [];
  const outside: string[] = [];
  let current: { id: string; rows: string[] } | null = null;
  for (const line of stdout.split("\n")) {
    const open = /^<<<ARIAD:([A-Z_]+)>>>$/u.exec(line);
    if (open) {
      current = { id: open[1] ?? "", rows: [] };
      continue;
    }
    if (current !== null && line === `<<<END:${current.id}>>>`) {
      surfaces.push(current);
      current = null;
      continue;
    }
    if (current === null) outside.push(line);
    else current.rows.push(line);
  }
  assert.equal(current, null, "every surface the output opens, it closes");
  return { surfaces, outside };
}

/** A card row's content, without its borders and trailing padding; null for other lines. */
function content(row: string): string | null {
  if (!(row.startsWith("│ ") && row.endsWith("│"))) return null;
  return row.slice(2, -1).trimEnd();
}

/**
 * No line inside a marked surface holds the root, and no card row there opens a path at
 * `/`, and outside the surfaces only Plan's four `*_path=` lines may hold the root. A
 * refusal on stderr names no root either.
 *
 * A row that continues a full 54-column chunk is exempt from the `/` check: a long
 * project-relative path can be cut right before a slash, so its next chunk opens at
 * `/` legitimately.
 */
function assertNoAbsolutePath(result: BuilderRun, label: string): void {
  const { surfaces, outside } = split(result.stdout);
  for (const surface of surfaces) {
    let previous: string | null = null;
    for (const row of surface.rows) {
      assert.ok(!row.includes(ROOT_MARK), `${label}: ${surface.id} holds the root: ${row}`);
      const text = content(row);
      const continues = previous !== null && Array.from(previous).length === CARD_WIDTH;
      if (text !== null && !continues) {
        assert.doesNotMatch(text, /^(\S{1,2} )?\//u, `${label}: ${surface.id} opens a path at /`);
      }
      previous = text;
    }
  }
  for (const line of outside) {
    if (!line.includes(ROOT_MARK)) continue;
    assert.match(line, /^[a-z_]+_path=/u, `${label}: the root outside a surface: ${line}`);
  }
  assert.ok(!result.stderr.includes(ROOT_MARK), `${label}: stderr holds the root`);
}

/** The rows under `label` in `surface`, up to the next blank row, as the card prints them. */
function block(stdout: string, surface: string, label: string): string[] {
  const found = split(stdout).surfaces.find((candidate) => candidate.id === surface);
  assert.ok(found, `the output holds ${surface}`);
  const rows = found.rows.map(content);
  const at = rows.indexOf(label);
  assert.notEqual(at, -1, `${surface} has a ${label} block`);
  const out: string[] = [];
  for (const row of rows.slice(at + 1)) {
    if (row === null || row === "") break;
    out.push(row);
  }
  return out;
}

/** `text` as the card wraps it, row contents only. */
function wrapped(text: string): string[] {
  return cardWrapped(text).map((row) => content(row) ?? "");
}

/**
 * Every report of a write names its target once (CR009): the artifacts card on the row
 * under its context, a story closure on the row under its record's label, when it has a
 * record. A card names no other target.
 */
function assertTargetNamed(result: BuilderRun, label: string): void {
  for (const surface of split(result.stdout).surfaces) {
    const rows = surface.rows.map(content);
    const named = rows.filter((row) => row?.startsWith("project: ")).length;
    if (surface.id === "ARTIFACTS_MATERIALIZED") {
      const context = rows.indexOf("") + 1;
      const end = rows.indexOf("", context);
      assert.equal(rows[end - 1], TARGET, `${label}: the artifacts card's target`);
      assert.equal(named, 1, `${label}: the artifacts card names one target`);
      continue;
    }
    const record = CLOSURE_LABELS[surface.id];
    if (record !== undefined && rows[rows.indexOf(record) + 1] !== "not materialized") {
      assert.equal(rows[rows.indexOf(record) + 1], TARGET, `${label}: ${surface.id}'s target`);
      assert.equal(named, 1, `${label}: ${surface.id} names one target`);
      continue;
    }
    assert.equal(named, 0, `${label}: ${surface.id} names a target it did not write to`);
  }
}

function ran(result: BuilderRun, label: string, exitCode = 0): BuilderRun {
  assert.equal(result.exitCode, exitCode, `${label}: ${result.stderr}${result.stdout}`);
  assertNoAbsolutePath(result, label);
  assertTargetNamed(result, label);
  return result;
}

const VALIDATE = [
  "validate-item",
  "--implementation-complete",
  "--check",
  "npm test",
  "--checks-status",
  "passed",
  "--e2e-decision",
  "not_required",
  "--e2e-evidence",
  "unit-level change",
  "--navigator-route",
  "walk the route",
  "--navigator-accepted",
  "--expected-observation",
  "it shows",
  "--pass-condition",
  "it does",
  "--fail-condition",
  "it does not",
];

test("a story's lifecycle prints every path project-relative, and Plan's lines below its surface", () => {
  const w = world();
  const templates = ran(runBuild(w, ["prepare-templates"]), "templates");
  assert.match(templates.stdout, /^journey\ndemo\n\nproject\nproject\n\nmethod\nariad\n/mu);
  ran(
    runBuild(w, [
      "pull-item",
      "--item-code",
      "CV1.DS1.US1",
      "--item-level",
      "user_story",
      "--item-title",
      "Enter an address",
      "--why-now",
      "next",
    ]),
    "pull",
  );

  const planned = ran(runBuild(w, ["plan-item"]), "plan");
  assert.deepEqual(block(planned.stdout, "PLAN_CHECKPOINT", "story package"), wrapped(PACKAGE));
  // D1: the four lines follow the end marker, absolute, in their order.
  const after = planned.stdout.split("<<<END:PLAN_CHECKPOINT>>>\n")[1]?.split("\n") ?? [];
  const absolute = join(w.project, PACKAGE);
  assert.deepEqual(after.slice(0, 4), [
    `story_package_path=${absolute}`,
    `index_artifact_path=${absolute}/index.md`,
    `plan_artifact_path=${absolute}/plan.md`,
    `test_guide_artifact_path=${absolute}/test-guide.md`,
  ]);
  assert.equal(w.plan, `${absolute}/plan.md`, "the agent's line still names plan.md");

  authorPlan(join(absolute, "plan.md"));
  authorStoryIndex(join(absolute, "index.md"));
  ran(runBuild(w, ["approve-plan"]), "approve");

  for (const [argv, surface, label, record] of [
    [VALIDATE, "VALIDATION_CHECKPOINT", "validation artifact", "validation.md"],
    [
      ["review-item", "--debt", "No debt found", "--decision", "no_action"],
      "DEBT_REVIEW_CHECKPOINT",
      "review artifact",
      "review.md",
    ],
    [
      ["coherence-item", "--process", "p", "--project", "p", "--product", "p"],
      "COHERENCE_CHECKPOINT",
      "coherence artifact",
      "coherence.md",
    ],
    [
      ["done-item", "--history-action", "h", "--roadmap-update", "r", "--next-recommendation", "n"],
      "DONE_CHECKPOINT",
      "done artifact",
      "done.md",
    ],
  ] as const) {
    const closed = ran(runBuild(w, argv), label);
    assert.deepEqual(
      block(closed.stdout, surface, label),
      [TARGET, ...wrapped(`${PACKAGE}/${record}`)],
      `${label}: the target, then the record, project-relative`,
    );
  }
});

test("a Delivery Story's lifecycle prints no absolute path on any surface", () => {
  const w = world();
  ran(
    runBuild(w, [
      "pull-item",
      "--item-code",
      "CV1.DS1",
      "--item-level",
      "delivery_story",
      "--item-title",
      "Checkout address",
      "--why-now",
      "next",
    ]),
    "pull a Delivery Story",
  );
  ran(runBuild(w, ["set-flow-unit", "--unit", "delivery_story"]), "flow unit");
  ran(
    runBuild(w, [
      "plan-delivery-story",
      "--objective",
      "Checkout takes an address",
      "--child",
      "CV1.DS1.US1",
      "--child",
      "CV1.DS1.TS1",
    ]),
    "Delivery Story plan",
  );
  ran(runBuild(w, ["approve-delivery-story-plan"]), "Delivery Story approval");
  ran(
    runBuild(w, ["validate-delivery-story", "--summary", "s", "--navigator-accepted"]),
    "Delivery Story validation",
  );
  ran(
    runBuild(w, ["review-delivery-story", "--decision", "no_action", "--summary", "s"]),
    "Delivery Story review",
  );
  ran(runBuild(w, ["coherence-delivery-story", "--summary", "s"]), "Delivery Story coherence");
  for (const path of indexFiles(join(w.project, "docs/project/roadmap/cv1/ds1"))) {
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replaceAll("🟡 Planned", "✅ Done")
        .replace(/\*\*Status:\*\* .*/u, "**Status:** ✅ Done"),
      "utf8",
    );
  }
  ran(runBuild(w, ["done-delivery-story", "--summary", "s"]), "Delivery Story done");
});

function indexFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? indexFiles(join(directory, entry.name))
      : entry.name === "index.md"
        ? [join(directory, entry.name)]
        : [],
  );
}

test("Expand's refusals name each package project-relative, for each of its three causes", () => {
  const w = world();
  const pull = (code: string, title: string): BuilderRun =>
    runBuild(w, [
      "pull-item",
      "--item-code",
      code,
      "--item-level",
      "delivery_story",
      "--item-title",
      title,
      "--why-now",
      "next",
    ]);
  for (const [code, title, reason] of [
    [
      "CV1.DS2",
      "Checkout payment",
      "authored package at docs/project/roadmap/cv1/ds2 has no canonical candidate-stories " +
        "table (a Markdown table header must include Code, Story, Type, and Status columns); " +
        "refusing to fabricate a generic story",
    ],
    [
      "CV1.DS3",
      "Gift options",
      "CV1.DS3 has no package, and an authored package already claims CV1.DS3.US1 at " +
        "docs/project/roadmap/cv1/claim; refusing to invent a story over it",
    ],
    [
      "CV1.DS4",
      "Receipts",
      "2 roadmap packages claim code 'CV1.DS4': docs/project/roadmap/cv1/dup-a, " +
        "docs/project/roadmap/cv1/dup-b",
    ],
  ] as const) {
    const blocked = ran(pull(code, title), `blocked ${code}`, 1);
    assert.deepEqual(block(blocked.stdout, "EXPAND_BLOCKED", "why blocked"), wrapped(reason), code);
  }
});

test("a double claim met by Plan names both packages project-relative on its Error line", () => {
  const w = world();
  ran(
    runBuild(w, [
      "pull-item",
      "--item-code",
      "CV1.DS4",
      "--item-level",
      "user_story",
      "--item-title",
      "Receipts",
      "--why-now",
      "next",
    ]),
    "pull the claimed code as a story",
  );
  const refused = ran(runBuild(w, ["plan-item"]), "plan a doubly claimed story", 1);
  assert.equal(
    refused.stderr,
    "Error: 2 roadmap packages claim code 'CV1.DS4': docs/project/roadmap/cv1/dup-a, " +
      "docs/project/roadmap/cv1/dup-b\n",
  );
  assert.ok(dirname(w.project).startsWith(ROOT_MARK), "the world sits under the short root");
});

test("with no project, a closure writes no record, and its card names no target", () => {
  const w = world();
  w.db
    .prepare("UPDATE identity SET metadata = ? WHERE layer = 'journey' AND key = 'demo'")
    .run(JSON.stringify({}));
  ran(
    runBuild(w, [
      "pull-item",
      "--item-code",
      "CV1.DS1.US1",
      "--item-level",
      "user_story",
      "--item-title",
      "Enter an address",
      "--why-now",
      "next",
    ]),
    "pull without a project",
  );
  ran(runBuild(w, ["plan-item"]), "plan without a project");
  ran(runBuild(w, ["approve-plan"]), "approve without a project");
  const validated = ran(runBuild(w, VALIDATE), "validate without a project");
  assert.deepEqual(block(validated.stdout, "VALIDATION_CHECKPOINT", "validation artifact"), [
    "not materialized",
  ]);
});

test("the skill tells the agent how to read a card's path, and what the `project:` row is for", () => {
  const skill = readFileSync(
    fileURLToPath(new URL("../../../.pi/skills/mm-build/SKILL.md", import.meta.url)),
    "utf8",
  ).replaceAll(/\s+/gu, " ");
  for (const sentence of [
    "A card prints a path inside the project relative to the journey's `project_path`, the line `build load` printed last.",
    "Open it by joining the two, never by joining it to the working directory, which can belong to another repository.",
    "If that row names a project or journey other than the one this session loaded, tell the Navigator before touching the files.",
    "They are not part of the surface: use them as printed, and do not render them.",
    "name the plan in the reply by its project-relative path: the card's `story package`, then `/plan.md`.",
  ]) {
    assert.ok(skill.includes(sentence), `the skill says: ${sentence}`);
  }
  assert.ok(!skill.includes("include the `plan artifact` path"), "the old Plan line left");
});
