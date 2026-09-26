// CR002 — the journey's roadmap scope, derived from its delivery cursor.
//
// Hand-written expectations over trees built here, never goldens: the scope is
// new behavior, and there is no oracle to record it from. The trees stage the
// shapes that broke the old project-wide readers:
//
//   * the July tree — a stale `Active` Delivery Story in one CV and Planned work
//     in another, the shape that made `build load` tell a CV20 journey it was at
//     CV9.DS7;
//   * a package parked outside its CV's folder, because a package is what its
//     heading says it is;
//   * a CV whose code prefixes another's (`CV2` and `CV20`);
//   * every position fallback a surface must be able to state instead of throw.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectPullCandidates, inspectRoadmapSnapshot } from "#builder/pullCandidates.ts";
import {
  renderProjectPositionReport,
  renderPullCandidatesReport,
  renderRoadmapSnapshotReport,
} from "#builder/pullCandidatesRender.ts";
import { renderBuilderResumeSurface } from "#builder/resumeSurface.ts";
import {
  cvCodeOf,
  isInsideCv,
  type RoadmapScope,
  resolveRoadmapScope,
  scopeFocus,
  scopePullCandidates,
} from "#builder/roadmapScope.ts";
import { roadmapPositionLines } from "#builder/scopePhrases.ts";

const roots: string[] = [];

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

interface PackageSpec {
  dir: string;
  code: string;
  title: string;
  status?: string;
  type?: string;
}

function writeTree(name: string, packages: PackageSpec[], roadmapIndex?: string): string {
  const root = mkdtempSync(join(tmpdir(), `roadmap-scope-${name}-`));
  roots.push(root);
  const roadmap = join(root, "docs", "project", "roadmap");
  mkdirSync(roadmap, { recursive: true });
  if (roadmapIndex !== undefined) writeFileSync(join(roadmap, "index.md"), roadmapIndex);
  for (const spec of packages) {
    const directory = join(roadmap, ...spec.dir.split("/"));
    mkdirSync(directory, { recursive: true });
    const lines = [`# ${spec.code} — ${spec.title}`, ""];
    if (spec.type) lines.push(`**Type:** ${spec.type}`);
    if (spec.status) lines.push(`**Status:** ${spec.status}`);
    writeFileSync(join(directory, "index.md"), `${lines.join("\n")}\n`);
  }
  return root;
}

// The CV20 row's status differs from the CV20 package's on purpose: it is how the
// focus test tells the roadmap index row apart from the package heading.
const JULY_INDEX = [
  "# Roadmap",
  "",
  "| Code | Capability Value | Status |",
  "|------|------------------|--------|",
  "| [CV2](cv2-small/index.md) | Small Things | 🟡 Planned |",
  "| [CV9](cv9-mirror/index.md) | Mirror Mind 1.0 | 🟢 In Progress |",
  "| [CV20](cv20-builder/index.md) | Builder Mode Evolution | 🟢 In Progress (table) |",
  "",
].join("\n");

function julyTree(): string {
  return writeTree(
    "july",
    [
      { dir: "cv2-small", code: "CV2", title: "Small Things", status: "🟡 Planned" },
      { dir: "cv2-small/cv2-ds1-thing", code: "CV2.DS1", title: "Thing", status: "🟡 Planned" },
      { dir: "cv9-mirror", code: "CV9", title: "Mirror Mind 1.0", status: "🟢 In Progress" },
      {
        dir: "cv9-mirror/cv9-ds7-metadata",
        code: "CV9.DS7",
        title: "Conversation Metadata Lifecycle",
        status: "Active Delivery Story; expansion accepted",
      },
      {
        dir: "cv20-builder",
        code: "CV20",
        title: "Builder Mode Evolution",
        status: "🟢 In Progress",
      },
      {
        dir: "cv20-builder/cv20-ds7-release",
        code: "CV20.DS7",
        title: "Release And Push Policies",
        status: "🟡 Planned",
      },
      {
        dir: "cv20-builder/cv20-ds7-release/cv20-ds7-us1-intent",
        code: "CV20.DS7.US1",
        title: "Define Release Intent",
        type: "User Story",
        status: "🟡 Planned",
      },
      {
        dir: "cv20-builder/cv20-ds12-refinement",
        code: "CV20.DS12",
        title: "Document-First Refinement",
        status: "🟡 Planned — redesign approved",
      },
      {
        dir: "cv20-builder/cv20-ds12-refinement/cv20-ds12-ts1-index",
        code: "CV20.DS12.TS1",
        title: "Canonical Refinement Index",
        type: "Technical Story",
        status: "🟠 Implemented — validation pending",
      },
      // Parked outside its CV's folder: a package is what its heading says it is.
      {
        dir: "parking/cv20-ds9-prefs",
        code: "CV20.DS9",
        title: "Method Preferences",
        status: "🟡 Planned",
      },
    ],
    JULY_INDEX,
  );
}

function edgesTree(): string {
  return writeTree("edges", [
    { dir: "ds-35", code: "DS-35", title: "Hyphen Grammar", status: "🟡 Planned" },
    { dir: "ds-35/ds-35-us-1", code: "DS-35.US-1", title: "Hyphen Child", status: "🟡 Planned" },
    // CV4 has no package of its own; its story does, somewhere else.
    { dir: "stray/cv4-ds1-orphan", code: "CV4.DS1", title: "Orphan Story", status: "🟡 Planned" },
    // Two packages claim CV7, and two claim CV8.DS1 under a CV8 that has none.
    { dir: "a/cv7", code: "CV7", title: "First Claim", status: "🟢 Active" },
    { dir: "b/cv7", code: "CV7", title: "Second Claim", status: "🟢 Active" },
    { dir: "a/cv8-ds1", code: "CV8.DS1", title: "First Item Claim", status: "🟡 Planned" },
    { dir: "b/cv8-ds1", code: "CV8.DS1", title: "Second Item Claim", status: "🟡 Planned" },
  ]);
}

function scoped(root: string, activeItem: string): RoadmapScope {
  return resolveRoadmapScope(root, { activeItem });
}

function candidateCodes(root: string, scope: RoadmapScope) {
  const view = scopePullCandidates(
    inspectPullCandidates(root, { journey: "j", method: "ariad" }),
    scope,
  );
  return {
    shown: view.shown.map((candidate) => candidate.code),
    outsideCount: view.outsideCount,
    recommended: view.recommended?.code ?? null,
  };
}

test("the July tree scans to the candidates these tests are derived from", () => {
  // Pins the fixture, not new behavior: every expectation below is worked out by
  // hand from this list and its order (path components, `-` before `0`).
  const report = inspectPullCandidates(julyTree(), { journey: "j", method: "ariad" });
  assert.deepEqual(
    report.candidates.map((candidate) => `${candidate.code} [${candidate.level}]`),
    [
      "CV2.DS1 [delivery_story]",
      "CV2 [cv]",
      "CV20.DS12 [delivery_story]",
      "CV20.DS7.US1 [user_story]",
      "CV20.DS7 [delivery_story]",
      "CV9.DS7 [delivery_story]",
      "CV20.DS9 [delivery_story]",
    ],
  );
});

test("the CV is the code up to the first dot", () => {
  assert.equal(cvCodeOf("CV22.DS10.TS5"), "CV22");
  assert.equal(cvCodeOf("CV22"), "CV22");
  assert.equal(cvCodeOf("DS-35.US-1"), "DS-35");
  assert.equal(cvCodeOf("CV21.E2.S1b"), "CV21");
});

test("membership is strict descent by code, and the dot keeps CV2 out of CV20", () => {
  assert.equal(isInsideCv("CV2.DS1", "CV2"), true);
  assert.equal(isInsideCv("CV2.DS1.US1", "CV2"), true);
  assert.equal(isInsideCv("DS-35.US-1", "DS-35"), true);
  assert.equal(isInsideCv("CV20.DS7", "CV2"), false);
  assert.equal(isInsideCv("CV2", "CV2"), false, "a CV is its own position, never its candidate");
});

test("no cursor and no active item are unscoped, whatever the tree holds", () => {
  const root = julyTree();
  assert.deepEqual(resolveRoadmapScope(root, null), { kind: "unscoped", reason: "no_cursor" });
  assert.deepEqual(resolveRoadmapScope(root, { activeItem: null }), {
    kind: "unscoped",
    reason: "no_active_item",
  });
});

test("on the July tree the position is the active item's CV, not the stale Active package", () => {
  assert.deepEqual(scoped(julyTree(), "CV20.DS12.TS1"), {
    kind: "active_item",
    activeItem: "CV20.DS12.TS1",
    cvCode: "CV20",
    position: {
      kind: "cv_package",
      package: {
        code: "CV20",
        title: "Builder Mode Evolution",
        status: "🟢 In Progress",
        path: "docs/project/roadmap/cv20-builder/index.md",
      },
    },
  });
});

test("a top-level item is its own CV, hyphen grammar included", () => {
  const root = edgesTree();
  const expected = {
    kind: "cv_package",
    package: {
      code: "DS-35",
      title: "Hyphen Grammar",
      status: "🟡 Planned",
      path: "docs/project/roadmap/ds-35/index.md",
    },
  };
  for (const activeItem of ["DS-35", "DS-35.US-1"]) {
    const scope = scoped(root, activeItem);
    assert.equal(scope.kind, "active_item");
    if (scope.kind !== "active_item") continue;
    assert.equal(scope.cvCode, "DS-35", activeItem);
    assert.deepEqual(scope.position, expected, activeItem);
  }
});

test("every position fallback is stated, never thrown", () => {
  const root = edgesTree();
  const positionOf = (activeItem: string) => {
    const scope = scoped(root, activeItem);
    assert.equal(scope.kind, "active_item");
    return scope.kind === "active_item" ? scope.position : null;
  };

  assert.deepEqual(
    positionOf("CV4.DS1"),
    {
      kind: "item_package",
      package: {
        code: "CV4.DS1",
        title: "Orphan Story",
        status: "🟡 Planned",
        path: "docs/project/roadmap/stray/cv4-ds1-orphan/index.md",
      },
    },
    "a CV without a package falls back to the active item's own",
  );
  assert.deepEqual(positionOf("CV5.DS1"), { kind: "no_package" }, "nothing authored at all");
  assert.deepEqual(
    positionOf("CV7.DS1"),
    {
      kind: "ambiguous",
      code: "CV7",
      paths: ["docs/project/roadmap/a/cv7/index.md", "docs/project/roadmap/b/cv7/index.md"],
    },
    "two packages claim the CV",
  );
  assert.deepEqual(
    positionOf("CV8.DS1"),
    {
      kind: "ambiguous",
      code: "CV8.DS1",
      paths: ["docs/project/roadmap/a/cv8-ds1/index.md", "docs/project/roadmap/b/cv8-ds1/index.md"],
    },
    "the CV has none and two packages claim the item",
  );
  assert.deepEqual(resolveRoadmapScope(null, { activeItem: "CV20.DS1" }), {
    kind: "active_item",
    activeItem: "CV20.DS1",
    cvCode: "CV20",
    position: { kind: "no_project" },
  });
});

test("unscoped, every candidate is shown and nothing is recommended", () => {
  const root = julyTree();
  assert.deepEqual(candidateCodes(root, resolveRoadmapScope(root, null)), {
    shown: ["CV2.DS1", "CV2", "CV20.DS12", "CV20.DS7.US1", "CV20.DS7", "CV9.DS7", "CV20.DS9"],
    outsideCount: 0,
    recommended: null,
  });
});

test("scoped, only the CV's descendants are shown, parked packages included", () => {
  const root = julyTree();
  assert.deepEqual(candidateCodes(root, scoped(root, "CV20.DS12.TS1")), {
    shown: ["CV20.DS12", "CV20.DS7.US1", "CV20.DS7", "CV20.DS9"],
    // CV2.DS1, CV2, and the stale CV9.DS7; CV20 itself is neither shown nor counted.
    outsideCount: 3,
    recommended: "CV20.DS7.US1",
  });
});

test("the active item is never recommended", () => {
  const root = julyTree();
  assert.deepEqual(candidateCodes(root, scoped(root, "CV20.DS7.US1")), {
    shown: ["CV20.DS12", "CV20.DS7", "CV20.DS9"],
    outsideCount: 3,
    recommended: "CV20.DS12",
  });
});

test("a CV never recommends itself when nothing is left under it", () => {
  // CV2 is itself a Planned candidate. With CV2.DS1 active, nothing remains under
  // CV2, and `recommend()` falls back to its first candidate at any level — so a
  // membership that admitted the CV would recommend pulling the CV.
  const root = julyTree();
  assert.deepEqual(candidateCodes(root, scoped(root, "CV2.DS1")), {
    shown: [],
    outsideCount: 5,
    recommended: null,
  });
});

test("two journeys on one project get different positions and recommendations", () => {
  const root = julyTree();
  const builder = scoped(root, "CV20.DS12.TS1");
  const small = scoped(root, "CV2.DS1");
  assert.ok(builder.kind === "active_item" && small.kind === "active_item");
  assert.equal(builder.position.kind === "cv_package" && builder.position.package.code, "CV20");
  assert.equal(small.position.kind === "cv_package" && small.position.package.code, "CV2");
  assert.equal(candidateCodes(root, builder).recommended, "CV20.DS7.US1");
  assert.equal(candidateCodes(root, small).recommended, null);
});

test("the stale Active package never reaches a journey outside its CV", () => {
  const root = julyTree();
  for (const activeItem of ["CV20.DS12.TS1", "CV20.DS7.US1", "CV2.DS1"]) {
    const { shown, recommended } = candidateCodes(root, scoped(root, activeItem));
    assert.ok(!shown.includes("CV9.DS7"), activeItem);
    assert.notEqual(recommended, "CV9.DS7", activeItem);
  }
});

test("the focus is the roadmap index row, then the CV package, then a stated placeholder", () => {
  const july = julyTree();
  const julyItems = inspectRoadmapSnapshot(july, { journey: "j", method: "ariad" }).items;
  assert.equal(scopeFocus(julyItems, resolveRoadmapScope(july, null)), null, "unscoped");
  assert.deepEqual(
    scopeFocus(julyItems, scoped(july, "CV20.DS12.TS1")),
    { code: "CV20", title: "Builder Mode Evolution", status: "🟢 In Progress (table)" },
    "the index row wins over the package heading, as the old focus did",
  );

  const edges = edgesTree();
  const edgeItems = inspectRoadmapSnapshot(edges, { journey: "j", method: "ariad" }).items;
  assert.deepEqual(edgeItems, [], "the edges tree has no roadmap index");
  const focusOf = (activeItem: string) => scopeFocus(edgeItems, scoped(edges, activeItem));
  assert.deepEqual(focusOf("DS-35.US-1"), {
    code: "DS-35",
    title: "Hyphen Grammar",
    status: "🟡 Planned",
  });
  assert.deepEqual(focusOf("CV4.DS1"), { code: "CV4", title: "no authored package", status: "" });
  assert.deepEqual(focusOf("CV5.DS1"), { code: "CV5", title: "no authored package", status: "" });
  assert.deepEqual(focusOf("CV7.DS1"), {
    code: "CV7",
    title: "claimed by 2 packages",
    status: "",
  });
  assert.deepEqual(focusOf("CV8.DS1"), { code: "CV8", title: "no authored package", status: "" });
  assert.deepEqual(scopeFocus([], resolveRoadmapScope(null, { activeItem: "CV20.DS1" })), {
    code: "CV20",
    title: "no project path configured",
    status: "",
  });
});

test("the resume row states every position in the plan's words", () => {
  const july = julyTree();
  const edges = edgesTree();
  assert.deepEqual(roadmapPositionLines(resolveRoadmapScope(july, null)), ["no item pulled yet"]);
  assert.deepEqual(roadmapPositionLines(resolveRoadmapScope(july, { activeItem: null })), [
    "no item pulled yet",
  ]);
  assert.deepEqual(roadmapPositionLines(scoped(july, "CV20.DS12.TS1")), [
    "CV20 — Builder Mode Evolution (🟢 In Progress) [docs/project/roadmap/cv20-builder/index.md]",
  ]);
  assert.deepEqual(roadmapPositionLines(scoped(edges, "CV4.DS1")), [
    "CV4.DS1 — Orphan Story (🟡 Planned) [docs/project/roadmap/stray/cv4-ds1-orphan/index.md]",
    "no authored package for CV4",
  ]);
  assert.deepEqual(roadmapPositionLines(scoped(edges, "CV5.DS1")), [
    "no authored package for CV5 or CV5.DS1",
  ]);
  assert.deepEqual(roadmapPositionLines(scoped(edges, "CV5")), ["no authored package for CV5"]);
  assert.deepEqual(roadmapPositionLines(scoped(edges, "CV7.DS1")), [
    "CV7 is claimed by 2 packages: docs/project/roadmap/a/cv7/index.md, docs/project/roadmap/b/cv7/index.md",
  ]);
  assert.deepEqual(roadmapPositionLines(resolveRoadmapScope(null, { activeItem: "CV20.DS1" })), [
    "no project path configured",
  ]);
});

test("a package without a status renders without empty parentheses", () => {
  const root = writeTree("statusless", [{ dir: "cv3", code: "CV3", title: "No Status" }]);
  assert.deepEqual(roadmapPositionLines(scoped(root, "CV3.DS1")), [
    "CV3 — No Status [docs/project/roadmap/cv3/index.md]",
  ]);
});

test("each position paragraph starts its own card line on the resume surface", () => {
  // Written independently of card.ts: Python's f"│ {text[:54]:<54} │".
  const card = (text: string) => `│ ${text}${" ".repeat(54 - [...text].length)} │`;
  const scope = scoped(edgesTree(), "CV4.DS1");
  const rendered = renderBuilderResumeSurface(
    {
      journey: "orphan-journey",
      adoptedMethod: "ariad",
      cursor: {
        activeItem: "CV4.DS1",
        activeCheckpoint: null,
        pendingConfirmation: null,
        lastDeliveryEvent: "pull",
        releaseIntent: null,
        releaseIntentDeliveryStory: null,
      },
      resumable: true,
      reason: null,
      allowedNextActions: ["prepare_active_item"],
    },
    { scope },
  );
  const lines = rendered.split("\n");
  const at = lines.indexOf(card("roadmap position"));
  assert.ok(at > 0);
  assert.deepEqual(lines.slice(at + 1, at + 5), [
    card("CV4.DS1 — Orphan Story (🟡 Planned)"),
    card("[docs/project/roadmap/stray/cv4-ds1-orphan/index.md]"),
    card("no authored package for CV4"),
    card(""),
  ]);
});

// --- The recommendation surfaces, scoped -----------------------------------------
//
// The goldens grade these renderers unscoped (their scenarios record no cursor)
// and scoped only where CV1 still had a recommendation. These cover the rest,
// on the July tree: facts, not bytes, because the formatting beneath them is
// already graded by the goldens.

/** The card texts between two card rows, trimmed; `until` excluded. */
function cardTexts(rendered: string, from: string, until: string): string[] {
  const texts = rendered
    .split("\n")
    .filter((line) => line.startsWith("│ ") && line.endsWith(" │"))
    .map((line) => line.slice(2, -2).trimEnd());
  const start = texts.indexOf(from);
  const end = texts.indexOf(until, start + 1);
  assert.ok(start >= 0 && end > start, `no ${from} … ${until} in:\n${rendered}`);
  return texts.slice(start + 1, end);
}

function julyView(root: string, scope: RoadmapScope) {
  return scopePullCandidates(inspectPullCandidates(root, { journey: "j", method: "ariad" }), scope);
}

const PULL_J = [
  "pull explicitly: mirror build pull-item --journey j",
  "--method ariad --item-code <code> --item-title",
  '"<title>" --item-level <level> --why-now "<why now>"',
];

test("scoped PULL CANDIDATES lists the CV's candidates, counts the rest, and recommends inside", () => {
  const root = julyTree();
  const rendered = renderPullCandidatesReport(julyView(root, scoped(root, "CV20.DS12.TS1")));
  const list = cardTexts(rendered, "candidates in CV20", "");
  const codes = list.filter((text) => text.startsWith("- ")).map((text) => text.split(" ")[1]);
  assert.deepEqual(codes, ["CV20.DS12", "CV20.DS7.US1", "CV20.DS7", "CV20.DS9"]);
  assert.equal(list.at(-1), "3 more outside CV20");
  assert.ok(!rendered.includes("CV9.DS7"), "the stale Active package is not even listed");
  const recommended = cardTexts(rendered, "recommended pull", "");
  assert.ok(recommended[0]?.startsWith("CV20.DS7.US1 — Define Release Intent [user_story]"));
});

test("a CV with nothing left says so, then gives the literal command", () => {
  const root = julyTree();
  const report = inspectRoadmapSnapshot(root, { journey: "j", method: "ariad" });
  const rendered = renderProjectPositionReport(report, {
    view: julyView(root, scoped(root, "CV2.DS1")),
  });
  assert.deepEqual(cardTexts(rendered, "Where are we now?", ""), [
    "🟪[CV2] Small Things",
    "progress: planned",
  ]);
  assert.deepEqual(cardTexts(rendered, "What looks next?", ""), [
    "no remaining candidates in CV2",
    ...PULL_J,
  ]);
  assert.deepEqual(cardTexts(rendered, "candidates in CV2", ""), ["none", "5 more outside CV2"]);
});

test("scoped ROADMAP SNAPSHOT focuses the journey's CV and backlogs only its candidates", () => {
  const root = julyTree();
  const report = inspectRoadmapSnapshot(root, { journey: "j", method: "ariad" });
  const rendered = renderRoadmapSnapshotReport(report, {
    view: julyView(root, scoped(root, "CV20.DS12.TS1")),
  });
  const texts = rendered.split("\n").filter((line) => line.startsWith("│ "));
  assert.ok(texts[0]?.includes("🟪[CV20]  Builder Mode Evolution"), texts[0]);
  assert.ok(texts[0]?.endsWith("◉ active │"), texts[0]);
  assert.ok(rendered.includes("└─ 🟦[US1] Define Release Intent"), "current is the scoped pick");
  const backlog = cardTexts(rendered, "      Backlog", "").map((text) => text.trim());
  assert.deepEqual(backlog, [
    "○ 🟦[CV20.DS12] Document-First Refinement",
    "○ 🟦[CV20.DS7.US1] Define Release Intent",
    "○ 🟦[CV20.DS7] Release And Push Policies",
    "○ 🟦[CV20.DS9] Method Preferences",
  ]);
});

test("the July tree, unscoped, names no position and recommends nothing", () => {
  const root = julyTree();
  const report = inspectRoadmapSnapshot(root, { journey: "j", method: "ariad" });
  const view = julyView(root, resolveRoadmapScope(root, { activeItem: null }));
  const position = renderProjectPositionReport(report, { view });
  assert.deepEqual(cardTexts(position, "Where are we now?", ""), ["no item pulled yet"]);
  assert.deepEqual(cardTexts(position, "What looks next?", ""), PULL_J);
  assert.ok(!position.includes("recommended next pull"));
  const snapshot = renderRoadmapSnapshotReport(report, { view });
  assert.ok(snapshot.includes("roadmap field"));
  assert.ok(!snapshot.includes("🟪["), "no CV is focused");
  const candidates = renderPullCandidatesReport(view);
  assert.deepEqual(cardTexts(candidates, "recommended pull", ""), PULL_J);
  const listed = cardTexts(candidates, "project-wide candidates", "")
    .filter((text) => text.startsWith("- "))
    .map((text) => text.split(" ")[1]);
  assert.equal(listed.length, 7, "the honest project-wide list, CV9.DS7 included");
});
