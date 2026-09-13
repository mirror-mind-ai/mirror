[< Story](index.md)

# Test Guide — CV22.DS7.US8 — Builder/Ariad tree

## Automated Validation

Five golden corpora, generated from Python and regenerated as a no-op in the
determinism gate under 3.10 and 3.12 (`TZ=UTC`, offline, demo database only):

| Corpus | Grades | Generator |
|---|---|---|
| Surface | every wrapped and unwrapped `build` render × absent optionals × over-long tokens × CJK / combining marks / NBSP / ideographic space × the `body`-vs-`body + "\n"` call-site split | `ts/parity/generate_builder_surface_golden.py` |
| Cursor transitions | ordered sequences of the full `runtime_sessions` row (all columns, `updated_at` injected) for the story lifecycle, the DS lifecycle, every D3 refusal, each receipt-invalidation reason, receipt drop rules, CAS conflict | `ts/parity/generate_builder_cursor_golden.py` |
| Roadmap parsing | snapshot, candidates, position, story-directory resolution, duplicate headings, both grammars, `legacy/` exclusion, candidate tables (4-col, 5-col, malformed), `/`-chained titles, status glyphs | `ts/parity/generate_builder_roadmap_golden.py` over `ts/parity/fixtures/builder-roadmap/` |
| Artifacts | files written into a scratch project by Plan, Expand, closure, DS Plan, and `prepare-templates`, byte for byte; the preservation rule; folder derivation; the path-confinement matrix; the DS Done preflight | `ts/parity/generate_builder_artifact_golden.py` |
| `load` | the D3.16 scenarios × adopted/unadopted × active-item/none × canonical-index/legacy-Workbench × previous-conversation/none, under replay fixtures; the degraded path; the `llm_calls` ledger rows | `ts/parity/generate_builder_load_golden.py` |

Unit tests close to the code: the argparse refusal matrix (D3.17) — one test
per argument, same inputs, exit 2; the two-level allowlist including all
twenty named Workbench refusals; `MIRROR_TS_BUILD=0`; the provider-isolation
test (26 leaves never reach `resolveFamilyProviders`); the front-door
redaction test (`--why-now`, `--objective`, `--summary`, `--evidence`,
`--debt`, `--limit`, review and validation prose never reach
`front-door.log`; `leaf=` and `calls=` do); the broken-core drill under a
Node loader hook.

Real-DB-copy probes in `ts/parity/real_db_copy_parity.py`:
`builder_cursor_state`, `builder_artifacts` (scratch project),
`builder_load` (replay).

Smokes through the real front door on a disposable home and a scratch
project, both engines, **no gate in the environment**, asserting stdout,
stderr, exit code, the cursor row after every step, the written artifacts,
and the published `operational.json`:

1. Story lifecycle: adopt → prepare-templates → sync-cursor → load →
   pull-candidates → pull-item → prepare-item → plan-item →
   check-implementation → approve-plan → validate-item → review-item →
   coherence-item → done-item → load.
2. Delivery Story flow: set-flow-unit → pull-item (DS, Expand) → child pull →
   plan-delivery-story → approve-delivery-story-plan →
   validate-delivery-story → review-delivery-story → done-delivery-story
   (preflight refusal, then success).
3. Authority and cadence: plan-item --preauthorize-approval → mismatch on a
   coordinate change → cancel → set-cadence accelerated → plan-item →
   approve-plan --use-preauthorization → continue-lifecycle refusing in
   stepwise → release-intent inspect/set.

Each smoke exercises at least one refusal through the process boundary.

Regression in the flip checklist: `conversation_lifecycle_smoke.ts`, the
Explorer smoke, `welcome --status-line` after a `load`, the full TS suite,
the Python suite, `.pi` typecheck, oracle-baseline green.

## E2E Decision

**Required.** Builder is a lived mode, and the self-hosting property — a
complete Ariad lifecycle executed on the ported engine, indistinguishable to
the Navigator — is only observable by running this story's own closure
through the TS front door after Validation is accepted.

## Navigator Validation

In order, on the real home:

| Step | Command(s) | Expected observation | Pass | Fail |
|---|---|---|---|---|
| 1 | `inspect-method ariad`, `inspect-method --journey mirror-ts-core`, `pull-candidates --method ariad --journey mirror-ts-core`, `check-implementation --method ariad --journey mirror-ts-core` — both engines, diffed | Byte-identical stdout, stderr, exit code | identical | any byte |
| 2 | `build load mirror-ts-core --session-id <disposable>` on **two fresh copies** of the real database, one per engine | Identical banner, transition, resume surface, context, trailer; same six entries in the ranked block | identical outside the block, same entries inside | any surface difference or a different entry set |
| 3 | Full story lifecycle on a copy of the real database and a scratch clone of this repository, both engines, cursor row diffed after every step | Diff-clean at every step, artifacts identical | diff-clean | any cursor-row or artifact difference at any step |
| 4 | `backup`; restore the dated zip into a scratch home and `build load` there; then this story's own `review-item`, `coherence-item`, `done-item` through the **TS front door**, each dry-run on a copy against Python first | Restore works; each dry-run diff-clean; the real cursor advances on TS with identical surfaces | diff-clean and cursor advances | any difference, or a cursor that Python cannot then read |
| 5 | A live Pi Builder session after the flip: `/mm-build mirror-ts-core`, then `pull-candidates`, then `build change-request capture --title x --body y` | Unchanged experience; `front-door.log` shows `build ts leaf=…`, no `fell_back`, no argument text; the Workbench line says `python` with the DS10 reason | as described | `fell_back`, argument text in the log, a TS answer for a Workbench leaf |
| 6 | `MIRROR_TS_BUILD=0` on `pull-candidates`; then review the CI output of the broken-core drill | Identical output, Python in the log; drill green | identical and green | any difference; drill red |

Providing this route is not acceptance. Validation passes only when the
Navigator has run steps 1–6 and accepted them explicitly.

## Validation Evidence

Pending implementation and validation.
