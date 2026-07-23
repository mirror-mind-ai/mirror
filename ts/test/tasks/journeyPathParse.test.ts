import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type ParsedTask,
  parseDoneTasks,
  parseJourneyPathTasks,
} from "../../src/tasks/journeyPathParse.ts";

interface GoldenCase {
  name: string;
  journey: string;
  journey_path: string;
  expected_pending: ParsedTask[];
  expected_done: ParsedTask[];
}

interface Golden {
  cases: GoldenCase[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(HERE, "..", "goldens", "task-parse.golden.json");
const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;

test("task-parse golden is well-formed", () => {
  assert.ok(golden.cases.length > 0, "corpus has cases");
});

for (const c of golden.cases) {
  test(`parseJourneyPathTasks reproduces the Python oracle: ${c.name}`, () => {
    assert.deepEqual(parseJourneyPathTasks(c.journey_path, c.journey), c.expected_pending);
  });
  test(`parseDoneTasks reproduces the Python oracle: ${c.name}`, () => {
    assert.deepEqual(parseDoneTasks(c.journey_path, c.journey), c.expected_done);
  });
}

// Hand-written behavior tests, for readability alongside the golden.

test("unchecked checkbox under a stage is extracted as todo", () => {
  const tasks = parseJourneyPathTasks("\n### Etapa 1: Início\n- [ ] Task simples\n", "reflexo");
  assert.deepEqual(tasks, [
    { title: "Task simples", stage: "Início", status: "todo", journey: "reflexo" },
  ]);
});

test("checked checkbox is ignored by the pending parser", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 1: Início\n- [x] Já feito\n- [ ] Pendente\n",
    "reflexo",
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Pendente");
});

test("a completed stage header (✅) skips its pending checkboxes", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 1: Completa ✅\n- [ ] Não deve ser extraída\n\n### Etapa 2: Ativa\n- [ ] Deve ser extraída\n",
    "reflexo",
  );
  assert.deepEqual(
    tasks.map((t) => t.title),
    ["Deve ser extraída"],
  );
});

test("a completed stage header (✅) does NOT skip already-done checkboxes", () => {
  // parse_done_tasks never resets current_stage on a ✅ header — this is a
  // deliberate asymmetry with parse_journey_path_tasks, not a bug to fix.
  const tasks = parseDoneTasks("\n### Etapa 1: Completa ✅\n- [x] Feita\n", "reflexo");
  assert.deepEqual(tasks, [
    { title: "Feita", stage: "Completa", status: "done", journey: "reflexo" },
  ]);
});

test("a bold cycle header with ✅ resets the stage and skips tasks under it", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 1: Sprint\n**Cycle 1 ✅**\n- [ ] Should be skipped\n",
    "reflexo",
  );
  assert.deepEqual(tasks, []);
});

test("a bold cycle header without ✅ is a no-op while a stage is active", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 1: Sprint\n**Cycle 2 in progress:**\n- [ ] Still under Sprint\n",
    "reflexo",
  );
  assert.deepEqual(
    tasks.map((t) => t.title),
    ["Still under Sprint"],
  );
});

test("markdown bold is stripped and a trailing period is removed from the title", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 1: Início\n- [ ] **Título em negrito**\n",
    "reflexo",
  );
  assert.equal(tasks[0].title, "Título em negrito");

  const tasks2 = parseJourneyPathTasks(
    "\n### Etapa 1: Início\n- [ ] Task com ponto final.\n",
    "reflexo",
  );
  assert.equal(tasks2[0].title, "Task com ponto final");
});

test("a checkbox before any stage header is not extracted", () => {
  assert.deepEqual(parseJourneyPathTasks("- [ ] Task sem etapa\n", "reflexo"), []);
});

test("empty input returns an empty list for both parsers", () => {
  assert.deepEqual(parseJourneyPathTasks("", "reflexo"), []);
  assert.deepEqual(parseDoneTasks("", "reflexo"), []);
});

test("the 'Etapa N:' prefix is stripped, leaving only the stage label", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Etapa 2: Desenvolvimento\n- [ ] Implementar feature\n",
    "reflexo",
  );
  assert.equal(tasks[0].stage, "Desenvolvimento");
});

test("a plain (non-Etapa) stage header works the same way", () => {
  const tasks = parseJourneyPathTasks(
    "\n### Plain Stage Name (no Etapa prefix)\n- [ ] Task under plain stage\n",
    "reflexo",
  );
  assert.deepEqual(tasks, [
    {
      title: "Task under plain stage",
      stage: "Plain Stage Name (no Etapa prefix)",
      status: "todo",
      journey: "reflexo",
    },
  ]);
});

test("parseDoneTasks matches '[x]' case-insensitively", () => {
  const lower = parseDoneTasks("\n### Etapa 1\n- [x] a\n", "reflexo");
  const upper = parseDoneTasks("\n### Etapa 1\n- [X] a\n", "reflexo");
  assert.equal(lower.length, 1);
  assert.equal(upper.length, 1);
});

test("both parsers split pending vs done from the same file content", () => {
  const journeyPath = "\n### Etapa 1: Sprint\n- [x] Task concluída\n- [ ] Task pendente\n";
  const pending = parseJourneyPathTasks(journeyPath, "reflexo");
  const done = parseDoneTasks(journeyPath, "reflexo");
  assert.equal(pending.length, 1);
  assert.equal(done.length, 1);
  assert.equal(pending[0].status, "todo");
  assert.equal(done[0].status, "done");
});
