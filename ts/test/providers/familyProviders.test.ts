import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderConfigError } from "#providers/config.ts";
import { LiveEmbeddingProvider } from "#providers/embedding.ts";
import {
  requireFamilyProviders,
  requireKeyForFamily,
  resolveFamilyProviders,
} from "#providers/familyProviders.ts";
import { LiveLlmProvider } from "#providers/llm.ts";
import {
  BUILD_LOAD_COMPOSITION,
  CONSULT_ASK_TRANSPORT,
  CONVERSATION_TAIL_TRANSPORT,
  JOURNAL_TRANSPORT,
  type ProviderTransportSpec,
  ReplayFixtureIncompleteError,
  SEARCH_TRANSPORT,
  WEEK_PLAN_TRANSPORT,
} from "#providers/transport.ts";

/**
 * CV22.DS8.US3 plateau 1 — the one place a transport decision becomes actual
 * providers.
 *
 * The seams are injected throughout: no test here touches disk (the replay
 * loaders read fixture files) or the network (the live providers resolve their
 * config on first call, so constructing one is inert — which is exactly why an
 * `instanceof` assertion is enough to prove the live branch was taken).
 */

const REPLAY_LLM = { complete: async () => ({ content: "replayed" }) };
const REPLAY_EMBEDDING = {
  embed: async () => ({ vector: [0], model: "stub", promptTokens: 0 }),
};

/** Replay loaders that record the fixture path they were handed, per test. */
function trackingLoaders() {
  const loaded: { llm: string[]; embedding: string[] } = { llm: [], embedding: [] };
  return {
    loaded,
    loadReplayLlm: async (path: string) => {
      loaded.llm.push(path);
      return REPLAY_LLM;
    },
    loadReplayEmbedding: async (path: string) => {
      loaded.embedding.push(path);
      return REPLAY_EMBEDDING;
    },
  };
}

test("a leftover revert variable builds the live providers, as if it were unset (D3)", async () => {
  // Until CV22.DS10.TS5 `=0` made this factory yield null so the route could
  // fall back to Python. The engine is gone, and so is the null.
  const family = await resolveFamilyProviders(
    { MIRROR_TS_CONVERSATION_LLM_TAIL: "0" },
    CONVERSATION_TAIL_TRANSPORT,
    trackingLoaders(),
  );

  assert.equal(family.mode, "live");
});

test("replay builds one provider per declared fixture, from that fixture's path", async () => {
  const seam = trackingLoaders();
  const family = await resolveFamilyProviders(
    {
      MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY: "/tmp/emb.json",
    },
    CONVERSATION_TAIL_TRANSPORT,
    seam,
  );

  assert.equal(family?.mode, "replay");
  assert.equal(family?.llm, REPLAY_LLM);
  assert.equal(family?.embedding, REPLAY_EMBEDDING);
  // Each kind is loaded from ITS OWN variable -- swapping them would still
  // produce two providers and fail only at the first call.
  assert.deepEqual(seam.loaded, { llm: ["/tmp/llm.json"], embedding: ["/tmp/emb.json"] });
});

test("half a fixture refuses by name instead of building a live provider", async () => {
  // The dangerous outcome is not the refusal; it is the alternative. Falling
  // back to Python here would spend on the live provider too, just on the
  // other engine and silently.
  await assert.rejects(
    () =>
      resolveFamilyProviders(
        { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/llm.json" },
        CONVERSATION_TAIL_TRANSPORT,
        trackingLoaders(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ReplayFixtureIncompleteError);
      assert.match(error.message, /MIRROR_TS_CONVERSATION_EMBEDDING_REPLAY/);
      return true;
    },
  );
});

test("an unconfigured install builds live providers for the declared kinds", async () => {
  const family = await resolveFamilyProviders({}, CONVERSATION_TAIL_TRANSPORT);

  assert.equal(family?.mode, "live");
  assert.ok(family?.llm instanceof LiveLlmProvider);
  assert.ok(family?.embedding instanceof LiveEmbeddingProvider);
});

test("a family builds only what it declares -- search gets no LLM provider", async () => {
  // The declared fixtures are the family's provider MANIFEST. Building an
  // unused provider would be harmless today and a wrong-tier live call the
  // first time someone reached for it.
  const seam = trackingLoaders();
  const live = await resolveFamilyProviders({}, SEARCH_TRANSPORT);
  const replayed = await resolveFamilyProviders(
    { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/emb.json" },
    SEARCH_TRANSPORT,
    seam,
  );

  assert.equal(live?.llm, undefined);
  assert.ok(live?.embedding instanceof LiveEmbeddingProvider);
  assert.equal(replayed?.llm, undefined);
  assert.deepEqual(seam.loaded, { llm: [], embedding: ["/tmp/emb.json"] });
});

test("the live constructors are injectable, so a failing provider needs no network", async () => {
  const failing = {
    complete: async () => {
      throw new Error("provider down");
    },
  };
  const family = await resolveFamilyProviders({}, CONVERSATION_TAIL_TRANSPORT, {
    liveLlm: () => failing,
    liveEmbedding: () => REPLAY_EMBEDDING,
  });

  assert.equal(family?.mode, "live");
  await assert.rejects(() => (family?.llm as typeof failing).complete(), /provider down/);
});

test("the decision's reason travels with the providers, for the front-door log", async () => {
  const spec: ProviderTransportSpec = {
    replay: { llm: "MIRROR_TS_EXAMPLE_LLM_REPLAY" },
    liveReason: "DS8.US3 example live",
  };

  const live = await resolveFamilyProviders({}, spec);
  const replayed = await resolveFamilyProviders(
    { MIRROR_TS_EXAMPLE_LLM_REPLAY: "/tmp/f.json" },
    spec,
    trackingLoaders(),
  );

  assert.equal(live?.reason, "DS8.US3 example live");
  assert.equal(replayed?.reason, "MIRROR_TS_EXAMPLE_LLM_REPLAY replay transport");
});

// --- CV22.DS7.US8 item 18b: a COMPOSED family's providers ---------------------
//
// The factory has to accept the composition, not only the owning spec. If the
// route decided `build load` with three specs and the runtime then built
// providers from one, they could disagree about the transport for the same
// invocation -- CR077's defect exactly, one level up.

test("a composed family replays from the OWNER's fixtures", async () => {
  // Every seam inside `load` -- both searches and the previous conversation's
  // close tail -- is built from these two variables, so the search family's own
  // fixture must not be read here.
  const seam = trackingLoaders();
  const family = await resolveFamilyProviders(
    {
      MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/build-llm.json",
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/build-emb.json",
      MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/search-emb.json",
    },
    BUILD_LOAD_COMPOSITION,
    seam,
  );

  assert.equal(family?.mode, "replay");
  assert.deepEqual(seam.loaded, {
    llm: ["/tmp/build-llm.json"],
    embedding: ["/tmp/build-emb.json"],
  });
});

test("a composed family goes live only when nothing in the composition replays", async () => {
  const live = await resolveFamilyProviders({}, BUILD_LOAD_COMPOSITION);

  assert.equal(live?.mode, "live");
  assert.ok(live?.llm instanceof LiveLlmProvider);
  assert.ok(live?.embedding instanceof LiveEmbeddingProvider);
  assert.match(live?.reason ?? "", /DS7\.US8 build load live/);

  await assert.rejects(
    () =>
      resolveFamilyProviders(
        { MIRROR_TS_SEARCH_EMBEDDING_REPLAY: "/tmp/search-emb.json" },
        BUILD_LOAD_COMPOSITION,
        trackingLoaders(),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ReplayFixtureIncompleteError);
      assert.match(error.message, /MIRROR_TS_BUILD_LLM_REPLAY/);
      assert.match(error.message, /MIRROR_TS_BUILD_EMBEDDING_REPLAY/);
      return true;
    },
  );
});

test("the composed reason travels with the providers, naming the family that reverted", async () => {
  const replayed = await resolveFamilyProviders(
    {
      MIRROR_TS_BUILD_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_BUILD_EMBEDDING_REPLAY: "/tmp/emb.json",
    },
    BUILD_LOAD_COMPOSITION,
    trackingLoaders(),
  );

  assert.equal(
    replayed?.reason,
    "MIRROR_TS_BUILD_LLM_REPLAY + MIRROR_TS_BUILD_EMBEDDING_REPLAY replay transport",
  );
});

// --- CR187: the families that cannot work without the key check it up front ---

test("CR187: a family that needs the key refuses before anything is built when it is missing", async () => {
  await assert.rejects(
    () =>
      requireFamilyProviders({}, JOURNAL_TRANSPORT, {
        consequence: "the journal entry was not saved",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderConfigError);
      assert.match(
        error.message,
        /^the journal entry was not saved, because OPENROUTER_API_KEY is not configured\. Add /,
      );
      return true;
    },
  );
  // A key of only spaces is no key, as the provider reads it.
  await assert.rejects(
    () => requireFamilyProviders({ OPENROUTER_API_KEY: "  " }, WEEK_PLAN_TRANSPORT),
    // Matched against String(error), which leads with the class name.
    /^ProviderConfigError: nothing was done, because OPENROUTER_API_KEY is not configured\./,
  );
});

test("CR187: with a key, a required family resolves exactly as resolveFamilyProviders does", async () => {
  const family = await requireFamilyProviders(
    { OPENROUTER_API_KEY: "sk-or-x" },
    WEEK_PLAN_TRANSPORT,
  );
  assert.equal(family.mode, "live");
  assert.ok(family.llm instanceof LiveLlmProvider);
});

test("CR187: replay never asks for a key, so the suite and CI behave as before", async () => {
  const family = await requireFamilyProviders(
    { MIRROR_TS_WEEK_LLM_REPLAY: "/tmp/week.json" },
    WEEK_PLAN_TRANSPORT,
    { overrides: trackingLoaders() },
  );
  assert.equal(family.mode, "replay");
  requireKeyForFamily(
    {
      MIRROR_TS_CONSULT_LLM_REPLAY: "/tmp/llm.json",
      MIRROR_TS_CREDITS_REPLAY: "/tmp/credits.json",
    },
    CONSULT_ASK_TRANSPORT,
  );
});

test("CR187: the decision-only check refuses a live family with no key, and leaves half a fixture to the factory", () => {
  // `consult` ask opens its ledger database before it builds providers, and that
  // open takes the pre-write snapshot: its check has to come first, with no
  // providers built yet.
  assert.throws(() => requireKeyForFamily({}, CONSULT_ASK_TRANSPORT), ProviderConfigError);
  // Half a replay fixture is not a key problem; resolveFamilyProviders refuses it by name.
  requireKeyForFamily({ MIRROR_TS_CONSULT_LLM_REPLAY: "/tmp/llm.json" }, CONSULT_ASK_TRANSPORT);
});
