// The refusals the front door answers by name when no route answered them.
//
// Main consults `namedRefusal` for every error a route lets through. The half
// replay fixture proves that call through the real CLI (`buildCli.test.ts`), so
// what is graded here is the answer for each refusal, and that anything else stays
// a crash.

import assert from "node:assert/strict";
import test from "node:test";
import { namedRefusal } from "#frontDoor/namedRefusal.ts";
import {
  assertNewIdentityKey,
  InvalidIdentityKeyError,
  newIdentityKeyProblem,
} from "#identity/identityKey.ts";
import { keyRefusedMessage, ProviderConfigError } from "#providers/config.ts";
import { EmbeddingError } from "#providers/embedding.ts";
import { LlmTransportError } from "#providers/openrouter.ts";
import {
  CONVERSATION_TAIL_TRANSPORT,
  ReplayFixtureIncompleteError,
  resolveProviderTransport,
} from "#providers/transport.ts";

test("CR104: a new key the store refused is one Error: line and exit 1", () => {
  let refused: unknown;
  try {
    assertNewIdentityKey("journey", "x;touch PWNED");
  } catch (error) {
    refused = error;
  }
  assert.ok(refused instanceof InvalidIdentityKeyError);
  assert.deepEqual(namedRefusal(refused), {
    line: `Error: ${newIdentityKeyProblem("journey", "x;touch PWNED")}`,
    exitCode: 1,
  });
});

test("half a replay fixture keeps its line and exit 2", () => {
  const error = new ReplayFixtureIncompleteError(
    resolveProviderTransport(
      { MIRROR_TS_CONVERSATION_LLM_REPLAY: "/tmp/half.json" },
      CONVERSATION_TAIL_TRANSPORT,
    ),
  );
  assert.deepEqual(namedRefusal(error), {
    line: `Mirror TS front door: ${error.message}`,
    exitCode: 2,
  });
});

test("anything else is a crash, not a refusal", () => {
  assert.equal(namedRefusal(new Error("boom")), null);
  assert.equal(namedRefusal("not even an error"), null);
});

// --- CR187: a missing key, and a key OpenRouter refused ---

test("CR187: a missing key is one Error: line and exit 2, in the refusal's own words", () => {
  // The up-front check and the lazy one both throw ProviderConfigError; so does
  // the argv-secret refusal. Each message is true as it stands, and all three
  // reached Node as stack traces before.
  for (const message of [
    "nothing was done, because OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your key> to /home/u/.config/mirror/env, then run the same command again.",
    "OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your key> to /home/u/.config/mirror/env.",
    "API keys must come from env/config, not argv-like inputs.",
  ]) {
    assert.deepEqual(namedRefusal(new ProviderConfigError(message)), {
      line: `Error: ${message}`,
      exitCode: 2,
    });
  }
});

test("CR187: a key OpenRouter refused is one line and exit 2, from a chat call or an embedding call", () => {
  const chat = new LlmTransportError("auth", "provider returned HTTP 401", { status: 401 });
  assert.deepEqual(namedRefusal(chat), { line: `Error: ${keyRefusedMessage(401)}`, exitCode: 2 });
  const embedding = new EmbeddingError(
    "Embedding provider call failed: provider returned HTTP 403",
    {
      transport: { kind: "auth", status: 403 },
    },
  );
  assert.deepEqual(namedRefusal(embedding), {
    line: `Error: ${keyRefusedMessage(403)}`,
    exitCode: 2,
  });
  // Every other transport failure is still a crash here: outages are not this CR's.
  assert.equal(namedRefusal(new LlmTransportError("timeout", "timed out")), null);
  assert.equal(
    namedRefusal(new EmbeddingError("x", { transport: { kind: "rate_limit", status: 429 } })),
    null,
  );
  assert.equal(namedRefusal(new EmbeddingError("Embedding provider call failed: boom")), null);
});

test("CR187: no refusal line carries the key, even with one set", () => {
  const before = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "sk-or-canary-7f3a";
  try {
    const refused = namedRefusal(
      new LlmTransportError("auth", "provider returned HTTP 401", { status: 401 }),
    );
    assert.ok(refused !== null && !refused.line.includes("canary"), refused?.line);
  } finally {
    if (before === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = before;
  }
});
