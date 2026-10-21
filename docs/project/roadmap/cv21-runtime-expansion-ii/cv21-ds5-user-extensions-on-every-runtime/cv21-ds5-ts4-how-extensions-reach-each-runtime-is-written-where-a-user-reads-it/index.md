[< Parent](../index.md)

# CV21.DS5.TS4 — How extensions reach each runtime is written where a user reads it

**Status:** 🟢 In Progress — planned, reviewed through five lenses, approved 2026-10-21
**Type:** Technical Story
**Delivery Story:** CV21.DS5 — User Extensions On Every Runtime

---

## Technical Story

In order to close DS5 with what it measured written where a person looks for it,
As the engineering team,
I want the runtime interface contract, the extension docs, `review-copy`'s own
`SKILL.md`, Getting Started, and REFERENCE to say how an installed extension reaches
Pi, Claude Code, Codex, Antigravity, and Grok Build, what a user runs once per runtime
and again after a change, and what they type to invoke it on each. Every line comes
from TS1's decision, US3's live evidence with its version, binary, and date, or the
report `mirror extensions install` prints,
So that a person who installs an extension finds the step and the spelling for their
runtime in the docs instead of in a story package, and the docs claim nothing DS5 did
not measure.

## Outcome

The contract holds the one table: per runtime, what reads the extension (Pi's catalog;
the per-home plugin `mirror-ext-<user>` on the other four), the wiring step `mirror
extensions install` prints, the reinstall a copying runtime needs after a change, and
the invocation as US3 measured it on 2026-10-20: `/ext-review-copy` on Claude Code
(claude 2.1.304) and Grok Build (grok 1.0.62); `$mirror-ext-<user>:ext-review-copy` on
Codex (codex 0.163.0); `/mirror-ext-<user>:ext-review-copy` on Antigravity (agy
1.4.3); and on Pi, its unchanged catalog path. The extension docs, `review-copy`'s
header, Getting Started, and REFERENCE each carry their part of it and link the table.
Wherever invocations are listed, one line says what to run when a skill is not listed.

Lines that said otherwise are corrected to what the code does and what was measured:
`ext:review-copy` as a typed Claude Code command, `expose-claude` as the Claude Code
path, the contract's Claude Code wiring line without the `mkdir -p` the install prints,
and "codex etc. optional" as if a third `runtimes:` block reached a runtime. CV21's
superseded extension assessment points at the decision. The two debts deferred here are
paid: US3's `static` diffs the authoring guide's six listings against
`fixtures/hello/`, and TS1's Claude Code login facts stand in the contract.

## Acceptance Behavior

```text
Given mirror-mind at this commit, with TS1's decision, US3's evidence, and the report
  `extensions install` prints as the only sources
When a person reads the contract's external-skill section, docs/product/extensions,
  examples/extensions/review-copy/SKILL.md, Getting Started, or REFERENCE for how an
  installed extension reaches their runtime
Then the contract names, for Pi, Claude Code, Codex, Antigravity, and Grok Build, what
  reads the extension, the step run once, the step after a change, and the exact
  invocation, and every other surface carries its part of it, agreeing with it
And every wiring step on every surface is the one extensions install prints, and every
  version, binary, and date is one US3 or TS1 recorded
And bash route.sh static in US3's package fails when a listing in the authoring guide
  and its file under fixtures/hello/ differ, and passes at this commit
And no product code, test, or manifest changes, and npm test, checkDocLinks, and the
  retired-surface sweep stay green
```

## Scope

- `docs/product/specs/runtime-interface/index.md`: the one table, with US3's versions;
  the two `runtimes:` keys that are read; the Claude Code wiring line as printed; the
  Claude Code section's plugin link and `expose-claude` as project-local; TS1's login
  facts.
- `docs/product/extensions/index.md`, `authoring-guide.md` (steps 7 and 8, prose
  only — the six listings do not change), `api-reference.md` (the `runtimes:` keys and
  what each reaches).
- `examples/extensions/review-copy/SKILL.md`: the header cut to location, command,
  names, and files; *Syntax* and *Examples*.
- `docs/getting-started.md` step 10 (and one sentence in step 8); `REFERENCE.md` rows;
  `README.md` one bullet.
- `docs/project/roadmap/cv21-runtime-expansion-ii/index.md`: the superseded assessment
  points at TS1's decision and DS5.
- US3's `route.sh static`: the listing-drift guard.
- The records: this file, `plan.md`, `test-guide.md`, the DS5 index row, and at Done
  the DS5 and CV21 status and the worklog.

## Out Of Scope

- The parity matrix across every doc with every runtime's version, binary, and date
  side by side: DS11. A second copy of the table outside the contract.
- Any product change: `mirror extensions install`, the plugin generator, the manifest
  validator, `runtime diagnose`, Pi's catalog path, and `expose-claude` stay as they are.
- Re-measuring anything. Pi is written from its unchanged catalog path, not re-run.
- The `ext:` naming convention for the `claude` block, documented as what it is, not
  changed; the project-wide spelling of Pi's skills.
- CR158 (a catalog whose skill files are gone yields `0 skills`, silently) and the
  other open CRs.

## Validation

Navigator-visible validation route plus automated checks: see `plan.md` and
`test-guide.md`.
