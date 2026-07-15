import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderConfig } from "../../src/providers/config.ts";

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
