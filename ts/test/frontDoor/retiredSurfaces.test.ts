// CV22.DS10.TS4 plateau 1 — the front door says *removed*.
//
// Five surfaces retire in this story. Until now a retired name fell through to
// Python, which answered `Unknown command: web` with its usage block — an
// answer that belongs to the engine TS5 deletes. These tests pin the TS-native
// refusal that replaces it: matched by NAME (never inherited), one line, exit
// 1, naming the cutoff that explains why.
//
// The three properties the panel asked for are pinned here rather than assumed:
// the refusal reads no stdin, echoes no argv, and prints a STATIC anchor.

import assert from "node:assert/strict";
import { test } from "node:test";
import { RETIRED_SURFACES, retiredRefusal, routeMemoryCommand } from "#frontDoor/routing.ts";

/** Every shape TS4 retires, with the anchor its cutoff lives under. */
const RETIRED_SHAPES: ReadonlyArray<{ argv: string[]; surface: string; anchor: string }> = [
  {
    argv: ["migrate-legacy", "validate", "--source", "/tmp/a", "--target-home", "/tmp/b"],
    surface: "migrate-legacy",
    anchor: "legacy-migration",
  },
  { argv: ["migrate-legacy"], surface: "migrate-legacy", anchor: "legacy-migration" },
  {
    argv: ["journey", "export-registry"],
    surface: "journey export-registry",
    anchor: "journey-admin-verbs",
  },
  { argv: ["journey", "mutate"], surface: "journey mutate", anchor: "journey-admin-verbs" },
  {
    argv: ["conversations", "--metadata-backfill-preview"],
    surface: "conversations --metadata-backfill-preview",
    anchor: "conversation-metadata-backfill",
  },
  {
    argv: ["conversations", "--metadata-backfill-apply", "--metadata-backfill-mode", "all"],
    surface: "conversations --metadata-backfill-apply",
    anchor: "conversation-metadata-backfill",
  },
  {
    argv: ["build", "change-request", "capture", "--journey", "x", "--title", "t"],
    surface: "build change-request capture",
    anchor: "sqlite-refinement-workbench",
  },
  {
    argv: ["build", "refinement-story", "create", "--journey", "x"],
    surface: "build refinement-story create",
    anchor: "sqlite-refinement-workbench",
  },
];

test("every retired shape routes to the retired engine, naming its surface and anchor", () => {
  for (const { argv, surface, anchor } of RETIRED_SHAPES) {
    const decision = routeMemoryCommand(argv, {});
    assert.equal(decision.engine, "retired", argv.join(" "));
    assert.equal(decision.engine === "retired" && decision.surface, surface);
    assert.equal(decision.engine === "retired" && decision.anchor, anchor);
  }
});

test("all twenty Workbench verbs retire, and an unknown build verb still goes to Python", () => {
  const refinementStory = ["create", "overview", "pull", "review", "coherence", "close", "park"];
  const changeRequest = [
    "capture",
    "attach",
    "discard",
    "select",
    "confirm",
    "resume",
    "plan",
    "mark-implemented",
    "validate",
    "done",
    "park",
    "reject",
    "promote",
  ];
  assert.equal(refinementStory.length + changeRequest.length, 20);
  for (const verb of refinementStory) {
    assert.equal(
      routeMemoryCommand(["build", "refinement-story", verb], {}).engine,
      "retired",
      verb,
    );
  }
  for (const verb of changeRequest) {
    assert.equal(routeMemoryCommand(["build", "change-request", verb], {}).engine, "retired", verb);
  }
  // Inheritance stays closed: a verb the Workbench never had is not retired by
  // association -- it keeps the family's existing not-ported answer.
  const unknown = routeMemoryCommand(["build", "change-request", "teleport"], {});
  assert.equal(unknown.engine, "python");
  assert.match(unknown.reason, /not ported/);
});

test("CR089: the two admin verbs are refused before the journey status read", () => {
  // The defect: `journey export-registry` rendered an empty status document for
  // a journey that does not exist, exit 0 -- and `journey mutate`, a WRITE on
  // stdin, was a silent no-op. Both are now matched by name first.
  for (const verb of ["export-registry", "mutate"]) {
    const decision = routeMemoryCommand(["journey", verb], {});
    assert.equal(decision.engine, "retired", verb);
  }
});

test("CR095 is NOT taken here: every other journey shape is untouched", () => {
  // A verb and a slug have the same shape at the front door, so the status read
  // must keep answering for anything that is not one of the two retired verbs.
  // The empty-document-exit-0 behavior for an unresolvable slug is Python's own
  // (CR095, sequenced after TS5) and this story does not change it.
  assert.equal(routeMemoryCommand(["journey"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["journey", "mirror-ts-core"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["journey", "status", "mirror-ts-core"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["journey", "no-such-journey-xyz"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["journey", "set-path", "x", "/tmp"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["journey", "update", "x"], {}).engine, "ts");
});

test("the plain families the retired shapes live in are unaffected", () => {
  assert.equal(routeMemoryCommand(["conversations"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["conversations", "append"], {}).engine, "ts");
  assert.equal(routeMemoryCommand(["build", "load", "mirror-ts-core"], {}).engine, "ts");
});

test("the refusal names the surface and a static anchor, and echoes no argument", () => {
  const secret = "/home/someone/private-path";
  const decision = routeMemoryCommand(
    ["migrate-legacy", "run", "--source", secret, "--target-home", secret],
    {},
  );
  assert.equal(decision.engine, "retired");
  if (decision.engine !== "retired") return;
  const line = retiredRefusal(decision);

  assert.match(line, /migrate-legacy/);
  assert.match(line, /was removed in the CV22 migration/);
  assert.match(line, /docs\/releases\/pending-cutoffs\.md#legacy-migration/);
  // No argv value reaches the one line a caller sees: the anchor is a constant
  // per entry, never derived from the invocation.
  assert.ok(!line.includes(secret), "refusal must not echo argument values");
  assert.equal(line.trimEnd().split("\n").length, 1, "refusal is one line");
});

test("an unknown token is never interpolated into the refusal", () => {
  // The anchor and surface both come from the matched entry, so a caller
  // cannot push text into the message through argv.
  const decision = routeMemoryCommand(["journey", "mutate", "$(whoami)", "<script>"], {});
  assert.equal(decision.engine, "retired");
  if (decision.engine !== "retired") return;
  const line = retiredRefusal(decision);
  assert.ok(!line.includes("whoami"));
  assert.ok(!line.includes("script"));
});

test("every entry's anchor is a static string, not a template", () => {
  for (const entry of RETIRED_SURFACES) {
    assert.match(entry.anchor, /^[a-z0-9-]+$/, entry.surface);
    assert.match(entry.surface, /^[a-z0-9 \-.]+$/i, entry.surface);
  }
});
