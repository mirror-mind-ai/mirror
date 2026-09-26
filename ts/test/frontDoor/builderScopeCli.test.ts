// CR002 — a journey's Builder position and next pull, end to end through the
// real front-door process.
//
// The characterization reproduced the defect this way: a scratch journey on the
// July tree, `build load` before and after `sync-cursor`, then an explicit Pull.
// Python and the TypeScript port told that journey it was at CV9.DS7, the one
// stale "Active" package in the tree, then recommended another CV's story, then
// kept naming CV9.DS7 beside the CV20 item it had pulled. These tests replay the
// route through `cli.ts` in an isolated home, and add a second journey on the
// same project, so the scope is proven where the Navigator meets it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { setAdoptedMethod } from "#builder/methodAdoption.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { createJourney } from "#journey/journeyWrite.ts";

const CLI = new URL("../../src/frontDoor/cli.ts", import.meta.url).pathname;
const NOW = "2026-09-26T00:00:00Z";

const ROADMAP_INDEX = `# Roadmap

| Code | Capability Value | Status |
|------|------------------|--------|
| [CV2](cv2-small/index.md) | Small Things | 🟡 Planned |
| [CV9](cv9-mirror/index.md) | Mirror Mind 1.0 | 🟢 In Progress |
| [CV20](cv20-builder/index.md) | Builder Mode Evolution | 🟢 In Progress |
`;

/** The July shape: a stale Active package in CV9, Planned work in CV2 and CV20. */
const PACKAGES: [dir: string, heading: string, status: string, type?: string][] = [
  ["cv2-small", "CV2 — Small Things", "🟡 Planned"],
  ["cv2-small/cv2-ds1-thing", "CV2.DS1 — Thing", "🟡 Planned", "Delivery Story"],
  ["cv2-small/cv2-ds1-thing/cv2-ds1-us1-part", "CV2.DS1.US1 — Part", "🟡 Planned", "User Story"],
  ["cv9-mirror", "CV9 — Mirror Mind 1.0", "🟢 In Progress"],
  [
    "cv9-mirror/cv9-ds7-metadata",
    "CV9.DS7 — Conversation Metadata Lifecycle",
    "Active Delivery Story; expansion accepted",
  ],
  ["cv20-builder", "CV20 — Builder Mode Evolution", "🟢 In Progress"],
  [
    "cv20-builder/cv20-ds7-release",
    "CV20.DS7 — Release And Push Policies",
    "🟡 Planned",
    "Delivery Story",
  ],
  [
    "cv20-builder/cv20-ds7-release/cv20-ds7-us1-intent",
    "CV20.DS7.US1 — Define Release Intent",
    "🟡 Planned",
    "User Story",
  ],
  [
    "cv20-builder/cv20-ds12-refinement",
    "CV20.DS12 — Document-First Refinement",
    "🟡 Planned — redesign approved",
    "Delivery Story",
  ],
  [
    "cv20-builder/cv20-ds12-refinement/cv20-ds12-ts1-index",
    "CV20.DS12.TS1 — Canonical Refinement Index",
    "🟠 Implemented — validation pending",
    "Technical Story",
  ],
];

interface Fixture {
  root: string;
  home: string;
}

function fixture(journeys: readonly string[]): Fixture {
  const root = mkdtempSync("/tmp/builder-scope-cli-");
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  // A neutral project directory, not this repository: `build load`'s clone-role
  // guard judges the journey's project path.
  const project = join(root, "project");
  const roadmap = join(project, "docs", "project", "roadmap");
  mkdirSync(roadmap, { recursive: true });
  writeFileSync(join(roadmap, "index.md"), ROADMAP_INDEX);
  for (const [dir, heading, status, type] of PACKAGES) {
    mkdirSync(join(roadmap, dir), { recursive: true });
    const typeLine = type ? `**Type:** ${type}\n` : "";
    writeFileSync(
      join(roadmap, dir, "index.md"),
      `# ${heading}\n\n${typeLine}**Status:** ${status}\n`,
    );
  }
  const db = bootstrapDatabase(join(home, "memory.db"));
  for (const slug of journeys) {
    createJourney(
      db,
      { id: `journey-${slug}`, slug, content: `# ${slug}\n`, projectPath: project },
      NOW,
    );
    setAdoptedMethod(db, slug, "ariad", () => NOW);
  }
  db.close();
  return { root, home };
}

function run(f: Fixture, args: readonly string[]): string {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: f.root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: f.root,
      NODE_OPTIONS: "--no-warnings",
      MIRROR_HOME: f.home,
      MIRROR_USER: "home",
      MEMORY_ENV: "",
    },
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result.stdout;
}

/** One marked Ariad block, which must be present exactly once. */
function surface(stdout: string, id: string): string {
  const open = `<<<ARIAD:${id}>>>`;
  const start = stdout.indexOf(open);
  const end = stdout.indexOf(`<<<END:${id}>>>`);
  assert.ok(start >= 0 && end > start, `no ${id} surface in:\n${stdout}`);
  assert.equal(stdout.indexOf(open, start + 1), -1, `two ${id} surfaces`);
  return stdout.slice(start, end);
}

/** The card texts under a card row, up to the next blank card line. */
function under(block: string, header: string): string[] {
  const texts = block
    .split("\n")
    .filter((line) => line.startsWith("│ ") && line.endsWith(" │"))
    .map((line) => line.slice(2, -2).trimEnd());
  const start = texts.indexOf(header);
  assert.ok(start >= 0, `no ${header} row in:\n${block}`);
  const end = texts.indexOf("", start + 1);
  return texts.slice(start + 1, end);
}

function pullItem(f: Fixture, journey: string, code: string, title: string, level: string) {
  run(f, [
    "build",
    "pull-item",
    "--journey",
    journey,
    "--method",
    "ariad",
    "--item-code",
    code,
    "--item-title",
    title,
    "--item-level",
    level,
    "--why-now",
    "CR002 end-to-end",
  ]);
}

test("the July route names the journey's own position at every step", () => {
  const f = fixture(["builder"]);
  try {
    // 1. No cursor: the defect named CV9.DS7 here.
    const noCursor = surface(run(f, ["build", "load", "builder"]), "BUILDER_RESUME");
    assert.deepEqual(under(noCursor, "roadmap position"), ["no item pulled yet"]);

    // 2. Empty cursor: the defect focused CV20 and recommended CV20.DS7.US1 for
    //    any journey. Now there is no focus and no recommendation, only the list,
    //    labelled project-wide, and the literal command for this journey.
    run(f, ["build", "sync-cursor", "--journey", "builder", "--method", "ariad"]);
    const emptyCursor = run(f, ["build", "load", "builder"]);
    const position = surface(emptyCursor, "PROJECT_POSITION");
    assert.deepEqual(under(position, "Where are we now?"), ["no item pulled yet"]);
    assert.ok(
      under(position, "What looks next?")
        .join(" ")
        .startsWith("pull explicitly: mirror build pull-item --journey builder --method ariad"),
    );
    assert.ok(!position.includes("recommended next pull"));
    const orientation = surface(emptyCursor, "BUILDER_ORIENTATION");
    assert.deepEqual(under(orientation, "Where are we in the roadmap?"), ["no item pulled yet"]);
    assert.equal(under(orientation, "What can be pulled next?")[0], "project-wide candidates");
    assert.ok(!orientation.includes("▸"), "nothing is marked recommended");

    // 3. Explicit Pull: the defect kept naming CV9.DS7 beside the pulled item.
    pullItem(f, "builder", "CV20.DS12.TS1", "Canonical Refinement Index", "technical_story");
    for (let load = 0; load < 2; load += 1) {
      const resume = surface(run(f, ["build", "load", "builder"]), "BUILDER_RESUME");
      assert.deepEqual(under(resume, "active item"), ["CV20.DS12.TS1"]);
      const row = under(resume, "roadmap position").join(" ");
      assert.ok(row.startsWith("CV20 — Builder Mode Evolution (🟢 In Progress)"), row);
      assert.ok(!row.includes("CV9"), row);
    }

    // And the next pull stays inside CV20.
    const candidates = surface(
      run(f, ["build", "pull-candidates", "--journey", "builder", "--method", "ariad"]),
      "PULL_CANDIDATES",
    );
    assert.equal(under(candidates, "candidates in CV20").at(-1), "4 more outside CV20");
    assert.ok(under(candidates, "recommended pull")[0]?.startsWith("CV20.DS7.US1 — "));
    assert.ok(!candidates.includes("CV9.DS7"), "the stale package is not even listed");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("two journeys on one project each get their own position and next pull", () => {
  const f = fixture(["builder", "small"]);
  try {
    for (const journey of ["builder", "small"]) {
      run(f, ["build", "sync-cursor", "--journey", journey, "--method", "ariad"]);
    }
    pullItem(f, "builder", "CV20.DS12.TS1", "Canonical Refinement Index", "technical_story");
    pullItem(f, "small", "CV2.DS1.US1", "Part", "user_story");

    const positionOf = (journey: string) =>
      under(surface(run(f, ["build", "load", journey]), "BUILDER_RESUME"), "roadmap position")
        .join(" ")
        .split(" (")[0];
    assert.equal(positionOf("builder"), "CV20 — Builder Mode Evolution");
    assert.equal(positionOf("small"), "CV2 — Small Things");

    const recommendedFor = (journey: string) =>
      under(
        surface(
          run(f, ["build", "pull-candidates", "--journey", journey, "--method", "ariad"]),
          "PULL_CANDIDATES",
        ),
        "recommended pull",
      )[0]?.split(" — ")[0];
    assert.equal(recommendedFor("builder"), "CV20.DS7.US1");
    assert.equal(recommendedFor("small"), "CV2.DS1");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
