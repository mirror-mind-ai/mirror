import assert from "node:assert/strict";
import { test } from "node:test";
import type { EvalRunRecord } from "#evals/harness/persistence.ts";
import {
  discoverEvalNames,
  type EvalModule,
  main,
  type RunnerIo,
  runAll,
  runEval,
} from "#evals/harness/runner.ts";
import type { EvalProbe, EvalReport } from "#evals/harness/types.ts";

function probe(id: string, passed: boolean, blocking = false, notes = ""): EvalProbe {
  return {
    id,
    description: id,
    blocking,
    run: async () => ({ passed, notes: notes || (passed ? "ok" : "nope") }),
  };
}

interface Harness {
  io: RunnerIo;
  records: EvalRunRecord[];
  lines: string[];
}

function harness(modules: Record<string, EvalModule>, overrides: Partial<RunnerIo> = {}): Harness {
  const records: EvalRunRecord[] = [];
  const lines: string[] = [];
  const io: RunnerIo = {
    loadModule: async (name) => {
      const module = modules[name];
      if (!module) throw new Error(`no module ${name}`);
      return module;
    },
    listModuleNames: async () => Object.keys(modules),
    appendRun: (record) => {
      records.push(record);
    },
    now: () => new Date("2026-09-22T10:00:00Z"),
    newSuiteRunId: () => "suite-fixed",
    write: (line) => {
      lines.push(line);
    },
    ...overrides,
  };
  return { io, records, lines };
}

// --- runEval ---------------------------------------------------------------

test("runEval returns a report named for the eval, one result per probe, in order", async () => {
  const { io } = harness({ sample: { PROBES: [probe("a", true), probe("b", false)] } });
  const report = await runEval("sample", { io });
  assert.equal(report.evalName, "sample");
  assert.deepEqual(
    report.results.map((r) => r.probeId),
    ["a", "b"],
  );
  assert.deepEqual(
    report.results.map((r) => r.passed),
    [true, false],
  );
});

test("runEval uses the module's THRESHOLD and defaults to 0.8 when absent", async () => {
  const { io } = harness({
    strict: { PROBES: [probe("a", true)], THRESHOLD: 1 },
    lenient: { PROBES: [probe("a", true)] },
  });
  assert.equal((await runEval("strict", { io })).threshold, 1);
  assert.equal((await runEval("lenient", { io })).threshold, 0.8);
});

test("runEval records a raising probe as a failure instead of aborting the eval", async () => {
  const exploding: EvalProbe = {
    id: "boom",
    description: "raises",
    run: async () => {
      throw new Error("provider exploded");
    },
  };
  const { io } = harness({ sample: { PROBES: [exploding, probe("after", true)] } });
  const report = await runEval("sample", { io });
  assert.equal(report.results[0]?.passed, false);
  assert.match(report.results[0]?.notes ?? "", /probe raised: .*provider exploded/);
  assert.equal(report.results[1]?.passed, true, "the eval continued past the raise");
});

test("runEval runs each probe exactly once", async () => {
  let calls = 0;
  const counted: EvalProbe = {
    id: "counted",
    description: "counts",
    run: async () => {
      calls += 1;
      return { passed: true, notes: "" };
    },
  };
  const { io } = harness({ sample: { PROBES: [counted] } });
  await runEval("sample", { io });
  assert.equal(calls, 1);
});

test("runEval rejects an unknown eval name", async () => {
  const { io } = harness({});
  await assert.rejects(() => runEval("nope", { io }), /Unknown eval 'nope'/);
});

// Found while porting the first real module: every load failure was being
// reported as "Unknown eval", so a parameter-property syntax error in a probe
// module sent the reader hunting for a typo in the module NAME. A broken
// module must report its own breakage.
test("runEval surfaces a real load failure instead of calling the module unknown", async () => {
  const io = harness({}).io;
  io.loadModule = async () => {
    throw new Error("TypeScript parameter property is not supported in strip-only mode");
  };
  await assert.rejects(
    () => runEval("retrieval_relevance", { io }),
    /parameter property is not supported/,
    "the module's own error reaches the caller",
  );
});

test("runEval still reports a genuinely missing module as unknown", async () => {
  const io = harness({}).io;
  io.loadModule = async () => {
    const error = new Error("Cannot find module") as Error & { code: string };
    error.code = "ERR_MODULE_NOT_FOUND";
    throw error;
  };
  await assert.rejects(() => runEval("no-such-module-anywhere", { io }), /Unknown eval/);
});

test("runEval rejects a module that exposes no PROBES", async () => {
  const io = harness({}).io;
  io.loadModule = async () => ({}) as EvalModule;
  await assert.rejects(() => runEval("hollow", { io }), /must expose a PROBES list/);
});

// --- persistence seam ------------------------------------------------------

test("runEval persists exactly one record matching the report", async () => {
  const { io, records } = harness({
    sample: {
      PROBES: [probe("a", true), probe("b", false)],
      THRESHOLD: 0.8,
      EVAL_MODEL: "openai/gpt-5-mini",
      EVAL_PROMPTS: ["PROMPT ONE"],
    },
  });
  const report = await runEval("sample", { io });
  assert.equal(records.length, 1);
  const record = records[0] as EvalRunRecord;
  assert.equal(record.eval_name, "sample");
  assert.equal(record.score, 0.5);
  assert.equal(record.threshold, 0.8);
  assert.equal(record.passed, false);
  assert.equal(record.model, "openai/gpt-5-mini");
  assert.equal(record.schema_version, 3);
  assert.deepEqual(
    record.probes.map((p) => p.id),
    report.results.map((r) => r.probeId),
  );
});

test("a prompt-free module records null model and null prompt_hash", async () => {
  const { io, records } = harness({ deterministic: { PROBES: [probe("a", true)] } });
  await runEval("deterministic", { io });
  assert.equal(records[0]?.model, null);
  assert.equal(records[0]?.prompt_hash, null);
});

test("prompt_hash is stable for the same prompts and changes when a prompt changes", async () => {
  const { io: ioA, records: a } = harness({
    m: { PROBES: [probe("p", true)], EVAL_PROMPTS: ["ONE", "TWO"] },
  });
  await runEval("m", { io: ioA });
  await runEval("m", { io: ioA });
  assert.equal(a[0]?.prompt_hash, a[1]?.prompt_hash);

  const { io: ioB, records: b } = harness({
    m: { PROBES: [probe("p", true)], EVAL_PROMPTS: ["ONE", "TWO CHANGED"] },
  });
  await runEval("m", { io: ioB });
  assert.notEqual(a[0]?.prompt_hash, b[0]?.prompt_hash);
});

test("a persistence failure changes neither the report nor the exit code", async () => {
  const { io } = harness({ sample: { PROBES: [probe("a", true)] } });
  io.appendRun = () => {
    throw new Error("disk is gone");
  };
  const report = await runEval("sample", { io });
  assert.equal(report.results[0]?.passed, true);
  assert.equal(await main(["sample"], { io }), 0);
});

test("the persisted probe entry carries the blocking flag", async () => {
  const { io, records } = harness({
    fenced: { PROBES: [probe("quality", true), probe("injection-resisted", false, true)] },
  });
  await runEval("fenced", { io });
  assert.deepEqual(records[0]?.probes, [
    { id: "quality", passed: true, notes: "ok", blocking: false },
    { id: "injection-resisted", passed: false, notes: "nope", blocking: true },
  ]);
  assert.equal(records[0]?.passed, false, "blocked run persists as failed");
});

// --- discovery -------------------------------------------------------------

test("discovery keeps every module exposing PROBES, sorted, and excludes the rest", async () => {
  const { io } = harness({
    zeta: { PROBES: [probe("a", true)] },
    alpha: { PROBES: [probe("a", true)] },
    helper: {} as EvalModule,
  });
  assert.deepEqual(await discoverEvalNames({ io }), ["alpha", "zeta"]);
});

test("discovery reads the real evals directory and never scans harness infrastructure", async () => {
  const names = await discoverEvalNames();
  assert.equal(
    names.some((n) => n.startsWith("harness")),
    false,
    "infrastructure is not a probe module",
  );
  for (const infra of ["types", "runner", "persistence", "support", "cli"]) {
    assert.equal(names.includes(infra), false, `${infra} is not discovered`);
  }
  assert.ok(names.includes("retrieval_relevance"), "the real module is discovered by capability");
});

// --- runAll ----------------------------------------------------------------

test("runAll threads one suite_run_id through every eval and returns reports in order", async () => {
  const { io, records } = harness({
    a: { PROBES: [probe("p", true)] },
    b: { PROBES: [probe("p", true)] },
  });
  const reports = await runAll(["a", "b"], { io });
  assert.deepEqual(
    reports.map((r) => r.evalName),
    ["a", "b"],
  );
  const ids = new Set(records.map((r) => r.suite_run_id));
  assert.deepEqual([...ids], ["suite-fixed"]);
});

test("a standalone run leaves suite_run_id null", async () => {
  const { io, records } = harness({ a: { PROBES: [probe("p", true)] } });
  await runEval("a", { io });
  assert.equal(records[0]?.suite_run_id, null);
});

test("a failing eval never aborts the rest of the suite", async () => {
  const { io } = harness({
    a: { PROBES: [probe("p", false)], THRESHOLD: 1 },
    b: { PROBES: [probe("p", true)] },
  });
  const reports = await runAll(["a", "b"], { io });
  assert.equal(reports.length, 2, "both ran");
});

test("runAll streams each report as it completes", async () => {
  const { io } = harness({
    a: { PROBES: [probe("p", true)] },
    b: { PROBES: [probe("p", true)] },
  });
  const streamed: string[] = [];
  await runAll(["a", "b"], { io, onReport: (r: EvalReport) => streamed.push(r.evalName) });
  assert.deepEqual(streamed, ["a", "b"]);
});

// --- main / exit codes -----------------------------------------------------

test("main exits 0 when the named eval passes and 1 when it does not", async () => {
  const { io } = harness({
    good: { PROBES: [probe("p", true)] },
    bad: { PROBES: [probe("p", false)] },
  });
  assert.equal(await main(["good"], { io }), 0);
  assert.equal(await main(["bad"], { io }), 1);
});

test("main exits 1 for an unknown eval name without raising", async () => {
  const { io } = harness({});
  assert.equal(await main(["nope"], { io }), 1);
});

test("main with no arguments prints usage and exits 1", async () => {
  const { io, lines } = harness({});
  assert.equal(await main([], { io }), 1);
  assert.match(lines.join("\n"), /Usage:/);
});

test("--all runs every discovered eval and exits 1 when any module fails", async () => {
  const { io, lines } = harness({
    a: { PROBES: [probe("p", true)] },
    b: { PROBES: [probe("p", false)] },
  });
  assert.equal(await main(["--all"], { io }), 1);
  const output = lines.join("\n");
  assert.match(output, /1\/2 evals passed/);
  assert.match(output, /failing: b/, "the summary names the failing eval");
});

test("--all exits 0 when every module passes", async () => {
  const { io } = harness({ a: { PROBES: [probe("p", true)] } });
  assert.equal(await main(["--all"], { io }), 0);
});

test("--all takes precedence over --history", async () => {
  const { io, lines } = harness({ a: { PROBES: [probe("p", true)] } });
  await main(["a", "--history", "--all"], { io });
  assert.match(lines.join("\n"), /eval --all/);
});

// D-017 end to end: the verdict a human reads must name the blocking probe.
test("--all fails the suite on a blocked module whose score clears threshold", async () => {
  const { io, lines } = harness({
    fenced: {
      PROBES: [
        probe("q1", true),
        probe("q2", true),
        probe("q3", true),
        probe("q4", true),
        probe("q5", true),
        probe("injection-resisted", false, true),
      ],
      THRESHOLD: 0.8,
    },
  });
  assert.equal(await main(["--all"], { io }), 1);
  const output = lines.join("\n");
  assert.match(output, /blocked by injection-resisted/);
  assert.match(output, /0\/1 evals passed/);
});

// --- history rendering -----------------------------------------------------

test("--history prints a clear message when nothing is persisted yet", async () => {
  const { io, lines } = harness({ a: { PROBES: [probe("p", true)] } });
  io.readHistory = () => [];
  await main(["a", "--history"], { io });
  assert.match(lines.join("\n"), /no persisted history for 'a'/);
});

test("--history renders each record and flags a probe that regressed", async () => {
  const { io, lines } = harness({ a: { PROBES: [probe("p", true)] } });
  io.readHistory = () => [
    {
      eval_name: "a",
      started_at: "2026-09-22T10:00:00+00:00",
      ended_at: "2026-09-22T10:00:01+00:00",
      model: "m",
      prompt_hash: "h",
      score: 0.5,
      threshold: 0.8,
      passed: false,
      probes: [{ id: "p", passed: false, notes: "", blocking: false }],
      schema_version: 3,
      suite_run_id: null,
    },
    {
      eval_name: "a",
      started_at: "2026-09-21T10:00:00+00:00",
      ended_at: "2026-09-21T10:00:01+00:00",
      model: "m",
      prompt_hash: "h",
      score: 1,
      threshold: 0.8,
      passed: true,
      probes: [{ id: "p", passed: true, notes: "", blocking: false }],
      schema_version: 2,
      suite_run_id: null,
    },
  ];
  await main(["a", "--history"], { io });
  const output = lines.join("\n");
  assert.match(output, /2026-09-22T10:00:00/);
  assert.match(output, /2026-09-21T10:00:00/);
  assert.match(output, /probe 'p' regressed/);
});

test("--history marks a blocked run distinctly from a low-score failure", async () => {
  const { io, lines } = harness({ a: { PROBES: [probe("p", true)] } });
  io.readHistory = () => [
    {
      eval_name: "a",
      started_at: "2026-09-22T10:00:00+00:00",
      ended_at: "2026-09-22T10:00:01+00:00",
      model: "m",
      prompt_hash: "h",
      score: 0.9,
      threshold: 0.8,
      passed: false,
      probes: [
        { id: "q", passed: true, notes: "", blocking: false },
        { id: "inj", passed: false, notes: "", blocking: true },
      ],
      schema_version: 3,
      suite_run_id: null,
    },
  ];
  await main(["a", "--history"], { io });
  assert.match(lines.join("\n"), /blocked by inj/);
});

test("--history accepts an explicit limit", async () => {
  const { io } = harness({ a: { PROBES: [probe("p", true)] } });
  let seenLimit = -1;
  io.readHistory = (_name, limit) => {
    seenLimit = limit;
    return [];
  };
  await main(["a", "--history", "3"], { io });
  assert.equal(seenLimit, 3);
});
