import assert from "node:assert/strict";
import test from "node:test";
import { promptAssemblyGolden, scenariosFor, sha256 } from "#helpers/promptAssemblyGolden.ts";
import {
  buildReceptionPrompt,
  formatJourneys,
  formatPersonas,
  RECEPTION_PROMPT,
  runReception,
} from "#mirror/reception.ts";
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

// --- CV22.DS8.US3: assembled-prompt parity against the Python oracle ----------
//
// `reception` predates the digest discipline: it runs on every Mirror Mode
// activation with a query, and nothing compared its assembled bytes to
// Python's. Replay resolves a fixture by role and never reads the prompt, so
// the first reader of a drifted prompt would have been a live model.

test("the reception template is byte-identical to the Python source", () => {
  // Doubled braces included. Holding Python's raw template is what forces
  // assembly through pyFormat rather than String.replace.
  assert.equal(RECEPTION_PROMPT, promptAssemblyGolden().system_prompts.reception);
});

for (const scenario of scenariosFor("reception")) {
  test(`reception prompt assembly — ${scenario.label}`, () => {
    const inputs = scenario.inputs as {
      query: string;
      personas: { slug: string; description: string; routing_keywords: string[] }[];
      journeys: { slug: string; description: string }[];
    };
    const assembled = buildReceptionPrompt(
      inputs.query,
      inputs.personas.map((persona) => ({
        slug: persona.slug,
        description: persona.description,
        routingKeywords: persona.routing_keywords,
      })),
      inputs.journeys,
    );

    assert.equal(assembled, scenario.prompt, "assembled bytes match the oracle");
    assert.equal(sha256(assembled), scenario.prompt_sha256, "digest matches the pinned value");
  });
}

test("dollar patterns in identity content survive assembly untouched", () => {
  // The defect this pins: String.prototype.replace treats `$&`, "$`", `$'`,
  // and `$1` in the REPLACEMENT as substitution directives, so a persona
  // described as "Cost: $& per hour" assembled as "Cost: {personas} per hour"
  // — the matched pattern injected into the prompt. Python's str.format has
  // no such behavior, no fixture carried a `$`, and replay never reads a
  // prompt, so only a live call would have shown it.
  const assembled = buildReceptionPrompt(
    "q",
    [{ slug: "engineer", description: "Cost: $& and $` and $' and $1", routingKeywords: [] }],
    [],
  );

  assert.match(assembled, /- engineer: Cost: \$& and \$` and \$' and \$1/);
  assert.ok(!assembled.includes("{personas}"), "the field marker was consumed, not re-injected");
});
