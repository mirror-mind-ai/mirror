// CR115 — the cadence a journey runs at, read once and printed the same way everywhere.
//
// A journey's cadence changes what Plan does, and no read-only surface printed it. The
// runtime also held its default twice, in the cursor sync report and in
// `continue-lifecycle`. `cadence.ts` holds the effective profile and the rows every
// orienting surface prints; these tests grade it alone, and `cadenceSurfaces.test.ts`
// grades the surfaces through the front door.

import assert from "node:assert/strict";
import test from "node:test";

import {
  cadenceCardLines,
  cadenceOrientationLines,
  effectiveCadenceProfile,
} from "#builder/cadence.ts";
import { cardText } from "#builder/card.ts";

const BLANK = cardText("");

test("CR115: a cursor that stores no cadence runs stepwise, and a stored one runs as stored", () => {
  assert.equal(effectiveCadenceProfile({ cadenceProfile: null, cadenceLimits: [] }), "stepwise");
  for (const profile of ["stepwise", "checkpoint", "accelerated", "autonomous"]) {
    assert.equal(effectiveCadenceProfile({ cadenceProfile: profile, cadenceLimits: [] }), profile);
  }
});

test("CR115: the resume and build show print the profile, and its limits only under autonomous", () => {
  assert.deepEqual(cadenceCardLines(null), [cardText("cadence profile"), cardText("none")]);
  assert.deepEqual(cadenceCardLines({ cadenceProfile: null, cadenceLimits: [] }), [
    cardText("cadence profile"),
    cardText("stepwise"),
  ]);
  assert.deepEqual(
    cadenceCardLines({ cadenceProfile: "checkpoint", cadenceLimits: ["stop before push"] }),
    [cardText("cadence profile"), cardText("checkpoint")],
    "limits stored under another profile bound nothing, and are not printed",
  );
  assert.deepEqual(
    cadenceCardLines({
      cadenceProfile: "autonomous",
      cadenceLimits: ["stop before push or release", "stop on scope change"],
    }),
    [
      cardText("cadence profile"),
      cardText("autonomous"),
      BLANK,
      cardText("cadence limits"),
      cardText("stop before push or release, stop on scope change"),
    ],
  );
  assert.deepEqual(cadenceCardLines({ cadenceProfile: "autonomous", cadenceLimits: [] }), [
    cardText("cadence profile"),
    cardText("autonomous"),
    BLANK,
    cardText("cadence limits"),
    cardText("none"),
  ]);
});

test("CR115: the orientation answers in its own label-and-value rows", () => {
  assert.deepEqual(cadenceOrientationLines({ cadenceProfile: "accelerated", cadenceLimits: [] }), [
    cardText("cadence profile: accelerated"),
  ]);
  assert.deepEqual(
    cadenceOrientationLines({
      cadenceProfile: "autonomous",
      cadenceLimits: ["stop before push or release", "stop on scope change"],
    }),
    [
      cardText("cadence profile: autonomous"),
      cardText("cadence limits: stop before push or release, stop on"),
      cardText("scope change"),
    ],
  );
});
