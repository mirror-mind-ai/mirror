import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILD_LOAD_COMPOSITION,
  BUILD_LOAD_TRANSPORT,
  CONVERSATION_TAIL_TRANSPORT,
  type ProviderTransportSpec,
  ReplayFixtureIncompleteError,
  resolveComposedProviderTransport,
  resolveProviderTransport,
} from "#providers/transport.ts";

const SEARCH: ProviderTransportSpec = {
  replay: { embedding: "MIRROR_TS_SEARCH_EMBEDDING_REPLAY" },
};

test("nothing configured means live -- the DS8 default an unconfigured install gets", () => {
  const decision = resolveProviderTransport({}, SEARCH);

  assert.equal(decision.mode, "live");
  assert.match(decision.reason, /live/);
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

test("a leftover revert variable is inert, whatever its value (CV22.DS10.TS5, D3)", () => {
  // The revert chose Python, and Python is gone. A value left in a shell must
  // not change the transport in either direction.
  for (const value of ["0", "1", ""]) {
    assert.equal(resolveProviderTransport({ MIRROR_TS_SEARCH: value }, SEARCH).mode, "live");
    assert.equal(
      resolveProviderTransport(
        { MIRROR_TS_SEARCH: value, MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/f.json" },
        SEARCH,
      ).mode,
      "replay",
    );
  }
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
  const journal: ProviderTransportSpec = {
    replay: {
      llm: "MIRROR_TS_JOURNAL_LLM_REPLAY",
      embedding: "MIRROR_TS_JOURNAL_EMBEDDING_REPLAY",
    },
  };
  const modes = new Set([
    resolveProviderTransport({}, journal).mode,
    resolveProviderTransport(
      {
        MIRROR_TS_JOURNAL_LLM_REPLAY: "/tmp/f.json",
        MIRROR_TS_JOURNAL_EMBEDDING_REPLAY: "/tmp/e.json",
      },
      journal,
    ).mode,
    resolveProviderTransport({ MIRROR_TS_JOURNAL_LLM_REPLAY: "/tmp/f.json" }, journal).mode,
  ]);

  assert.deepEqual([...modes].sort(), ["incomplete_replay", "live", "replay"]);
});

test("a family with no replay variable is always live", () => {
  const decision = resolveProviderTransport({}, {});

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

// --- CV22.DS7.US8 item 18b: the COMPOSED decision -----------------------------
//
// `build load` does not own a provider seam. It composes two families that are
// already live in production: its two embeddings ARE the search family, and the
// previous conversation's close tail IS the conversation-tail family. A private
// gate would make `MIRROR_TS_SEARCH=0` mean two different things in two
// commands -- `memories --search` back on Python while `build load` keeps
// calling the same provider. (Those reverts left with Python at CV22.DS10.TS5;
// what the composition still decides is whether a half-configured replay
// harness is refused.)
//
// So all three specs resolve BEFORE the first byte: `load` prints four surfaces
// ahead of its first provider call, and a refusal decided later would come
// after every one of them.

test("nothing configured composes to live -- the shipped default a fresh install gets", () => {
  const decision = resolveComposedProviderTransport({}, BUILD_LOAD_COMPOSITION);

  assert.equal(decision.mode, "live");
  assert.equal(decision.reason, "DS7.US8 build load live");
});

test("a fully configured harness replays, composed fixtures and all", () => {
  // The parity harness sets every family's fixture. Replay intent elsewhere is
  // only a hazard when THIS family has nothing to replay from; here it has, so
  // the run is deterministic and nothing is refused.
  const decision = resolveComposedProviderTransport(
    {
      MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/emb.json",
      MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/search.json",
      MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/tail-llm.json",
      MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/tail-emb.json",
    },
    BUILD_LOAD_COMPOSITION,
  );

  assert.equal(decision.mode, "replay");
  assert.deepEqual(decision.replayPaths, { llm: "/tmp/llm.json", embedding: "/tmp/emb.json" });
});

test("the owner's fixtures answer every seam inside load", () => {
  // `load` embeds its query twice AND runs the previous conversation's close
  // tail, so one family's two fixtures cover both seams. The composed families
  // being live is not a hazard: no call escapes the fixtures named here.
  const decision = resolveComposedProviderTransport(
    {
      MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/emb.json",
    },
    BUILD_LOAD_COMPOSITION,
  );

  assert.equal(decision.mode, "replay");
  assert.deepEqual(decision.replayPaths, { llm: "/tmp/llm.json", embedding: "/tmp/emb.json" });
});

test("half the owner's fixture is incomplete_replay, exactly as for one family", () => {
  const decision = resolveComposedProviderTransport(
    { MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/emb.json" },
    BUILD_LOAD_COMPOSITION,
  );

  assert.equal(decision.mode, "incomplete_replay");
  assert.deepEqual(decision.missingReplayVars, ["MIRROR_TS_BUILD_LLM_REPLAY"]);
  assert.deepEqual(decision.presentReplayVars, ["MIRROR_TS_BUILD_EMBEDDING_REPLAY"]);
});

test("half a COMPOSED family's fixture refuses too, instead of going live", () => {
  // CR077's rule, propagated: the close tail's own pair rule cannot be honoured
  // by a runtime that never sees it, and going live here would spend money in a
  // shell that was being configured for replay.
  const decision = resolveComposedProviderTransport(
    { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/half.json" },
    BUILD_LOAD_COMPOSITION,
  );

  assert.equal(decision.mode, "incomplete_replay");
  assert.match(decision.reason, /MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY/);
  assert.match(decision.reason, /build load/);
});

test("a composed family fully in replay while this one is live refuses by name", () => {
  // The hazard the composition exists for: a harness that configures the search
  // family for replay, expecting no spend, then runs `build load` -- whose
  // providers are built from THIS family's fixtures, which nobody set. Live
  // would be a silent charge; Python would charge too, on the other engine. The
  // only honest answer names the fixtures that are missing here.
  const decision = resolveComposedProviderTransport(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/search.json" },
    BUILD_LOAD_COMPOSITION,
  );

  assert.equal(decision.mode, "incomplete_replay");
  assert.deepEqual(decision.presentReplayVars, ["MIRROR_TS_SEARCH_EMBEDDING_REPLAY"]);
  assert.deepEqual(decision.missingReplayVars, [
    "MIRROR_TS_BUILD_LLM_REPLAY",
    "MIRROR_TS_BUILD_EMBEDDING_REPLAY",
  ]);
  // And the refusal reads as an instruction, not as a diagnosis.
  const error = new ReplayFixtureIncompleteError(decision);
  assert.match(error.message, /MIRROR_TS_BUILD_LLM_REPLAY/);
  assert.match(error.message, /spend real money/);
});

test("the composed decision reduces to the single-family one when nothing composes", () => {
  // The composition is data, not a second precedence: with no composed family
  // the answer is byte-identical to `resolveProviderTransport`, so there is one
  // rule to reason about rather than two that can drift (the US11 lesson).
  for (const env of [
    {},
    { MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/l.json", MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/e.json" },
    { MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/l.json" },
  ]) {
    assert.deepEqual(
      resolveComposedProviderTransport(env, {
        label: "build load",
        owner: BUILD_LOAD_TRANSPORT,
        composes: [],
      }),
      resolveProviderTransport(env, BUILD_LOAD_TRANSPORT),
    );
  }
});
