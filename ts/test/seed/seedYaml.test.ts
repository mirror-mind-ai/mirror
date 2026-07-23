import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadJourneyContent,
  loadPersonaContent,
  loadYamlContent,
  YamlFileNotFoundError,
} from "../../src/seed/seedYaml.ts";

function fakeReader(content: string): (path: string) => string {
  return () => content;
}

test("loadYamlContent extracts the named field and version, defaulting version to 1.0.0", () => {
  const read = fakeReader('version: "2.0.0"\nsoul: |\n  # Soul\n  Line two.\n');
  assert.deepEqual(loadYamlContent("/fake/self/soul.yaml", "soul", read), {
    content: "# Soul\nLine two.\n",
    version: "2.0.0",
  });

  const noVersion = fakeReader("behavior: Just a scalar.\n");
  assert.deepEqual(loadYamlContent("/fake/ego/behavior.yaml", "behavior", noVersion), {
    content: "Just a scalar.",
    version: "1.0.0",
  });
});

test("loadYamlContent returns empty content when the field is absent", () => {
  const read = fakeReader("version: '1.0.0'\nother_field: x\n");
  assert.deepEqual(loadYamlContent("/fake/ego/constraints.yaml", "constraints", read), {
    content: "",
    version: "1.0.0",
  });
});

test("loadYamlContent throws YamlFileNotFoundError when the reader throws", () => {
  const throwingRead = () => {
    throw new Error("ENOENT");
  };
  assert.throws(
    () => loadYamlContent("/fake/missing.yaml", "field", throwingRead),
    (error: unknown) =>
      error instanceof YamlFileNotFoundError &&
      error.message === "File not found: /fake/missing.yaml",
  );
});

test("loadPersonaContent assembles content from system_prompt + briefing and canonical metadata JSON", () => {
  const yaml = [
    "persona_id: engineer",
    "name: Engineer",
    "version: '1.0.0'",
    "inherits_from: ego",
    "default_model: anthropic/claude-sonnet-4.6",
    "description: A technical persona.",
    "system_prompt: |",
    "  # Engineer",
    "  I help build software.",
    "briefing: |",
    "  Extra context.",
    "routing_keywords:",
    "  - code",
    "  - refactor",
  ].join("\n");
  const result = loadPersonaContent("/fake/personas/engineer.yaml", fakeReader(yaml));
  assert.equal(result.personaId, "engineer");
  assert.equal(result.version, "1.0.0");
  assert.equal(
    result.content,
    "# Engineer\nI help build software.\n\n\n# Briefing\n\nExtra context.\n",
  );
  assert.deepEqual(JSON.parse(result.metadataJson), {
    persona_id: "engineer",
    name: "Engineer",
    inherits_from: "ego",
    description: "A technical persona.",
    routing_keywords: ["code", "refactor"],
    default_model: "anthropic/claude-sonnet-4.6",
  });
  // Key order matches the Python dict literal exactly (semantically required
  // per the DS6 identity.metadata decision: parse-and-compare, not raw bytes).
  assert.equal(
    result.metadataJson,
    '{"persona_id":"engineer","name":"Engineer","inherits_from":"ego","description":"A technical persona.","routing_keywords":["code","refactor"],"default_model":"anthropic/claude-sonnet-4.6"}',
  );
});

test("loadPersonaContent defaults persona_id to the file stem and keeps null metadata fields as null (not omitted)", () => {
  const yaml = "system_prompt: Minimal prompt.\n";
  const result = loadPersonaContent("/fake/personas/minimal.yaml", fakeReader(yaml));
  assert.equal(result.personaId, "minimal");
  const metadata = JSON.parse(result.metadataJson);
  assert.equal(metadata.name, null);
  assert.equal(metadata.inherits_from, null);
  assert.equal(metadata.description, null);
  assert.equal(metadata.default_model, null);
  assert.deepEqual(metadata.routing_keywords, []);
  assert.ok(Object.hasOwn(metadata, "name"), "absent fields must be present as null, not omitted");
});

test("loadJourneyContent assembles content in name/status/description/briefing/context order", () => {
  const yaml = [
    "journey_id: personal-growth",
    "name: Personal Growth",
    "status: active",
    "version: '1.0.0'",
    "description: A broad journey.",
    "briefing: Use this when reflecting.",
    "context: |",
    "  # Context",
    "  Body text.",
  ].join("\n");
  const result = loadJourneyContent("/fake/journeys/personal-growth.yaml", fakeReader(yaml));
  assert.equal(result.journeyId, "personal-growth");
  assert.equal(result.version, "1.0.0");
  assert.equal(
    result.content,
    "# Personal Growth\n**Status:** active\n\n## Description\n\nA broad journey.\n\n## Briefing\n\nUse this when reflecting.\n\n## Context\n\n# Context\nBody text.\n",
  );
});

test("loadJourneyContent falls back to the file stem when journey_id is absent or empty", () => {
  const result = loadJourneyContent(
    "/fake/journeys/my-journey.yaml",
    fakeReader("status: active\n"),
  );
  assert.equal(result.journeyId, "my-journey");
});
