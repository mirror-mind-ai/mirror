import assert from "node:assert/strict";
import test from "node:test";

import {
  curateAgainstExisting,
  extractMemories,
  extractMemoriesWithStatus,
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

test("extractMemories fences the transcript as data in the request (AI-16)", async () => {
  const provider = new ReplayLlmProvider({ kind: "llm", responses: { extraction: "[]" } });
  await extractMemories(provider, [{ role: "user", content: "hi" }]);
  assert.equal(provider.calls.length, 1);
  assert.match(provider.calls[0].prompt, /^<transcript>\n/);
  assert.match(provider.calls[0].prompt, /\n<\/transcript>$/);
});

test("extractMemories drops an item with an invalid layer (CR041 / AI-15)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([
        { title: "ok", content: "c", memory_type: "insight", layer: "ego", tags: [] },
        { title: "bad", content: "c", memory_type: "insight", layer: "banana", tags: [] },
      ]),
    },
  });
  const memories = await extractMemories(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(
    memories.map((m) => m.title),
    ["ok"],
  );
});

test("extractMemories caps at 8 memories per conversation (CR041 / AI-15)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify(
        Array.from({ length: 20 }, (_, i) => ({
          title: `m${i}`,
          content: "c",
          memory_type: "insight",
          layer: "ego",
          tags: [],
        })),
      ),
    },
  });
  const memories = await extractMemories(provider, [{ role: "user", content: "x" }]);
  assert.equal(memories.length, 8);
});

test("extractTasks fences the transcript as data in the request (AI-16)", async () => {
  const provider = new ReplayLlmProvider({ kind: "llm", responses: { task_extraction: "[]" } });
  await extractTasks(provider, [{ role: "user", content: "hi" }]);
  assert.match(provider.calls[0].prompt, /^<transcript>\n/);
  assert.match(provider.calls[0].prompt, /\n<\/transcript>$/);
});

test("extractTasks caps at 5 tasks per conversation (CR041 / AI-15)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      task_extraction: JSON.stringify(
        Array.from({ length: 12 }, (_, i) => ({ title: `task ${i}` })),
      ),
    },
  });
  const tasks = await extractTasks(provider, [{ role: "user", content: "x" }]);
  assert.equal(tasks.length, 5);
});

test("curateAgainstExisting drops a curated item with an invalid layer (CR041 / AI-15)", async () => {
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
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      curation: JSON.stringify([
        { title: "ok", content: "c", memory_type: "insight", layer: "ego" },
        { title: "bad", content: "c", memory_type: "insight", layer: "banana" },
      ]),
    },
  });
  const curated = await curateAgainstExisting(provider, candidates, [
    { title: "Old", content: "old", memory_type: "insight", layer: "ego" },
  ]);
  assert.deepEqual(
    curated.map((m) => m.title),
    ["ok"],
  );
});

test("extractMemoriesWithStatus reports parse_failed for a non-array response (AI-10)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: { extraction: '{"not":"a list"}' },
  });
  const outcome = await extractMemoriesWithStatus(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(outcome.memories, []);
  assert.deepEqual(outcome.status, { status: "parse_failed" });
});

test("extractMemoriesWithStatus reports no_signal with an all-zero dropped map for an empty response (AI-10)", async () => {
  const provider = new ReplayLlmProvider({ kind: "llm", responses: { extraction: "[]" } });
  const outcome = await extractMemoriesWithStatus(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(outcome.memories, []);
  assert.deepEqual(outcome.status, {
    status: "no_signal",
    dropped: { invalidLayer: 0, invalidType: 0, overCap: 0 },
  });
});

test("extractMemoriesWithStatus reports ok with an all-zero dropped map when nothing is dropped (AI-10)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([{ title: "ok", content: "c", memory_type: "insight" }]),
    },
  });
  const outcome = await extractMemoriesWithStatus(provider, [{ role: "user", content: "x" }]);
  assert.equal(outcome.memories.length, 1);
  assert.deepEqual(outcome.status, {
    status: "ok",
    dropped: { invalidLayer: 0, invalidType: 0, overCap: 0 },
  });
});

test("extractMemoriesWithStatus reports ok and counts a real drop when one item survives (AI-10)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([
        { title: "ok", content: "c", memory_type: "insight", layer: "ego" },
        { title: "bad", content: "c", memory_type: "insight", layer: "banana" },
      ]),
    },
  });
  const outcome = await extractMemoriesWithStatus(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(
    outcome.memories.map((m) => m.title),
    ["ok"],
  );
  assert.deepEqual(outcome.status, {
    status: "ok",
    dropped: { invalidLayer: 1, invalidType: 0, overCap: 0 },
  });
});

test("extractMemoriesWithStatus reports no_signal and counts drops when every item is dropped (AI-10)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: {
      extraction: JSON.stringify([
        { title: "bad", content: "c", memory_type: "insight", layer: "banana" },
      ]),
    },
  });
  const outcome = await extractMemoriesWithStatus(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(outcome.memories, []);
  assert.deepEqual(outcome.status, {
    status: "no_signal",
    dropped: { invalidLayer: 1, invalidType: 0, overCap: 0 },
  });
});

test("extractMemoriesWithStatus reports no_signal with no dropped key for zero messages (AI-10, documented divergence)", async () => {
  const provider = new ReplayLlmProvider({ kind: "llm", responses: {} });
  const outcome = await extractMemoriesWithStatus(provider, []);
  assert.deepEqual(outcome.memories, []);
  assert.deepEqual(outcome.status, { status: "no_signal" });
  assert.equal(provider.calls.length, 0);
});

test("extractMemories (legacy) still returns only the memories array, unaffected by status (AI-10)", async () => {
  const provider = new ReplayLlmProvider({
    kind: "llm",
    responses: { extraction: '{"not":"a list"}' },
  });
  const memories = await extractMemories(provider, [{ role: "user", content: "x" }]);
  assert.deepEqual(memories, []);
});

test("naiveSummary matches Python chunk and total truncation", () => {
  const summary = naiveSummary([
    { role: "system", content: "ignored" },
    { role: "user", content: "a".repeat(600) },
    { role: "assistant", content: "b".repeat(600) },
  ]);

  assert.equal(summary, `${"a".repeat(500)} ${"b".repeat(500)}`);
});
