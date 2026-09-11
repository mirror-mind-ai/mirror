import assert from "node:assert/strict";
import { test } from "node:test";

import { LiveEmbeddingProvider } from "#providers/embedding.ts";
import { resolveFamilyProviders } from "#providers/familyProviders.ts";
import { LiveLlmProvider } from "#providers/llm.ts";
import {
  CONVERSATION_TAIL_TRANSPORT,
  type ProviderTransportSpec,
  ReplayFixtureIncompleteError,
  SEARCH_TRANSPORT,
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

test("a reverted family yields null, so the route can fall back to Python", async () => {
  const family = await resolveFamilyProviders(
    { MIRROR_TS_CONVERSATION_LLM_TAIL: "0" },
    CONVERSATION_TAIL_TRANSPORT,
    trackingLoaders(),
  );

  assert.equal(family, null);
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
    revertVar: "MIRROR_TS_EXAMPLE",
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
