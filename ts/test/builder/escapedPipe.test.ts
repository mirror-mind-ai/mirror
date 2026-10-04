// CR107 — a `\|` inside a table cell is a pipe, in every roadmap table Ariad reads.
//
// Three readers split a row on every pipe, so GFM's one way to put a pipe in a cell cut
// the cell and shifted every column after it: Expand recommended a fragment and wrote
// it into a heading and a folder, the roadmap index's CV table read a status from the
// wrong cell, and the Done preflight refused a Done row. The one writer, the Delivery
// Story scaffold, escaped nothing, so what Ariad wrote Ariad could not read. One row
// reader (D1) and one cell writer that is its inverse (D2).

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderDeliveryStoryIndex } from "#builder/artifacts/storyIndex.ts";
import { inspectAuthoredClosure } from "#builder/deliveryStoryRoadmapClosure.ts";
import { snapshotItemsFromContent } from "#builder/pullCandidates.ts";
import { parseCandidateStories, tableCell, tableRowCells } from "#builder/roadmapGrammar.ts";
import {
  type BuilderRun,
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

test("tableRowCells: one row per rule", () => {
  const cases: readonly [string, string, string[]][] = [
    ["a plain row", "| a | b | c |", ["a", "b", "c"]],
    ["an escaped pipe inside a cell", "| a \\| b | c |", ["a | b", "c"]],
    [
      "an escaped pipe inside a code span",
      "| Read `a \\| b` input | c |",
      ["Read `a | b` input", "c"],
    ],
    ["a backslash before a border", "| a \\\\| b |", ["a \\", "b"]],
    ["an escaped pipe at a cell's start", "| \\| a | b |", ["| a", "b"]],
    ["an escaped pipe at a cell's end", "| a \\| | b |", ["a |", "b"]],
    ["leading and trailing pipe runs", "|| a | b ||", ["a", "b"]],
    ["an escaped trailing pipe is content", "| a | b \\|", ["a", "b |"]],
    ["an empty cell", "| a |  | c |", ["a", "", "c"]],
    ["a row with no pipes", "a b", ["a b"]],
    [
      "six escapes in one cell",
      "| x | `\\| Code \\| Delivery Story \\| Status \\|` tables | ✅ Done |",
      ["x", "`| Code | Delivery Story | Status |` tables", "✅ Done"],
    ],
  ];
  for (const [label, row, cells] of cases) {
    assert.deepEqual(tableRowCells(row), cells, label);
  }
});

test("tableCell is the reader's inverse for the characters the reader interprets", () => {
  for (const text of ["Pay by cash | card", "a \\| b", "plain", "| at the edges |", "a \\\\ b"]) {
    assert.deepEqual(tableRowCells(`| ${tableCell(text)} | x |`), [text, "x"], text);
  }
  assert.equal(tableCell("Pay by cash | card"), "Pay by cash \\| card");
  assert.equal(tableCell("a \\| b"), "a \\\\\\| b");
});

const THIS_ROW =
  "| CV20.DS13.TS1 | Pull Candidates DS Grammar | Technical Story | `inspect_pull_candidates` and the roadmap snapshot exclude the `legacy/` archive, accept hyphenated `DS-NN` codes, classify top-level DS codes as `delivery_story`, and read `\\| Code \\| Delivery Story \\| Status \\|` tables under `## Chapter N —` sections | ✅ Done |";

test("CR107: every reader gives a cell its escaped pipe", () => {
  assert.deepEqual(
    snapshotItemsFromContent(
      "| Code | Capability Value | Status |\n|---|---|---|\n| CV1 | Checkout, cash \\| card | 🟢 Active |\n",
    ),
    [{ code: "CV1", title: "Checkout, cash | card", status: "🟢 Active" }],
    "the CV table",
  );
  assert.deepEqual(
    snapshotItemsFromContent(
      "| Code | Delivery Story | Status |\n|---|---|---|\n| DS-1 | Cash \\| card | 🟡 Planned |\n",
    ),
    [{ code: "DS-1", title: "Cash | card", status: "🟡 Planned" }],
    "the DS table",
  );
  assert.deepEqual(
    parseCandidateStories(
      "| Code | Story | Type | Status |\n|---|---|---|---|\n| CV1.DS1.US1 | Read `a \\| b` input | User Story | 🟡 Planned |\n" +
        "| CV1.DS1.US2 | [a \\| b](x.md) | User Story | ✅ Done |\n",
    ).map((child) => [child.code, child.title, child.level, child.status]),
    [
      ["CV1.DS1.US1", "Read `a | b` input", "user_story", "🟡 Planned"],
      ["CV1.DS1.US2", "a | b", "user_story", "✅ Done"],
    ],
    "the candidate table, a link's label included",
  );
  const row = parseCandidateStories(
    `| Code | Story | Type | Outcome | Status |\n|---|---|---|---|---|\n${THIS_ROW}\n`,
  );
  assert.deepEqual(
    row.map((child) => [child.code, child.level, child.status]),
    [["CV20.DS13.TS1", "technical_story", "✅ Done"]],
    "this repository's row, as written",
  );
  assert.equal(
    readFileSync(
      join(
        import.meta.dirname,
        "../../../docs/project/roadmap/cv20-builder-mode-evolution/cv20-ds13-ds-grammar-roadmap-support/index.md",
      ),
      "utf8",
    ).includes(THIS_ROW),
    true,
    "the row is still as written on this roadmap",
  );
});

test("CR107: the Done preflight reads a Done row with an escape as Done", () => {
  const w = builderWorld({
    files: {
      "docs/project/roadmap/index.md": "# Roadmap\n",
      "docs/project/roadmap/cv1/ds1/index.md":
        "# CV1.DS1 — Checkout address\n\n**Status:** ✅ Done\n\n## Candidate Stories\n\n" +
        "| Code | Story | Type | Status |\n|---|---|---|---|\n| CV1.DS1.US1 | Read `a \\| b` input | User Story | ✅ Done |\n",
      "docs/project/roadmap/cv1/ds1/us1/index.md":
        "# CV1.DS1.US1 — Read `a | b` input\n\n**Status:** ✅ Done\n**Type:** User Story\n",
    },
  });
  assert.deepEqual(
    inspectAuthoredClosure(w.project, {
      deliveryStory: "CV1.DS1",
      childWorkItems: ["CV1.DS1.US1"],
    }),
    { ready: true, issues: [] },
  );
});

test("CR107: the scaffold's row reads back as written", () => {
  for (const title of ["Pay by cash | card", "a \\| b"]) {
    const index = renderDeliveryStoryIndex("CV1.DS2", "Payments", "CV1.DS2.US1", title);
    const [child] = parseCandidateStories(index);
    assert.equal(child?.title, title, title);
    assert.equal(child?.status, "🟡 Planned", title);
  }
  assert.match(
    renderDeliveryStoryIndex("CV1.DS2", "P", "CV1.DS2.US1", "cash | card"),
    /\| cash \\\| card \| User Story \| Navigator can validate cash \\\| card as/u,
  );
});

const DS1_INDEX = `# CV1.DS1 — Checkout address

**Status:** 🟡 Planned
**Type:** Delivery Story

## Candidate Stories

| Code | Story | Type | Status |
|------|-------|------|--------|
| CV1.DS1.US1 | Read \`a \\| b\` input | User Story | 🟡 Planned |
| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |
`;

function world(): BuilderWorld {
  return builderWorld({
    files: {
      "docs/project/roadmap/index.md":
        "# Roadmap\n\n| Code | Capability Value | Status |\n|---|---|---|\n| CV1 | Checkout, cash \\| card | 🟢 Active |\n",
      "docs/project/roadmap/cv1/index.md": "# CV1 — Checkout\n\n**Status:** 🟢 Active\n",
      "docs/project/roadmap/cv1/ds1/index.md": DS1_INDEX,
    },
  });
}

function ran(w: BuilderWorld, argv: readonly string[], label: string): BuilderRun {
  const result = runBuild(w, argv);
  assert.equal(result.exitCode, 0, `${label}: ${result.stderr}${result.stdout}`);
  assert.ok(!/\\\s*│/u.test(result.stdout), `${label}: a backslash ends a card row`);
  return result;
}

function pullDs(w: BuilderWorld, code: string, title: string, label: string): BuilderRun {
  return ran(
    w,
    [
      "pull-item",
      "--item-code",
      code,
      "--item-level",
      "delivery_story",
      "--item-title",
      title,
      "--why-now",
      "next",
    ],
    label,
  );
}

function indexFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? indexFiles(join(directory, entry.name))
      : entry.name === "index.md"
        ? [join(directory, entry.name)]
        : [],
  );
}

test("CR107: through the front door, a title with an escaped pipe travels whole", () => {
  const w = world();
  const pulled = pullDs(w, "CV1.DS1", "Checkout address", "pull");
  assert.match(pulled.stdout, /│ 🟩\[US1\] Read `a \| b` input\s+│/u, "the recommendation");
  const child = join(w.project, "docs/project/roadmap/cv1/ds1/cv1-ds1-us1-read-a-b-input/index.md");
  assert.ok(existsSync(child), "the child's folder is slugged from the whole title");
  assert.match(
    readFileSync(child, "utf8"),
    /^# CV1\.DS1\.US1 — Read `a \| b` input$/mu,
    "the child's heading",
  );

  const candidates = ran(w, ["pull-candidates"], "pull-candidates");
  assert.match(
    candidates.stdout,
    /│ 🟪\[CV1\] {2}Checkout, cash \| card\s+◉ active │/u,
    "the focus row",
  );
  assert.match(candidates.stdout, /│ value: Checkout, cash \| card\s+│/u);

  // The Delivery Story's Done, with the escaped row marked Done.
  ran(w, ["set-flow-unit", "--unit", "delivery_story"], "flow unit");
  ran(
    w,
    ["plan-delivery-story", "--objective", "o", "--child", "CV1.DS1.US1", "--child", "CV1.DS1.TS1"],
    "plan",
  );
  ran(w, ["approve-delivery-story-plan"], "approve");
  ran(w, ["validate-delivery-story", "--summary", "s", "--navigator-accepted"], "validate");
  ran(w, ["review-delivery-story", "--decision", "no_action", "--summary", "s"], "review");
  for (const path of indexFiles(join(w.project, "docs/project/roadmap/cv1/ds1"))) {
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replaceAll("🟡 Planned", "✅ Done")
        .replace(/\*\*Status:\*\* .*/u, "**Status:** ✅ Done"),
      "utf8",
    );
  }
  const done = ran(w, ["done-delivery-story", "--summary", "s"], "done");
  assert.match(done.stdout, /<<<ARIAD:DELIVERY_STORY_CLOSURE_CHECKPOINT>>>/u);
});

test("CR107: a Delivery Story pulled with a piped title writes a row a second Pull reads whole", () => {
  const w = world();
  pullDs(w, "CV1.DS2", "Pay by cash | card", "pull, no package");
  const written = indexFiles(join(w.project, "docs/project/roadmap")).find((path) =>
    readFileSync(path, "utf8").startsWith("[< Parent](../index.md)\n\n# CV1.DS2 "),
  );
  assert.ok(written, "the scaffold was written");
  assert.match(
    readFileSync(written, "utf8"),
    /\| Pay by cash \\\| card \| User Story \| Navigator can validate Pay by cash \\\| card as/u,
  );
  ran(w, ["sync-cursor"], "sync");
  const again = pullDs(w, "CV1.DS2", "Pay by cash | card", "pull again");
  assert.match(again.stdout, /│ 🟩\[US1\] Pay by cash \| card\s+│/u, "read back whole");
});
