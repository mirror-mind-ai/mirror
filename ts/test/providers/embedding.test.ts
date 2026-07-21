import assert from "node:assert/strict";
import test from "node:test";

import {
  addEmbeddingProvenance,
  DEFAULT_EMBEDDING_ATTEMPTS,
  EMBEDDING_DIMENSIONS,
  EmbeddingError,
  type EmbeddingProvider,
  embeddingProvenance,
  generateEmbeddingSafely,
} from "../../src/providers/embedding.ts";

const noSleep = async () => {};
const VALID = Array(EMBEDDING_DIMENSIONS).fill(0.1);

class CountingProvider implements EmbeddingProvider {
  calls = 0;
  private readonly behavior: (call: number) => Promise<readonly number[]>;
  constructor(behavior: (call: number) => Promise<readonly number[]>) {
    this.behavior = behavior;
  }
  async embed(): Promise<readonly number[]> {
    this.calls += 1;
    return this.behavior(this.calls);
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
