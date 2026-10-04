// CR103 — no marked surface prints a roadmap package's whole status line.
//
// Every status line in this world carries a sentinel after its separator, with the
// Markdown a changelog carries. The commands walked are the callers of the renderers
// that call `formatCandidate`, `formatPackage`, or `statusMarker`, which is the rule for
// adding one: `build load` with nothing pulled and with a story pulled,
// `pull-candidates` both ways, `done-item` with its `PROJECT_POSITION` trailer, and
// `done-delivery-story` with its. No surface holds the sentinel, no card row is wider
// than the frame, a Blocked CV in focus keeps its title, no list names the Done story
// whose changelog says Active, and the Candidate is recommended over the Blocked story
// whose changelog says Planned (D3).
//
// The Delivery Story's packages are marked `✅ Done` with no tail before its Done: the
// preflight that reads them is CR119's, and refuses a tail today.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderBuilderEntrySurface } from "#builder/load.ts";
import { authorPlan, authorStoryIndex } from "#helpers/authorScaffold.ts";
import {
  type BuilderRun,
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

const SENTINEL = "TAIL-7c1e";
const TAIL = `— ${SENTINEL} restarted, **bold**, [a link](../../decisions.md#x), \`code\``;
/** A frame row, borders included. */
const FRAME_WIDTH = 58;

function world(): BuilderWorld {
  return builderWorld({
    files: {
      "docs/project/roadmap/index.md": "# Roadmap\n",
      "docs/project/roadmap/cv1/index.md": `# CV1 — Checkout\n\n**Status:** 🟢 Active ${TAIL}\n`,
      "docs/project/roadmap/cv1/ds1/index.md":
        `# CV1.DS1 — Checkout address\n\n**Status:** 🟢 In Progress ${TAIL}\n**Type:** Delivery Story\n\n` +
        "## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
        `| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned ${TAIL} |\n` +
        `| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned ${TAIL} |\n`,
      "docs/project/roadmap/cv1/ds2/index.md": `# CV1.DS2 — Pay by card\n\n**Status:** 🟡 Candidate ${TAIL}\n**Type:** User Story\n`,
      "docs/project/roadmap/cv1/ds3/index.md": `# CV1.DS3 — Export to CSV\n\n**Status:** 🔴 Blocked — Planned ${SENTINEL} waits on the vendor\n**Type:** User Story\n`,
      "docs/project/roadmap/cv1/ds4/index.md": `# CV1.DS4 — Monthly digest\n\n**Status:** ✅ Done — Active ${SENTINEL} development moved\n**Type:** User Story\n`,
      "docs/project/roadmap/cv2/index.md": `# CV2 — Payments\n\n**Status:** 🔴 Blocked ${TAIL} [the ticket](https://example.com/t/1)\n`,
      "docs/project/roadmap/cv2/ds1/index.md": `# CV2.DS1 — Card\n\n**Status:** 🔴 Blocked ${TAIL}\n**Type:** User Story\n`,
    },
  });
}

interface Surface {
  readonly id: string;
  readonly rows: readonly string[];
}

function surfaces(stdout: string): Surface[] {
  const found: Surface[] = [];
  let current: { id: string; rows: string[] } | null = null;
  for (const line of stdout.split("\n")) {
    const open = /^<<<ARIAD:([A-Z_]+)>>>$/u.exec(line);
    if (open) {
      current = { id: open[1] ?? "", rows: [] };
      continue;
    }
    if (current !== null && line === `<<<END:${current.id}>>>`) {
      found.push(current);
      current = null;
      continue;
    }
    if (current !== null) current.rows.push(line);
  }
  assert.equal(current, null, "every surface the output opens, it closes");
  return found;
}

/**
 * No surface holds the sentinel, and no card row is wider than the frame. Python's
 * ragged header literals are narrower than the frame, never wider, so the bound is
 * what the Blocked focus row broke.
 */
function clean(stdout: string, label: string, expectSurface = true): Surface[] {
  const found = surfaces(stdout);
  if (expectSurface) assert.ok(found.length > 0, `${label}: prints a surface`);
  for (const surface of found) {
    for (const row of surface.rows) {
      assert.ok(!row.includes(SENTINEL), `${label}: ${surface.id} prints the line: ${row}`);
      if (/^[│╭╰]/u.test(row)) {
        assert.ok(
          Array.from(row).length <= FRAME_WIDTH,
          `${label}: ${surface.id} row wider than the frame: ${row}`,
        );
      }
    }
  }
  return found;
}

function ran(w: BuilderWorld, argv: readonly string[], label: string): BuilderRun {
  const result = runBuild(w, argv);
  assert.equal(result.exitCode, 0, `${label}: ${result.stderr}${result.stdout}`);
  clean(result.stdout, label);
  return result;
}

function load(w: BuilderWorld, label: string): string {
  const stdout = renderBuilderEntrySurface(w.db, "demo", w.project);
  clean(stdout, label);
  return stdout;
}

/** The content of the rows under `label` in `surface`, up to the next blank row. */
function block(stdout: string, surface: string, label: string): string[] {
  const found = surfaces(stdout).find((candidate) => candidate.id === surface);
  assert.ok(found, `the output holds ${surface}`);
  const rows = found.rows.map((row) =>
    row.startsWith("│ ") && row.endsWith("│") ? row.slice(2, -1).trimEnd() : null,
  );
  const at = rows.indexOf(label);
  assert.notEqual(at, -1, `${surface} has a ${label} block`);
  const out: string[] = [];
  for (const row of rows.slice(at + 1)) {
    if (row === null || row === "") break;
    out.push(row);
  }
  return out;
}

const PULL_US1 = [
  "pull-item",
  "--item-code",
  "CV1.DS1.US1",
  "--item-level",
  "user_story",
  "--item-title",
  "Enter an address",
  "--why-now",
  "next",
];

/**
 * The list names the Blocked story and the Candidate by their clauses and not the Done
 * story, and the Candidate is recommended over the Blocked story whose changelog says
 * Planned. `PULL_CANDIDATES` and the `PROJECT_POSITION` trailer word the recommendation
 * differently.
 */
function assertListsClassifyByClause(stdout: string, surface: string, label: string): void {
  const list = block(stdout, surface, "candidates in CV1").join("\n");
  assert.ok(!list.includes("CV1.DS4"), `${label}: the Done story is not listed`);
  assert.match(list, /CV1\.DS3 — Export to CSV \[user_story\] 🔴 Blocked$/mu, label);
  assert.match(list, /CV1\.DS2 — Pay by card \[user_story\] 🟡 Candidate$/mu, label);
  const [recommended, pattern] =
    surface === "PULL_CANDIDATES"
      ? [block(stdout, surface, "recommended pull")[0], /^CV1\.DS2 — Pay by card/u]
      : [block(stdout, surface, "What looks next?")[0], /^🟦\[CV1\.DS2\] Pay by card/u];
  assert.match(
    recommended ?? "",
    pattern,
    `${label}: the Candidate is recommended over the Blocked story whose changelog says Planned`,
  );
}

test("a story's walk prints every status as its clause", () => {
  const w = world();
  const unscoped = load(w, "load, nothing pulled");
  const projectWide = block(unscoped, "PROJECT_POSITION", "project-wide candidates").join("\n");
  assert.ok(!projectWide.includes("CV1.DS4"), "the Done story is not listed project-wide");
  assert.match(projectWide, /CV1 — Checkout \[cv\] 🟢 Active$/mu);
  ran(w, ["pull-candidates"], "pull-candidates, nothing pulled");

  ran(w, PULL_US1, "pull");
  const scoped = load(w, "load, a story pulled");
  assert.deepEqual(block(scoped, "BUILDER_RESUME", "roadmap position"), [
    "CV1 — Checkout (🟢 Active)",
    "[docs/project/roadmap/cv1/index.md]",
  ]);
  const candidates = ran(w, ["pull-candidates"], "pull-candidates, a story pulled");
  assertListsClassifyByClause(candidates.stdout, "PULL_CANDIDATES", "scoped");

  const planned = ran(w, ["plan-item"], "plan");
  const pkg = planned.stdout.match(/^story_package_path=(.+)$/mu)?.[1];
  assert.ok(pkg, "Plan names its package");
  authorPlan(join(pkg, "plan.md"));
  authorStoryIndex(join(pkg, "index.md"));
  ran(w, ["approve-plan"], "approve");
  ran(
    w,
    [
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
    ],
    "validate",
  );
  ran(w, ["review-item", "--debt", "No debt found", "--decision", "no_action"], "review");
  const done = ran(
    w,
    ["done-item", "--history-action", "h", "--roadmap-update", "r", "--next-recommendation", "n"],
    "done",
  );
  assertListsClassifyByClause(done.stdout, "PROJECT_POSITION", "the story's Done trailer");

  // A Blocked CV in focus: the snapshot's focus row keeps its title and its border.
  const synced = runBuild(w, ["sync-cursor"]);
  assert.equal(synced.exitCode, 0, synced.stderr);
  clean(synced.stdout, "sync", false);
  ran(
    w,
    [
      "pull-item",
      "--item-code",
      "CV2.DS1",
      "--item-level",
      "user_story",
      "--item-title",
      "Card",
      "--why-now",
      "next",
    ],
    "pull under the Blocked CV",
  );
  const snapshot = ran(w, ["pull-candidates"], "pull-candidates under the Blocked CV");
  const focus = surfaces(snapshot.stdout)
    .find((surface) => surface.id === "ROADMAP_SNAPSHOT")
    ?.rows.find((row) => row.includes("[CV2]"));
  assert.ok(focus, "the snapshot has a focus row for CV2");
  assert.equal(Array.from(focus).length, FRAME_WIDTH, focus);
  assert.match(focus, /🟪\[CV2\] {2}Payments\s+○ 🔴 blocked │$/u, focus);
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

test("a Delivery Story's walk prints every status as its clause, its Done trailer included", () => {
  const w = world();
  ran(
    w,
    [
      "pull-item",
      "--item-code",
      "CV1.DS1",
      "--item-level",
      "delivery_story",
      "--item-title",
      "Checkout address",
      "--why-now",
      "next",
    ],
    "pull a Delivery Story",
  );
  ran(w, ["set-flow-unit", "--unit", "delivery_story"], "flow unit");
  ran(
    w,
    [
      "plan-delivery-story",
      "--objective",
      "Checkout takes an address",
      "--child",
      "CV1.DS1.US1",
      "--child",
      "CV1.DS1.TS1",
    ],
    "Delivery Story plan",
  );
  ran(w, ["approve-delivery-story-plan"], "Delivery Story approval");
  ran(
    w,
    ["validate-delivery-story", "--summary", "s", "--navigator-accepted"],
    "Delivery Story validation",
  );
  ran(
    w,
    ["review-delivery-story", "--decision", "no_action", "--summary", "s"],
    "Delivery Story review",
  );
  ran(w, ["coherence-delivery-story", "--summary", "s"], "Delivery Story coherence");
  // Marked Done with no tail: the preflight that reads these lines is CR119's.
  for (const path of indexFiles(join(w.project, "docs/project/roadmap/cv1/ds1"))) {
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace(/\*\*Status:\*\* .*/u, "**Status:** ✅ Done")
        .replace(/\| 🟡 Planned [^|]*\|/gu, "| ✅ Done |"),
      "utf8",
    );
  }
  const done = ran(w, ["done-delivery-story", "--summary", "s"], "Delivery Story done");
  assertListsClassifyByClause(done.stdout, "PROJECT_POSITION", "the Delivery Story's Done trailer");
});
