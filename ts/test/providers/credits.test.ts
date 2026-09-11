import assert from "node:assert/strict";
import { test } from "node:test";

import { stubOpenRouterClient } from "#helpers/openRouterStub.ts";
import { ProviderConfigError } from "#providers/config.ts";
import { LiveCreditProvider } from "#providers/credits.ts";
import { LlmTransportError, type ProviderRequestOptions } from "#providers/openrouter.ts";

/**
 * CV22.DS8.US3 plateau 2 — the live credit provider.
 *
 * Ported from Python's `get_credits` and `fetch_generation_cost`, the two
 * endpoints `consult` needs and the TypeScript core never had. Everything is
 * injected: the client, and the poll's sleep — five real attempts would take
 * ten seconds of wall clock for a test about arithmetic.
 */

const LIVE_ENV = { OPENROUTER_API_KEY: "sk-or-v1-credits-test" };

interface Seen {
  path: string;
  options: ProviderRequestOptions;
}

function liveProvider(
  reply: (path: string, attempt: number) => unknown,
  env: Record<string, string | undefined> = LIVE_ENV,
) {
  const calls: Seen[] = [];
  const slept: number[] = [];
  const provider = new LiveCreditProvider({
    env,
    sleep: async (ms) => {
      slept.push(ms);
    },
    createClient: () =>
      stubOpenRouterClient({
        getJson: async (path, options) => {
          calls.push({ path, options });
          return reply(path, calls.length - 1);
        },
      }),
  });
  return { provider, calls, slept };
}

function creditsReply(data: unknown): unknown {
  return { data };
}

// --- /credits ---------------------------------------------------------------

test("the balance is total minus usage, as the bar renders it", async () => {
  const { provider, calls } = liveProvider(() =>
    creditsReply({ total_credits: 12.5, total_usage: 2.25 }),
  );

  const info = await provider.getCredits();

  assert.equal(calls[0]?.path, "/credits");
  assert.deepEqual(info, { totalCredits: 12.5, totalUsage: 2.25, balance: 10.25 });
});

test("absent amounts are zero, as Python's .get(..., 0) reads them", async () => {
  const { provider } = liveProvider(() => creditsReply({}));

  assert.deepEqual(await provider.getCredits(), {
    totalCredits: 0,
    totalUsage: 0,
    balance: 0,
  });
});

test("a response without a data object is malformed, never a zero balance", async () => {
  // Python indexes ["data"] unguarded -- a KeyError. Reporting R$ 0.00 for a
  // malformed response would read to the user as "you are out of credits",
  // which is a wrong answer rather than an error.
  const { provider } = liveProvider(() => ({ error: "nope" }));

  await assert.rejects(
    () => provider.getCredits(),
    (error: unknown) => {
      assert.ok(error instanceof LlmTransportError);
      assert.equal(error.kind, "malformed_output");
      return true;
    },
  );
});

test("a non-numeric amount is malformed -- Python raises on the subtraction", async () => {
  const { provider } = liveProvider(() => creditsReply({ total_credits: "12.5", total_usage: 0 }));

  await assert.rejects(() => provider.getCredits(), LlmTransportError);
});

test("credits is one request, as Python's single urlopen is", async () => {
  const { provider, calls } = liveProvider(() =>
    creditsReply({ total_credits: 1, total_usage: 0 }),
  );

  await provider.getCredits();

  assert.equal(calls[0]?.options.maxRetries, 0, "no transport retry on a balance read");
});

test("both GETs are bounded, where Python's urlopen has no timeout at all", async () => {
  // A deliberate divergence, at the tier Python uses for its other cheap GET
  // (/models): an interactive command must not hang forever on a stalled
  // connection. Recorded in docs/project/decisions.md.
  const { provider, calls } = liveProvider((path) =>
    path === "/credits" ? creditsReply({ total_credits: 1, total_usage: 0 }) : { data: {} },
  );

  await provider.getCredits();
  await provider.fetchGenerationCost("gen-1");

  for (const call of calls) assert.equal(call.options.timeoutMs, 15_000);
});

test("constructing without a key does not throw; the call does", async () => {
  const provider = new LiveCreditProvider({ env: {} });

  await assert.rejects(() => provider.getCredits(), ProviderConfigError);
});

// --- /generation ------------------------------------------------------------

test("the cost is returned as soon as the provider exposes it", async () => {
  const { provider, calls, slept } = liveProvider(() => ({ data: { total_cost: 0.0042 } }));

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0.0042);
  assert.equal(calls[0]?.path, "/generation?id=gen-abc");
  assert.deepEqual(slept, [], "no sleep before the first attempt");
});

test("the poll waits 1s, 2s, 3s, 4s -- OpenRouter exposes usage late", async () => {
  const { provider, calls, slept } = liveProvider((_path, attempt) =>
    attempt < 2 ? { data: {} } : { data: { total_cost: 0.01 } },
  );

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0.01);
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [1000, 2000]);
});

test("five attempts and then null -- a cost lookup never fails the command", async () => {
  const { provider, calls, slept } = liveProvider(() => ({ data: {} }));

  assert.equal(await provider.fetchGenerationCost("gen-abc"), null);
  assert.equal(calls.length, 5, "Python's range(retries + 1) with retries=4");
  assert.deepEqual(slept, [1000, 2000, 3000, 4000]);
});

test("a zero cost is an answer, not a missing one", async () => {
  // Truthiness here would turn every free call into "unknown" and, worse,
  // spend four more requests discovering it.
  const { provider, calls } = liveProvider(() => ({ data: { total_cost: 0 } }));

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0);
  assert.equal(calls.length, 1);
});

test("a numeric string is parsed, as Python's float(cost) parses it", async () => {
  const { provider } = liveProvider(() => ({ data: { total_cost: "0.25" } }));

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0.25);
});

test("a non-numeric cost keeps polling, as Python's ValueError does", async () => {
  const { provider, calls } = liveProvider((_path, attempt) =>
    attempt === 0 ? { data: { total_cost: "free!" } } : { data: { total_cost: 0.5 } },
  );

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0.5);
  assert.equal(calls.length, 2);
});

test("every transport failure is swallowed; the poll continues", async () => {
  const { provider, calls } = liveProvider((_path, attempt) => {
    if (attempt < 2) throw new LlmTransportError("provider_error", "boom");
    return { data: { total_cost: 0.02 } };
  });

  assert.equal(await provider.fetchGenerationCost("gen-abc"), 0.02);
  assert.equal(calls.length, 3);
});

test("the poll does not stack transport retries on top of its own attempts", async () => {
  // Five poll attempts times three transport tries would be fifteen requests
  // for a number that is optional by design.
  const { provider, calls } = liveProvider(() => ({ data: {} }));

  await provider.fetchGenerationCost("gen-abc");

  for (const call of calls) assert.equal(call.options.maxRetries, 0);
});

test("the generation id is URL-encoded on its way into the request line", async () => {
  const { provider, calls } = liveProvider(() => ({ data: { total_cost: 1 } }));

  await provider.fetchGenerationCost("gen/with?chars&here");

  assert.equal(calls[0]?.path, "/generation?id=gen%2Fwith%3Fchars%26here");
});

test("a malformed generation id is refused before any request is built", async () => {
  // Provider-supplied input crossing into a request line. Same provider, so
  // the realistic risk is small -- but Python would have built a broken URL
  // and returned None, which is exactly the observable behavior here.
  const { provider, calls } = liveProvider(() => ({ data: { total_cost: 1 } }));

  assert.equal(await provider.fetchGenerationCost(""), null);
  assert.equal(await provider.fetchGenerationCost("gen id\nwith space"), null);
  assert.equal(calls.length, 0);
});
