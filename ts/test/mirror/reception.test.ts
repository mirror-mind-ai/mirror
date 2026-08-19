import assert from "node:assert/strict";
import test from "node:test";
import { formatJourneys, formatPersonas, runReception } from "#mirror/reception.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

test("reception formats compact persona and journey metadata", () => {
  assert.equal(
    formatPersonas([
      { slug: "engineer", description: "Builds systems", routingKeywords: ["code", "debug"] },
    ]),
    "- engineer: Builds systems [keywords: code, debug]",
  );
  assert.equal(
    formatJourneys([{ slug: "mirror-ts-core", description: "Ports the core" }]),
    "- mirror-ts-core: Ports the core",
  );
});

test("reception parses replay output and records the reception role", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      reception: JSON.stringify({
        personas: ["engineer", 4],
        journey: "mirror-ts-core",
        touches_identity: false,
        touches_shadow: true,
      }),
    },
  });
  const result = await runReception(
    "please debug this",
    [{ slug: "engineer", description: "Builds systems", routingKeywords: ["debug"] }],
    [{ slug: "mirror-ts-core", description: "Ports the core" }],
    provider,
  );
  assert.deepEqual(result, {
    personas: ["engineer"],
    journey: "mirror-ts-core",
    touchesIdentity: false,
    touchesShadow: true,
  });
  assert.equal(provider.calls[0]?.role, "reception");
  assert.match(provider.calls[0]?.prompt ?? "", /## User message\nplease debug this$/);
});

test("reception uses Python truthiness for malformed boolean-shaped values", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      reception: JSON.stringify({
        touches_identity: [],
        touches_shadow: { evidence: true },
      }),
    },
  });
  const result = await runReception("query", [], [], provider);
  assert.equal(result.touchesIdentity, false);
  assert.equal(result.touchesShadow, true);
});

test("reception fails soft for malformed output, missing fixture role, and empty query", async () => {
  const malformed = new ReplayLlmProvider({ kind: "llm", responses: { reception: "not json" } });
  assert.deepEqual(await runReception("query", [], [], malformed), {
    personas: [],
    journey: null,
    touchesIdentity: false,
    touchesShadow: false,
  });
  const missing = new ReplayLlmProvider({ kind: "llm", responses: {} });
  assert.deepEqual(await runReception("query", [], [], missing), {
    personas: [],
    journey: null,
    touchesIdentity: false,
    touchesShadow: false,
  });
  assert.deepEqual(await runReception("  ", [], [], malformed), {
    personas: [],
    journey: null,
    touchesIdentity: false,
    touchesShadow: false,
  });
});
