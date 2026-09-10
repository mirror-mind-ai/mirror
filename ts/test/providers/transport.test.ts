import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveProviderTransport } from "#providers/transport.ts";

const SEARCH = { revertVar: "MIRROR_TS_SEARCH", replayVar: "MIRROR_TS_SEARCH_EMBEDDING_REPLAY" };

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
  assert.equal(decision.replayPath, "/tmp/fixture.json");
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
        { revertVar: "MIRROR_TS_JOURNAL", replayVar: "MIRROR_TS_JOURNAL_LLM_REPLAY" },
      ).mode,
    ].values(),
  );

  assert.deepEqual([...modes].sort(), ["live", "python", "replay"]);
});

test("a family with no replay variable can still choose python or live", () => {
  const decision = resolveProviderTransport({}, { revertVar: "MIRROR_TS_WEEK" });

  assert.equal(decision.mode, "live");
  assert.equal(decision.replayPath, undefined);
});
