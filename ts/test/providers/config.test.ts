import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EXTRACTION_MODEL,
  MODEL_DEFAULT_REASONING,
  REASONING_EFFORTS,
  readExtractionReasoning,
  resolveEmbeddingModel,
  resolveExtractionModel,
  resolveExtractionReasoning,
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
  // CV9.DS9.US3: the pin moved to Haiku on DS9's evidence.
  assert.equal(DEFAULT_EXTRACTION_MODEL, "anthropic/claude-haiku-5.5");
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

// CV9.DS9.TS1: the reasoning setting is read, never thrown. Inside the session-end
// hooks a throw becomes an extraction attempt, and three attempts quarantine a
// conversation for good (CR178), so an invalid value sends nothing and is reported.

test("readExtractionReasoning sends nothing when the variable is absent or empty (CV9.DS9.TS1)", () => {
  assert.deepEqual(readExtractionReasoning({ env: {} }), { effort: null, invalid: null });
  assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: "" } }), {
    effort: null,
    invalid: null,
  });
  assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: "   " } }), {
    effort: null,
    invalid: null,
  });
});

test("readExtractionReasoning accepts every effort OpenRouter's catalogue lists (CV9.DS9.TS1)", () => {
  assert.deepEqual(
    [...REASONING_EFFORTS],
    ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
  );
  for (const effort of REASONING_EFFORTS) {
    assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: effort } }), {
      effort,
      invalid: null,
    });
  }
});

test("readExtractionReasoning ignores case and surrounding whitespace (CV9.DS9.TS1)", () => {
  assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: " None\n" } }), {
    effort: "none",
    invalid: null,
  });
  assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: "LOW" } }), {
    effort: "low",
    invalid: null,
  });
});

test("readExtractionReasoning reports an invalid value as written, and never throws (CV9.DS9.TS1)", () => {
  // `off` is the most natural typo: the Delivery Story itself says "reasoning off".
  for (const value of ["off", "false", "0", "disabled", "Sometimes"]) {
    assert.deepEqual(readExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: value } }), {
      effort: null,
      invalid: value,
    });
  }
});

// CV9.DS9.US3: the reasoning default is a property of the model. What DS9 measured
// is a fact about each model: Haiku needs `none` (it reasons by default and spends
// the title call's budget), Flash Lite was measured with no field. The effective
// model is resolved first, then the effort: the setting when it names an effort,
// else the model's table entry, else no field.

test("the default pin carries its model default effort, none (CV9.DS9.US3)", () => {
  assert.deepEqual(MODEL_DEFAULT_REASONING, { "anthropic/claude-haiku-5.5": "none" });
  assert.deepEqual(resolveExtractionReasoning({ env: {} }), {
    model: "anthropic/claude-haiku-5.5",
    effort: "none",
    source: "model_default",
    invalid: null,
  });
});

test("naming the default pin explicitly sends the same request as leaving it unset (CV9.DS9.US3)", () => {
  assert.deepEqual(
    resolveExtractionReasoning({ env: { MEMORY_EXTRACTION_MODEL: "anthropic/claude-haiku-5.5" } }),
    resolveExtractionReasoning({ env: {} }),
  );
});

test("a model outside the table carries no effort: the rollback is the measured request (CV9.DS9.US3)", () => {
  // The playbook's rollback. Flash Lite was measured with no reasoning field, and
  // that is what it gets back.
  assert.deepEqual(
    resolveExtractionReasoning({
      env: { MEMORY_EXTRACTION_MODEL: "google/gemini-2.5-flash-lite" },
    }),
    { model: "google/gemini-2.5-flash-lite", effort: null, source: null, invalid: null },
  );
  assert.deepEqual(resolveExtractionReasoning({ env: { MEMORY_EXTRACTION_MODEL: "vendor/new" } }), {
    model: "vendor/new",
    effort: null,
    source: null,
    invalid: null,
  });
});

test("an explicit effort wins on any model (CV9.DS9.US3)", () => {
  assert.deepEqual(resolveExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: "low" } }), {
    model: "anthropic/claude-haiku-5.5",
    effort: "low",
    source: "setting",
    invalid: null,
  });
  assert.deepEqual(
    resolveExtractionReasoning({
      env: {
        MEMORY_EXTRACTION_MODEL: "google/gemini-2.5-flash-lite",
        MEMORY_EXTRACTION_REASONING: "none",
      },
    }),
    { model: "google/gemini-2.5-flash-lite", effort: "none", source: "setting", invalid: null },
  );
});

test("an invalid effort reads as unset: the default pin still sends none, and the value is reported (CV9.DS9.US3)", () => {
  // The case most easily got wrong: invalid -> nothing, as before this story.
  assert.deepEqual(resolveExtractionReasoning({ env: { MEMORY_EXTRACTION_REASONING: "off" } }), {
    model: "anthropic/claude-haiku-5.5",
    effort: "none",
    source: "model_default",
    invalid: "off",
  });
  assert.deepEqual(
    resolveExtractionReasoning({
      env: { MEMORY_EXTRACTION_MODEL: "vendor/new", MEMORY_EXTRACTION_REASONING: "off" },
    }),
    { model: "vendor/new", effort: null, source: null, invalid: "off" },
  );
});
