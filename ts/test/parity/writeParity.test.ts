import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCopyTarget,
  evaluateWriteProbe,
  type MutatedRow,
  renderRedactedWriteReport,
  stateHash,
  WriteParityGuardError,
} from "../../src/parity/writeParity.ts";

const pythonRows: MutatedRow[] = [
  { id: "m1", cells: { last_accessed_at: "2026-06-23T12:00:00", use_count: 3 } },
  { id: "m2", cells: { last_accessed_at: "2026-06-23T12:00:00", use_count: 1 } },
];

test("stateHash is independent of row and column ordering", () => {
  const reordered: MutatedRow[] = [
    { id: "m2", cells: { use_count: 1, last_accessed_at: "2026-06-23T12:00:00" } },
    { id: "m1", cells: { use_count: 3, last_accessed_at: "2026-06-23T12:00:00" } },
  ];
  assert.equal(stateHash(pythonRows), stateHash(reordered));
});

test("stateHash distinguishes a changed cell value and a string/number cell", () => {
  const changedValue: MutatedRow[] = [
    { id: "m1", cells: { last_accessed_at: "2026-06-23T12:00:00", use_count: 4 } },
    { id: "m2", cells: { last_accessed_at: "2026-06-23T12:00:00", use_count: 1 } },
  ];
  assert.notEqual(stateHash(pythonRows), stateHash(changedValue));

  const stringCell: MutatedRow[] = [{ id: "m1", cells: { use_count: 3 } }];
  const numberCell: MutatedRow[] = [{ id: "m1", cells: { use_count: "3" } }];
  assert.notEqual(stateHash(stringCell), stateHash(numberCell));
});

test("evaluateWriteProbe reports PASS when Python and TS mutate identically", () => {
  const result = evaluateWriteProbe("log_access", pythonRows, pythonRows);
  assert.equal(result.match, true);
  assert.equal(result.mutatedRowCount, 2);
  assert.equal(result.pythonStateHash, result.tsStateHash);
});

test("evaluateWriteProbe reports FAIL on a one-second last_accessed_at drift", () => {
  const tsRows: MutatedRow[] = [
    { id: "m1", cells: { last_accessed_at: "2026-06-23T12:00:00", use_count: 3 } },
    { id: "m2", cells: { last_accessed_at: "2026-06-23T12:00:01", use_count: 1 } },
  ];
  const result = evaluateWriteProbe("log_access", pythonRows, tsRows);
  assert.equal(result.match, false);
  assert.notEqual(result.pythonStateHash, result.tsStateHash);
});

test("evaluateWriteProbe redacts state by default and reveals it only on demand", () => {
  const redacted = evaluateWriteProbe("log_access", pythonRows, pythonRows);
  assert.equal(redacted.pythonState, undefined);
  assert.equal(redacted.tsState, undefined);

  const sensitive = evaluateWriteProbe("log_access", pythonRows, pythonRows, {
    includeSensitiveDebug: true,
  });
  assert.deepEqual(sensitive.pythonState, pythonRows);
});

test("assertCopyTarget refuses a live memory.db and paths outside tmp/", () => {
  assert.throws(() => assertCopyTarget("/home/x/.mirror/memory.db"), WriteParityGuardError);
  assert.throws(() => assertCopyTarget("/home/x/other.db"), WriteParityGuardError);
});

test("assertCopyTarget allows a copy under tmp/", () => {
  assert.doesNotThrow(() => assertCopyTarget("tmp/parity/python-copy.db"));
  assert.doesNotThrow(() => assertCopyTarget("/repo/tmp/parity/ts-copy.db"));
});

test("renderRedactedWriteReport emits hashes and verdict without raw cell values", () => {
  const report = renderRedactedWriteReport([
    evaluateWriteProbe("log_access", pythonRows, pythonRows),
  ]);
  assert.match(report, /probe: log_access/);
  assert.match(report, /mutated_row_count: 2/);
  assert.match(report, /python_state_hash: [0-9a-f]{64}/);
  assert.match(report, /match: true/);
  assert.match(report, /overall_match: true/);
  assert.doesNotMatch(report, /use_count/);
});
