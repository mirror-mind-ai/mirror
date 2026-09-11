import assert from "node:assert/strict";
import test from "node:test";

import { stubOpenRouterClient } from "#helpers/openRouterStub.ts";
import { ProviderConfigError } from "#providers/config.ts";
import {
  addEmbeddingProvenance,
  DEFAULT_EMBEDDING_ATTEMPTS,
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  type EmbeddingProvider,
  type EmbeddingResult,
  embeddingProvenance,
  generateEmbeddingSafely,
  LiveEmbeddingProvider,
} from "#providers/embedding.ts";
import { LlmTransportError } from "#providers/openrouter.ts";

const noSleep = async () => {};
const VALID = Array(EMBEDDING_DIMENSIONS).fill(0.1);

class CountingProvider implements EmbeddingProvider {
  calls = 0;
  private readonly behavior: (call: number) => Promise<readonly number[]>;
  constructor(behavior: (call: number) => Promise<readonly number[]>) {
    this.behavior = behavior;
  }
  async embed(): Promise<EmbeddingResult> {
    this.calls += 1;
    return { vector: await this.behavior(this.calls), promptTokens: null };
  }
}

function succeedsImmediately(): CountingProvider {
  return new CountingProvider(async () => VALID);
}

function emptyThenSucceeds(emptyCount: number): CountingProvider {
  return new CountingProvider(async (call) => (call <= emptyCount ? [] : VALID));
}

function alwaysEmpty(): CountingProvider {
  return new CountingProvider(async () => []);
}

function wrongDimension(): CountingProvider {
  return new CountingProvider(async () => [1, 2, 3]);
}

function throwsOnCall(): CountingProvider {
  return new CountingProvider(async () => {
    throw new Error("network failure");
  });
}

test("generateEmbeddingSafely rejects empty/whitespace text before any provider call (permanent, no attempt)", async () => {
  const provider = succeedsImmediately();
  await assert.rejects(
    () => generateEmbeddingSafely(provider, "   ", { sleep: noSleep }),
    (error: unknown) => error instanceof EmbeddingError && error.permanent,
  );
  assert.equal(provider.calls, 0);
});

test("generateEmbeddingSafely returns the vector immediately on a well-formed response", async () => {
  const provider = succeedsImmediately();
  const vector = await generateEmbeddingSafely(provider, "hello", { sleep: noSleep });
  assert.equal(vector.length, EMBEDDING_DIMENSIONS);
  assert.equal(provider.calls, 1);
});

test("generateEmbeddingSafely retries a transient empty response within budget, then succeeds", async () => {
  const provider = emptyThenSucceeds(2);
  const vector = await generateEmbeddingSafely(provider, "hello", { sleep: noSleep });
  assert.equal(vector.length, EMBEDDING_DIMENSIONS);
  assert.equal(provider.calls, 3); // 2 empty attempts + 1 success
});

test("generateEmbeddingSafely exhausts attempts and throws when the response stays empty", async () => {
  const provider = alwaysEmpty();
  await assert.rejects(
    () => generateEmbeddingSafely(provider, "hello", { attempts: 3, sleep: noSleep }),
    EmbeddingError,
  );
  assert.equal(provider.calls, 3);
});

test("generateEmbeddingSafely fails immediately (permanent) on a dimension mismatch, without retrying", async () => {
  const provider = wrongDimension();
  await assert.rejects(
    () => generateEmbeddingSafely(provider, "hello", { attempts: 3, sleep: noSleep }),
    (error: unknown) => {
      assert.ok(error instanceof EmbeddingError);
      assert.equal(error.permanent, true);
      assert.match(error.message, /dimension mismatch/i);
      assert.match(error.message, /MEMORY_EMBEDDING_MODEL/);
      return true;
    },
  );
  assert.equal(provider.calls, 1); // NOT retried -- permanent, config-shaped failure
});

test("CRITICAL: generateEmbeddingSafely treats a provider exception as TERMINAL, not retried -- unlike an empty response (AI-01 philosophy: the SDK already retried transport failures)", async () => {
  const provider = throwsOnCall();
  await assert.rejects(
    () => generateEmbeddingSafely(provider, "hello", { attempts: 3, sleep: noSleep }),
    (error: unknown) => {
      assert.ok(error instanceof EmbeddingError);
      assert.equal(error.permanent, false); // not "permanent" in the config sense, but still terminal
      assert.match(error.message, /Embedding provider call failed/);
      assert.match(error.message, /network failure/);
      return true;
    },
  );
  // The one assertion this test exists for: exactly 1 call, not `attempts` (3).
  // A provider rejection must NOT be retried at this layer.
  assert.equal(provider.calls, 1);
});

test("generateEmbeddingSafely calls onAttempt once per real API round-trip, not for the empty-input guard", async () => {
  const attemptsSeen: Array<{ hasVector: boolean }> = [];
  const provider = emptyThenSucceeds(1);

  await generateEmbeddingSafely(provider, "hello", {
    sleep: noSleep,
    onAttempt: (info) => attemptsSeen.push({ hasVector: info.vector !== null }),
  });

  assert.equal(attemptsSeen.length, 2); // 1 empty attempt + 1 success
  assert.deepEqual(
    attemptsSeen.map((a) => a.hasVector),
    [false, true],
  );

  attemptsSeen.length = 0;
  await assert.rejects(() =>
    generateEmbeddingSafely(succeedsImmediately(), "", { sleep: noSleep }),
  );
  assert.equal(attemptsSeen.length, 0); // empty-input guard: no call attempted, no callback
});

test("generateEmbeddingSafely honors custom attempts/backoff options", async () => {
  const provider = alwaysEmpty();
  const backoffs: number[] = [];
  await assert.rejects(() =>
    generateEmbeddingSafely(provider, "hello", {
      attempts: 2,
      backoffMs: 10,
      sleep: async (ms) => {
        backoffs.push(ms);
      },
    }),
  );
  assert.equal(provider.calls, 2);
  assert.deepEqual(backoffs, [10]); // sleeps between attempts only, not after the last
});

test("embeddingProvenance reports the currently configured pin", () => {
  const provenance = embeddingProvenance();
  assert.equal(provenance.embedding_dimensions, EMBEDDING_DIMENSIONS);
  assert.equal(typeof provenance.embedding_model, "string");
});

test("addEmbeddingProvenance merges provenance into empty/null existing metadata", () => {
  const result = JSON.parse(addEmbeddingProvenance(null)) as Record<string, unknown>;
  assert.equal(result.embedding_dimensions, EMBEDDING_DIMENSIONS);
  assert.equal(typeof result.embedding_model, "string");
});

test("addEmbeddingProvenance preserves other keys and overwrites stale provenance", () => {
  const existing = JSON.stringify({ extraction_status: "ok", embedding_model: "stale/model" });
  const result = JSON.parse(addEmbeddingProvenance(existing)) as Record<string, unknown>;
  assert.equal(result.extraction_status, "ok"); // preserved
  assert.notEqual(result.embedding_model, "stale/model"); // overwritten, authoritative
});

test("addEmbeddingProvenance never throws on malformed existing metadata (write-path crash-safety)", () => {
  assert.doesNotThrow(() => addEmbeddingProvenance("not json at all"));
  assert.doesNotThrow(() => addEmbeddingProvenance("[1,2,3]")); // valid JSON, not an object
  const result = JSON.parse(addEmbeddingProvenance("not json at all")) as Record<string, unknown>;
  assert.equal(result.embedding_dimensions, EMBEDDING_DIMENSIONS); // falls back to a fresh object
});

test("DEFAULT_EMBEDDING_ATTEMPTS matches Python's default of 3", () => {
  assert.equal(DEFAULT_EMBEDDING_ATTEMPTS, 3);
});

// --- CV22.DS8.US1: the live provider and the unconfigured-install boundary ---

const LIVE_ENV = { OPENROUTER_API_KEY: "sk-or-v1-live-test" };

function liveProvider(post: (path: string, body: unknown) => Promise<unknown>) {
  const calls: { path: string; body: unknown }[] = [];
  const provider = new LiveEmbeddingProvider({
    env: LIVE_ENV,
    createClient: () =>
      stubOpenRouterClient({
        postJson: async (path, body) => {
          calls.push({ path, body });
          return post(path, body);
        },
      }),
  });
  return { provider, calls };
}

function embeddingResponse(vector: readonly number[], promptTokens?: number): unknown {
  return {
    data: [{ embedding: vector }],
    ...(promptTokens === undefined ? {} : { usage: { prompt_tokens: promptTokens } }),
  };
}

test("the live provider returns the vector and the usage the ledger prices from", async () => {
  const { provider, calls } = liveProvider(async () => embeddingResponse(VALID, 7));

  const result = await provider.embed("hello");

  assert.deepEqual(result.vector, VALID);
  assert.equal(result.promptTokens, 7);
  assert.equal(calls[0]?.path, "/embeddings");
  assert.deepEqual(calls[0]?.body, { input: "hello", model: "openai/text-embedding-3-small" });
});

test("missing usage is null, not zero -- an unpriced call must not look free", async () => {
  const { provider } = liveProvider(async () => embeddingResponse(VALID));

  const result = await provider.embed("hello");

  assert.equal(result.promptTokens, null);
});

test("an empty data array is TRANSIENT, so the retry budget still applies", async () => {
  // Python's `_extract_embedding` raises a non-permanent EmbeddingError here
  // and `generate_embedding` retries. The provider must therefore report an
  // EMPTY VECTOR rather than throwing: a throw is terminal at the
  // generateEmbeddingSafely layer and would invert the taxonomy.
  const { provider } = liveProvider(async () => ({ data: [] }));

  const result = await provider.embed("hello");

  assert.deepEqual(result.vector, []);
});

test("an empty embedding payload is transient in the same way", async () => {
  const { provider } = liveProvider(async () => embeddingResponse([]));

  const result = await provider.embed("hello");

  assert.deepEqual(result.vector, []);
});

test("a non-numeric payload is malformed_output, never stored as a vector", async () => {
  const { provider } = liveProvider(async () => embeddingResponse(["nope"] as never));

  const error = await provider.embed("hello").catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "malformed_output");
});

test("a response with no data at all is transient, exactly as Python treats it", async () => {
  // Tempting to call this malformed -- but Python's `_extract_embedding` does
  // `if not data: raise EmbeddingError("No embedding data received")` WITHOUT
  // permanent=True, so a shapeless response is retried, not failed hard.
  // Classifying it as malformed_output here would make TS give up where Python
  // recovers on the second attempt.
  const { provider } = liveProvider(async () => ({ unexpected: true }));

  const result = await provider.embed("hello");

  assert.deepEqual(result.vector, []);
});

test("a data list holding something that is not an embedding object is malformed", async () => {
  // Distinct from the case above: `data` is present and non-empty, so Python
  // proceeds to `data[0].embedding` and dies on the attribute. That is a
  // deterministic shape error, not a transient emptiness.
  const { provider } = liveProvider(async () => ({ data: ["not-an-object"] }));

  const error = await provider.embed("hello").catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "malformed_output");
});

test("the live provider bounds the call with the embedding-tier timeout", async () => {
  let seenTimeout: number | undefined;
  const provider = new LiveEmbeddingProvider({
    env: LIVE_ENV,
    createClient: () =>
      stubOpenRouterClient({
        postJson: async (_path, _body, options) => {
          seenTimeout = options.timeoutMs;
          return embeddingResponse(VALID, 1);
        },
      }),
  });

  await provider.embed("hello");

  assert.equal(seenTimeout, 15_000, "Python's LLM_TIMEOUT_EMBEDDING, not an SDK default");
});

test("constructing the live provider without a key does NOT throw", async () => {
  // Config resolves lazily on the first embed(). Resolving at construction
  // would throw OUTSIDE searchMemoriesWithStatus's try, crashing the command
  // instead of degrading to lexical-only the way Python does.
  assert.doesNotThrow(() => new LiveEmbeddingProvider({ env: {} }));
});

test("embedding without a key raises ProviderConfigError from inside embed()", async () => {
  const provider = new LiveEmbeddingProvider({ env: {} });

  const error = await provider.embed("hello").catch((e: unknown) => e);

  assert.ok(error instanceof ProviderConfigError);
});

test("generateEmbeddingSafely rethrows a config error WITHOUT logging an attempt", async () => {
  // Python raises its RuntimeError before the attempt loop, so an unconfigured
  // install writes NO llm_calls row. Firing onAttempt here would give TS an
  // unpriced ledger row where Python has none -- a parity break invisible in
  // every replay test, because replay always has a "key".
  const attempts: unknown[] = [];
  const provider: EmbeddingProvider = {
    embed: async () => {
      throw new ProviderConfigError("OPENROUTER_API_KEY is not configured.");
    },
  };

  const error = await generateEmbeddingSafely(provider, "hello", {
    sleep: noSleep,
    onAttempt: (info) => attempts.push(info),
  }).catch((e: unknown) => e);

  assert.ok(error instanceof ProviderConfigError, "the config error is not re-typed");
  assert.equal(attempts.length, 0, "no ledger row for a call that was never attempted");
});

test("a real provider failure still logs its attempt, as Python's unpriced row does", async () => {
  const attempts: unknown[] = [];
  const provider: EmbeddingProvider = {
    embed: async () => {
      throw new LlmTransportError("provider_error", "provider connection failed");
    },
  };

  await generateEmbeddingSafely(provider, "hello", {
    sleep: noSleep,
    onAttempt: (info) => attempts.push(info),
  }).catch(() => undefined);

  assert.equal(attempts.length, 1, "a failed round-trip is real spend and must be visible");
});

test("the attempt hook reports usage on the retried attempts too", async () => {
  // Each round-trip is billable, so each one must be visible. Python logs per
  // attempt for exactly this reason (D-003 / CV9.E2.S18).
  const attempts: (number | null)[] = [];
  let call = 0;
  const provider: EmbeddingProvider = {
    embed: async () => {
      call += 1;
      return call === 1 ? { vector: [], promptTokens: 3 } : { vector: VALID, promptTokens: 4 };
    },
  };

  await generateEmbeddingSafely(provider, "hello", {
    sleep: noSleep,
    onAttempt: (info) => attempts.push(info.promptTokens),
  });

  assert.deepEqual(attempts, [3, 4]);
});

test("usage from the provider reaches the attempt hook so the row can be priced", async () => {
  const attempts: { promptTokens: number | null }[] = [];
  const provider: EmbeddingProvider = {
    embed: async () => ({ vector: VALID, promptTokens: 11 }),
  };

  await generateEmbeddingSafely(provider, "hello", {
    sleep: noSleep,
    onAttempt: (info) => attempts.push({ promptTokens: info.promptTokens }),
  });

  assert.deepEqual(attempts, [{ promptTokens: 11 }]);
});
