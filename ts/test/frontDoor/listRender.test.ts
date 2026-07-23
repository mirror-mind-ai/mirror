import assert from "node:assert/strict";
import { test } from "node:test";
import { renderListJourneys, renderListPersonas } from "../../src/frontDoor/render/list.ts";

test("renderListPersonas reports (none) for an empty list", () => {
  assert.equal(renderListPersonas([], false), "=== PERSONAS ===\n  (none)\n");
});

test("renderListPersonas lists bare keys when not verbose", () => {
  const rendered = renderListPersonas(
    [
      { key: "engineer", version: "1.0.0", routingKeywords: ["code"] },
      { key: "writer", version: "1.0.0", routingKeywords: [] },
    ],
    false,
  );
  assert.equal(rendered, "=== PERSONAS ===\n  engineer\n  writer\n");
});

test("renderListPersonas adds version/keywords lines when verbose, '(none)' for empty keywords", () => {
  const rendered = renderListPersonas(
    [
      { key: "engineer", version: "1.0.0", routingKeywords: ["code", "refactor"] },
      { key: "writer", version: "2.0.0", routingKeywords: [] },
    ],
    true,
  );
  assert.equal(
    rendered,
    "=== PERSONAS ===\n" +
      "  engineer\n" +
      "    version: 1.0.0\n" +
      "    routing_keywords: code, refactor\n" +
      "  writer\n" +
      "    version: 2.0.0\n" +
      "    routing_keywords: (none)\n",
  );
});

test("renderListJourneys reports (none) for an empty list", () => {
  assert.equal(renderListJourneys([]), "=== JOURNEYS ===\n  (none)\n");
});

test("renderListJourneys formats [status] key, with an optional ': description' suffix", () => {
  const rendered = renderListJourneys([
    { key: "demo", status: "active", description: "A demo journey." },
    { key: "quiet", status: "unknown", description: "" },
  ]);
  assert.equal(rendered, "=== JOURNEYS ===\n  [active] demo: A demo journey.\n  [unknown] quiet\n");
});
