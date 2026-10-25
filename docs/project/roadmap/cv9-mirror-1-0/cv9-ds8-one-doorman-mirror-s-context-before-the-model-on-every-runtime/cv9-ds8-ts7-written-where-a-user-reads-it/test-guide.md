[< Story](index.md)

# Test Guide — CV9.DS8.TS7

## Automated Validation

From the repository root, after the docs are written:

```bash
node --test ts/test/scripts/runtimeParityDocs.test.ts   # the five docs agree with the matrix
node --test ts/test/scripts/mirrorSkillContract.test.ts  # no skill copy changed
node ts/scripts/checkDocLinks.ts
git diff --check
```

The retired sentences, run **before** writing and after. Each pattern matched at
least one line when the plan was written (10 lines in all), so the green run
proves something:

```bash
for p in "does not auto-inject" "once on the first turn after" "carry no text" \
         'Call `mirror load --context-only`' "injected once per" \
         "Zero runtime cost; requires user awareness" "hook_injected"; do
  grep -rnF "$p" docs/product docs/getting-started.md REFERENCE.md README.md
done
```

Before: 10 lines (the contract 6, Getting Started 2, the architecture 2). After:
nothing. The contract's CLI Reference keeps its `mirror mirror load --context-only`
line, since agy's pre-1.4.7 path runs it, which is why the pattern is the retired
guidance sentence and not the command.

No internal vocabulary on the page a new user reads first:

```bash
grep -niwE "doorman|delta|folder" docs/getting-started.md   # nothing before, nothing after
```

Pass: the four commands green, the retired-sentence grep empty after, the vocabulary
grep empty. Fail: any assertion, any broken link, any match.

## E2E Decision

Not required: the story changes documentation only. The parity guard and the
Navigator's reading are the validation; no runtime is exercised and nothing is
re-measured.

## Navigator Validation

Reading, no runtime needed. Each row is read beside its source of truth.

Throughout: every behavior a page claims for a runtime must have its row in US4's,
US5's, or TS6's walk for that runtime. A sentence that needs a behavior none of them
walked is a stop for a Navigator decision, not a sentence to soften.

| # | Page | Read beside | Expected observation | Fail when |
|---|------|-------------|----------------------|-----------|
| 1 | contract, `## Optional: Mirror Mode Identity Injection` | `ts/src/mirror/doorman.ts` header and `decideDoorman` | opens with what the doorman is; then the same policy in the same order: explicit form, Mirror Mode on (mode condition), skill turn, refresh, delta; the delivered line; five runtimes and how each calls it | a rule the module does not have, or the mode condition, skill-turn rule, or refresh missing; "Pi does not auto-inject" still present |
| 2 | contract, `### Mirror Mode injection models` and `## CLI Reference` | the matrix's injection column; `agy.ts` | one doorman model naming four runtimes by event and carrier; Grok Build inert; new-runtime guidance says "call the doorman"; the CLI Reference lists `mirror mirror doorman` (with `--forget`) and keeps the `load --context-only` line | a runtime's event or carrier differs from its matrix cell; the doorman missing from the CLI Reference |
| 3 | contract, Claude Code and Codex matrix rows, and the Pi, Claude Code, Codex, and Antigravity reference-implementation tables | US4's `test-guide.md` walk 2; the inline-annotation table in `plan.md` step 4; DS12.TS1 and DS4.US4 | 2.1.310 / 0.164.0, 2026-10-25, record opens with DS8.US4; the injection cell says the doorman through the inject hook; every cell not re-measured carries its version and story; each reference table names how context reaches the model through the doorman, Pi's through `before_agent_start` and `session_compact` | any value not in its story's record; a cell without its annotation; the Pi, Antigravity, or Grok Build matrix row changed; a reference table still naming the skill or the `SessionStart` context as Mirror's way in |
| 4 | contract, Antigravity paragraphs (reference implementation, `### Assistant Response`) | TS6's `index.md` | the prompt comes as `lastUserInput` on agy 1.4.7; the reply still comes from the transcript | "carry no text" still stated as a whole |
| 5 | Getting Started, the sentence above "What each runtime gives you" and the table | the matrix; US4, US5, TS6 walks | one idea, said once, in plain words, claiming only what all four walks measured; each row says when Mirror Mode starts there; "Measured on" carries the stories' versions and dates; the note under the table says the matrix names the version behind each part | a row or the sentence promises what a story did not measure on that runtime (e.g. `/mm-new` ending Mirror Mode anywhere but Pi); an internal word on the page |
| 6 | Getting Started, the Antigravity wiring step (§6) and section (§8) | TS6's `index.md` | the same plain words as the table, measured on agy 1.4.7 (CV9.DS8.TS6) | "injected once per turn" or agy 1.4.2 still given as the measurement |
| 7 | architecture, `## 6. Runtime Model`, §7's `runtime_sessions` row, §8's Mirror Mode state sentence | the matrix; `ts/src/db/schema.ts` | Claude Code and Codex rows name the doorman; levels unchanged; `metadata` listed, `hook_injected` gone | a level differs from the matrix; a column the schema does not have |
| 8 | decisions log, the one-doorman entry | US4, US5, TS6 test guides | the cost model, then each number with where, when, and which story measured it; no dollar figure; the double hook named as US4's debt | a number with no source or no date |
| 9 | REFERENCE, `## The doorman` | `doorman.ts`, `mirrorModeRoute.ts` | `--forget`; mode condition and what ends Mirror Mode (`mirror mirror deactivate`, a mode switch); skill-turn rule; up to five memories at or above 0.4 semantic, delivered once; compaction refresh; three callers | any rule without its line in the code |

Pass: every row observed. Fail: any fail condition.

## Debt Review Candidate

`runtimeParityDocs.test.ts` checks that the docs name the five runtimes, that the
matrix rows carry level/version/binary/record/date, that the architecture's levels
match, and that README, Getting Started, and REFERENCE link the matrix. It does not
check that Getting Started's "Measured on" column agrees with the matrix's version
and date. This story writes them to agree; nothing keeps them agreeing. Candidate:
a column-level assertion in the existing test, a few lines. Out of this story's scope
(`ts/` is a non-goal); carried to Debt Review with this note as its evidence.

## Validation Evidence

**Driver's run, 2026-10-25** (commits `23e110c4`..`27859e51` on main; the Navigator's
reading is pending):

- `runtimeParityDocs.test.ts` and `mirrorSkillContract.test.ts`: 10 tests, 10 pass.
  `checkDocLinks`: clean. `git diff --check` over the story's commits: clean.
- Retired-sentence grep: 10 lines before (the contract 6, Getting Started 2, the
  architecture 2), 0 after. The contract's CLI Reference keeps
  `mirror mirror load --context-only` and lists `mirror mirror doorman` and
  `--forget`.
- Getting Started vocabulary grep (`doorman|delta|folder`): nothing before, nothing
  after.
- No file under `ts/`, `.pi/`, `plugins/`, `.claude/`, or `AGENTS.md` changed.
- Beyond the story's route: `npm test` 3527 tests, 3524 pass, 3 skipped
  (pre-existing), 0 fail; `checkRetiredSurfaces`, `checkSkillCommandParity`,
  `checkPackContents` clean.

**Found while writing, held to the plan's rules:**

- The attachments' threshold is strictly above 0.4 (`context.ts`), the memories' at
  least 0.4 (`doorman.ts`). The plan said "at or above" for both; the pages say what
  the code does.
- TS6's agy walk recorded the delivered step, the re-routing, and the signature, not
  memories (its memories were the demo database's). By the plan's rule the Getting
  Started sentence claims only what all four walks measured, so memories are not in
  it; the contract and REFERENCE, which describe the policy, name them. Whether to
  add them to the user page on the core's evidence is a Navigator decision.
- The probe listed only `PreInvocation`'s payload keys, so no page claims that no
  payload carries the reply; they say the `Stop` handler still logs from the
  transcript, as it was built to when agy 1.4.2's payloads carried no text.
- REFERENCE said a load the model runs itself marks the session on every runtime; on
  agy it cannot yet (CR169). The contract and REFERENCE now both say so.
- REFERENCE's cost table said the explicit turn makes "the attachment embedding". The
  load embeds the query only when there are attachments to score, and US4's and
  US5's explicit turns wrote one `reception` row and no `embedding` row; the cell now
  says so. The plan had said the cost table stays: a one-cell deviation, made to meet
  the plan's own rule that every REFERENCE rule traces to the code.
