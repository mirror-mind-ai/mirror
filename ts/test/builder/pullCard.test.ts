// CR113 — the Pull card says what happened, at the level that happened, and where the
// item lives.
//
// The card was headed DELIVERY STORY ACTIVATED for every level, under a marker naming
// a Delivery Story, said Prepare had not run while the same command ran it, drew a
// story straight under its CV, and called any pulled code a roadmap candidate. Each
// test pulls for real over a scratch roadmap and reads the card the command prints.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pullLifecycleItem, pullPlacement, renderPullReport } from "#builder/pull.ts";
import { removeStoryWorlds, type StoryWorld, storyDeps, storyWorld } from "#helpers/storyWorld.ts";

test.after(removeStoryWorlds);

const ROADMAP = "docs/project/roadmap";

/** CV1 → DS1, whose candidate table names US1 and TS1; neither has a package yet. */
function withRoadmap(w: StoryWorld): void {
  const root = join(w.project, ROADMAP);
  mkdirSync(join(root, "cv1/cv1-ds1"), { recursive: true });
  writeFileSync(join(root, "index.md"), "# Roadmap\n", "utf8");
  writeFileSync(join(root, "cv1/index.md"), "# CV1 — Checkout\n\n**Status:** 🟢 Active\n", "utf8");
  writeFileSync(
    join(root, "cv1/cv1-ds1/index.md"),
    "# CV1.DS1 — Checkout address\n\n**Status:** 🟡 Planned\n**Type:** Delivery Story\n\n" +
      "## Candidate Stories\n\n| Code | Story | Type | Status |\n|------|-------|------|--------|\n" +
      "| CV1.DS1.US1 | Enter an address | User Story | 🟡 Planned |\n" +
      "| CV1.DS1.TS1 | Validate the address | Technical Story | 🟡 Planned |\n",
    "utf8",
  );
}

function pullCard(
  w: StoryWorld,
  item: { code: string; title: string; level: string },
  project: string | null = w.project,
): string {
  const report = pullLifecycleItem(
    w.db,
    { journey: "demo", method: "ariad", item: { ...item, whyNow: "now" } },
    storyDeps,
  );
  return renderPullReport(report, pullPlacement(project, report.cursor));
}

/** The card's rows, frame removed, trailing space trimmed. */
function rows(card: string): string[] {
  return card
    .split("\n")
    .filter((line) => line.startsWith("│"))
    .map((line) => line.slice(2, -1).trimEnd());
}

/** The rows of the block under `header`, up to the next blank row or the card's end. */
function block(card: string, header: string): string[] {
  const all = rows(card);
  const start = all.indexOf(header);
  if (start === -1) return [];
  const end = all.indexOf("", start);
  return all.slice(start + 1, end === -1 ? undefined : end);
}

const US1 = { code: "CV1.DS1.US1", title: "Enter an address", level: "user_story" };
const TS1 = { code: "CV1.DS1.TS1", title: "Validate the address", level: "technical_story" };
const DS1 = { code: "CV1.DS1", title: "Checkout address", level: "delivery_story" };

test("CR113: the card names the level it pulled, under a marker that names none", () => {
  const cases: [typeof US1, string][] = [
    [US1, "USER STORY ACTIVATED"],
    [TS1, "TECHNICAL STORY ACTIVATED"],
    [DS1, "DELIVERY STORY ACTIVATED"],
  ];
  for (const [item, title] of cases) {
    const w = storyWorld();
    withRoadmap(w);
    const card = pullCard(w, item);
    assert.ok(card.startsWith("<<<ARIAD:ITEM_ACTIVATED>>>\n"), item.level);
    assert.ok(card.trimEnd().endsWith("<<<END:ITEM_ACTIVATED>>>"), item.level);
    assert.ok(!card.includes("DELIVERY_STORY_IDENTIFIED"), item.level);
    assert.equal(rows(card)[0]?.trim(), `🟪■  ${title}`, item.level);
    if (item.level !== "delivery_story") assert.ok(!card.includes("DELIVERY STORY"), item.level);
  }
});

test("CR113: the Delivery Story title row keeps its old bytes, padded to terminal columns", () => {
  const w = storyWorld();
  withRoadmap(w);
  const lines = pullCard(w, DS1).split("\n");
  assert.ok(lines.includes("│        🟪■  DELIVERY STORY ACTIVATED                   │"));
  // 🟪 takes two terminal columns and one code point: every title row is one code
  // point shorter than the frame, as every Builder title literal is.
  for (const item of [US1, TS1]) {
    const v = storyWorld();
    withRoadmap(v);
    const title = pullCard(v, item)
      .split("\n")
      .find((line) => line.startsWith("│") && line.includes("ACTIVATED"));
    assert.equal([...(title ?? "")].length, 57, item.level);
  }
});

test("CR113: the card claims nothing about Prepare, and keeps what is true", () => {
  const w = storyWorld();
  withRoadmap(w);
  const card = pullCard(w, US1);
  assert.ok(!card.includes("Prepare was not executed"));
  assert.deepEqual(block(card, "next event"), ["Prepare"]);
  assert.deepEqual(block(card, "boundary"), ["Plan and later lifecycle work were not executed."]);
});

test("CR113: the placement is the item's lineage, each level titled by the roadmap", () => {
  const w = storyWorld();
  withRoadmap(w);
  const card = pullCard(w, US1);
  assert.deepEqual(block(card, "roadmap placement"), [
    "🟪[CV1] Checkout",
    "  └─ 🟦[DS1] Checkout address",
    "     └─ 🟩[US1] Enter an address",
  ]);
  assert.deepEqual(block(card, "source"), ["roadmap candidate"]);

  const v = storyWorld();
  withRoadmap(v);
  assert.deepEqual(block(pullCard(v, DS1), "roadmap placement"), [
    "🟪[CV1] Checkout",
    "  └─ 🟦[DS1] Checkout address",
  ]);
});

test("CR113: an item the roadmap does not name says so, and its missing parent too", () => {
  const w = storyWorld();
  withRoadmap(w);
  const card = pullCard(w, { code: "CV1.DS2.US9", title: "Unlisted story", level: "user_story" });
  assert.deepEqual(block(card, "roadmap placement"), [
    "🟪[CV1] Checkout",
    "  └─ 🟦[DS2] no authored package",
    "     └─ 🟩[US9] Unlisted story",
  ]);
  assert.deepEqual(block(card, "source"), ["not in the roadmap: pulled by its code"]);
});

test("CR113: a story the roadmap marks Done is still named by it", () => {
  const w = storyWorld();
  withRoadmap(w);
  const done = join(w.project, ROADMAP, "cv1/cv1-ds1/cv1-ds1-us1-enter-an-address");
  mkdirSync(done, { recursive: true });
  writeFileSync(
    join(done, "index.md"),
    "# CV1.DS1.US1 — Enter an address\n\n**Status:** ✅ Done\n**Type:** User Story\n",
    "utf8",
  );
  writeFileSync(join(done, "done.md"), "# Done\n", "utf8");
  assert.deepEqual(block(pullCard(w, US1), "source"), ["roadmap candidate"]);
});

// The handoff review (finding 2): a Delivery Story with no package of its own is titled
// by the roadmap index's listing of it, and a story that listing does not name is not
// in the roadmap.
test("CR113 review: a Delivery Story the index lists without a package is titled by that listing", () => {
  const w = storyWorld();
  const root = join(w.project, ROADMAP);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "index.md"),
    "# Roadmap\n\n## CV1: Checkout\n\n**Status:** 🟡 Planned\n\n" +
      "Candidate Delivery Stories:\n- DS1 Checkout address\n",
    "utf8",
  );
  const card = pullCard(w, US1);
  assert.equal(block(card, "roadmap placement")[1], "  └─ 🟦[DS1] Checkout address");
  assert.deepEqual(block(card, "source"), ["not in the roadmap: pulled by its code"]);
});

test("CR113: with no project path, every row says so", () => {
  const w = storyWorld();
  const card = pullCard(w, US1, null);
  assert.deepEqual(block(card, "roadmap placement"), [
    "🟪[CV1] no project path configured",
    "  └─ 🟦[DS1] no project path configured",
    "     └─ 🟩[US1] Enter an address",
  ]);
  assert.deepEqual(block(card, "source"), ["not in the roadmap: pulled by its code"]);
});
