import assert from "node:assert/strict";
import test from "node:test";

import {
  curateAgainstExisting,
  extractMemories,
  extractTasks,
  formatTranscript,
  naiveSummary,
} from "../../src/extraction/conversation.ts";
import { parseJsonResponse } from "../../src/extraction/json.ts";
import { ReplayLlmProvider } from "../../src/providers/llm.ts";

test("parseJsonResponse mirrors Python raw/fenced/invalid behavior", () => {
  assert.deepEqual(parseJsonResponse('[{"title":"A"}]'), [{ title: "A" }]);
  assert.deepEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true });
  assert.equal(parseJsonResponse(""), null);
  assert.equal(parseJsonResponse("not json"), null);
});

test("formatTranscript uses Python role labels and spacing", () => {
  const transcript = formatTranscript(
    [
      { role: "user", content: "Olá" },
      { role: "assistant", content: "Escuto." },
      { role: "system", content: "hidden-ish" },
    ],
    "Alisson",
  );

  assert.equal(transcript, "**Alisson:** Olá\n\n**Mirror:** Escuto.\n\n**Mirror:** hidden-ish");
});

test("extractMemories validates items, defaults fields, and inherits context", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([
        { title: "Decision", content: "Ship TS", memory_type: "decision", tags: ["cv22"] },
        { title: "Bad" },
        {
          title: "Layered",
          content: "Shadow",
          memory_type: "pattern",
          layer: "shadow",
          journey: "j2",
        },
      ]),
    },
  });

  const memories = await extractMemories(provider, [{ role: "user", content: "x" }], {
    persona: "builder",
    journey: "cv22",
  });

  assert.deepEqual(memories, [
    {
      title: "Decision",
      content: "Ship TS",
      context: null,
      memory_type: "decision",
      layer: "ego",
      tags: ["cv22"],
      journey: "cv22",
      persona: "builder",
    },
    {
      title: "Layered",
      content: "Shadow",
      context: null,
      memory_type: "pattern",
      layer: "shadow",
      tags: [],
      journey: "j2",
      persona: "builder",
    },
  ]);
});

test("extractTasks inherits journey and skips malformed items", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      task_extraction: JSON.stringify([
        { title: "Validate", due_date: "2026-01-02", context: "CI" },
        { due_date: "2026-01-03" },
      ]),
    },
  });

  const tasks = await extractTasks(provider, [{ role: "user", content: "x" }], { journey: "cv22" });

  assert.deepEqual(tasks, [
    { title: "Validate", due_date: "2026-01-02", journey: "cv22", stage: null, context: "CI" },
  ]);
});

test("curateAgainstExisting skips LLM without existing and fails open on malformed response", async () => {
  const candidates = [
    {
      title: "Keep",
      content: "content",
      context: null,
      memory_type: "insight",
      layer: "ego",
      tags: [],
      journey: null,
      persona: null,
    },
  ];
  const noCall = new ReplayLlmProvider({ kind: "llm", responses: {} });
  assert.deepEqual(await curateAgainstExisting(noCall, candidates, []), candidates);
  assert.equal(noCall.calls.length, 0);

  const malformed = new ReplayLlmProvider({ kind: "llm", responses: { curation: "not json" } });
  assert.deepEqual(
    await curateAgainstExisting(malformed, candidates, [
      { title: "Old", content: "old", memory_type: "insight", layer: "ego" },
    ]),
    candidates,
  );
});

test("naiveSummary matches Python chunk and total truncation", () => {
  const summary = naiveSummary([
    { role: "system", content: "ignored" },
    { role: "user", content: "a".repeat(600) },
    { role: "assistant", content: "b".repeat(600) },
  ]);

  assert.equal(summary, `${"a".repeat(500)} ${"b".repeat(500)}`);
});
