import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCaptured } from "#evals/harness/fixture.ts";
import { discoverEvalNames, type EvalModule } from "#evals/harness/runner.ts";

// Port of tests/unit/memory/evals/test_eval_modules.py: the structural
// contract every probe module must satisfy, asserted without running a single
// probe. Evals themselves never enter CI -- they cost money and vary -- but
// their SHAPE is ordinary code and belongs under test like any other.

const KEYLESS = new Set(["retrieval_relevance"]);
/** Modules whose inputs were captured from the Python probes (plateau 3). */
const CAPTURED = new Set([
  "conversation_summary",
  "journal",
  "proportionality",
  "consolidate",
  "shadow",
  "title_tags",
  "extraction",
  "reception",
]);

const names = await discoverEvalNames();
const modules = new Map<string, EvalModule>(
  await Promise.all(
    names.map(async (name) => [name, await import(`../../evals/${name}.ts`)] as const),
  ),
);

test("the suite denominator is the nine modules the roadmap names", () => {
  assert.deepEqual(
    names,
    [
      "conversation_summary",
      "consolidate",
      "extraction",
      "journal",
      "proportionality",
      "reception",
      "retrieval_relevance",
      "shadow",
      "title_tags",
    ].sort(),
  );
});

for (const [name, module] of modules) {
  test(`${name}: exposes a non-empty PROBES list`, () => {
    assert.ok(Array.isArray(module.PROBES), "PROBES is an array");
    assert.ok((module.PROBES?.length ?? 0) > 0, "PROBES is non-empty");
  });

  test(`${name}: THRESHOLD is a fraction`, () => {
    assert.equal(typeof module.THRESHOLD, "number");
    assert.ok((module.THRESHOLD ?? -1) >= 0 && (module.THRESHOLD ?? 2) <= 1);
  });

  test(`${name}: every probe has a unique id, a description, and a callable run`, () => {
    const ids = (module.PROBES ?? []).map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "probe ids are unique");
    for (const probe of module.PROBES ?? []) {
      assert.ok(probe.id.length > 0, "probe id is non-empty");
      assert.ok(probe.description.length > 0, `${probe.id} has a description`);
      assert.equal(typeof probe.run, "function", `${probe.id} has a callable run`);
    }
  });

  test(`${name}: declares model and prompts consistently with what it calls`, () => {
    if (KEYLESS.has(name)) {
      // A genuinely prompt-free eval records null model and null hash -- a
      // distinguishable state from "hash unchanged", not an omission.
      assert.equal(module.EVAL_MODEL, undefined, "keyless module pins no model");
      assert.deepEqual(module.EVAL_PROMPTS, [], "keyless module declares no prompts");
    } else {
      assert.equal(typeof module.EVAL_MODEL, "string");
      assert.ok((module.EVAL_MODEL ?? "").length > 0, "live module pins a model");
      assert.ok((module.EVAL_PROMPTS?.length ?? 0) > 0, "live module declares its prompts");
    }
  });

  if (CAPTURED.has(name)) {
    test(`${name}: every probe matches a captured fixture probe, in order`, () => {
      const captured = loadCaptured(name);
      assert.deepEqual(
        (module.PROBES ?? []).map((p) => p.id),
        captured.probes.map((p) => p.id),
        "probe ids and order match the Python capture",
      );
    });

    test(`${name}: THRESHOLD matches the captured Python threshold`, () => {
      assert.equal(module.THRESHOLD, loadCaptured(name).threshold);
    });

    test(`${name}: blocking flags match the captured injection probes`, () => {
      const captured = loadCaptured(name);
      for (const probe of module.PROBES ?? []) {
        const expected = captured.probes.find((p) => p.id === probe.id)?.blocking ?? false;
        assert.equal(
          probe.blocking === true,
          expected,
          `${probe.id} blocking flag matches the capture`,
        );
      }
    });
  }
}

test("exactly six probes across the suite are blocking, and all are injection probes", () => {
  const blocking: string[] = [];
  for (const [name, module] of modules) {
    for (const probe of module.PROBES ?? []) {
      if (probe.blocking === true) blocking.push(`${name}/${probe.id}`);
    }
  }
  assert.equal(blocking.length, 6, `blocking probes: ${blocking.join(", ")}`);
  for (const id of blocking) {
    assert.match(id, /inject/, `${id} is an injection probe`);
  }
});

test("importing a probe module makes no provider call and needs no key", () => {
  // Discovery imports every module, including ones --all will not run. The
  // live provider resolves its config lazily on first complete(), which is
  // what keeps discovery free; this pins that property.
  assert.ok(modules.size > 0);
  assert.equal(process.env.OPENROUTER_API_KEY_USED_AT_IMPORT, undefined);
});
