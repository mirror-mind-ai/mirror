[< Parent](../index.md)

# CV21.DS11.TS1 — The parity matrix is written once, with version, binary, and date

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS11 — Contract & Docs Refresh

---

## Technical Story

In order to end five docs disagreeing about which runtimes Mirror supports and how well,
As the engineering team,
I want one parity matrix in the runtime interface contract, every row sourced to the
record that measured it with its version, binary, and date, the other docs pointing to
it, and a test that fails when they drift,
So that a person reads the same five runtimes at the same level wherever they look, and
no level is claimed that no record holds.

## Outcome

- The contract's `## Parity Matrix`: one row per runtime — Pi, Claude Code, Codex,
  Antigravity, Grok Build — with skills, instructions at start, Mirror context before the
  model answers, logging, MCP, the level, and the version, binary, date, and record. The
  binaries were found in the records (DS12's `recorded-versions.tsv`, DS4.US4's and
  DS10.US3's test guides, DS7.US4's bar-walk, CR159). Pi's instructions cell says its
  record (CV22.DS10.US3, 2026-10-06) holds no version.
- The levels stated beside it, CV8's, with the line CV21 measured made explicit: at L4
  the runtime puts Mirror's context before the model through a hook; at L3 the model
  loads it through `/mm-mirror`. **Pi moves from L4 to L3**, the Navigator's decision
  (stop condition 5, option 3): the extension injects nothing, Grok Build's model.
  Nothing about Pi changed. The way back is captured as CR165.
- The contract's "Mirror Mode injection models" table: Codex moves from explicit
  invocation to the hook, as DS4.US4 measured.
- Beside the matrix, at DS11's closure and the Navigator's direction: Gemini CLI retired
  in v0.35.0 (CV21.DS8), Antigravity its successor, so the matrix itself meets CV21's
  Done condition on the retired runtime.
- The architecture: five harnesses in §1 and §6, Grok Build's row, Claude Code's
  installed path named as the plugin, Pi at L3, the levels pointed to the matrix.
- README's "How It Works" and REFERENCE's Commands introduction link the matrix;
  Getting Started carries a table in plain words — what each runtime gives, on which
  version, on which date — and says a newer version is not re-measured.
- `decisions.md`: "The contract's parity matrix is the single authority for runtime
  parity", with CV21's measured parity beside the 2026-10-13 bet and the L3/L4 line.
- `ts/test/scripts/runtimeParityDocs.test.ts`, in `npm test`: every one of the five docs
  names the five runtimes; the matrix holds one row per runtime with its level and
  provenance; the architecture's levels equal the matrix's; README, Getting Started, and
  REFERENCE link the matrix. Written first: it failed four ways on the tree before TS1.

## Acceptance Behavior

```text
Given the contract, README, Getting Started, REFERENCE, and the architecture
When a person reads any of them for which runtimes Mirror supports and how well
Then each names the same five runtimes, and the matrix and the architecture give each
     the same level
And every matrix row carries the version, binary, date, and record it was measured in
And npm test fails if a doc drops a runtime or the two levels diverge
```

## Scope

- The matrix, the levels, the injection-models row, the architecture, the three links,
  Getting Started's table, the decision, the guard.

## Out Of Scope

- Re-measuring any runtime; the matrix is sourced, not re-run.
- Changing Pi: CR165 holds that.

## Validation

`npm test` (the guard among it) and the docs link check; the Navigator reads the five
docs side by side (DS11 test guide, step 1).
