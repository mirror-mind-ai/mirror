// CR115 — every surface that orients the Navigator prints the cadence, through the
// front door.
//
// A cadence set in one session shaped the next session's Plan, and the surfaces that
// open a session said nothing about it: the first sign of `accelerated` was
// implementation starting. Under every profile, these tests read the cadence on the
// Builder resume, on `build show` with and without an item, and on the Builder
// orientation, which `build load` renders for a journey with no item pulled.

import assert from "node:assert/strict";
import test from "node:test";

import { setDeliveryCursor } from "#builder/deliveryCursor.ts";
import { renderBuilderEntrySurface } from "#builder/load.ts";
import {
  type BuilderWorld,
  builderWorld,
  removeBuilderWorlds,
  runBuild,
} from "#helpers/builderWorld.ts";

test.after(removeBuilderWorlds);

const PROFILES = ["stepwise", "checkpoint", "accelerated", "autonomous"] as const;

const ROADMAP = {
  "docs/project/roadmap/index.md": "# Roadmap\n",
  "docs/project/roadmap/cv1/index.md": "# CV1 — Checkout\n\n**Status:** 🟢 Active\n",
};

/** One wrapped surface's card rows, without their frame. */
function rowsOf(stdout: string, surface: string): string[] {
  const block = stdout.match(
    new RegExp(`<<<ARIAD:${surface}>>>\\n([\\s\\S]*?)<<<END:${surface}>>>`, "u"),
  )?.[1];
  assert.ok(block !== undefined, `the output holds ${surface}`);
  return block
    .split("\n")
    .filter((line) => line.startsWith("│"))
    .map((line) => line.replace(/^│ ?/u, "").replace(/ *│$/u, ""));
}

/** The rows under a label, up to the next blank row; null when the label is absent. */
function under(rows: readonly string[], label: string): string[] | null {
  const at = rows.indexOf(label);
  if (at === -1) return null;
  const end = rows.indexOf("", at);
  return rows.slice(at + 1, end === -1 ? undefined : end);
}

function setCadence(w: BuilderWorld, profile: string): void {
  const limits = profile === "autonomous" ? ["--limit", "stop before push"] : [];
  assert.equal(runBuild(w, ["set-cadence", "--profile", profile, ...limits]).exitCode, 0);
}

const pullStory = (w: BuilderWorld) =>
  runBuild(w, [
    "pull-item",
    "--item-code",
    "CV1.US1",
    "--item-title",
    "One story",
    "--item-level",
    "user_story",
    "--why-now",
    "CR115",
  ]);

test("CR115: the resume and build show print the cadence of an item, under every profile", () => {
  for (const profile of PROFILES) {
    const w = builderWorld({ files: ROADMAP });
    try {
      pullStory(w);
      setCadence(w, profile);
      const limits = profile === "autonomous" ? ["stop before push"] : null;
      const resume = rowsOf(renderBuilderEntrySurface(w.db, "demo", w.project), "BUILDER_RESUME");
      assert.deepEqual(under(resume, "cadence profile"), [profile], `${profile}: the resume`);
      assert.deepEqual(under(resume, "cadence limits"), limits, `${profile}: the resume`);
      const show = rowsOf(runBuild(w, ["show"]).stdout, "ACTIVE_CHECKPOINT");
      assert.deepEqual(under(show, "cadence profile"), [profile], `${profile}: build show`);
      assert.deepEqual(under(show, "cadence limits"), limits, `${profile}: build show`);
    } finally {
      w.db.close();
    }
  }
});

test("CR115: with no item pulled, the orientation and build show print the cadence", () => {
  for (const profile of PROFILES) {
    const w = builderWorld({ files: ROADMAP });
    try {
      setCadence(w, profile);
      const orientation = rowsOf(
        renderBuilderEntrySurface(w.db, "demo", w.project),
        "BUILDER_ORIENTATION",
      );
      const limits = profile === "autonomous" ? ["cadence limits: stop before push"] : [];
      assert.deepEqual(
        under(orientation, "How will the next item run?"),
        [`cadence profile: ${profile}`, ...limits],
        profile,
      );
      const show = rowsOf(runBuild(w, ["show"]).stdout, "ACTIVE_CHECKPOINT");
      assert.deepEqual(under(show, "cadence profile"), [profile], `${profile}: build show`);
    } finally {
      w.db.close();
    }
  }
});

test("CR115: the orientation asks about the cadence before it lists what can be done", () => {
  const w = builderWorld({ files: ROADMAP });
  try {
    const rows = rowsOf(renderBuilderEntrySurface(w.db, "demo", w.project), "BUILDER_ORIENTATION");
    const asked = rows.indexOf("How will the next item run?");
    assert.ok(asked > rows.indexOf("What is open for refinement?"));
    assert.ok(asked < rows.indexOf("What can we do now?"));
  } finally {
    w.db.close();
  }
});

test("CR115: a cursor that stores no cadence prints stepwise, and no cursor prints none", () => {
  const unset = builderWorld({ files: ROADMAP });
  try {
    pullStory(unset);
    // A cursor from before `sync-cursor` wrote a profile stores none.
    setDeliveryCursor(
      unset.db,
      {
        journey: "demo",
        method: "ariad",
        activeItem: "CV1.US1",
        activeItemLevel: "user_story",
        lastDeliveryEvent: "prepare",
        cadenceProfile: null,
      },
      { nowIso: () => "2026-10-01T12:00:00+00:00" },
    );
    const resume = rowsOf(
      renderBuilderEntrySurface(unset.db, "demo", unset.project),
      "BUILDER_RESUME",
    );
    assert.deepEqual(under(resume, "cadence profile"), ["stepwise"]);
  } finally {
    unset.db.close();
  }
  const none = builderWorld({ files: ROADMAP, sync: false });
  try {
    const resume = rowsOf(
      renderBuilderEntrySurface(none.db, "demo", none.project),
      "BUILDER_RESUME",
    );
    assert.deepEqual(under(resume, "cadence profile"), ["none"]);
    const show = rowsOf(runBuild(none, ["show"]).stdout, "ACTIVE_CHECKPOINT");
    assert.deepEqual(under(show, "cadence profile"), ["none"]);
  } finally {
    none.db.close();
  }
});

test("CR115: build show meets the cadence before the steps, as the resume does", () => {
  const w = builderWorld({ files: ROADMAP });
  try {
    pullStory(w);
    const rows = rowsOf(runBuild(w, ["show"]).stdout, "ACTIVE_CHECKPOINT");
    const order = ["active checkpoint", "cadence profile", "allowed next actions", "records"].map(
      (label) => rows.indexOf(label),
    );
    assert.ok(
      order.every((at) => at !== -1),
      order.join(","),
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
      "in this order",
    );
    const resume = rowsOf(renderBuilderEntrySurface(w.db, "demo", w.project), "BUILDER_RESUME");
    assert.ok(resume.indexOf("last delivery event") < resume.indexOf("cadence profile"));
    assert.ok(resume.indexOf("cadence profile") < resume.indexOf("allowed next actions"));
  } finally {
    w.db.close();
  }
});
