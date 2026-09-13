[< Story](index.md)

# Handoff — CV22.DS7.US8 — Builder/Ariad tree (plateaus 1–2 complete)

**Status:** plateaus 1 and 2 of 9 complete; **plateau 3 in progress** — see
[Plateau 3 progress](#plateau-3-progress) at the end. **Nothing is routed.**
`routing.ts` is untouched and every `build` invocation still reaches Python, which
is the intended state until plateau 8 adds the gate and plateau 9 flips it.

Written for the session that resumes this story — possibly a different session, a
different Mirror, or a later collaborator. It assumes only the repository, and it
exists so a resuming session does not have to re-derive the measurements below.

---

## What is now true

Six of the 27 in-scope leaves answer from TypeScript end to end, behind no route:
`inspect-method`, `pull-candidates`, `adopt`, `prepare-templates`, `sync-cursor`,
`check-implementation`.

Ten commits, oldest first:

| Commit | What |
|---|---|
| `7e651537` | Card primitives (`card.ts`, `surfaceProtocol.ts`) — 516-row golden |
| `a991b873` | Leaf inventory corrected across ledger, index, DS10, decisions |
| `0bea14c7` | Roadmap parsing (`roadmapGrammar`, `roadmapScan`, `pullCandidates` + renderers, `roadmapPosition`, `storyPaths`) — 145 rows over an 8-project fixture tree |
| `54ded9d2` | Absolute-path leak in a golden, found by CI |
| `e8687fa8` | The Ariad DSL as data (`methodDefinition` + validator, `ariadMethod`, `methodInspection`) |
| `056edf06` | The three activation surfaces (`resumeSurface`, `homeSurface`, `refinementField`) |
| `5eaadc37` | First two leaves end to end (`commands.ts`, `methodAdoption`) |
| `f4dcf8f8` | **The delivery cursor** (`deliveryCursor.ts`, CAS helper, widened `run()` seam) |
| `9d1be54f` | `resumeState`, `workbenchSnapshot`, `implementationGuard`, `lifecycleRibbon` |
| `fef52ce2` | `templateGeneration`, four more leaves, the `builder_cursor_state` write probe |

**Checks at handoff:** TS suite 2137 pass / 0 fail; `tsc --noEmit` clean; biome
clean (one pre-existing `routing.ts` warning, not from this story); Python suite
green; doc links and roadmap-heading checks clean; CI green on all five jobs at
`fef52ce2`; `builder_cursor_state` write probe green on a copy of a real database.

**Seven golden corpora**, all in the CI determinism gate, all generated from
Python before the TypeScript existed:
`builder-card`, `builder-roadmap` (+ fixture tree), `builder-method`,
`builder-orientation` (+ fixture tree), `builder-command` (+ fixture project),
`builder-cursor`, `builder-resume-state`.

---

## What a resuming session must not re-derive

These cost measurement to find. Each is already encoded in a test, but the
reasoning is here so nobody "simplifies" one back.

1. **The cursor's bytes are the contract, not its values.**
   `set_delivery_cursor(expected_cursor=…)` compare-and-swaps on STRING EQUALITY
   of the serialized metadata, so TypeScript must write the bytes Python writes —
   `pythonJsonDumps` separators, `ensure_ascii=False`, Python's key order.
   Divergent bytes mean `MIRROR_TS_BUILD=0` fails on its first lifecycle write:
   the revert would corrupt exactly when it is needed. The write probe does **not**
   prove this (the harness canonicalizes that cell); `builder-cursor.golden.json`
   does.
2. **`re.MULTILINE` is not the `m` flag.** JavaScript's `m` anchors `$` at U+2028
   too, so a lazy title silently truncates at an embedded line separator. The
   roadmap patterns use explicit `(?<=^|\n)` / `(?=\n|$)` anchors and no `m`.
   Python's `\s`, `.`, `str.strip()`, and `str.splitlines()` all differ from their
   JavaScript spellings; `#util/pythonText.ts` is the answer to all four.
3. **`sorted(rglob(...))` sorts path COMPONENTS, not strings.** That order decides
   `_recommend`, i.e. the Navigator-facing "recommended next pull". Latent on the
   real 352-file tree today — the two orders coincide — so the fixture stages the
   collision and a test asserts it stays staged.
4. **Python's frame literals are ragged** (54/55/57/58 inner code points where
   `cardText` gives 56). Normalizing them is prettier and fails parity on four
   lines.
5. **Two Python helpers have two behaviors each.** `_wrap_plain_text` chunks
   over-long words in eight modules and not in `release_intent`;
   `_card_prefixed` strips a leading `"- "` only in `delivery_story_closure`. TS
   ships one of each with a flag, and the test asserts the owner→flag mapping so a
   tenth Python copy cannot drift in silently.
6. **`policies` / `openQuestions` / `stateSemantics` keys are content.**
   `_append_mapping_fields` prints them verbatim into a surface, so
   `message_style` must stay `message_style`.
7. **The Workbench read is guarded on one path and not the other** — see the
   open item below.

---

## What remains intentionally undone

Plateaus 3–9, unchanged from the approved plan:

3. **Story lifecycle** — `pull-item` (with Expand and the candidate-table
   grammar), `prepare-item`, `plan-item`, `approve-plan`, story-package artifact
   materialization with the `if not path.exists()` preservation rule, and
   `planPreauthorization` (sha256 over canonical sorted-compact ASCII JSON).
4. **Story closure** — `validate-item`, `review-item`, `coherence-item`,
   `done-item`, the closure artifacts, and the two CLI-rendered surfaces
   (`debt_review_started`, `done_closure_confirmation`).
5. **Delivery Story lifecycle** — the six DS leaves and the authored roadmap
   closure preflight.
6. **Cadence and authority** — `set-cadence`, `set-flow-unit`, `release-intent`,
   both preauthorization cancels, `continue-lifecycle`.
7. **`load` and the provider seam** — the correction that reshaped the plan:
   `build load` is **not** provider-free. It embeds the query twice and runs the
   previous conversation's close tail, so it needs `BUILD_LOAD_TRANSPORT`, replay
   fixtures, and the degraded-search case.
8. **Front door, gate off** — lazy route import, the two-level allowlist with all
   twenty Workbench leaves refused by name, redaction, the broken-core drill,
   oracle registration.
9. **Flip** — gate on, three `mm-build` skill copies, ledger, `explore story
   promote` released.

### Starting plateau 3

Read first: the plan's Scope C and the panel's module-layout constraint — **one
module per Ariad event** (`pull.ts`, `expand.ts`, `prepare.ts`, `plan.ts`,
`approve.ts`) over a shared `cursorTransitions.ts`, never a `lifecycle.ts` that
mirrors `lifecycle.py`'s 2,303 lines. Renderers go in `builder/artifacts/`.

Two plateau-3-specific rules already established:

- **The artifact corpus will carry paths**, and a golden that records an absolute
  path is byte-stable on one machine and wrong on every other. Redact the project
  root to a token, apply the same substitution in the test so the message shape
  stays fully graded, and fail the generator if any absolute path survives (the
  `_assert_no_absolute_paths` pattern in `generate_builder_roadmap_golden.py`).
- **A test that writes files must write to a disposable copy.** At plateau 2 the
  generic case loop pointed `prepare-templates` at the committed fixture and
  created nine files inside it — caught by `git status`, not by an assertion.

---

## Open items carried forward

Recorded in the plan's Debt / CRs section; none blocks plateau 3.

- **Python's Workbench-read asymmetry.** `home_surface._safe_workbench_snapshot`
  swallows `sqlite3.OperationalError`; `read_builder_resume_state` does not. On a
  database predating CV20.DS6 the Home path degrades and `■ BUILDER RESUME`
  raises — the same install is resumable or not depending on which surface renders
  first. Reproduced in both halves, and a mutation that "fixes" it in TypeScript
  fails on purpose. Worth a CR.
- **`inspect_refinement_field` hard-codes a CV20 path** inside the *user's*
  project; every other project reports zero seed CRs and is correct by accident.
- **`_resume_phase` is dead code** — not ported; unreachable code is not parity
  surface.
- **The guard needs no active item**, and four distinct DS-plan failures share one
  message. Both parity-bound.
- **Surfaces still print `uv run python -m memory build …`**, which is wrong the
  moment TypeScript answers the family. A CR after the flip, not a liberty inside
  a port.
- **The front door imports every route module eagerly**, so no family's revert
  survives a TS core that fails to load. Fixed for `build` at plateau 8 by lazy
  import; the general case is a CR under RS009.
- **`--probe`'s choices cannot be derived from `PROBES`** — four probes are built
  inline in `write_parity.py`, including the default. Tried and reverted; the
  comment in that file names why.

---

## Method notes worth keeping

- **Mutation testing found three real coverage gaps** the corpora missed, each
  fixed by adding an oracle case rather than an assertion: the CV-table
  termination rule (needed a *second* CV table), `_recommend`'s loop order
  (needed a Candidate user story against a Planned delivery story), and
  `_projected_active_work`'s `or "active"` default (needed an event moving
  between absent and the literal `"active"`).
- **Three mutants are equivalent, and are recorded as such** rather than counted
  as kills: truncate-then-pad vs pad-then-truncate, the boolean guard in the
  generation normalizer (`Number.isInteger(true)` is already `false` in
  JavaScript), and hardcoding the roadmap surface instead of consulting the DSL
  route (equivalent under the current definition).
- **A mutation harness must assert the file changed.** Two early "survivors" were
  silent no-ops — one targeting a string in a different module, one hitting a
  file's own header comment.
- **Command-level goldens need a subprocess.** `memory.config` resolves `DB_PATH`
  once at import, so an in-process oracle reuses the first case's database; and
  `print(x + "\n")` ends the stream with two newlines, which no renderer-level
  golden can see.
- **`uv run pytest` on this machine resolves a global pytest** from mise's Python
  3.14, not the project venv. `uv sync --extra dev --frozen` fixes it; CI was
  always correct.

---

## Plateau 3 progress

Plateau 3 (Scope C — story lifecycle) is being delivered in **three commits**,
because it is the largest plateau in the story and its two halves fail
differently: surface rendering is cheap to grade, while writes into the
Navigator's project are the only US8 surface with a traversal shape.

1. **Oracle first — done.** `ts/parity/generate_builder_lifecycle_golden.py`
   (51 sequences, 166 graded steps, 105 surfaces, 27 refusals) and 25 new
   command-level cases in `generate_builder_command_golden.py`. No TypeScript
   exists yet, which is the point: the corpus was generated from Python before
   the port could influence it.
2. **`pull` + `expand`** — `pull.ts`, `expand.ts` over `cursorTransitions.ts`.
3. **`prepare` + `plan` + `approve` + preauthorization** — renderers in
   `builder/artifacts/`, the sha256 fingerprint, the five leaves, the
   `builder_artifacts` probe.

### What commit 1 measured that a resuming session should not re-derive

- **Token redaction and a truncating renderer are incompatible.** The first
  corpus ran under `tempfile.mkdtemp()` and replaced the project root with
  `<PROJECT>`, the pattern `generate_builder_roadmap_golden.py` uses. It cannot
  work for Scope C: `_card_text` truncates at 54 code points, so the golden
  recorded `│ /private/var/folders/5k/q6bjkgn95gzd_qss7_5flyzw0000gp │` — a
  truncated PREFIX no full-string substitution can match. The module-level corpus
  therefore runs under a repo-relative root and grades the bytes;
  `ts/parity/builder_surface_paths.py` owns the command-level rule and explains
  what stays graded.
- **Only a `/`-leading row may open a path run.** The first version of that rule
  asked whether a row's text was a fragment of some absolute path, which is also
  true of every RELATIVIZED row (`docs/project/…` is a substring of
  `/abs/prefix/project/docs/project/…`), so it collapsed the
  `artifacts_materialized` rows too and erased content that is machine-independent
  and must stay graded.
- **`.mirror/projections` cannot be snapshotted.** Every cursor write requests a
  Journey projection refresh, and the publisher names each receipt
  `op-<uuid4>.json`; including that tree made `builder-command.golden.json` differ
  between two consecutive runs on one machine. The corpus now grades the authored
  files exactly and the projection seam as `{documents, receipts}` — the receipt
  COUNT is the part that is behavior, and it already shows refused cases producing
  no refresh.
- **A generator must assert it did not touch the repository.** A scenario seeded an
  EMPTY project path; `Path("")` resolves to the process cwd, which for a
  subprocess launched from the repository root is the repository, so `pull-item`
  materialized a fabricated `CV1.DS1 — A delivery story` package under this
  project's real CV1 — a second package claiming a live code, which
  `resolve_story_directory` would refuse as ambiguous. Found by `git status`, like
  plateau 2's fixture pollution. `_repo_docs_fingerprint` now fails the generator
  instead.
- **Seed the state the guard under test actually needs.** Two refusal cases
  initially hit the delivery-cursor guard instead of the guard they were written
  for (`active item is required before prepare`, and the Delivery Story
  project-path refusal), because both sit BEHIND the cursor guard. Scenario
  `adopted_cursor_empty` exists for that reason.
- **The preservation rule only bites at the derived path.** The authored-plan
  scenario first wrote `plan.md` one level too high
  (`roadmap/cv1-us1-…` instead of `roadmap/cv1/cv1-us1-…`, since a dotted code
  nests under its parent coordinate), so Plan created all three artifacts and the
  corpus would have passed a port that overwrites authored work. It now authors two
  of three files and grades `existing / existing / created`.
