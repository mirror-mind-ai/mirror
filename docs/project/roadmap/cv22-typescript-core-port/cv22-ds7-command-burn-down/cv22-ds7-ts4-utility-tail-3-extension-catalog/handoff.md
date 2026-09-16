[< Story](index.md)

# Handoff — CV22.DS7.TS4 — Ops/utility tail 3: extension catalog

**Status:** plateau 1 of 8 complete. The **catalog reads** answer from
TypeScript — `extensions list|validate` (with the runtime filter and every
usage refusal), `ext list`, `list extensions`, `inspect extension`, and
`inspect runtime-catalog` — graded against 32 recorded Python invocations.
**Nothing is routed:** `routing.ts` still sends the whole family to Python,
which is the intended state until plateau 7 adds the routes and plateau 8
flips the gates.

## Resume here

**Next: plateau 2, the ledger reads** — `inspect llm-calls` (rows and
`--summary`, with its week bucketing and `_fmt_summary_cost`) and `inspect
embedding-provenance`, from `test_inspect_llm_calls.py` and
`test_inspect_embedding_provenance.py`, golden over the demo database. They
are the last catalog-adjacent reads before the plateau-3 writes.

What landed in plateau 1:

- `ts/src/extensions/catalog.ts` — discovery, the runtime filter, the runtime
  catalog loader, and the four renderers;
- `ts/src/extensions/catalogCommands.ts` — the hand-rolled argument parsing and
  the exact print/refuse/exit order of `cmd_extensions`, `ext list`,
  `cmd_list`'s extension branch, and `cmd_inspect`'s catalog targets;
- `ts/src/extensions/manifest.ts` — **widened** from TS3's `{id, kind}` to the
  fields the renderers print, exactly where TS3 said TS4 would extend it;
- `ts/parity/generate_extension_catalog_golden.py` and its fixture tree, in the
  CI determinism gate with their own `git diff` check.

## Rules this plateau paid for — do not rediscover them

- **This family does not use argparse.** Every refusal prints usage to
  **stdout** and exits **1**, and `stderr` is empty. A port that sends usage to
  stderr, or exits 2, is wrong for all of `extensions`, `ext`, `list`, and
  `inspect` — even though `inspect llm-calls` (plateau 2) IS argparse and does
  exit 2. Both classes live in one command.
- **An invalid extension masks a usage error.** `validate` and `sync` print the
  INVALID block and exit 1 in a shared prelude, before `sync` can report a
  missing `--runtime`. Fix the fixture's broken manifest and you change what a
  different case prints.
- **The two INVALID blocks are not the same block.** The one inside
  `print_extension_list` has a leading blank line; the prelude's does not.
- **A missing or corrupt runtime catalog is not an error.** `_load_catalog`
  returns an empty catalog for both, so `inspect runtime-catalog` prints
  `(none)` and exits 0. `load_runtime_catalog` — the strict one that raises —
  is a different function with different callers.
- **Entrypoint order is output.** Python mutates the parsed `entrypoint` dict
  by appending `module_path`, and `inspect extension` prints the mapping in
  insertion order. The TS manifest carries an ordered pair list for that
  reason, not an object.
- **Verify a mutant actually mutated.** A survivor in this plateau was a
  no-op replacement caused by shell escaping. An unverified SURVIVED verdict
  is worse than no mutation testing.
