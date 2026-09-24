# Goldens — frozen since CV22.DS10.TS5

Every `*.golden.json` here was **recorded from the Python core** while it
existed: a generator under `ts/parity/generate_*.py` drove the real Python
code over a synthetic fixture and wrote down what it answered. The TypeScript tests replay the same inputs
and must produce the same bytes. That is how the port proved, surface by
surface, that it answers the way the product always had.

[CV22.DS10.TS5](../../../docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/index.md)
deleted the Python core, and the generators with it. **Nothing can regenerate
these files any more. They are frozen fixtures** — the correct end state of a
strangler: the oracle is gone because it was replaced.

## What frozen means

- A test failing against a golden is a **regression** until proven otherwise.
  Nobody is left to say "the oracle moved".
- A **deliberate** behavior change edits the golden **by hand**, in the same
  commit as the change, with the reason in the commit message and a row in the
  table below. Do not write a generator that replays the TypeScript code into
  the golden: that grades TypeScript against itself, and every test would pass
  forever.
- The generators stay readable at the recovery tag
  [`cv22-last-python-bearing`](https://github.com/mirror-mind-ai/mirror/tree/cv22-last-python-bearing/ts/parity)
  (commit `b0d34254`), which is also where to look for what a field was meant
  to record.

One directory here is different: `render/` holds TypeScript's own render
snapshots (CR016), written by `renderGoldens.test.ts` under
`UPDATE_GOLDENS=1`. They never came from the oracle and are not frozen by
this story; they change the way any snapshot does, reviewed in the diff.

The freeze does hold for the other oracle-recorded fixtures outside this
directory: `ts/test/fixtures/*.golden.json` and the fixture trees their
generators wrote beside them, `mcp-framing.jsonl`, the `builder-roadmap`,
`builder-refinement`, and `builder-command` trees, the migration pre-states
and expected snapshots under `ts/test/fixtures/migrations/`, and
`ts/src/db/schemaInventorySnapshot.ts`.

## Changes since the last oracle regeneration

The last regeneration by the oracle happened at TS5 plateau 2, for three
deliberate changes made on **both** engines at once so that the regenerated
bytes still meant something: `runtime-status` lost its `Python:` line
(`48b7772a`), `metadata-lifecycle` lost two unreachable profiles (`3efd07a1`,
D-023), and the Refinement field stopped reading the roadmap (`7b95becb`,
D-024).

Hand edits after the freeze:

| Golden | Commit | Change | Why |
|---|---|---|---|
| `task-import-sync.golden.json` | `50dc3437` | the missing-file scenario's `error_message` records `<tmpdir>` instead of the oracle's own `mkdtemp` path | The path was random, so the file could not regenerate to its own bytes, and the test never compared the field. With a placeholder it is graded again (TS5 inventory, F4) |

## Why that one went unseen

The CI determinism gate ("regenerate must be a no-op") listed 58 of the 65
generators. Six were never gated, and `task-import-sync` was the one of them
that could not reproduce itself. A gate that enumerates its subjects is only as
complete as the list; one that must discover them cannot silently shrink.
