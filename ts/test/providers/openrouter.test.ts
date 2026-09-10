import assert from "node:assert/strict";
import { test } from "node:test";

import { createOpenRouterClient, LlmTransportError } from "#providers/openrouter.ts";

const CONFIG = {
  provider: "openrouter" as const,
  apiKey: "sk-or-v1-test-secret-key",
  baseUrl: "https://openrouter.ai/api/v1",
};

/** A fetch stub that replays a queued script and records every request. */
function scriptedFetch(script: readonly (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const fetchImpl = async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = script[index];
    index += 1;
    if (next === undefined) throw new Error(`unscripted fetch call #${index}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Collects backoff waits instead of spending them. */
function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

function client(
  script: readonly (Response | Error)[],
  options: { maxRetries?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const { fetchImpl, calls } = scriptedFetch(script);
  const { waits, sleep } = recordingSleep();
  const transport = createOpenRouterClient(CONFIG, {
    fetch: fetchImpl as unknown as typeof fetch,
    sleep: options.sleep ?? sleep,
  });
  return { transport, calls, waits, maxRetries: options.maxRetries ?? 2 };
}

test("a successful call returns the parsed body and issues exactly one request", async () => {
  const { transport, calls } = client([json({ ok: true })]);

  const body = await transport.postJson("/embeddings", { input: "hi" }, { timeoutMs: 15_000 });

  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://openrouter.ai/api/v1/embeddings");
  assert.equal(calls[0]?.init.method, "POST");
});

test("the key travels in exactly one Authorization header and nowhere else", async () => {
  const { transport, calls } = client([json({ ok: true })]);

  await transport.postJson("/embeddings", { input: "hi" }, { timeoutMs: 15_000 });

  const headers = new Headers(calls[0]?.init.headers as Record<string, string>);
  assert.equal(headers.get("authorization"), `Bearer ${CONFIG.apiKey}`);
  const serialized = JSON.stringify({
    url: calls[0]?.url,
    headers: [...headers].filter(([name]) => name !== "authorization"),
    body: calls[0]?.init.body,
  });
  assert.ok(!serialized.includes(CONFIG.apiKey), "key leaked outside the Authorization header");
});

test("redirects are refused, never followed with the key attached", async () => {
  // The base URL is a constant and there is no legitimate redirect. Relying on
  // the spec's cross-origin Authorization stripping would be an implicit
  // guarantee; refusing is explicit (security review, RS005).
  const { transport, calls } = client([json({ ok: true })]);

  await transport.postJson("/embeddings", { input: "hi" }, { timeoutMs: 15_000 });

  assert.equal((calls[0]?.init as RequestInit).redirect, "error");
});

test("401 is auth and is never retried", async () => {
  const { transport, calls } = client([json({ error: "no key" }, 401)]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "auth");
  assert.equal(error.status, 401);
  assert.equal(error.retryable, false);
  assert.equal(calls.length, 1, "an auth failure must not spend a retry budget");
});

test("403 is auth as well", async () => {
  const { transport } = client([json({ error: "forbidden" }, 403)]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "auth");
});

test("429 is retried to the ceiling and then reported as rate_limit", async () => {
  const { transport, calls, waits } = client([
    json({ error: "slow down" }, 429),
    json({ error: "slow down" }, 429),
    json({ error: "slow down" }, 429),
  ]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "rate_limit");
  assert.equal(calls.length, 3, "maxRetries=2 means three attempts total, as Python's SDK");
  assert.equal(waits.length, 2);
});

test("backoff grows exponentially between attempts", async () => {
  const { transport, waits } = client([json({}, 500), json({}, 500), json({ ok: true })]);

  await transport.postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 });

  assert.deepEqual(waits, [500, 1000]);
});

test("a retry-after header wins over the computed backoff", async () => {
  const { transport, waits } = client([json({}, 429, { "retry-after": "3" }), json({ ok: true })]);

  await transport.postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 });

  assert.deepEqual(waits, [3000]);
});

test("an absurd retry-after is capped, so a provider cannot park the hook", async () => {
  const { transport, waits } = client([
    json({}, 429, { "retry-after": "3600" }),
    json({ ok: true }),
  ]);

  await transport.postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 });

  assert.deepEqual(waits, [60_000]);
});

test("5xx is retried and succeeds when the provider recovers", async () => {
  const { transport, calls } = client([json({}, 500), json({}, 503), json({ ok: true })]);

  const body = await transport.postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 });

  assert.deepEqual(body, { ok: true });
  assert.equal(calls.length, 3);
});

test("an exhausted 5xx is provider_error, not rate_limit", async () => {
  const { transport } = client([json({}, 500), json({}, 500), json({}, 500)]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "provider_error");
  assert.equal(error.status, 500);
});

test("408 and 409 are retried, matching the SDK classes Python inherits", async () => {
  const { transport, calls } = client([json({}, 408), json({}, 409), json({ ok: true })]);

  await transport.postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 });

  assert.equal(calls.length, 3);
});

test("other 4xx are terminal provider errors, never retried", async () => {
  for (const status of [400, 404, 422]) {
    const { transport, calls } = client([json({ error: "bad" }, status)]);

    const error = await transport
      .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 })
      .catch((e: unknown) => e);

    assert.ok(error instanceof LlmTransportError);
    assert.equal(error.kind, "provider_error", `status ${status}`);
    assert.equal(error.retryable, false, `status ${status}`);
    assert.equal(calls.length, 1, `status ${status} must not be retried`);
  }
});

test("an aborted request is a timeout", async () => {
  const abort = new DOMException("The operation was aborted", "AbortError");
  const { transport } = client([abort]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 0 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "timeout");
});

test("a network failure is retried and then reported as provider_error", async () => {
  const { transport, calls } = client([
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
  ]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "provider_error");
  assert.equal(calls.length, 3);
});

test("a non-JSON 200 body is malformed_output, not a silent success", async () => {
  const { transport, calls } = client([
    new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  ]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 2 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "malformed_output");
  assert.equal(calls.length, 1, "a malformed body is deterministic; retrying spends money twice");
});

test("an error message never carries the provider's response body", async () => {
  // The primary control is that the body is never interpolated at all: a
  // provider that echoes the Authorization header, or a 4xx whose body quotes
  // the request, would otherwise reach the front-door log and any transcript
  // reporting the failure. Asserting only "no key" would pass vacuously; this
  // asserts the body is absent entirely, which is the property that holds.
  const { transport } = client([
    json({ error: { message: `invalid key ${CONFIG.apiKey} for org acme-1` } }, 401),
  ]);

  const error = await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000 })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.ok(!error.message.includes(CONFIG.apiKey), "key survived in the message");
  assert.ok(!error.message.includes("acme-1"), "provider body text survived in the message");
  assert.equal(error.message, "provider returned HTTP 401");
});

// Note: the client also passes every message through `redactString` with the
// key as the needle. That path is unreachable by construction today (no
// message interpolates a body), so there is no non-circular test for it here;
// `redaction.test.ts` covers the function itself. It stays wired as insurance
// for a future message that does interpolate.

test("the error object carries no response body under any serialization", async () => {
  // Loggers and test reporters serialize error objects whole -- message,
  // enumerable fields, and `cause`. A body kept "just for debugging" leaks the
  // key and the request content through that path even when the message is clean.
  const { transport } = client([
    json({ error: { message: `invalid key ${CONFIG.apiKey}`, secret_echo: CONFIG.apiKey } }, 401),
  ]);

  const error = (await transport
    .postJson("/embeddings", { input: "private query text" }, { timeoutMs: 15_000 })
    .catch((e: unknown) => e)) as LlmTransportError;

  const serialized = JSON.stringify({
    ...error,
    message: error.message,
    cause: (error as { cause?: unknown }).cause,
  });
  assert.ok(!serialized.includes(CONFIG.apiKey), "key reachable through serialization");
  assert.ok(!serialized.includes("private query text"), "request content reachable through error");
  // The whole own-property surface, pinned: adding a `body`, `response`, or
  // `cause` field for debugging would fail here before it could leak.
  assert.deepEqual(Object.keys({ ...error }).sort(), ["kind", "name", "retryable", "status"]);
  assert.equal((error as { cause?: unknown }).cause, undefined);
});

test("the timeout bound is passed to the request as an abort signal", async () => {
  const { transport, calls } = client([json({ ok: true })]);

  await transport.postJson("/embeddings", {}, { timeoutMs: 15_000 });

  const signal = (calls[0]?.init as RequestInit).signal;
  assert.ok(signal instanceof AbortSignal, "every call must be bounded, never open-ended");
});

test("maxRetries=0 issues exactly one attempt", async () => {
  const { transport, calls } = client([json({}, 500)]);

  await transport
    .postJson("/embeddings", {}, { timeoutMs: 15_000, maxRetries: 0 })
    .catch(() => undefined);

  assert.equal(calls.length, 1);
});
