import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EXTRACTION_MODEL,
  resolveExtractionModel,
  resolveProviderConfig,
} from "../../src/providers/config.ts";

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
