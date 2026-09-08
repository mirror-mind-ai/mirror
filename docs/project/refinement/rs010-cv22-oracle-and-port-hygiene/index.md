[< Refinement Workbench](../index.md)

# RS010 — CV22 Oracle And Port Hygiene

## Framing

Porting the Python core one command at a time keeps finding things that are
not the port's to fix: a TypeScript fidelity gap under an already-validated
golden, a Python product defect the oracle has always had, a test that
behaves differently on a developer machine than in CI. A parity story is the
wrong place for any of them — the moving-target rule says the authority
changes first and the port follows, and a story graded by byte-equality
cannot change either side silently without breaking its own evidence.

Until now these findings lived as debt observations in story plans, which is
where they get forgotten. This story is their durable home.

## Outcome

Each finding surfaced by CV22 that is neither in-scope parity work nor a
DS8 live-cutover input has a Change Request that fixes one core first and
reconciles the other, with the golden or test that pins it, so the port's
evidence stays honest as both cores move.

## Boundaries

- Never fixed inside a parity story; each CR is its own bounded change with
  the moving-target rule applied (authority first, port second, oracle
  baseline advanced in the same commit).
- Not for DS8 inputs (spend bounds, pricing, re-close cost): those are
  planning inputs for the live cutover, recorded in US10's Debt Review.
- Not for routing correctness: that is RS009.

## Change Requests

- [CR056 — Measure title length by code point in titleNeedsImprovement](cr056-measure-title-length-by-code-point.md)
- [CR057 — Stop paying for the discarded summary in the close tail](cr057-stop-paying-for-the-discarded-summary-in-the-close-tail.md)
- [CR058 — Wait for completion, not a wall-clock budget, in the runtime-diagnose web test](cr058-wait-for-completion-in-the-runtime-diagnose-web-test.md)
- [CR060 — Fail loudly when a silent backup fails](cr060-fail-loudly-when-a-silent-backup-fails.md)
- [CR061 — Snapshot the live database consistently before zipping](cr061-snapshot-the-live-database-consistently-before-zipping.md)
- [CR062 — Write backup archives owner-only](cr062-write-backup-archives-owner-only.md)
- [CR063 — Keep journey slugs consistent across tables in repair-encoding](cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md)
- [CR065 — Make parity fixture generators hermetic by construction](cr065-make-parity-fixture-generators-hermetic-by-construction.md)
- [CR066 — Skip a naive timestamp instead of crashing the diagnosis](cr066-skip-a-naive-timestamp-instead-of-crashing-the-diagnosis.md)
- [CR069 — Fail cleanly when `soul apply` is given an unknown id](cr069-fail-cleanly-when-soul-apply-is-given-an-unknown-id.md)
- [CR070 — Render or remove the inert `--listening-for` argument](cr070-render-or-remove-the-inert-listening-for-argument.md)
- [CR071 — Collapse the triplicated skill command references](cr071-collapse-the-triplicated-skill-command-references.md)
