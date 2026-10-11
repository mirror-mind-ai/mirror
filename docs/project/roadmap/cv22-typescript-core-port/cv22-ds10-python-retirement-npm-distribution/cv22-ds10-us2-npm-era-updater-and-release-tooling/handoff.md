[< Story](index.md)

# Handoff — CV22.DS10.US2

Written 2026-09-23, at the end of implementation, for the next session and for the
Mirror that loads this journey next.

---

## What is now true

`runtime update`, `runtime backup`, and the new `runtime migrate` answer from TypeScript.
`mm-update` enters the front door in all three skill copies. **`PYTHON_ALLOWLIST` is gone
— the mechanism, not just its entries** — and the guard that enforces its absence is
itself Node, because a check asserting that nothing invokes the interpreter cannot need
that interpreter to run.

The updater identifies how Mirror is installed from where the front door itself lives:
`clone` fast-forwards `origin/<channel>`, `package` installs the version a dist-tag
resolves to, `unknown` refuses with its reason. One pipeline serves both —
*gate → capture → plan → fetch → backup → verify → apply → migrate → validate* — and only
`apply` differs.

The release chain left the product surface: `npm run release:doctor` and
`release:promote`, with the old names answering their cutoff *before dispatch*, so a stray
`--push` reaches nothing.

**The updater has operational coverage for the first time since v0.8.0 introduced it**:
`scripts/smoke_runtime_update.sh`, 34 assertions, in CI on both platforms, with
`python`/`python3`/`uv` shadowed so an interpreter spawn fails the smoke rather than
passing unnoticed.

## What remains intentionally undone

- **Navigator validation of the Python → TS hop.** Blocked, and not by code: the
  production clone (`~/dev/workspace/mirror`) can only fast-forward to a ref its origin
  publishes, and this work is an ancestor of neither `origin/main` nor `origin/stable`.
  The route in the test guide is correct and becomes executable when the branch merges to
  `main` — its own Navigator gate. Until then the evidence is the scratch-clone smoke.
- **The registry half of the package strategy.** `npm view` is proven against a stub and
  `npm pack` against an isolated prefix; a real registry roundtrip needs a published
  package, which is US3's.
- **`frame/` and `installer/`** — re-homed to US3 by D4, recorded in its candidate row and
  as a Zero Python gate row so the zero-Python claim cannot be made while they stand.
- **The 17 extension-skill invocations** — the `automation` repository's, recorded under
  TS2's cutoff by D5.
- **Python's `runtime.py`** — untouched except two strings. TS5 deletes it.

## What the next plateau is

Story lifecycle: **Validate → Debt Review → Done**. Validation is the blocked route above;
the Navigator decides whether to accept the smoke as the evidence for this story and run
the two-hop route after the merge, or to hold the story open until then.

After this story, DS10 is 6/8. **TS5** (Python core deletion) and **US3** (npm
distribution) remain, both separately Navigator-authorized.

## What TS5 and US3 inherit

- **The `retired` route shape now answers two more names**, and TS5 reuses it for every
  remaining Python name once the interpreter is gone.
- **`packageVersion()` is the single version read** by the updater, the doctor, the
  welcome card, and the MCP server. US3 changes one body.
- **`release-promote`'s steps are an ordered array** so US3 appends `npm publish` and
  `npm dist-tag add` without restructuring control flow.
- **`runtime status` still reports `Python:`**, and `detectPythonVersion` still spawns
  `uv` when anything renders that field. The updater passes `pythonVersion: "unknown"` to
  avoid it; TS5 removes the field with the oracle it describes.
- **Five `.py` files remain under `scripts/`**, each now with a named owner — including
  `check_retired_surfaces.py`, which had none until this story found the gate's count was
  wrong.
- **The smoke depends on `uv run python ts/parity/generate_demo_memory_db.py`** for its
  fixture database. TS5 needs a non-Python way to produce it, or the smoke goes with the
  generator.

## The lesson this story paid for

This journey already knew that *the authored gate names one layer and the inventory finds
more*. US2 paid for a different one:

**A reviewed, approved document is not evidence.** Four of the six defects were false
statements inside artifacts that a five-persona panel had reviewed and the Navigator had
approved — a stage order, a refusal that does not exist, a debt that was already paid, and
a comment describing a CI step that does not exist. The panel is good at finding what is
*missing*; it cannot find what is *asserted and wrong*, because reviewing a claim is not
the same as checking it. Only running the code did that.

Its sharpest form: the smoke exists because the plan demanded interpreter shadowing, and
shadowing is what caught the updater spawning `uv`. **The test that embarrasses the plan
is the one worth writing.**
