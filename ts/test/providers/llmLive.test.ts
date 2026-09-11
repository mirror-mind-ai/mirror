import assert from "node:assert/strict";
import { test } from "node:test";

import { ProviderConfigError } from "#providers/config.ts";
import { LiveLlmProvider } from "#providers/llm.ts";
import { LlmTransportError, type PostJsonOptions } from "#providers/openrouter.ts";

const LIVE_ENV = { OPENROUTER_API_KEY: "sk-or-v1-live-chat-test" };

interface Captured {
  path: string;
  body: Record<string, unknown>;
  options: PostJsonOptions;
}

function liveProvider(
  reply: (body: Record<string, unknown>) => unknown,
  env: Record<string, string | undefined> = LIVE_ENV,
) {
  const calls: Captured[] = [];
  const provider = new LiveLlmProvider({
    env,
    createClient: () => ({
      postJson: async (path, body, options) => {
        calls.push({ path, body: body as Record<string, unknown>, options });
        return reply(body as Record<string, unknown>);
      },
    }),
  });
  return { provider, calls };
}

function chatReply(content: unknown, extra: Record<string, unknown> = {}): unknown {
  return { id: "gen-123", choices: [{ message: { content } }], ...extra };
}

function messagesOf(call: Captured): { role: string; content: string }[] {
  return call.body.messages as { role: string; content: string }[];
}

test("the request carries Python's envelope: exactly one user message", async () => {
  // The US10 prompt digests pin the CONTENT of every close-tail prompt, not
  // the structure around it. A system message, a prefill, or a second turn
  // would satisfy every digest and change what the model actually hears.
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "extraction", prompt: "GRADED PROMPT" });

  const messages = messagesOf(calls[0] as Captured);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[0]?.content, "GRADED PROMPT");
});

test("the graded prompt is sent byte-for-byte, including whitespace and fences", async () => {
  const prompt = "System rules.\n\n<<<TRANSCRIPT>>>\n  indented\ttabbed\n<<<END>>>\n\n";
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "conversation_summary", prompt });

  assert.equal(messagesOf(calls[0] as Captured)[0]?.content, prompt);
});

test("the request posts to /chat/completions with Python's defaults", async () => {
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(calls[0]?.path, "/chat/completions");
  assert.equal(calls[0]?.body.model, "google/gemini-2.5-flash-lite");
  assert.equal(calls[0]?.body.temperature, 0.7);
  assert.equal(calls[0]?.body.max_tokens, 4096);
});

test("per-request overrides win, as the graded call sites pass them", async () => {
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({
    role: "conversation_title",
    prompt: "p",
    temperature: 0.2,
    maxTokens: 40,
    model: "vendor/other",
  });

  assert.equal(calls[0]?.body.temperature, 0.2);
  assert.equal(calls[0]?.body.max_tokens, 40);
  assert.equal(calls[0]?.body.model, "vendor/other");
});

test("temperature 0 is honored, not treated as absent", async () => {
  // `??` not `||`: a deterministic call site asking for 0 must not silently
  // receive Python's 0.7 default.
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "extraction", prompt: "p", temperature: 0 });

  assert.equal(calls[0]?.body.temperature, 0);
});

test("no streaming, no tools, no system message -- Python sends none", async () => {
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "extraction", prompt: "p" });

  const body = calls[0]?.body ?? {};
  assert.equal(body.stream, undefined);
  assert.equal(body.tools, undefined);
  assert.deepEqual(Object.keys(body).sort(), ["max_tokens", "messages", "model", "temperature"]);
});

test("content is trimmed, matching Python's .strip()", async () => {
  const { provider } = liveProvider(() => chatReply("  spaced out \n"));

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.content, "spaced out");
});

test('null content becomes an empty string, not an error (Python\'s `or ""`)', async () => {
  // A refusal or an empty completion is a legitimate model outcome; the
  // parser upstream reports no_signal/parse_failed. Raising here would turn a
  // normal model behavior into a transport failure and a retry storm.
  const { provider } = liveProvider(() => chatReply(null));

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.content, "");
});

test("usage and generation id are carried for the ledger", async () => {
  const { provider } = liveProvider(() =>
    chatReply("ok", { usage: { prompt_tokens: 120, completion_tokens: 45 } }),
  );

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.promptTokens, 120);
  assert.equal(response.completionTokens, 45);
  assert.equal(response.generationId, "gen-123");
  assert.ok((response.latencyMs ?? -1) >= 0);
});

test("missing or non-integer usage is absent, never zero", async () => {
  // `LlmResponse` predates this story and marks usage optional, so absence is
  // `undefined` here while `EmbeddingResult` uses `null`. Both are normalized
  // by the ledger's `?? null`. What matters is that a string, a float, or a
  // missing field never becomes 0 -- a zero-token row reads as a free call.
  const { provider } = liveProvider(() => chatReply("ok", { usage: { prompt_tokens: "120" } }));

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.promptTokens, undefined);
  assert.equal(response.completionTokens, undefined);
  assert.notEqual(response.promptTokens, 0);
});

test("the response model echoes the requested model, which is what Python logs", async () => {
  const { provider } = liveProvider(() => chatReply("ok"));

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.model, "google/gemini-2.5-flash-lite");
});

test("empty choices is malformed_output -- Python's IndexError", async () => {
  const { provider } = liveProvider(() => ({ id: "g", choices: [] }));

  const error = await provider
    .complete({ role: "extraction", prompt: "p" })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "malformed_output");
});

test("a choice that is not an object is malformed_output", async () => {
  const { provider } = liveProvider(() => ({ id: "g", choices: ["nope"] }));

  const error = await provider
    .complete({ role: "extraction", prompt: "p" })
    .catch((e: unknown) => e);

  assert.ok(error instanceof LlmTransportError);
  assert.equal(error.kind, "malformed_output");
});

test("model output that is not JSON is NOT a transport error", async () => {
  // The taxonomy's malformed_output means the HTTP body, never the model's
  // text. A 200 whose content fails to parse is the parser's concern
  // (parse_failed); classifying it here would retry a deterministic model
  // answer three times and pay for it each time.
  const { provider } = liveProvider(() => chatReply("I'm afraid I can't do that."));

  const response = await provider.complete({ role: "extraction", prompt: "p" });

  assert.equal(response.content, "I'm afraid I can't do that.");
});

test("the call is bounded by the extraction-tier timeout, not an SDK default", async () => {
  const { provider, calls } = liveProvider(() => chatReply("ok"));

  await provider.complete({ role: "conversation_title", prompt: "p" });

  assert.equal(calls[0]?.options.timeoutMs, 60_000);
});

test("constructing without a key does not throw; embedding-time config does", async () => {
  // Same rule as the live embedding provider: a missing key must surface
  // inside the call, where the close tail records a failed attempt, not at
  // construction where it would crash the hook before any accounting.
  assert.doesNotThrow(() => new LiveLlmProvider({ env: {} }));

  const provider = new LiveLlmProvider({ env: {} });
  const error = await provider
    .complete({ role: "extraction", prompt: "p" })
    .catch((e: unknown) => e);

  assert.ok(error instanceof ProviderConfigError);
});

test("an error from the chat path carries no provider body", async () => {
  const { provider } = liveProvider(() => ({ id: "g", choices: [] }));

  const error = (await provider
    .complete({ role: "extraction", prompt: "transcript with private content" })
    .catch((e: unknown) => e)) as LlmTransportError;

  const serialized = JSON.stringify({ ...error, message: error.message });
  assert.ok(!serialized.includes("private content"));
  assert.deepEqual(Object.keys({ ...error }).sort(), ["kind", "name", "retryable", "status"]);
});
