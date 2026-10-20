[< Parent](../index.md)

# CV21.DS5.US3 — `review-copy` runs on every runtime, measured live

**Status:** 🟡 Planned
**Type:** User Story
**Delivery Story:** CV21.DS5 — User Extensions On Every Runtime

---

## User Story

As a person who installed Mirror Mind with `npm install -g` and keeps extensions in
my Mirror home,
I want to see `review-copy` — the reference extension, with its real body — listed,
invoked in that runtime's own spelling, and doing its work through `mirror consult`
on Claude Code, Codex, Antigravity, and Grok Build, and a `command-skill` extension's
skill reaching `mirror ext` the same way, each session installed from the shipped
package through nothing but the steps US2 prints,
So that the per-home plugin DS5.TS1 chose is proven on the thing it was chosen for,
with version, binary, and date, and the isolated smoke CV21's Done Condition asks for
on Codex, Antigravity, and Grok exists and re-runs.

## Outcome

A committed route in this story package installs `mirror-mind@0.36.0` from the
registry into a scratch prefix, wires each installed runtime through the steps
`mirror init` and `mirror extensions install` print, installs `review-copy` (its real
body) and `hello` (the authoring guide's command-skill) into one scratch Mirror home,
and runs one live session per runtime per extension. The record, per runtime, with
version, binary, and date: the extension listed by the runtime's own reader; the
session invoked it in that runtime's spelling; `review-copy`'s `mirror consult` calls
in the scratch home's ledger and its report written; `hello`'s `mirror ext hello ping`
row in the scratch database; the turns logged under the runtime's `interface`. Where
a runtime's headless mode cannot do a step, the record says so and the Navigator's
TUI session stands in. The real configuration is unchanged by the route.

## Acceptance Behavior

```text
Given mirror-mind@0.36.0 installed from the registry into a scratch prefix,
  a scratch Mirror home with review-copy and hello installed by `mirror extensions
  install`, and each runtime wired by the steps mirror init and the install printed
When one live session per runtime invokes review-copy in that runtime's spelling
  on a fixture copy file with `gemini lite`, and one invokes hello's skill
Then on Claude Code, Codex, Antigravity, and Grok Build the runtime lists both
  skills, the review-copy session's consult calls appear in the scratch ledger and
  its report at the named path, the hello session's ping lands in ext_hello_pings,
  and the conversations table holds the runtime's interface for both sessions —
  or the record names the runtime, the step, and the reason, measured
And the real ~/.claude, ~/.codex, ~/.gemini, ~/.grok, ~/.agents, and both real Mirror
  homes hash as the baseline recorded them
```

## Scope

- `route.sh` in this story package, derived from TS1's: setup from the registry
  tarball, the probe, the wiring, the installs, `live <runtime> <extension>`, the
  verification reads, `clean`, `untouched`.
- `fixtures/hello/`: the authoring guide's extension, as its listings write it.
- `evidence/versions.tsv` and `evidence/table.tsv`, committed; raw outputs not.
- The records: this file, `plan.md`, `test-guide.md`, and the DS5 index row.

## Out Of Scope

- TS4: the docs. This story measures; TS4 writes what it measured.
- The canonical plugin's missing agy finding, carried to DS11 by US2.
- Pi: its catalog path is unchanged and not re-measured.
- A product change. A defect the route finds is a stop condition, not a fix inside
  this story, unless it is one line and the Navigator says so.

## Validation

Navigator-visible validation route plus automated checks: see `plan.md` and
`test-guide.md`.
