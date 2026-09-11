import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONVERSATION_TAIL_TRANSPORT,
  type ProviderTransportSpec,
  ReplayFixtureIncompleteError,
  resolveProviderTransport,
} from "#providers/transport.ts";

const SEARCH: ProviderTransportSpec = {
  revertVar: "MIRROR_TS_SEARCH",
  replay: { embedding: "MIRROR_TS_SEARCH_EMBEDDING_REPLAY" },
};

test("nothing configured means live -- the DS8 default an unconfigured install gets", () => {
  const decision = resolveProviderTransport({}, SEARCH);

  assert.equal(decision.mode, "live");
  assert.match(decision.reason, /live/);
});

test("the revert variable wins over everything, including a replay fixture", () => {
  // The revert control is an operational escape hatch: it must not be
  // outvoted by leftover replay configuration in the same shell.
  const decision = resolveProviderTransport(
    { MIRROR_TS_SEARCH: "0", MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/fixture.json" },
    SEARCH,
  );

  assert.equal(decision.mode, "python");
  assert.match(decision.reason, /revert/i);
});

test("a replay fixture selects replay, keeping CI and the parity harness deterministic", () => {
  const decision = resolveProviderTransport(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/fixture.json" },
    SEARCH,
  );

  assert.equal(decision.mode, "replay");
  assert.deepEqual(decision.replayPaths, { embedding: "/tmp/fixture.json" });
});

test("replay no longer requires MIRROR_TS_EXTERNAL_ROUTES", () => {
  // That gate was DS5's safety catch for a replay-only production route. After
  // the live cutover replay is a TEST transport, so requiring the gate would
  // only make CI depend on an unrelated variable.
  const withGate = resolveProviderTransport(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/f.json", MIRROR_TS_EXTERNAL_ROUTES: "1" },
    SEARCH,
  );
  const withoutGate = resolveProviderTransport(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/f.json" },
    SEARCH,
  );

  assert.equal(withGate.mode, "replay");
  assert.equal(withoutGate.mode, "replay");
});

test("only an exact '0' reverts -- an unrelated value does not silently disable TS", () => {
  assert.equal(resolveProviderTransport({ MIRROR_TS_SEARCH: "1" }, SEARCH).mode, "live");
  assert.equal(resolveProviderTransport({ MIRROR_TS_SEARCH: "" }, SEARCH).mode, "live");
  assert.equal(resolveProviderTransport({ MIRROR_TS_SEARCH: "0" }, SEARCH).mode, "python");
});

test("an empty replay path is not a replay fixture", () => {
  // An exported-but-empty variable is a common shell accident; treating it as
  // a fixture path would fail later with a confusing file-not-found.
  const decision = resolveProviderTransport({ MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "" }, SEARCH);

  assert.equal(decision.mode, "live");
});

test("the reason names the story, so the front-door log explains the route", () => {
  const decision = resolveProviderTransport({}, { ...SEARCH, liveReason: "DS8.US1 live" });

  assert.equal(decision.reason, "DS8.US1 live");
});

test("the decision is a closed union every family reuses", () => {
  // One precedence function, not sixteen re-derivations across US2/US3 -- the
  // LLM_ROLES drift lesson from US11.
  const modes = new Set(
    [
      resolveProviderTransport({ MIRROR_TS_JOURNAL: "0" }, { revertVar: "MIRROR_TS_JOURNAL" }).mode,
      resolveProviderTransport({}, { revertVar: "MIRROR_TS_JOURNAL" }).mode,
      resolveProviderTransport(
        { MIRROR_TS_JOURNAL_LLM_REPLAY: "/tmp/f.json" },
        { revertVar: "MIRROR_TS_JOURNAL", replay: { llm: "MIRROR_TS_JOURNAL_LLM_REPLAY" } },
      ).mode,
    ].values(),
  );

  assert.deepEqual([...modes].sort(), ["live", "python", "replay"]);
});

test("a family with no replay variable can still choose python or live", () => {
  const decision = resolveProviderTransport({}, { revertVar: "MIRROR_TS_WEEK" });

  assert.equal(decision.mode, "live");
  assert.equal(decision.replayPaths, undefined);
});

// --- CR077: the spec carries the whole pair rule ------------------------------
//
// Before this, the spec named ONE fixture variable and the "both or neither"
// rule lived privately in `loggerRuntime`. With only the LLM half set, the
// router reported `engine=ts, reason=... replay transport` and the runtime
// then refused -- a route reason the next layer contradicted, and a front-door
// log line that claimed a replay that never happened.

test("every declared fixture set selects replay, and each path is resolved by kind", () => {
  const decision = resolveProviderTransport(
    {
      MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/emb.json",
    },
    CONVERSATION_TAIL_TRANSPORT,
  );

  assert.equal(decision.mode, "replay");
  assert.deepEqual(decision.replayPaths, { llm: "/tmp/llm.json", embedding: "/tmp/emb.json" });
});

test("half a fixture is incomplete_replay -- never live, never Python", () => {
  for (const [present, missing] of [
    ["MIRROR_TS_CONVERSATION_LLM_REPLAY", "MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY"],
    ["MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY", "MIRROR_TS_CONVERSATION_LLM_REPLAY"],
  ] as const) {
    const decision = resolveProviderTransport(
      { [present]: "/tmp/half.json" },
      CONVERSATION_TAIL_TRANSPORT,
    );

    assert.equal(decision.mode, "incomplete_replay", `${present} alone must not run`);
    assert.deepEqual(decision.missingReplayVars, [missing]);
    assert.deepEqual(decision.presentReplayVars, [present]);
    // The reason names BOTH halves: an operator reading the front-door log has
    // to know which variable to set, not merely that something is wrong.
    assert.match(decision.reason, new RegExp(present));
    assert.match(decision.reason, new RegExp(missing));
  }
});

test("the revert still wins over a half-configured fixture", () => {
  // Otherwise the operational escape hatch would be unreachable from exactly
  // the shell most likely to need it: one where replay was being set up.
  const decision = resolveProviderTransport(
    {
      MIRROR_TS_CONVERSATION_LLM_TAIL: "0",
      MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/half.json",
    },
    CONVERSATION_TAIL_TRANSPORT,
  );

  assert.equal(decision.mode, "python");
});

test("the incomplete-replay error names the missing half and how to run live deliberately", () => {
  const decision = resolveProviderTransport(
    { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/half.json" },
    CONVERSATION_TAIL_TRANSPORT,
  );
  const error = new ReplayFixtureIncompleteError(decision);

  assert.match(error.message, /MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY is not/);
  assert.match(error.message, /spend real money/);
  assert.match(error.message, /unset MIRROR_TS_CONVERSATION_LLM_REPLAY to run live/);
});

test("a single-fixture family's replay reason is unchanged, so the log reads the same", () => {
  const decision = resolveProviderTransport(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/f.json" },
    SEARCH,
  );

  assert.equal(decision.reason, "MIRROR_TS_SEARCH_EMBEDDING_REPLAY replay transport");
});
