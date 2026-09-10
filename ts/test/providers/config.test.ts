import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EXTRACTION_MODEL,
  resolveEmbeddingModel,
  resolveExtractionModel,
  resolveLlmMaxRetries,
  resolveLlmTimeoutMs,
  resolveLogLlmCallsMode,
  resolveProviderConfig,
} from "#providers/config.ts";

test("resolveProviderConfig reads API keys from env", () => {
  const config = resolveProviderConfig("openrouter", {
    env: { OPENROUTER_API_KEY: "sk-env-secret" },
  });

  assert.equal(config.provider, "openrouter");
  assert.equal(config.apiKey, "sk-env-secret");
  assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
});

test("resolveProviderConfig refuses argv-style secret sources", () => {
  assert.throws(
    () =>
      resolveProviderConfig("openrouter", {
        env: {},
        argv: ["--api-key", "sk-argv-secret"],
      }),
    /API keys must come from env\/config/i,
  );

  assert.throws(
    () =>
      resolveProviderConfig("openrouter", {
        env: {},
        argv: ["--openrouter-api-key=sk-argv-secret"],
      }),
    /API keys must come from env\/config/i,
  );
});

test("resolveProviderConfig fails with a redacted error when the key is missing", () => {
  assert.throws(
    () => resolveProviderConfig("openrouter", { env: {} }),
    /OPENROUTER_API_KEY is not configured/,
  );
});

test("resolveExtractionModel returns the default when no override is set (AI-06)", () => {
  assert.equal(resolveExtractionModel({ env: {} }), DEFAULT_EXTRACTION_MODEL);
  assert.equal(DEFAULT_EXTRACTION_MODEL, "google/gemini-2.5-flash-lite");
});

test("resolveExtractionModel honors a MEMORY_EXTRACTION_MODEL override (AI-06)", () => {
  assert.equal(
    resolveExtractionModel({ env: { MEMORY_EXTRACTION_MODEL: "vendor/custom-model" } }),
    "vendor/custom-model",
  );
});

test("resolveExtractionModel honors an empty-string override as-is, matching Python's os.getenv(name, default) (AI-06)", () => {
  // os.getenv only substitutes the default on ABSENCE, not falsiness -- an
  // empty-string override is a real (if unusual) value, not "unset".
  assert.equal(resolveExtractionModel({ env: { MEMORY_EXTRACTION_MODEL: "" } }), "");
});

test("DEFAULT_EMBEDDING_MODEL captures Python's embedding pin default (AI-06, capture-only)", () => {
  // No resolver function: EmbeddingProvider.embed(text) has no model parameter
  // to wire this into today. See CR039 plan for the excluded reachability probe.
  assert.equal(DEFAULT_EMBEDDING_MODEL, "openai/text-embedding-3-small");
});

test("resolveLogLlmCallsMode defaults to metadata, matching Python's off|metadata|full (AI-09)", () => {
  assert.equal(resolveLogLlmCallsMode({ env: {} }), "metadata");
  assert.equal(resolveLogLlmCallsMode({ env: { MEMORY_LOG_LLM_CALLS: "metadata" } }), "metadata");
});

test("resolveLogLlmCallsMode maps legacy '1' to full, matching Python's back-compat (AI-09)", () => {
  assert.equal(resolveLogLlmCallsMode({ env: { MEMORY_LOG_LLM_CALLS: "1" } }), "full");
  assert.equal(resolveLogLlmCallsMode({ env: { MEMORY_LOG_LLM_CALLS: "full" } }), "full");
});

test("resolveLogLlmCallsMode requires an explicit opt-in for full -- never a silent default (AI-09)", () => {
  assert.notEqual(resolveLogLlmCallsMode({ env: {} }), "full");
  assert.equal(resolveLogLlmCallsMode({ env: { MEMORY_LOG_LLM_CALLS: "anything-else" } }), "off");
});

test("resolveEmbeddingModel returns the default when no override is set, distinct from the extraction model (CR043)", () => {
  assert.equal(resolveEmbeddingModel({ env: {} }), DEFAULT_EMBEDDING_MODEL);
  assert.notEqual(resolveEmbeddingModel({ env: {} }), resolveExtractionModel({ env: {} }));
});

test("resolveEmbeddingModel honors a MEMORY_EMBEDDING_MODEL override (CR043)", () => {
  assert.equal(
    resolveEmbeddingModel({ env: { MEMORY_EMBEDDING_MODEL: "vendor/custom-embedding" } }),
    "vendor/custom-embedding",
  );
});

// --- CV22.DS8.US1: per-role timeouts and the retry ceiling (AI-18) ---------

test("resolveLlmTimeoutMs mirrors Python's per-role defaults, in milliseconds", () => {
  // Python holds seconds (config.py LLM_TIMEOUT_*); the TS transport needs ms
  // for AbortSignal.timeout. The VALUES must not drift -- a longer TS timeout
  // would reintroduce exactly the hook stall AI-01 removed.
  assert.equal(resolveLlmTimeoutMs("extraction", { env: {} }), 60_000);
  assert.equal(resolveLlmTimeoutMs("reception", { env: {} }), 10_000);
  assert.equal(resolveLlmTimeoutMs("embedding", { env: {} }), 15_000);
});

test("resolveLlmTimeoutMs honors each role's env override independently", () => {
  const env = {
    MEMORY_LLM_TIMEOUT_EXTRACTION: "90",
    MEMORY_LLM_TIMEOUT_RECEPTION: "5",
    MEMORY_LLM_TIMEOUT_EMBEDDING: "7.5",
  };
  assert.equal(resolveLlmTimeoutMs("extraction", { env }), 90_000);
  assert.equal(resolveLlmTimeoutMs("reception", { env }), 5_000);
  // Python's float() accepts fractional seconds; the ms conversion keeps them.
  assert.equal(resolveLlmTimeoutMs("embedding", { env }), 7_500);
});

test("resolveLlmTimeoutMs fails loudly on a non-numeric override, as Python's float() would", () => {
  // Python raises at import; substituting the default here would silently give
  // a misconfigured install a different timeout than the operator asked for.
  assert.throws(
    () => resolveLlmTimeoutMs("embedding", { env: { MEMORY_LLM_TIMEOUT_EMBEDDING: "abc" } }),
    /could not convert string to float/i,
  );
  assert.throws(
    () => resolveLlmTimeoutMs("embedding", { env: { MEMORY_LLM_TIMEOUT_EMBEDDING: "" } }),
    /could not convert string to float/i,
  );
});

test("resolveLlmMaxRetries mirrors Python's MEMORY_LLM_MAX_RETRIES default of 2", () => {
  assert.equal(resolveLlmMaxRetries({ env: {} }), 2);
  assert.equal(resolveLlmMaxRetries({ env: { MEMORY_LLM_MAX_RETRIES: "0" } }), 0);
  assert.equal(resolveLlmMaxRetries({ env: { MEMORY_LLM_MAX_RETRIES: "5" } }), 5);
});

test("resolveLlmMaxRetries fails loudly on a non-integer override, as Python's int() would", () => {
  assert.throws(
    () => resolveLlmMaxRetries({ env: { MEMORY_LLM_MAX_RETRIES: "2.5" } }),
    /invalid literal for int\(\)/i,
  );
});
