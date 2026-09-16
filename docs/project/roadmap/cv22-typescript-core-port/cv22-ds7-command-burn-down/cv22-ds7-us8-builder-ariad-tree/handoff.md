[< Story](index.md)

# Handoff — CV22.DS7.US8 — Builder/Ariad tree (plateaus 1–8 complete)

**Status:** plateaus 1–8 of 9 complete. **All 27 in-scope leaves answer from
TypeScript through the production front door when `MIRROR_TS_BUILD=1`**, `load`
included, while the shipped default deliberately remains Python. All three
Ariad flows — the story lifecycle, the aggregate Delivery Story lifecycle, and
the cadence/authority paths — now run through both real process boundaries and
agree after every step. The twenty legacy SQLite Workbench leaves remain on
Python by name for DS10 retirement. `explore story promote`, whose tail is a
Builder session start, remains on TypeScript.

## Resume here

**Plateau 8 is complete. Do not rebuild the route.** What landed:

- `frontDoor/buildRoute.ts`: production argv validation, honest TypeScript
  exit-2 usage refusals, all 26 non-`load` leaves, and `load` through
  `createBuildLoadRuntime`;
- `builder/argv.ts`: the single argv-to-command mapping now shared by production,
  the command corpus, and the lifecycle smoke; read-only leaves use a read-only
  database handle and do not take an unnecessary live backup;
- `builder/index.ts`: the lazy command-tree boundary. `dispatchTs` imports it only
  after routing selects TypeScript, so `MIRROR_TS_BUILD=0` reaches Python even
  when the Builder boundary throws;
- the two-level route allowlist: 27 in-scope leaves, seven `refinement-story`
  actions and thirteen `change-request` actions refused explicitly with their
  DS10 retirement owner, and unknown additions inherited by neither engine;
- `build load` resolves the Builder/search/conversation-tail composition before
  any byte. A half replay fixture reaches TypeScript's named refusal instead of
  falling into live Python — a plateau-8 correction to the earlier routing
  implementation — and `explore story promote` gets the same safety property;
- front-door logging records `leaf=<subcommand>` and, for `load`, `calls=N` plus
  a degraded category. Tests pass every prose-bearing argument and a journey
  briefing sentinel and prove none reaches `front-door.log`;
- the existing lifecycle smoke now drives TypeScript through the real front-door
  process rather than calling the command functions in process: **331/331
  checks**, including streams, exit codes, cursor bytes after every step,
  artifacts, and Journey projection receipts;
- the loader-hook broken-core drill proves the enabled route fails at the injected
  Builder boundary, `MIRROR_TS_BUILD=0` still reaches Python, and an unrelated
  TypeScript command still answers;
- `cli/build.py` and every in-scope `builder/*.py` oracle are registered on the
  drift tripwire; `builder_cursor_state` and `builder_artifacts` run in CI on the
  portable demo copy (`builder_load` correctly remains a real-1536-corpus probe);
- `docs/reference/configuration.md` documents the temporary plateau-8 opt-in,
  composed reverts, replay pair, and redacted log shape.

**Next: the Navigator's acceptance, then plateau 9.** Validation steps 1–3
and 6 were run on 2026-09-16 against the gated route and are recorded in
`test-guide.md` — all four identical on the real home (step 1), `load` live on
two real-database copies byte-identical on all four faces (step 2), a full
lifecycle on real-database copies and scratch clones diff-clean at every step
(step 3, `scripts/smoke_builder_real_copy.sh`, proven to bite with a mutant),
and the revert identical with Python in the log (step 6). Running the route is
not accepting it. The flip is a separate final plateau: default the family on,
update the three skill copies and ledger, then run the self-hosting closure
through TypeScript.

**Cursor finding for step 4.** The real cursor is at `prepare / gen 16`, not
`plan_approved`: a resume session's `prepare-item` on 2026-09-15 demoted the
approved Plan, because Python's Prepare overwrites the event unconditionally
(debt candidate in `plan.md`). The self-hosting closure therefore begins with
`plan-item` and a Navigator `approve-plan` through the TS front door, then
`validate-item`, `review-item`, `coherence-item`, `done-item` — each first
dry-run on a copy, which is exactly what the step-3 script does.

The plateau-8 handoff panel ran (recorded in `plan.md`) and left three items
for the flip, none blocking:

1. **Delete the smoke's internal opt-in.** `builder_lifecycle_smoke.ts` sets
   `environment.MIRROR_TS_BUILD = "1"` in `runTypeScript`. Once the default
   flips, remove that line so the smoke proves the shipped route, not a
   configured one.
2. **Record and pin the argv-grammar divergence.** TS refuses `--opt=value` and
   argparse abbreviations with exit 2 where Python accepts them. Same class as
   `--mirror-home`; decide, pin, record.
3. **Debt Review carries** the three-reader token grammar and the
   `builderInvoke.ts` shim.

### Rules this plateau paid for — do not rediscover them

- **`load` writes while it reads.** `log_access` stamps the memories it returned,
  and the ranker reads that back. **One `load` per database copy**, or replay with
  frozen scores. It does NOT touch `use_count` — retrieval logs access, `log_use`
  logs use, and conflating them inflates reinforcement for anything a Navigator
  merely loaded.
- **Keep corpus scores off the knife edge.** The ranker's recency term reads a
  live clock, so scores equal to six decimals reorder between runs — one case
  passed alone and failed inside the suite. And perfectly symmetric embeddings tie
  EXACTLY, where the two engines disagree about order (a search-family CR, not a
  `load` defect).
- **The corpus must not inherit the machine.** Cases stage a neutral
  `pyproject.toml` + `src/memory/` so the clone-role guard reads staged input;
  without it the golden encoded the developer's `.mirror-clone-role` and CI
  refused everything. Environment paths absolute, the project path relative.
- **`mergeRankedResults` is graded directly.** Its first-occurrence rule is not
  observable through the command in any case the corpus could hold — declared,
  not implied.
- **A composing command owns no fixtures, and that is the whole rule.** `load`'s
  two embeddings ARE the search family and its close tail IS the conversation
  tail family, so three specs resolve together: any revert among
  `MIRROR_TS_BUILD`, `MIRROR_TS_SEARCH`, `MIRROR_TS_CONVERSATION_LLM_TAIL` sends
  the whole command to Python, and any incomplete fixture — the owner's OR a
  composed family's — refuses by name instead of going live. Reverts are checked
  across the composition **before** any fixture is, or a shell that asked for
  Python would get a refusal instead.
- **Replay intent anywhere requires THIS family's fixtures.** A harness that sets
  `MIRROR_TS_SEARCH_EMBEDDING_REPLAY` and then runs `build load` would reach the
  live provider through fixtures nobody set, because every seam inside `load` is
  built from `MIRROR_TS_BUILD_*`. It refuses, naming the two missing variables.
  Python is not the safer answer there — it has no replay transport, so it spends
  too, on the other engine and silently (CR077's argument, one level up).
- **The factory takes the composition, not the owning spec.** `resolveFamilyProviders`
  resolving `BUILD_LOAD_TRANSPORT` alone would build a live embedding provider
  for an invocation the router had already sent to Python under
  `MIRROR_TS_SEARCH=0` — router and runtime disagreeing about one invocation,
  which is the defect CR077 was written about.
- **A failed round-trip is logged, THEN raised.** Python's `generate_embedding`
  calls `_log_embedding_call(on_llm_call, None, …)` before raising, so a failed
  embedding lands as an unpriced ledger row rather than vanishing — failed calls
  are still billable traffic. The oracle seam reproduces that order; a seam that
  raised without logging would have graded a port that undercounts spend.
- **Degradation is per SEARCH, not per command.** `load` embeds twice and each
  search catches its own failure, so the command is degraded if EITHER fails.
  One partial case proves only half the rule — with the second call failing,
  "report the second status" looks correct — so both directions are recorded and
  they render different blocks.
- **A degraded `load` on a real journey shows NOTHING.** `_fts_query` ANDs every
  whitespace word, and the query is a briefing cut at 500 code points, so during
  an outage the memories block disappears on a machine whose corpus is full.
  Reproduced (`load_degraded_briefing_query`), not repaired: it strengthens the
  18c CR from "no marker" to "no marker and no content".
- **The degraded filter is HARD.** Python drops non-FTS candidates outright, so
  the memory with the best embedding vanishes with the provider — and, since the
  block is what `log_access` stamps, it is not even recorded as read.
- **An absent provider is not an empty result** — the one defect this scenario
  found. `runBuildLoad` returned `results: []` when no provider was injected,
  which renders an EMPTY memories block on an unconfigured install with a full
  corpus. Python has no such state: a missing key raises inside
  `generate_embedding`, the search catches it, and FTS-only still renders. Fixed
  with a `ProviderConfigError`-throwing stub — the one failure class that fires
  no ledger hook, which is how Python prices a missing key too. `calls=` counts
  round-trips that REACHED a provider, so an unconfigured `load` reports zero
  rather than claiming two calls no ledger row backs.
- **Twin case names must stay the SAME LENGTH.** The healthy/offline pair is what
  proves an outage changes only the memories block, and each case stages
  `tmp/parity/builder-load/<name>/project` into a card row padded to 56 columns:
  a one-character rename puts one space of difference inside the card and the
  comparison stops being possible.
- **The `builder_load` probe runs the oracle in a SUBPROCESS, and that is a
  safety property.** `cmd_load` builds its own `MemoryClient()` and
  `switch_conversation` opens its own connection, both resolving `DB_PATH` from
  config at import. An in-process probe would have to patch every one of those
  seams correctly to avoid writing into the Navigator's real database; a child
  process with `DB_PATH` on the copy cannot reach it at all, whatever the command
  does internally. Two new oracle flags serve it: `--now` (the harness's frozen
  clock) and `--ignore-clone-role` (a guard whose inputs are the machine's).
- **Everything the probe grades is content-free by construction** — opaque memory
  ids in access order, ledger roles and token counts, row counts, and DIGESTS of
  stdout, stderr, and the memories block. The block's ORDER is not derivable from
  the access log (access is logged per search; the block is the merged, re-sorted
  six), so its digest is the only thing that grades the merge on real data.
- **The probe refuses a corpus that is not at the pinned width.** Python's search
  dots the 1536-wide query vector against each stored embedding with no width
  check of its own, so the synthetic demo database (8 floats wide) dies four
  frames deep inside numpy and the probe looks broken rather than inapplicable.
  It now names the precondition instead — the CR044 rule, applied to a harness.
- **The 26 leaves are isolated by REACHABILITY, not by observation.** A test that
  runs a leaf and sees no network call proves nothing about the leaf that stops
  being deterministic tomorrow. `test/builder/providerIsolation.test.ts` computes
  the import closure of every `builder/` module except `load.ts` over the real
  source tree and asserts no `providers/` module is in it, asserts `load.ts` DOES
  reach `familyProviders.ts` (so the property cannot pass vacuously), and pins
  that the walker walked. Both mutants — a planted value import and a planted
  TYPE-only import — are killed.
- **The clone-role guard exits 2, and this port exited 1.** Found by porting it:
  `_check_clone_role_guard` ends in `sys.exit(2)` — a usage-level refusal, the
  class argparse uses — while `load`'s unknown-journey refusal exits 1, and the
  two branches are one `if` apart. The corpus could not catch it (it stages a
  neutral checkout so the guard stays silent) and the unit test asserted the
  wrong number because it injected the refusal. Now graded against Python over
  eight staged trees, bytes and exit code.
- **`--ignore-production-role` DOWNGRADES the guard, it does not skip it.** An
  orange warning on stderr, before the banner, and the session start continues.
  A port that read the flag as "do not look" would lose the only trace that
  someone worked in a production clone on purpose.
- **The guard's cases stage a git repo in a temp dir OUTSIDE this checkout.**
  `inspect_clone_role` resolves the repo root with `git rev-parse
  --show-toplevel`, so a tree staged under `tmp/` inherits THIS repository's
  `.mirror-clone-role` — the plateau-1 trap in a new place. And the TS side must
  `realpathSync` its temp root: on macOS `/var` is a symlink to `/private/var`,
  so git answers with the resolved path and the recorded `<ROOT>` substitution
  misses by a prefix.
- **`promote` decides its engine before it writes.** Promotion ends the story's
  activeness, so a second run finds no active story and renders
  `no_builder_handoff`: not idempotent, therefore not recoverable by retry. The
  composed decision is resolved in `routing.ts`, and the route resolves the
  Builder runtime only AFTER the no-handoff refusal (which needs no provider at
  all) and BEFORE either mutation.
- **A harness that configures one family and exercises another gets the
  refusal.** The conversation smoke sets the conversation fixtures and never set
  the build ones, so its first promote run reported an incomplete replay fixture
  and went to Python — the composed rule biting in the first harness that met it,
  rather than replaying two searches while the close tail went live. The smoke
  now carries `MIRROR_TS_BUILD_*_REPLAY`, and the episode is the evidence that
  the rule is not theoretical.
- **Under replay, the close tail reads the BUILD family's fixtures.**
  `createLoggerRuntime` resolves `CONVERSATION_TAIL_TRANSPORT` itself, so a shell
  holding only `MIRROR_TS_BUILD_*_REPLAY` would replay the two searches and send
  the close tail live — real money inside a command configured to be
  deterministic. `buildLoadRuntime.ts` overlays the tail's variables, which is
  the composition's promise ("every seam inside `load` answers to the owner's
  fixtures") made true at the one place it could have leaked.
- **The per-session cost floor is the close tail, not the double embedding.**
  Measured from the real ledger and written into the plan's Debt section: the two
  query embeddings cost a median **$0.0000046** per session start, of which half
  is the duplicate call, while the close tail `load` triggers costs a median
  **$0.0011** per conversation — roughly 240× more. The double embedding is worth
  fixing for latency and honesty; the spend argument belongs to CR076/CR057.

Two constraints carried forward:

- the self-hosting protocol still holds — this story's OWN Ariad lifecycle runs on
  Python (by construction until plateau 9), so no smoke may become the thing that
  records US8's state;
- a step that writes goes in a disposable project, and the repository-fingerprint
  guard exists because that rule was broken twice already. The lifecycle smoke
  asserts the repository's `docs/` tree is unchanged for exactly that reason.

Then plateaus 7–9: `load` plus the provider seam (the one with real unknowns —
`load` embeds its query twice and runs the previous conversation's close tail),
front door with the gate off, and the flip.

## Current state, verifiable without re-deriving it

| Corpus | Coverage |
|---|---|
| `builder-lifecycle.golden.json` | 86 sequences / 274 steps / 161 surfaces / 40 refusals — all graded |
| `builder-command.golden.json` | 80 cases across 15 leaves — all graded |
| `PENDING_OPS` / `PENDING_LEAVES` | both empty; plateau 5 refills them |
| Write probes | `builder_cursor_state`, `builder_artifacts`, `builder_load` (25 rows, real corpus) |
| `builder_lifecycle_smoke.ts` | three sequences (story, Delivery Story, cadence), 47 steps × both engines, **331 checks**, in CI |

Written for the session that resumes this story — possibly a different session, a
different Mirror, or a later collaborator. It assumes only the repository, and it
exists so a resuming session does not have to re-derive the measurements below.

---

## What is now true

All 27 in-scope leaves answer from TypeScript end to end through the production
front door under `MIRROR_TS_BUILD=1`. The shipped default remains Python until
plateau 9. The route, not only the command functions, is graded: argv validation,
stream bytes, exit status, cursor rows, artifacts, projection receipts, provider
composition for `load`, redacted observability, and the broken-core revert.

**Remaining: the flip only.** Navigator validation precedes the small plateau-9
commit that defaults the gate on, updates the skill copies and ledger, and makes
the self-hosting closure run through TypeScript.

The ten commits below carried plateaus 1–2. Plateaus 3 and 4 added, oldest first:
`2dff5adb` (lifecycle oracle before any TypeScript), `e98554aa` / `9cb44cd8`
(CR082, CR065's fifth instance, corpus readability), `da3f3e3a` (Pull and Expand),
`314758ef` (Prepare, Plan, Approve, story authority), `3149fac5` (CR083),
`f614c361` (the five story-lifecycle leaves), `25570ca9` (the `builder_artifacts`
probe), `437f3c19` / `b898b06f` (the closure oracle, then closure with CR079 pinned
both ways), `6f1cbeb9` (the four closure leaves), and the plateau-4 smoke.

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

**Checks at handoff:** TS suite **2212 pass / 0 fail**; `tsc --noEmit` clean;
biome clean except the pre-existing unused `CONVERSATIONS_LIFECYCLE_FLAGS`
warning; Python unit/integration suite **2761 pass / 0 fail**; Ruff and Python
format checks clean; doc links, roadmap headings, and oracle drift clean;
`builder_cursor_state` and `builder_artifacts` write probes match on the portable
demo copy; front-door Builder lifecycle smoke **331/331** and the broader
conversation/Soul/Explorer smoke green. Repository-wide mypy remains a
pre-existing red gate (131 errors across 29 files, none in this plateau's changed
Python file).

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

9. **Flip** — after Navigator validation: default the route on, update the three
   `mm-build` skill copies and ledger, run the self-hosting closure through the
   TypeScript front door, and retain `MIRROR_TS_BUILD=0` as the whole-family
   revert.

## Historical plateau notes

The remaining sections preserve the implementation evidence and traps from
plateaus 1–8. They are history, not resume instructions.

### Plateau 3 constraints

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

The `builder_artifacts` probe encodes each file as an ordinary `{id, cells}` state
row rather than adding a file-aware probe type. `python_state` was never row-shaped
by contract — it is a list of identified cell bags — so a file maps onto it without
stretching the abstraction, and the harness needed no new diffing, redaction, or
failure reporting whose only user would be this one probe. A probe whose harness is
buggy reports a false verdict, which is worse than having no probe.

Its safety rule is stated in both halves and is the important part: the probe NEVER
writes into the journey's real `project_path`. It reads the journey and cursor from
the database copy and materializes into a disposable tree beside each engine's own
copy — separate trees, because one shared tree would make the second engine report
`existing` where the first reported `created`.

Recorded in the plan's Debt / CRs section; none of the rest blocks plateau 4.

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
- **The bootstrap lock is not exclusive while it is being written** — captured as
  [CR084](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr084-the-bootstrap-lock-is-not-exclusive-while-it-is-being-written.md).
  Surfaced here as one full-suite failure in thirteen runs
  (`migrateOnOpenConcurrency`, a worker hitting `disk I/O error` inside
  `takeBackup`), then reproduced deterministically: a lock created but not yet
  written reads as abandoned, so a waiter reclaims it and two processes hold it
  at once. Not this story's seam — it belongs to DS6 schema custody — and not a
  test flake either, so it is a CR rather than a line in a plan.

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
   (53 sequences, 171 graded steps, 109 surfaces, 27 refusals) and 25 new
   command-level cases in `generate_builder_command_golden.py`. No TypeScript
   exists yet, which is the point: the corpus was generated from Python before
   the port could influence it.
2. **`pull` + `expand` — done.** `pull.ts`, `expand.ts`, `cursorTransitions.ts`,
   `artifacts/artifactSurfaces.ts`, `artifacts/storyIndex.ts`. **20 of 53
   sequences now grade step for step** — every sequence whose lifecycle ops are
   only `pull` and `expand` — comparing the cursor dump, the serialized metadata
   cell, every surface, every file on disk, the artifact statuses, the projection
   requests, and the refusal messages.
3. **`prepare` + `plan` + `approve` + preauthorization — split in two.**
   - **3a, done.** The module level: `prepare.ts`, `plan.ts`, `approve.ts`,
     `planPreauthorization.ts`, `storyPlanPreauthorization.ts`,
     `deliveryStoryReady.ts`, `flowUnit.ts` (read side), and
     `artifacts/planArtifacts.ts`. **`PENDING_OPS` is empty and all 53 sequences /
     172 steps grade step for step.**
   - **3b, done except the probe.** The five command leaves in `commands.ts` —
     `pull-item` (with the CLI's auto-Prepare and the Delivery Story Expand
     branch), `prepare-item`, `plan-item`, `approve-plan`,
     `cancel-plan-preauthorization` — plus `_roadmap_plan_context` and the CLI
     artifact helpers. **`PENDING_LEAVES` is empty: 11 of the 27 in-scope leaves
     answer from TypeScript, all 64 command cases graded.**
   - **3c, done: the `builder_artifacts` write probe.** Materializes a story package
     on a copy of a real database and grades the resulting FILES. Green on the demo
     database, and it goes red — removing `writeStoryPackage`'s existence guard
     reports `match: false`.

**Plateau 3 is complete.** 11 of the 27 in-scope leaves answer from TypeScript.

### Plateau 4 progress

**Plateau 4 is complete.** Scope D (story closure) is ported: `closure.ts` and
`artifacts/closureArtifacts.ts` carry Validate, Debt Review, Coherence, and Done,
**all 86 sequences / 274 steps of the corpus grade step for step**, the four command
leaves and the two CLI-rendered surfaces (`debt_review_started`,
`done_closure_confirmation`) answer from TypeScript, and the unrouted story-lifecycle
smoke closes it.

What commit 2 measured:

- **The four verbs share one shape and it is the shape a port gets wrong.** Each
  computes a missing-evidence tuple, and that tuple decides three cursor fields at
  once (`activeCheckpoint`, `pendingConfirmation`, `lastDeliveryEvent`). So
  "incomplete" is not an error and not a different surface -- it is the same surface
  over different persisted state, and a port can render the right card while writing
  the wrong three fields.
- **Two verbs allow exact-state re-entry, one does not.** Review answers its own
  `navigator_debt_decision` and Coherence its own `navigator_coherence`; Done refuses
  every pending confirmation, including the ones its predecessors left. Removing
  either re-entry deadlocks the lifecycle, which is why Python grew them after a live
  failure on another project.
- **Done accepts `review_complete` directly** -- Coherence is an option, not a
  precondition.
- **CR079 is reproduced, and pinned in both directions.** The closure verbs overwrite
  authored artifacts; `closure_overwrites_authored_artifacts` records it, and adding
  the "obvious" existence guard to `writeClosureArtifact` FAILS the corpus. A future
  session cannot fix it inside the port without the test objecting.
- **Mutation testing earned its keep again.** Five of six mutants died on the corpus
  as generated -- Done's precondition, both re-entries, `pay_now`, and the CR079
  guard -- but turning validation's `if/elif` into two `if`s SURVIVED, because the
  default route is non-empty and no scenario passed whitespace. Fixed by adding
  `validate_blank_route_reports_only_the_route`, an oracle case, which is the same
  correction plateaus 1 and 3 each needed.

What commit 3 measured (the four closure leaves):

- **Their refusal shape is not the ordinary one.** A blocked lifecycle call renders
  `IMPLEMENTATION_GUARD` on STDOUT and exits 1, rather than printing `Error: …` to
  stderr — the same trap `check-implementation` set at plateau 2. Routing them through
  the ordinary refusal helper loses a surface the transport protocol requires verbatim,
  and the mutant that does so dies.
- **Two leaves emit a second, CLI-only surface** that `lifecycle.py` does not have and
  the module corpus therefore cannot see: `debt_review_started` after a passed
  Validation, `done_closure_confirmation` after a `no_action` Debt Review with nothing
  missing. `done-item` also prints the project position, reading the roadmap a second
  time after the write.
- **Seeding must target the guard under test.** Three `validate-item` cases first used
  `adopted_prepared`, and all three refused with `Validation requires an approved Plan
  and completed implementation` — a real guard, but one case already covers it and the
  other two proved nothing about the behavior they were written for. Validation starts
  from `plan_approved`, so `adopted_closure_plan_approved` exists; the wrong-event
  refusal is now its own case.
- **One mutant is UNREACHABLE, and is recorded rather than counted as a kill.**
  `miniCardWrapped` uses Python's NON-chunking wrapper, and flipping it to chunk
  survives the whole corpus — correctly, because every string those two surfaces wrap
  is a fixed literal with no word over 54 code points, and the one variable field
  (`activeItem`) goes through the truncating `miniCardText` instead. So the flag has no
  observable behavior today. It is set to match Python anyway, so a future surface that
  wraps variable text through this helper inherits the right behavior instead of
  discovering it. Same treatment plateau 1 gave its three equivalent mutants.
- **A complete `defer` offers no closure.** Dropping the `no_action` check survived
  until `review_item_defer_complete_offers_no_closure` existed, because every other
  complete decision in the corpus WAS `no_action`. Oracle case, not assertion.

### What the lifecycle smoke measured (`ts/parity/builder_lifecycle_smoke.ts`)

Eighteen steps — `inspect-method`, `adopt`, `prepare-templates`, `sync-cursor`,
`pull-candidates`, `pull-item`, `prepare-item`, a blocked `check-implementation`,
`plan-item`, a premature `done-item`, `approve-plan`, an allowed
`check-implementation`, `validate-item`, `review-item`, `coherence-item`,
`done-item`, and two post-closure reads — on **two disposable worlds**, 131 checks,
~10s, wired into the determinism job in `tests.yml`. It **found no composition
defect**, which is worth stating plainly: the per-step corpora had already closed
the gaps, and the smoke's value now is that a future plateau cannot reopen one.

Decisions a resuming session should not re-litigate:

- **The TypeScript side is invoked in process**, through the shared
  `#helpers/builderInvoke.ts` argv mapping the command corpus also uses — one parse,
  not two front doors. The consequence is stated in the file: the smoke does NOT
  grade TypeScript's stream mechanics or the exit status a shell sees. Plateau 8 owns
  that when the route exists; the command corpus already pins the bytes against
  Python's real subprocess. Building a throwaway CLI to buy it early was considered
  and rejected — it would be a second front door to delete at plateau 8.
- **`MIRROR_USER` must be pinned, not deleted.** `memory.config` re-applies the
  repository `.env` at import with `setdefault`, so a deleted `MIRROR_USER` comes
  back as the developer's real user — and `resolve_mirror_home` REFUSES the pair
  when `MIRROR_HOME`'s basename disagrees. Measured, not reasoned: on the first run
  every Python step exited 2 with `Mirror home is not configured` and the smoke was
  comparing TypeScript against nothing while reporting a clean Python side. Both
  worlds' homes are therefore named `home`. This is the same class the TS3 status
  generator hit, and it fails as a PASS, which is why it is recorded here.
- **The two project roots are the same length** (`.../py/project`,
  `.../ts/project`), asserted by a check. `cardPrefixed` wraps at a fixed code-point
  count, so root length decides where a wrapped path splits; unequal roots would
  produce a diff that is an artifact of the harness. CI's Linux runner supplies a
  third root length for free.
- **The projection seam is the real one.** The smoke injects
  `createPythonProjectionRefresh`, so each TypeScript cursor write spawns Python's
  publisher exactly as production will, and both worlds' `.mirror/projections` trees
  are compared as `{documents, receipts}` — the receipt COUNT is the behavior, the
  names are uuid4. Using `noProjectionRefresh` would have made the smoke fast and
  blind, and US7 already shipped a silently dead seam once.
- **`metadata` is compared byte for byte**, unlike the write probe, which
  canonicalizes that cell. Compare-and-swap matches on that exact string, so this is
  the D2 revert contract under a whole lifecycle rather than per transition.

The smoke was verified to fail before it was trusted — three mutants, each killed in
its own dimension: reordering two keys in `serializeCursor` (cursor bytes, from
`sync-cursor` onward), lowercasing a closure-artifact heading (`done.md` bytes), and
dropping Done's `requestProjectionRefresh` call (receipt count). A green smoke that
has never been red is a belief, not evidence.

### Plateau 5 — the Delivery Story lifecycle (Scope E)

**Complete.** The aggregate face of the lifecycle is ported: `deliveryStoryPlan.ts`,
`deliveryStoryClosure.ts`, `deliveryStoryRoadmapClosure.ts`,
`artifacts/deliveryStoryArtifacts.ts`, and the write side of `flowUnit.ts`. The
corpus grew to **107 sequences / 469 steps / 244 surfaces / 57 refusals** and 102
command cases; `PENDING_OPS` and `PENDING_LEAVES` are empty again.

The plateau ran a Plan-stage persona panel first (recorded in `plan.md`), and all
four dissents changed the plan rather than the code. Two moved work between
plateaus: `set-flow-unit` and the DS preauthorization cancel came forward into
Scope E, because the DS smoke opens with `set-flow-unit` and seeding the flow unit
by a raw cursor write would have been the unrecorded mutation plateau 3a ruled out.

**Three near-duplicates in Python decide whether the port refuses what Python
refuses.** Each is a separate implementation here, with a case that fails the merged
version:

1. **The Done preflight's walk includes `legacy/`.** Every other roadmap reader is
   "sorted rglob MINUS `legacy/`", so `roadmapScan` now takes the exclusion as a
   parameter. An archived table row for a known code blocks a Delivery Story's
   Done, and `authored_closure_reads_legacy_rows` fails a port that reuses the
   default.
2. **The DS unfilled-section rule is not the story one.** It also refuses a body
   containing this section's exact scaffold line, or the word `placeholder`
   ANYWHERE rather than at line start. Reusing the story helper consumes a
   preauthorization receipt against a Plan Python still calls unfilled — authority
   granted where Python withholds it. Found by reading both copies, then pinned by
   `delivery_story_preauthorization_refuses_prose_placeholder`, whose Plan is
   complete by one rule and unfilled by the other.
3. **`_replace_status` appends.** Replacing a status REORDERS
   `aggregate_checkpoint_status`: same set, different bytes, and compare-and-swap
   matches bytes. `delivery_story_revalidation_reorders_status` re-validates after
   the debt review to stage it.

**Two inherited shapes reproduced, not repaired**, each with a mutant that dies: the
Coherence surface renders the DONE ribbon by fall-through (Python has no `coherence`
branch), and the aggregate closure artifacts overwrite authored files (CR079).

**`_is_done` is a suffix test** — `strip().casefold().endswith("done")` — so `Done`
and `✅ DONE` pass while `✅ Done (2026-09-14)` does not. That dated form is what
THIS repository's roadmap uses, so a DS Done preflight here would refuse on our own
packages. Parity-bound; carried to Debt Review as a CR candidate.

#### What the DS smoke measured

The smoke now runs two sequences over separate world pairs — 215 checks, ~40s. The
DS one is the interesting one: `pull-item` at Delivery Story level (which expands
it), a DS verb refused before the flow unit is chosen, DS Plan → approve → validate
→ review, `done-delivery-story` **refused by the authored preflight**, a graded
authored edit, then the close that succeeds.

The edit is a first-class step, not a `writeFileSync` between invocations: it is
applied to both worlds, its files are compared like any other step's, and it must
produce **zero** new projection receipts — an authored edit is not a cursor write.

And it earned its keep immediately, unlike plateau 4's. Removing the CLI's preflight
call leaves the module corpus **green** — the preflight lives in the CLI, not in
`delivery_story_closure.py`, so no module sequence can see it — while the smoke goes
**red** on the first Done. That is the composition defect class the smoke exists
for, demonstrated rather than asserted.

### Plateau 6 — cadence, authority, continuation (Scope F)

**Complete.** `set-cadence`, `release-intent`, and `continue-lifecycle` answer from
TypeScript. Corpus at 112 sequences / 494 steps and 121 command cases; the smoke
gained a third sequence (331 checks).

**No Plan-stage panel for this plateau — a recorded decision, not a default.** The
collaboration strategy requires one for every story above a small slice, and
defines a small slice as one bounded family with an existing pattern to copy. After
reading the terrain that is what this was: two of the three leaves have no module at
all, the third is 197 lines, and every renderer, guard idiom, and cursor-write shape
they need was already ported and graded. The plateau-5 panel's findings still
applied and were reused. If plateau 7 looks like this, it will still get a panel —
`load` crosses the provider seam, which is precisely the boundary the panel exists
for.

**Two plan corrections came out of the terrain read**, both of the "written from
reading rather than from code" class the story has now hit three times:

- `set-cadence` and `continue-lifecycle` have **no module**. Both are implemented
  entirely in `cli/build.py`, so the module corpus cannot see them at all and the
  command corpus is their only oracle.
- `continue-lifecycle` has **no multi-surface output**. The plan called it "its
  multi-surface output" and the skill documentation says it "may emit multiple Ariad
  surfaces"; every path in the code prints exactly one — IMPLEMENTATION_GUARD with
  exit 1, or DONE_CHECKPOINT with exit 0.

**Three behaviors pinned because a port would guess them wrong:**

1. **`set-cadence` validates the profile BEFORE resolving the journey**, unlike
   every other leaf. So an unknown profile with an unresolvable journey reports the
   profile.
2. **`continue-lifecycle` accepts four arguments it ignores.** `--process`,
   `--project`, `--product`, and `--difference` are parsed and never read: it takes
   Coherence's evidence and never runs Coherence.
3. **It crosses Done and prints nothing after its checkpoint**, where `done-item`
   crossing the same boundary prints the roadmap snapshot.

**Release intent is a PAIR** — the intent and the Delivery Story code it belongs to
— so moving to a story under another Delivery Story makes the inspect face report
`not_recorded` rather than inheriting the previous decision. `not_recorded` is
rendered, never stored, and is deliberately distinct from the explicit decision
`none`.

#### What mutation testing bought this time

Eight mutants, seven killed immediately. The survivor was the interesting one: the
case written for "the profile guard precedes journey resolution" passed an explicit
`--journey`, which ALWAYS resolves — `set-cadence` never checks journey existence —
so the case could not distinguish the two orders at all. It now runs with no
`--journey` under an active mode carrying none, paired with a valid-profile case
that reaches the journey guard, so the two orders produce different messages. A
case that cannot fail is not coverage.

#### A harness bug the new scenarios exposed

The replay's `seed_cursor` set `release_intent` and
`release_intent_delivery_story` to `null` whenever the seed did not mention them.
Python's `set_delivery_cursor` defaults both to its `_KEEP` sentinel, so an absent
key PRESERVES the stored value. Invisible until a scenario records an intent and
then seeds a new cursor — which is exactly what
`release_intent_is_scoped_to_its_delivery_story` does. **An absent key is not the
value `null`**, and the replay now distinguishes them.

#### The harness lesson worth more than the plateau

The first mutation run reported two SURVIVED verdicts that were both false.
`git checkout -- src/builder/` cannot revert an **untracked** file, so a plateau's
own new modules kept their mutants while the tracked files were silently reverted —
which also wiped half the work in progress. One mutant "survived" because it was
never applied to a clean tree; the next "survived" because the previous one was
still in place; and every later KILLED verdict was meaningless because the suite was
already red for an unrelated reason.

The rule this project had — *a mutation harness must assert the file changed* — now
reads: **assert it changed back**. The driver snapshots bytes and restores from that
snapshot, and verifies the restore.

The replay had a matching gap. `authored_closure` emits no surface, so its whole
observable behavior is a list of issues — which the comparison loop recorded and
never asserted. A mutant that stopped reading `legacy/` passed cleanly. Every
recorded extra is compared now; recording without asserting is the same false green,
one level up.

   Split because the module level reached a coherent, fully graded state and the
   command level is a separate failure mode (argv parsing, guard order, exit
   codes) that deserves its own review boundary.

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

### What commit 2 measured

- **Path-row normalization must be root-LENGTH invariant, and the marker is the
  only stable signal.** The rule first opened a collapse run at any `/`-leading
  row, since each absolute path starts with one. So does an arbitrary continuation
  chunk: where a wrapped path splits depends on the prefix length. Under the
  generator's repo-relative root, `materialized`'s four paths produced eight
  `/`-leading rows and eight token rows; under the test's `/tmp` root, four. Runs
  now open on `_card_prefixed`'s list marker and continue through its two-space
  indent, which is structural rather than positional. The cross-check is free and
  worth keeping in mind: **Python generates under one root length and the
  TypeScript test replays under another, so the byte comparison itself proves the
  invariance** — no separate test needed, and CI's Linux runner adds a third root.
- **A wrapped path's last chunk can carry the sentence's punctuation.** Wrapping
  splits on whitespace, so `<path>,` is one word and `dmap/cv9-ds1-duplicate-a,`
  is not a substring of any recorded path. That row survived normalization into the
  committed golden — a machine-dependent tail of a temp root. Found through
  `expand_blocked`, whose reason embeds two paths.
- **`_display_path` needs `relative_to`'s three outcomes, not two.** The first port
  guarded with `!resolve(relation).startsWith("/")`, which is always false, so every
  artifact path rendered absolute. Python raises only when the path is not under the
  root and returns `.` when they are equal; the guard is a `..` prefix or an
  absolute result, plus the empty-result case.
- **Expand treats a `/` in a title two OPPOSITE ways**, and mutation testing is what
  surfaced it: replacing `child.title` with `title_leaf(child.title)` survived the
  entire corpus. A child's folder slugs its FULL title
  (`ds-35-us-1-application-flow-review-step-parity`), while the Delivery Story's own
  title goes through `title_leaf` and keeps only the tail
  (`ds-77-application-admin-parity` from `"Delivery / Application & Admin Parity"`).
  Fixed by adding two oracle cases rather than an assertion, which is the same
  correction plateau 1 applied three times.
- **Five other mutants died on the corpus as it stood**: never resetting stale
  children, not advancing the generation, always preserving release intent,
  recommending the first child regardless of `Done`, and overwriting an existing
  child `index.md`.

### What commit 3a measured

- **`resolveStoryDirectory` did not resolve the roadmap root, and Python always
  does.** Latent since plateau 1, because every test and every real caller passes an
  ABSOLUTE project path — the front door reads it from the journey row, where
  `journey set-path` stores an absolute one. Under a relative project root Python
  printed absolute package paths and TypeScript printed relative ones in the same
  surface, and `createStoryDirectory`'s confinement guard would have compared a
  relative candidate against a resolved root. Fixed in `storyPaths.ts`; found only
  because the replay had to run under the generator's own relative root.
- **The replay must use the sequence's recorded `project_root`, not a `mkdtemp`
  directory.** `plan_checkpoint` prints its package path unrelativized (CR082), so
  the generator hands Plan a repo-relative path to keep those rows byte-stable.
  Replaying under an absolute temp root pushes the rows through path normalization
  and stops grading them. Both sides now stage `tmp/parity/builder-lifecycle/<name>`,
  gitignored, which also satisfies the database copy guard.
- **A scenario deleted a file without recording a step.** The missing-Plan authority
  scenario unlinked `plan.md` inline, so the snapshot showed it absent while nothing
  in the sequence said so and the replay refused nothing. `delete_file` is a recorded
  op now. The rule: every mutation a scenario performs is a step, or the sequence is
  not replayable.
- **Plan passes its receipt EXPLICITLY**, which bypasses the cursor's
  coordinate-change invalidation — that is what lets a freshly recorded receipt
  survive the write that records it. It also writes `refreshProjection: false` and
  then requests the refresh itself, once, after the artifacts exist.
- **Existence is sampled BEFORE Plan writes.** The CLI's `_artifact_existence` runs
  first, so a preserved file reports `existing` and a created one `created`. Sampling
  afterwards makes preservation and overwrite indistinguishable.
