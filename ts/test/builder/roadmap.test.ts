// CV22.DS7.US8 plateau 1 — roadmap parsing against the oracle.
//
// Graded over a committed synthetic fixture tree rather than the real roadmap,
// because the real tree changes whenever this project plans anything and does
// not currently contain the cases that break a port. The fixtures stage them
// deliberately: the Path-sort collision, three snapshot grammars with
// precedence, inherited `done.md`, duplicate heading codes, the `/` title chain,
// and the regex-dialect traps where Python's `\s`, `.`, and `str.strip()` each
// disagree with their JavaScript spelling.

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectPullCandidates,
  inspectRoadmapSnapshot,
  type PullCandidate,
  type RoadmapSnapshotItem,
} from "#builder/pullCandidates.ts";
import {
  renderProjectPositionReport,
  renderPullCandidatesReport,
  renderRoadmapSnapshotReport,
} from "#builder/pullCandidatesRender.ts";
import {
  HEADING_RE,
  matchHeading,
  matchStatus,
  stripMarkdownLink,
} from "#builder/roadmapGrammar.ts";
import { resolveRoadmapPosition } from "#builder/roadmapPosition.ts";
import {
  createStoryDirectory,
  findDuplicateRoadmapHeadings,
  resolveStoryDirectory,
  StoryPackageAmbiguityError,
  storyFolderName,
  titleLeaf,
} from "#builder/storyPaths.ts";
import golden from "#goldens/builder-roadmap.golden.json" with { type: "json" };

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "builder-roadmap");

interface Scenario {
  name: string;
  kind: string;
  input: Record<string, unknown>;
  expected?: unknown;
  expected_error?: string;
}

const scenarios = (golden as { scenarios: Scenario[] }).scenarios;

function byKind(kind: string): Scenario[] {
  const rows = scenarios.filter((scenario) => scenario.kind === kind);
  assert.ok(rows.length > 0, `golden has no rows of kind ${kind}`);
  return rows;
}

/** `null` for the scenario that asks what happens with no project path at all. */
function projectRoot(scenario: Scenario): string | null {
  const project = scenario.input.project as string;
  return project === "missing_entirely" ? null : join(FIXTURES, project);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

test("every golden kind is exercised here", () => {
  assert.deepEqual(
    [...new Set(scenarios.map((s) => s.kind))].sort(),
    [
      "create_story_directory",
      "duplicate_headings",
      "match_heading",
      "match_status",
      "pull_candidates",
      "render_project_position",
      "render_pull_candidates",
      "render_roadmap_snapshot",
      "resolve_story_directory",
      "roadmap_position",
      "roadmap_snapshot",
      "story_folder_name",
      "strip_markdown_link",
      "title_leaf",
    ],
    "a new golden kind needs a case here, not a silent skip",
  );
});

test("inspectRoadmapSnapshot matches Python, including grammar precedence", () => {
  for (const scenario of byKind("roadmap_snapshot")) {
    const actual = inspectRoadmapSnapshot(projectRoot(scenario), { journey: "j", method: "ariad" });
    assert.deepEqual(actual, scenario.expected, scenario.name);
  }
});

test("the CV table wins over a DS table in the same file", () => {
  const main = scenarios.find((s) => s.name === "snapshot__main");
  const items = (main?.expected as { items: RoadmapSnapshotItem[] }).items;
  assert.deepEqual(
    items.map((item) => item.code),
    ["CV1", "CV2", "CV3"],
    "main/index.md carries both grammars; only the CV rows may be returned",
  );
});

test("the DS table accumulates across chapters where the CV table would stop", () => {
  const ds = scenarios.find((s) => s.name === "snapshot__ds_grammar");
  const items = (ds?.expected as { items: RoadmapSnapshotItem[] }).items;
  assert.deepEqual(
    items.map((item) => item.code),
    ["DS-1", "DS-2", "DS-35", "DS-35.US-1"],
    "prose between chapters must not end the accumulation",
  );
});

test("inspectPullCandidates matches Python, order included", () => {
  for (const scenario of byKind("pull_candidates")) {
    const actual = inspectPullCandidates(projectRoot(scenario), { journey: "j", method: "ariad" });
    assert.deepEqual(actual, scenario.expected, scenario.name);
  }
});

test("candidate order follows Python's Path sort, not a string sort", () => {
  // The collision the fixture stages: `cv2-ds1-alpha/` contents must precede
  // `cv2-ds1-alpha-extra/`, because Python compares path COMPONENTS and `-`
  // (0x2D) sorts before `/` (0x2F) only in a joined-string comparison.
  const actual = inspectPullCandidates(join(FIXTURES, "main"), {
    journey: "j",
    method: "ariad",
  });
  const order = actual.candidates.map((candidate) => candidate.code);
  assert.deepEqual(order, ["CV2.DS1.US1", "CV2.DS1", "CV2.DS2", "CV2.DS3", "CV2.DS4", "CV2"]);

  // Prove the naive sort would differ, so this test fails if someone "simplifies"
  // the scan: a string sort over the same relative paths reorders DS2 ahead.
  const files = readdirSync(join(FIXTURES, "main", "docs/project/roadmap"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.name === "index.md")
    .map((entry) =>
      toPosix(
        relative(
          join(FIXTURES, "main", "docs/project/roadmap"),
          join(entry.parentPath, entry.name),
        ),
      ),
    );
  const stringSorted = [...files].sort();
  const componentSorted = [...files].sort((a, b) => {
    const ax = a.split("/");
    const bx = b.split("/");
    for (let i = 0; i < Math.max(ax.length, bx.length); i += 1) {
      const av = ax[i];
      const bv = bx[i];
      if (av === undefined) return -1;
      if (bv === undefined) return 1;
      if (av !== bv) return av < bv ? -1 : 1;
    }
    return 0;
  });
  assert.notDeepEqual(
    stringSorted,
    componentSorted,
    "the fixture must keep staging the sort collision, or this guard is vacuous",
  );
});

test("a done.md is inherited by descendants", () => {
  const main = scenarios.find((s) => s.name === "candidates__main");
  const codes = (main?.expected as { candidates: PullCandidate[] }).candidates.map((c) => c.code);
  assert.ok(!codes.includes("CV1"), "CV1 has its own done.md");
  assert.ok(
    !codes.includes("CV1.DS1"),
    "CV1.DS1 is Planned with no done.md of its own, but an ancestor has one",
  );
  assert.ok(!codes.includes("CV0"), "legacy/ is excluded from the scan");
});

test("resolveRoadmapPosition matches Python", () => {
  for (const scenario of byKind("roadmap_position")) {
    assert.deepEqual(
      resolveRoadmapPosition(projectRoot(scenario)),
      scenario.expected ?? null,
      scenario.name,
    );
  }
});

test("resolveStoryDirectory matches Python, ambiguity included", () => {
  for (const scenario of byKind("resolve_story_directory")) {
    const root = join(FIXTURES, scenario.input.project as string);
    const code = scenario.input.code as string;
    if (scenario.expected_error !== undefined) {
      assert.throws(
        () => resolveStoryDirectory(root, code),
        (error: unknown) => {
          assert.ok(error instanceof StoryPackageAmbiguityError, scenario.name);
          // The golden redacts the fixture root to `<FIXTURES>` because Python's
          // message names the claiming packages by ABSOLUTE path, which differs
          // between a laptop and a CI runner. Applying the same substitution here
          // keeps the whole message shape graded — count, quoting, separator, and
          // order — instead of degrading to a loose regex match.
          const actual = `${error.name}: ${error.message}`.replaceAll(FIXTURES, "<FIXTURES>");
          assert.equal(actual, scenario.expected_error, scenario.name);
          return true;
        },
        scenario.name,
      );
      continue;
    }
    const resolved = resolveStoryDirectory(root, code);
    const actual = resolved === null ? null : toPosix(relative(root, resolved));
    assert.equal(actual, scenario.expected, scenario.name);
  }
});

test("findDuplicateRoadmapHeadings matches Python", () => {
  for (const scenario of byKind("duplicate_headings")) {
    const root = join(FIXTURES, scenario.input.project as string);
    const actual = Object.fromEntries(
      [...findDuplicateRoadmapHeadings(root)].map(([code, directories]) => [
        code,
        directories.map((directory) => `docs/project/roadmap/${directory}`),
      ]),
    );
    assert.deepEqual(actual, scenario.expected, scenario.name);
  }
});

test("createStoryDirectory matches Python, confinement included", () => {
  for (const scenario of byKind("create_story_directory")) {
    const root = join(FIXTURES, scenario.input.project as string);
    const code = scenario.input.code as string;
    const title = scenario.input.leaf_title as string;
    if (scenario.expected_error !== undefined) {
      assert.throws(() => createStoryDirectory(root, code, title), scenario.name);
      continue;
    }
    assert.equal(
      toPosix(relative(root, createStoryDirectory(root, code, title))),
      scenario.expected,
      scenario.name,
    );
  }
});

test("no created story directory escapes the roadmap root", () => {
  // The security control, asserted independently of the golden: whatever Python
  // does with a hostile code or title, TS must never produce a path outside
  // docs/project/roadmap/.
  const root = join(FIXTURES, "main");
  const hostile: [string, string][] = [
    ["../escape", "Escaping code"],
    ["CV2.DS1.US6", "../../escape"],
    ["CV2.DS1.US7", "/etc/passwd"],
    ["..", "Bare dotdot"],
    ["CV2/DS9", "Slash inside the code"],
    ["CV2.DS1.US8", "/"],
    ["....", "Quad dot"],
    ["CV2.DS1.US9", "..\\..\\windows"],
  ];
  for (const [code, title] of hostile) {
    let produced: string | null = null;
    try {
      produced = createStoryDirectory(root, code, title);
    } catch {
      continue; // refusing is an acceptable outcome
    }
    const relation = toPosix(relative(join(root, "docs/project/roadmap"), produced));
    assert.ok(
      relation !== "" && !relation.startsWith("../"),
      `escaped the roadmap root: code=${code} title=${title} -> ${produced}`,
    );
  }
});

test("titleLeaf and storyFolderName match Python", () => {
  for (const scenario of byKind("title_leaf")) {
    assert.equal(titleLeaf(scenario.input.title as string), scenario.expected, scenario.name);
  }
  for (const scenario of byKind("story_folder_name")) {
    assert.equal(
      storyFolderName(scenario.input.code as string, scenario.input.title as string),
      scenario.expected,
      scenario.name,
    );
  }
});

test("titleLeaf splits a slash-bearing real title, as Python does", () => {
  // The defect this story's own Pull surface displays. Pinned so the port does
  // not quietly "fix" it and diverge from the oracle.
  assert.equal(titleLeaf("Builder/Ariad tree"), "Ariad tree");
});

test("matchHeading matches Python on every dialect trap", () => {
  for (const scenario of byKind("match_heading")) {
    const actual = matchHeading(scenario.input.content as string);
    assert.deepEqual(actual, scenario.expected ?? null, scenario.name);
  }
});

test("the heading dialect traps are the ones a literal transcription fails", () => {
  // U+001F is whitespace to Python's `\s` but not to JavaScript's, so a `\s`
  // transcription would not match this heading at all.
  assert.deepEqual(matchHeading("# CV1.DS1\u001f—\u001fTitle\n"), {
    code: "CV1.DS1",
    title: "Title",
  });
  // U+2028 is matched by Python's `.` but not JavaScript's, so a `.` version
  // would truncate this title.
  assert.deepEqual(matchHeading("# CV1.DS1 — Title\u2028more\n"), {
    code: "CV1.DS1",
    title: "Title\u2028more",
  });
  // U+FEFF is whitespace to JavaScript's `\s` but not Python's, so a `\s`
  // version would strip it out of the title.
  assert.deepEqual(matchHeading("# CV1.DS1 — Title\ufeffmore\n"), {
    code: "CV1.DS1",
    title: "Title\ufeffmore",
  });
  // An en dash is not a separator; only an em dash or a hyphen.
  assert.equal(matchHeading("# CV1.DS1 – Title\n"), null);
  // The pattern is a level-one heading only.
  assert.equal(matchHeading("## CV1.DS1 — Title\n"), null);
  // HEADING_RE is shared state; confirm it carries no sticky/global flag that
  // would make a second call on the same string behave differently.
  const content = "# CV1 — First\n";
  assert.deepEqual(matchHeading(content), matchHeading(content));
  assert.ok(!HEADING_RE.global && !HEADING_RE.sticky);
});

test("matchStatus matches Python on every dialect trap", () => {
  for (const scenario of byKind("match_status")) {
    assert.equal(
      matchStatus(scenario.input.content as string),
      scenario.expected ?? null,
      scenario.name,
    );
  }
});

test("stripMarkdownLink matches Python, whole-cell only", () => {
  for (const scenario of byKind("strip_markdown_link")) {
    assert.equal(
      stripMarkdownLink(scenario.input.value as string),
      scenario.expected,
      scenario.name,
    );
  }
});

/** The inspection pair every rendered surface is built from. */
function inspectBoth(scenario: Scenario) {
  const root = projectRoot(scenario);
  return {
    snapshot: inspectRoadmapSnapshot(root, { journey: "j", method: "ariad" }),
    candidates: inspectPullCandidates(root, { journey: "j", method: "ariad" }),
  };
}

test("ROADMAP SNAPSHOT renders byte-identically to Python", () => {
  for (const scenario of byKind("render_roadmap_snapshot")) {
    const { snapshot, candidates } = inspectBoth(scenario);
    assert.equal(
      renderRoadmapSnapshotReport(snapshot, { candidates: candidates.candidates }),
      scenario.expected,
      scenario.name,
    );
  }
});

test("PULL CANDIDATES renders byte-identically to Python", () => {
  for (const scenario of byKind("render_pull_candidates")) {
    const { candidates } = inspectBoth(scenario);
    assert.equal(renderPullCandidatesReport(candidates), scenario.expected, scenario.name);
  }
});

test("PROJECT POSITION renders byte-identically to Python, with and without just-moved", () => {
  for (const scenario of byKind("render_project_position")) {
    const { snapshot, candidates } = inspectBoth(scenario);
    assert.equal(
      renderProjectPositionReport(snapshot, {
        candidates: candidates.candidates,
        justMoved: (scenario.input.just_moved as string | null) ?? null,
      }),
      scenario.expected,
      scenario.name,
    );
  }
});

test("Python's ragged frame literals are reproduced, not normalized", () => {
  // Four hardcoded lines are not 56 inner code points like `cardText`'s output:
  // the two card titles are short and the two empty-state rows are long, because
  // they were padded by eye against a terminal where an astral glyph is two
  // columns wide and one code point. Normalizing them would be prettier and
  // wrong.
  const empty = scenarios.find((s) => s.name === "render_snapshot__empty");
  const rendered = empty?.expected as string;
  const widths = new Map<string, number>();
  for (const line of rendered.split("\n")) {
    if (line.startsWith("│") && line.endsWith("│")) {
      widths.set(line, [...line].length - 2);
    }
  }
  const roadmapField = [...widths.keys()].find((line) => line.includes("roadmap field"));
  const backlog = [...widths.keys()].find((line) => line.includes("Backlog"));
  assert.equal(widths.get(roadmapField ?? ""), 57, "the empty roadmap-field row is one long");
  assert.equal(widths.get(backlog ?? ""), 58, "the empty Backlog row is two long");

  const candidatesRendered = scenarios.find((s) => s.name === "render_candidates__empty")
    ?.expected as string;
  const title = candidatesRendered
    .split("\n")
    .find((line) => line.includes("PULL CANDIDATES")) as string;
  assert.equal([...title].length - 2, 55, "the PULL CANDIDATES title row is one short");
});
