// CV22.DS7.US8 plateau 3 — the story-lifecycle corpus and its burn-down.
//
// The story's rule is that a golden is generated from Python BEFORE the port
// exists, which means for one commit the corpus knows more than the code. A golden
// nobody reads is not evidence, so this file exists from the moment the corpus
// does, and it does two jobs:
//
// 1. It declares the burn-down. Every lifecycle operation the corpus grades is
//    either ported or pending, and `the pending list cannot go stale` fails as soon
//    as a pending one becomes reachable — so implementing `pull` forces its
//    sequences into the graded loop instead of leaving them unread.
// 2. It grades the corpus itself, which is worth doing before any TypeScript
//    consumes it. The invariants below caught real defects while the generator was
//    being written: an absolute path leaking into a surface (machine-dependent
//    golden), and a path region collapsing rows that were already relative.
//
// Commit 2 ports `pull` and `expand`; commit 3 the rest. Each moves names from
// PENDING_OPS to PORTED_OPS and the assertions here start comparing bytes.

import assert from "node:assert/strict";
import test from "node:test";

import golden from "#goldens/builder-lifecycle.golden.json" with { type: "json" };

interface Surface {
  id: string;
  text: string;
}

interface Step {
  index: number;
  op: string;
  input: Record<string, unknown>;
  cursor: Record<string, unknown> | null;
  metadata: string | null;
  projection_requests: string[];
  files: Record<string, string>;
  surfaces?: Surface[];
  artifacts?: { kind: string; path: string; status: string }[];
  error?: string;
  materialized_paths?: string[];
}

interface Sequence {
  name: string;
  journey: string;
  project_root: string;
  steps: Step[];
}

const sequences = (golden as unknown as { sequences: Sequence[] }).sequences;

/** Harness operations: they seed state, they are not leaves under port. */
const HARNESS_OPS = ["seed_cursor", "seed_receipt", "write_file"] as const;

/** Lifecycle operations TypeScript can execute today. */
const PORTED_OPS: readonly string[] = [];

/**
 * Lifecycle operations the corpus grades and TypeScript cannot execute yet.
 *
 * Plateau 3 empties this: `pull` and `expand` in commit 2, the rest in commit 3.
 */
const PENDING_OPS = [
  "approve",
  "approve_with_preauthorization",
  "cancel_preauthorization",
  "expand",
  "plan",
  "prepare",
  "pull",
] as const;

const lifecycleOps = (step: Step): boolean => !(HARNESS_OPS as readonly string[]).includes(step.op);

/** A sequence is gradable once every lifecycle op it exercises is ported. */
const isGradable = (sequence: Sequence): boolean =>
  sequence.steps.filter(lifecycleOps).every((step) => PORTED_OPS.includes(step.op));

test("every operation in the corpus is declared ported, pending, or harness", () => {
  const ops = new Set(sequences.flatMap((sequence) => sequence.steps.map((step) => step.op)));
  const declared = new Set<string>([...HARNESS_OPS, ...PORTED_OPS, ...PENDING_OPS]);
  const undeclared = [...ops].filter((op) => !declared.has(op)).sort();
  assert.deepEqual(
    undeclared,
    [],
    "the generator grew an operation this test does not know about — declare it",
  );
  assert.equal(
    PORTED_OPS.filter((op) => (PENDING_OPS as readonly string[]).includes(op)).length,
    0,
    "an operation cannot be both ported and pending",
  );
});

test("the pending list cannot go stale", () => {
  // Nothing to invoke yet, so the check is on the declaration: a pending op must
  // still appear in the corpus, and no pending op may already be ported. Commit 2
  // replaces this with an invocation-level assertion, the way commands.test.ts
  // asserts `unsupported argv` for its own pending leaves.
  for (const op of PENDING_OPS) {
    const used = sequences.some((sequence) => sequence.steps.some((step) => step.op === op));
    assert.ok(used, `${op} is declared pending but the corpus never exercises it`);
  }
  assert.equal(
    sequences.filter(isGradable).length,
    0,
    "a sequence became gradable — move its ops to PORTED_OPS and grade it here",
  );
});

test("the corpus covers the lifecycle shapes plateau 3 has to port", () => {
  assert.ok(sequences.length >= 51, `expected the full sequence matrix, got ${sequences.length}`);
  const names = new Set(sequences.map((sequence) => sequence.name));
  for (const required of [
    // The happy path, and the rule that protects a Driver's authored work.
    "story_lifecycle_happy_path",
    "plan_preserves_authored_plan",
    // Expand's candidate-table grammar, both column shapes, and its refusals.
    "expand_reads_four_column_candidate_table",
    "expand_parses_generated_five_column_table",
    "expand_recommends_first_pending_child",
    "expand_blocks_on_non_canonical_candidate_table",
    "expand_blocks_on_duplicate_heading",
    // Resolution by heading code rather than by arithmetic on code and title.
    "expand_resolves_authored_dotted_code_package",
    "expand_resolves_by_heading_not_folder_name",
    // The only US8 surface with a traversal shape.
    "expand_sanitizes_path_bearing_code_cell",
    // Bounded story authority: recorded, consumed once, refused, cancelled.
    "story_authority_recorded_user_story",
    "authority_blocks_incomplete_plan_0",
    "authority_rejects_tampered_fingerprint",
    "navigator_cancels_pending_authority",
  ]) {
    assert.ok(names.has(required), `the corpus lost the ${required} sequence`);
  }
  const refusals = sequences.flatMap((sequence) =>
    sequence.steps.filter((step) => step.error !== undefined),
  );
  assert.ok(refusals.length >= 27, `expected the refusal matrix, got ${refusals.length}`);
});

test("every recorded surface is a complete Ariad transport block", () => {
  // The story's transport invariant is that a surface crosses the boundary
  // verbatim, so a port that drops a marker or trims the trailing newline breaks
  // the contract before anyone reads the body.
  let graded = 0;
  for (const sequence of sequences) {
    for (const step of sequence.steps) {
      for (const surface of step.surfaces ?? []) {
        const marker = surface.id.toUpperCase();
        const lines = surface.text.split("\n");
        assert.equal(
          lines[0],
          `<<<ARIAD:${marker}>>>`,
          `${sequence.name} step ${step.index} ${surface.id}: begin marker`,
        );
        assert.equal(
          lines.at(-2),
          `<<<END:${marker}>>>`,
          `${sequence.name} step ${step.index} ${surface.id}: end marker`,
        );
        assert.ok(
          surface.text.endsWith("\n"),
          `${sequence.name} step ${step.index} ${surface.id}: trailing newline`,
        );
        graded += 1;
      }
    }
  }
  assert.ok(graded >= 105, `expected the full surface matrix, got ${graded}`);
});

test("no recorded path is machine-dependent", () => {
  // The corpus is only portable because every path it records is project-relative
  // or an explicit token. An absolute path here is byte-stable on one machine and
  // wrong on every other — the failure CI caught for the roadmap golden, and the
  // reason `ts/parity/builder_surface_paths.py` exists. Asserted on the committed
  // artifact so a regenerated corpus cannot reintroduce it quietly.
  const absolute = /\/(?:Users|home|private\/var|var\/folders)\//;
  for (const sequence of sequences) {
    assert.ok(
      sequence.project_root.startsWith("tmp/parity/builder-lifecycle/"),
      `${sequence.name}: project root must be the disposable relative one`,
    );
    for (const step of sequence.steps) {
      for (const path of Object.keys(step.files)) {
        assert.ok(!path.startsWith("/"), `${sequence.name}: absolute key in files: ${path}`);
      }
      for (const artifact of step.artifacts ?? []) {
        assert.ok(
          !artifact.path.startsWith("/") && artifact.path !== "<OUTSIDE PROJECT>",
          `${sequence.name}: artifact path is not project-relative: ${artifact.path}`,
        );
      }
      for (const path of step.materialized_paths ?? []) {
        assert.ok(!path.startsWith("/"), `${sequence.name}: absolute materialized path: ${path}`);
      }
      for (const surface of step.surfaces ?? []) {
        assert.ok(
          !absolute.test(surface.text),
          `${sequence.name} step ${step.index} ${surface.id}: absolute path in surface`,
        );
      }
      if (step.error !== undefined) {
        assert.ok(!absolute.test(step.error), `${sequence.name}: absolute path in error`);
      }
    }
  }
});

test("every recorded cursor cell is the serialized shape Python writes", () => {
  // D2 rests on TypeScript writing the bytes Python writes, so the corpus must
  // record parseable metadata wherever a cursor exists, and none where it does not.
  for (const sequence of sequences) {
    for (const step of sequence.steps) {
      assert.equal(
        step.metadata === null,
        step.cursor === null,
        `${sequence.name} step ${step.index}: cursor and metadata must agree on existence`,
      );
      if (step.metadata === null) continue;
      const parsed = JSON.parse(step.metadata) as Record<string, unknown>;
      assert.equal(
        parsed.method,
        step.cursor?.method,
        `${sequence.name} step ${step.index}: metadata method must match the cursor`,
      );
      assert.equal(
        parsed.active_item ?? null,
        step.cursor?.active_item ?? null,
        `${sequence.name} step ${step.index}: metadata active item must match the cursor`,
      );
    }
  }
});

test("steps are recorded in order, so transitions can be graded as sequences", () => {
  for (const sequence of sequences) {
    assert.deepEqual(
      sequence.steps.map((step) => step.index),
      sequence.steps.map((_step, index) => index),
      `${sequence.name}: step indices must be dense and ordered`,
    );
  }
});
