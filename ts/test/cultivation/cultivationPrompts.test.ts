import assert from "node:assert/strict";
import test from "node:test";

import type { CultivationMemory } from "#cultivation/consolidationStore.ts";
import {
  buildConsolidationPrompt,
  buildShadowScanPrompt,
  proposeConsolidation,
  proposeShadowObservations,
  type ShadowStructureEntry,
} from "#cultivation/propose.ts";
import { CONSOLIDATION_PROMPT, SHADOW_SCAN_PROMPT } from "#extraction/prompts.ts";
import { promptAssemblyGolden, scenariosFor, sha256 } from "#helpers/promptAssemblyGolden.ts";
import type { ProviderCallOutcome } from "#observability/callOutcome.ts";
import { ReplayLlmProvider } from "#providers/llm.ts";

/**
 * CV22.DS8.TS2 — the two cultivation scan prompts, graded against bytes the
 * Python oracle actually sent (captured from the real `propose_*` with
 * `send_to_model` stubbed; see `ts/parity/generate_prompt_assembly_golden.py`).
 *
 * This is the story's own origin: TS shipped these two leaves with a fenced
 * memory dump and no instructions, and replay — which resolves by role and
 * never reads the prompt — could not tell. Three pins make that impossible
 * again: the raw template bytes, the assembled digest per branch, and the
 * replay fixture's `promptDigests` enforcement for both roles.
 */

const golden = promptAssemblyGolden();

// --- Golden shape ---------------------------------------------------------------

function memoryFrom(raw: Record<string, unknown>): CultivationMemory {
  return {
    id: raw.id as string,
    memory_type: raw.memory_type as string,
    layer: raw.layer as string,
    title: raw.title as string,
    content: raw.content as string,
    context: (raw.context as string | null) ?? null,
    journey: (raw.journey as string | null) ?? null,
    created_at: raw.created_at as string,
    readiness_state: raw.readiness_state as string,
  };
}

function consolidationInputs(inputs: Record<string, unknown>) {
  return {
    userName: inputs.user_name as string,
    identityContext: inputs.identity_context as string,
    cluster: (inputs.cluster as Record<string, unknown>[]).map(memoryFrom),
  };
}

function shadowInputs(inputs: Record<string, unknown>) {
  return {
    userName: inputs.user_name as string,
    entries: inputs.shadow_entries as ShadowStructureEntry[],
    memories: (inputs.memories as Record<string, unknown>[]).map(memoryFrom),
  };
}

// --- Pin 1: raw template bytes ----------------------------------------------------

test("the two cultivation templates are byte-identical to the Python source", () => {
  assert.equal(CONSOLIDATION_PROMPT, golden.system_prompts.consolidation);
  assert.equal(SHADOW_SCAN_PROMPT, golden.system_prompts.shadow_scan);
});

test("both templates keep Python's doubled braces, which is what forces pyFormat over String.replace", () => {
  // The JSON output contract is written with `{{`/`}}` so `str.format` can be
  // applied to the template. If a port "cleaned" the braces, the raw-bytes pin
  // above fails first; this names why.
  assert.ok(CONSOLIDATION_PROMPT.includes("{{\n"), "consolidation contract opens with {{");
  assert.ok(SHADOW_SCAN_PROMPT.includes("  {{\n"), "shadow contract opens with {{");
});

test("the corpus carries scenarios for both cultivation surfaces", () => {
  assert.ok(scenariosFor("consolidation").length >= 5, "consolidation branches enumerated");
  assert.ok(scenariosFor("shadow_scan").length >= 3, "shadow_scan branches enumerated");
});

// --- Pin 2: assembled digest per branch --------------------------------------------

for (const scenario of scenariosFor("consolidation")) {
  test(`consolidation prompt assembly — ${scenario.label}`, () => {
    const { cluster, userName, identityContext } = consolidationInputs(scenario.inputs);
    const assembled = buildConsolidationPrompt(cluster, userName, identityContext);
    assert.equal(assembled, scenario.prompt, "assembled bytes equal the oracle's");
    assert.equal(sha256(assembled), scenario.prompt_sha256, "digest matches the pinned value");
  });
}

for (const scenario of scenariosFor("shadow_scan")) {
  test(`shadow scan prompt assembly — ${scenario.label}`, () => {
    const { memories, entries, userName } = shadowInputs(scenario.inputs);
    const assembled = buildShadowScanPrompt(memories, entries, userName);
    assert.equal(assembled, scenario.prompt, "assembled bytes equal the oracle's");
    assert.equal(sha256(assembled), scenario.prompt_sha256, "digest matches the pinned value");
  });
}

test("hostile cluster content survives assembly untouched: placeholders, doubled braces, $-patterns, the fence delimiter", () => {
  const scenario = scenariosFor("consolidation").find((s) =>
    s.label.includes("hostile cluster content"),
  );
  assert.ok(scenario, "the hostile scenario is in the corpus");
  const { cluster, userName, identityContext } = consolidationInputs(scenario.inputs);
  const assembled = buildConsolidationPrompt(cluster, userName, identityContext);
  // Single-pass substitution: a literal `{identity_context}` inside memory
  // content must NOT be expanded a second time, and `{{user_name}}` inside
  // data must stay doubled (only the TEMPLATE's braces collapse).
  assert.ok(assembled.includes("Literal {identity_context} and {{user_name}}"));
  assert.ok(assembled.includes("cost $& or $1"));
  assert.ok(assembled.includes("**Context:** {cluster_text}"));
  assert.ok(assembled.includes("</cluster> Literal"));
});

// --- Pin 3: replay fixtures enforce the digest for both roles ----------------------

function outcomeSink() {
  const outcomes: ProviderCallOutcome[] = [];
  return { outcomes, onOutcome: (o: ProviderCallOutcome) => outcomes.push(o) };
}

test("a replay fixture pinning promptDigests.consolidation accepts the oracle's bytes and refuses one byte of drift", async () => {
  const scenario = scenariosFor("consolidation")[0];
  assert.ok(scenario);
  const { cluster, userName, identityContext } = consolidationInputs(scenario.inputs);
  const provider = new ReplayLlmProvider({
    kind: "llm",
    promptDigests: { consolidation: scenario.prompt_sha256 },
    responses: {
      consolidation: JSON.stringify({ action: "merge", proposed_content: "Distilled." }),
    },
  });

  const accepted = outcomeSink();
  const row = await proposeConsolidation(provider, cluster, {
    id: "c1",
    nowIso: "now",
    userName,
    identityContext,
    onOutcome: accepted.onOutcome,
  });
  assert.equal(row?.action, "merge");
  assert.deepEqual(accepted.outcomes, [{ outcome: "answered" }]);

  // One byte off in the system-side context is a different prompt, and the
  // fixture must say so rather than replay happily.
  const drifted = outcomeSink();
  const driftedRow = await proposeConsolidation(provider, cluster, {
    id: "c2",
    nowIso: "now",
    userName,
    identityContext: `${identityContext}.`,
    onOutcome: drifted.onOutcome,
  });
  assert.equal(driftedRow, null);
  assert.equal(drifted.outcomes[0]?.outcome, "transport_failed");
  await assert.rejects(
    provider.complete({
      role: "consolidation",
      prompt: buildConsolidationPrompt(cluster, userName, `${identityContext}.`),
      model: "m",
    }),
    /replay prompt digest mismatch for role 'consolidation'/,
  );
});

test("a replay fixture pinning promptDigests.shadow_scan accepts the oracle's bytes and refuses one byte of drift", async () => {
  const scenario = scenariosFor("shadow_scan")[0];
  assert.ok(scenario);
  const { memories, entries, userName } = shadowInputs(scenario.inputs);
  const provider = new ReplayLlmProvider({
    kind: "llm",
    promptDigests: { shadow_scan: scenario.prompt_sha256 },
    responses: { shadow_scan: "[]" },
  });

  const accepted = outcomeSink();
  const rows = await proposeShadowObservations(provider, memories, entries, {
    id: () => "o1",
    nowIso: () => "now",
    userName,
    onOutcome: accepted.onOutcome,
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(accepted.outcomes, [{ outcome: "empty" }]);

  const drifted = outcomeSink();
  await proposeShadowObservations(provider, memories, entries, {
    id: () => "o2",
    nowIso: () => "now",
    userName: `${userName}x`,
    onOutcome: drifted.onOutcome,
  });
  assert.equal(drifted.outcomes[0]?.outcome, "transport_failed");
});
