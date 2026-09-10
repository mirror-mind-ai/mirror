[< RS009](index.md)

# CR072 — Route every skill through the front door

**Status:** done
**RS:** RS009
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

A flipped route reaches a live session only if the caller enters the front
door. Two earlier CRs closed two caller classes: CR059 routed the Pi extension
and the Gemini hooks, and CR071 made the three skill copies agree with each
other. Neither made every *skill* enter the front door, and CR071's own
outcome said so: "This check guarantees the three copies AGREE; it does not
guarantee they have stopped calling Python."

The CR068 inspection (2026-09-09) measured the residue. Nine skills whose
routes already point at TypeScript still invoke `uv run python -m memory`
directly, identically across all three copies — which is exactly why the CR071
checker passes on them:

| Skill | Family flipped by | Route today for its commands |
|-------|-------------------|------------------------------|
| `mm-tasks` | DS7.US2 | `tasks *` → ts |
| `mm-week` | DS7.US2 | `week view` → ts |
| `mm-consolidate` | DS7.US3 | `consolidate list\|reject` → ts (`scan\|apply` replay-gated) |
| `mm-shadow` | DS7.US3 | `shadow list\|show\|reject\|apply` → ts (`scan` replay-gated) |
| `mm-consult` | DS5 | replay-gated → python today; live in DS8 |
| `mm-mute` | DS7.US5 | `conversation-logger mute\|unmute\|status` → ts |
| `mm-new` | DS7.US5/US10 | `conversation-logger switch` → ts under replay |
| `mm-discard` | DS7.US5 | `conversation-logger discard-current` → ts |
| `mm-mirror` | DS7.US4 | `mirror load` → ts without `--query`; with `--query` replay-gated |

Three more call Python because their commands are unported, and are not this
CR's to change: `mm-build` (DS7.US8), `mm-journal` (DS7.US11), `mm-update`
(DS10). `mm-identity`'s `identity edit` line is DS7.TS4's.

Consequence: the US2–US5 flips recorded in the burn-down ledger have been
real for the Pi extension and for the lifecycle smoke, not for the skill a
Navigator types. And DS8 flipping `mirror load --query` live would be invisible
through `mm-mirror`, the daily Mirror Mode entry, until this is fixed.

## Expected Behavior

Every skill whose commands have a TypeScript route invokes
`NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts <command>`
in all three copies (`.pi/skills/`, `.claude/skills/`, `plugins/mirror-mind/skills/`),
in the same form the eleven CR071-repaired skills use, so the routing table —
not the skill text — decides the engine. Skills whose commands are still
unported keep calling Python until their owning story flips them, and are
listed by name as the known residue.

`scripts/check_skill_command_parity.py` gains the assertion DS10's Skill
Invocation Gate scheduled for retirement time, brought forward: a skill may
invoke `uv run python -m memory` only for a command on an explicit allowlist of
unported commands (`build`, `journal`, `runtime update|pull|stable|...`,
`identity edit`), and that allowlist shrinks as stories flip. A new Python
invocation outside the allowlist fails CI.

## Impact

Medium, compounding, and cheap to fix. Every family flip since DS7.US2 has
been partially theatrical for skill-driven use; the ledger's ✅ rows for those
families describe the routing table and the smoke. No user-visible defect —
Python still answers correctly — but the strangler's promise is *measurable*
burn-down, and this is the second caller class (after CR059) through which a
measured flip did not reach the user. It is also a hard prerequisite for DS8
to have any effect on the daily Mirror turn.

The fix is mechanical: nine skills, three copies each, argument spellings
untouched, guarded by an existing checker plus one assertion.

## Plan Or Decision

**Selected 2026-09-09. Batched with [CR073](../rs010-cv22-oracle-and-port-hygiene/cr073-refuse-a-mistyped-stdin-sentinel-in-journey-update.md)
(RS010) by Navigator decision** — one branch, one Plan, two CR records, two
separate validations and closures. They are batched because they touch the same
surface from two directions: CR072 rewrites skill invocations, CR073 fixes a CLI
contract that a skill (`mm-journey`) documents, and both land in
`scripts/check_skill_command_parity.py` or the skill files it guards. This
section is the plan of record for both; CR073 keeps its own scope and acceptance.

_Amended 2026-09-09 after the ai-engineer + quality-assurance Plan review (recorded
below). **Approved by the Navigator 2026-09-09** with the +160 ms accepted, no
argument-shape convergence, and CR068's debt re-deferred. Driver @viniciusteles,
Delivery `mirror-ts-core`; implementation started the same day._

### Scope

**CR072 — skills**

1. Rewrite **89 `uv run python -m memory` invocation lines across 27 files**
   (nine skills × three copies) to the front-door form CR071 established:
   `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts <command>`.
   Argument spellings, the Portuguese examples in `.pi`, and the per-runtime
   Usage sections are untouched.

   **Prose references are in scope, not only code blocks.** A skill file is a
   prompt; the invocation is a token sequence the model reproduces from it.
   `mm-mirror` line 15 is imperative prose (*"Never produce a Mirror Mode
   response without first running `uv run python -m memory mirror load`"*) and
   line 39 is the code block. Rewriting one and not the other leaves the model
   two forms in one prompt and lets it pick. The checker scans every line, so CI
   would catch a leftover — but the 89 count above already includes prose
   mentions, and the rewrite must too.

   | Skill | `.pi` | `.claude` | `plugins` | Commands |
   |---|--:|--:|--:|---|
   | `mm-tasks` | 4 | 1 | 1 | `tasks` |
   | `mm-week` | 3 | 3 | 3 | `week` |
   | `mm-consolidate` | 5 | 5 | 5 | `consolidate` |
   | `mm-shadow` | 6 | 6 | 6 | `shadow` |
   | `mm-consult` | 5 | 5 | 5 | `consult` |
   | `mm-mute` | 3 | 3 | 3 | `conversation-logger` |
   | `mm-new` | 2 | 2 | 2 | `conversation-logger`, `mirror` |
   | `mm-discard` | 1 | 1 | 1 | `conversation-logger` |
   | `mm-mirror` | 2 | 3 | 3 | `mirror` |

   Per-copy counts differ legitimately: `.pi` carries extra Portuguese
   examples. The checker compares entry points per command, not line counts.

2. Extend `scripts/check_skill_command_parity.py` with the assertion DS10's
   Skill Invocation Gate scheduled for retirement time: a skill may invoke
   `uv run python -m memory` only for a command on an explicit allowlist, and
   each allowlist entry names its owning story.

   | Allowlisted command | Skill | Owner |
   |---|---|---|
   | `build` | `mm-build` | DS7.US8 |
   | `journal` | `mm-journal` | DS7.US11 |
   | `runtime update\|pull\|stable\|backup\|release-doctor\|release-promote` | `mm-update` | DS10 |
   | `identity edit` | `mm-identity` | DS7.TS4 |

   The allowlist shrinks as those stories flip; a Python invocation outside it
   fails CI.

3. Update the ledger's "What routed to TS reaches" note so it stops implying
   skills already enter the front door.

**CR073 — the sentinel.** See its own document; summarised here because it
shares this plan. **Amended:** the guard refuses **flag-shaped** input —
`^--?[A-Za-z]` — not everything beginning with `-`. The captured CR asserted
that *"an argument that begins with `-` is never plausible journey path text"*;
four of the six journey-path rows in the Navigator's database contain markdown
lists, and a path written as a list from line one starts with `- `. The guard
must let list-shaped input through. Plus the empty guard `identity set` already
has, and the misleading `<content|-stdin>` usage string fixed — Python first as
the oracle, then TS, then the `mm-journey` skill copies.

**Named scope the capture missed:** `src/memory/cli/journey.py` is not in
`ts/parity/oracle-baseline.json` and no `journey update` golden exists. "Proven
red-before-green on both engines" requires creating that golden (a
Python-generated corpus over the accept/refuse matrix below) and registering the
file in the drift tripwire. Small, but it is scope.

**CR073 test matrix** (each case on both engines):

| Input | Expected | Why |
|---|---|---|
| `-stdin` | refuse, exit ≠ 0, no write, message names `-` | the incident |
| `--stdin`, `-s`, `--content` | refuse | flag-shaped |
| `""`, `"   "` | refuse (`content is empty`) | empty guard |
| `-` with piped stdin | accept, content = stdin | the real sentinel, unchanged |
| `- phase 1\n- phase 2` | **accept** | list-shaped; legitimate |
| `— em-dash lead` | accept | not a flag |
| ordinary positional text | accept, unchanged | regression |

### Decision required at approval — CR073's argument shape

CR073's captured plan left open whether to converge `journey update` on
`identity set`'s `--content`-or-stdin shape. **Recommendation: do not.** It is a
breaking CLI contract change for any caller passing content positionally, and
the guard closes the defect without one. Record the divergence between the two
sibling commands as accepted rather than paying a migration for symmetry.

### Accepted cost, measured

Routing a skill whose command is currently **Python-routed** through the front
door pays a double process start: Node decides, then spawns `uv run python`.
Measured on this home, warm: direct Python ~0.34 s, front door fallback ~0.51 s
— **about +160 ms**.

This lands on `mm-consult` (until DS8), `mm-new`'s `conversation-logger switch`
(until DS8), `mm-consolidate scan`/`shadow scan` (until DS8), and
`mm-mirror`'s `mirror load --query` — the daily Mirror turn. The other skills
are TS-routed and get *faster* (~0.17 s, no Python start).

The cost is accepted and temporary: it inverts at DS8, when those routes flip to
TS and the front-door path drops Python entirely. Paying it now is the point of
the CR — a skill outside the front door cannot observe DS8 at all.

### Behavior changes the skills inherit from the front door

Stated so they are accepted knowingly rather than discovered:

- **A 10-minute ceiling on Python-routed commands.** `spawnSync` kills the
  fallback at `DEFAULT_PYTHON_TIMEOUT_MS`; direct invocation had no bound. This
  lands on `mm-consult` and `mm-consolidate scan` — model-backed, previously
  unbounded. On a kill mid-call the `llm_calls` row is never written: spend
  without a ledger line. Accepted — ten minutes exceeds any observed call, and
  a hung session is the worse failure. The two skills' text will state the
  ceiling in one line.
- **Every skill now depends on Node, `uv`, a parseable `cli.ts`, and `.env` in
  cwd.** Before, `mm-mirror` needed only Python. Route-level TS failures fall
  back to Python (CR064's `fell_back` path); front-door-level failures do not.
  Checked 2026-09-09 on Node v25.9.0: with `.env` absent from cwd, Node exits
  **9** with `node: .env: not found` and runs nothing — loud, no wrong-home
  risk. Missing `node` is a shell error before anything runs. The cwd
  assumption itself is shared with the current Python form (`uv run python -m
  memory` from `/tmp` fails with `No module named memory`), so it is neither
  worsened nor fixed here.
- **Observability, intended.** Today `mm-mirror` leaves no trace; the daily
  Mirror turn is unobservable. After this CR every skill call leaves one
  `front-door.log` line — command, engine, exit, `fell_back` when applicable.
  That is DS8's evaluation substrate: per-family fallback rates and
  before/after latency from a log that already exists. DS8's plan should use it.

### Affected files

- 27 `SKILL.md` files under `.pi/skills/`, `.claude/skills/`,
  `plugins/mirror-mind/skills/`
- `scripts/check_skill_command_parity.py`
- `src/memory/cli/journey.py`, `ts/src/frontDoor/cli.ts` (CR073)
- `.pi/skills/mm-journey/SKILL.md` + two copies (CR073 usage string)
- `.pi/skills/mm-consult/SKILL.md`, `.pi/skills/mm-consolidate/SKILL.md` + copies
  (one line each, the timeout ceiling)
- **new:** a `journey update` golden generator and corpus;
  `ts/parity/oracle-baseline.json` gains `src/memory/cli/journey.py`
- `docs/.../burn-down-ledger.md`, DS10 index note

### Acceptance

1. No skill copy in any runtime invokes `uv run python -m memory` for a command
   outside the allowlist — in code blocks **or prose**.
2. The checker fails on injected drift for **both** new failure modes: a skill
   reverted to Python off-allowlist, and copies that disagree. The CR071 proof
   (copies disagreeing) is re-run, not assumed.
3. The CR073 test matrix above passes on both engines, proven red-before-green
   against a Python-generated golden; `cli/journey.py` is in the drift tripwire.
4. **Both-paths diff.** The six documented invocations that carry no placeholder
   — `tasks list`, `week view`, `consolidate list`, `shadow list`,
   `conversation-logger status`, `consult credits` — produce byte-identical
   stdout via `uv run python -m memory` and via the front door. *(Replaces the
   unverifiable "every repaired skill still produces its previous output": this
   is exactly what is covered, and nothing more is claimed.)*
5. The Navigator validation route below passes.

### Validation route (Navigator)

Same prediction-then-observation shape CR068 used, with its three guards (log
delta exact, every `exit=0`, engine column discriminates). **Amended to sample
by risk, not convenience:** the costliest journeys to break are `mm-mirror`
(every Mirror turn — the highest-frequency path in the product) and the
conversation-lifecycle skills, where a broken `mm-new` misfiles a session.

1. In a fresh Pi session, run **`/mm-mirror`** on a real prompt, **`/mm-new`**,
   **`/mm-tasks`**, and **`/mm-consult`** — two Python-routed, two TS-routed,
   both critical journeys covered — and confirm the visible output is
   unchanged.
2. `front-door.log` gains one line per invocation, correct engine, `exit=0`.
   Before this CR those calls left **no** log line at all, which is itself the
   observation: absence → presence proves the skill entered.
3. `journey update mirror-ts-core -stdin` is refused with the journey path
   intact — read it back to confirm. This is the incident replayed. Then
   `journey update <scratch-slug> "- a\n- b"` is **accepted** — the false
   positive the review caught, proven absent.
4. Injected-drift proof for the checker, both modes.
5. Record the measured `mirror load --query` latency through the front door,
   once, so the plan carries the number for the path that matters rather than
   the `journal --help` proxy.

### Revert contract

Skill text has no environment kill-switch; the revert is `git revert` of the
skill commit, which restores direct Python invocation with no data migration.
This adds no new exposure: ungated families (`tasks`, `week view`, the
lifecycle reads) never had a switch, and gated families keep theirs — the front
door honours `MIRROR_TS_*=0` and the replay gates exactly as before. CR073's
guard reverts with the same commit; a reverted guard reopens the sentinel
defect, nothing else.

### Exclusions

- No routing decision changes; no command is ported.
- `mm-build`, `mm-journal`, `mm-update`, `mm-identity`'s `identity edit` stay on
  Python — they are the allowlist, owned by US8, US11, DS10, TS4.
- No collapse of the three skill copies into a generated artifact (CR071
  rejected that; the per-runtime differences are deliberate content).
- No change to what a successful `journey update` writes; no confirmation
  prompt, no dry run, no fix for its missing slug-existence check.

### Authority boundaries

Local implementation only. Driver and Delivery must be recorded before
`in_progress`. Navigator validation is required before `validated`; push and
release remain separate gates. Neither CR may absorb the other's closure — two
records, two validations, two `done` decisions.

### Multi-Persona Plan Review (2026-09-09)

Run per the collaboration strategy's Plan-review checkpoint, at the Navigator's
request, with the two lenses named: ai-engineer and quality-assurance. Findings
are recorded here so no later checkpoint can claim they were unknown. All
blockers were folded into the amended plan above.

**◇ quality-assurance**

- *Blocker — the CR073 guard refused legitimate content.* Specified as `^-`;
  four of six journey-path rows carry markdown lists. Amended to flag-shaped
  `^--?[A-Za-z]` with `- item` as an accept case in the matrix.
- *Blocker — the validation route sampled by convenience.* `/mm-tasks` +
  `/mm-consult` are the easiest to run, not the costliest to break. Amended to
  include `/mm-mirror` and `/mm-new`.
- *Blocker — acceptance #6 was unverifiable.* "Every repaired skill still
  produces its previous output" had no mechanism. Replaced with the
  six-invocation both-paths diff, stated as exactly what is covered.
- *Non-blocking, new scope* — no `journey update` golden exists and
  `cli/journey.py` is not in the drift tripwire. Added to scope.
- *Non-blocking* — no revert section. Added.
- *Accepted boundary* — three copies, one runtime validated; `.claude` and
  `plugins` are validated by text agreement only, as CR071 accepted.

**◇ ai-engineer**

- *Non-blocking* — a skill file is a prompt; prose and code-block invocations
  must agree or the model picks. Prose references added to scope explicitly.
  The 71-character boilerplate is more surface for a model to mistype than the
  Python form; accepted, because CR071 set it and DS10's npm entry point is the
  structural fix — no wrapper invented here.
- *Non-blocking* — the blast radius of a broken front door grows from
  extension hooks to every skill. Route failures fall back; front-door failures
  do not. The `.env`-absent case was checked in review rather than deferred to
  the route: loud failure, exit 9, nothing runs.
- *Question, answered* — the 10-minute fallback ceiling is new for `consult`
  and `consolidate scan`. Accepted and stated in both skills' text.
- *Positive, now claimed* — the daily Mirror turn becomes observable; handed to
  DS8 as its evaluation substrate.
- *Refinement* — the +160 ms was measured on `journal --help`; the route now
  records it on `mirror load --query`.

**Converged, no dissent:** the batch itself; the +160 ms accepted as temporary;
no argument-shape convergence for `journey update`; re-deferring CR068's
completeness-guard debt to the last of US11/TS4/DS8.

**Read after amendment:** ready for Navigator approval.

## Evidence

Route decisions read from `routeMemoryCommand` with an empty environment on
2026-09-09:

```text
["tasks","add","x"]                      -> ts
["week","view"]                          -> ts
["consolidate","list"]                   -> ts
["shadow","list"]                        -> ts
["conversation-logger","mute"]           -> ts
["mirror","load","--journey","x"]        -> ts
["mirror","load","--query","q"]          -> python  (replay-gated; DS8)
```

Skill invocation counts (`.pi` tier; the other two copies are byte-identical
per CR071's checker): `mm-tasks` 4 Python / 0 front door, `mm-week` 3 / 0,
`mm-consolidate` 5 / 0, `mm-shadow` 6 / 0, `mm-consult` 5 / 0, `mm-mute` 3 / 0,
`mm-new` 2 / 0, `mm-discard` 1 / 0, `mm-mirror` 2 / 0. Contrast `mm-soul`
6 / 20, `mm-explore` 2 / 12, `mm-journeys` 0 / 1.

## Implementation Evidence (2026-09-09, commit `3e05f0a`)

Evidence, not validation. Navigator validation is the route in the Plan.

- **The assertion was written first and run on the untouched tree.** It
  found the nine skills — and three more the plan's count missed: `mm-soul`
  (5 non-`soul` lines: `identity get` ×4, `mode deactivate`), `mm-explore`
  (`conversations`), `mm-build` (`mirror log`). Ported commands left on
  Python by the stories that flipped their neighbours. And it found prose:
  `mm-mirror`'s "NEVER produce a response without first running …" line.
- **110 lines across 36 files** moved (plan estimated 89 / 27). The rewrite
  was driven by the checker's own `allowlisted()`, so the rewrite rule and the
  CI rule are one rule. Allowlisted `build load` lines in `mm-explore` and
  `mm-soul` stayed on Python, verified.
- **`PYTHON_ALLOWLIST`** matches token prefixes — `identity edit` permits that
  leaf, not `identity set` — a granularity the plan's wording (`identity edit`
  as a command) would have got wrong at command level.
- **Injected-drift proof, both modes.** One copy reverted: trips the CR071
  disagreement check *and* the allowlist. All three copies reverted together
  (invisible to CR071): trips the allowlist. Restored; checker clean.
  A first attempt at mode 1 used a GNU-only `sed` address on macOS and
  injected nothing — caught because the checker stayed clean when it should
  not have, redone portably. Recorded because a proof that did not inject is
  the sheet-that-measured-nothing class.
- **Both-paths diff (acceptance #4): 6/6 byte-identical** — `tasks list`
  (43,933 bytes), `week view`, `consolidate list`, `shadow list`,
  `conversation-logger status`, `consult credits`. Five answered from TS, the
  last from Python behind the DS8 gate. All `exit=0`.
- The 10-minute ceiling is stated in `mm-consult` and `mm-consolidate`, all
  three copies; `.claude`/`plugins` byte-identity held.
- Checks: skill parity clean (25 skills), doc links clean, ruff clean.

## Validation

**Accepted 2026-09-09** by @viniciusteles.

Route: predict the answering engine from the ledger, then run four skills in a
fresh Pi session sampled by risk rather than convenience — `/mm-mirror` (every
Mirror turn), `/mm-new` (a broken switch misfiles a session), `/mm-tasks`,
`/mm-consult` — plus the CR073 steps, then read `front-door.log`.

**The expected observation was that nothing visible changes**, and nothing did.
That is the acceptance: 110 rewritten invocation lines across four Delivery
Stories' worth of flipped families, and the product behaved identically. The
log is where the change is visible — those four skills previously left **no
line at all**, so absence → presence is the proof the skill entered the front
door rather than calling Python behind it.

**Limits.** Four of twelve repaired skills were exercised live; the remaining
eight rest on the both-paths diff (six invocations, byte-identical) and the
checker. Only the `.pi` copy was run — `.claude` and `plugins/mirror-mind` are
covered by byte-identity and the entry-point assertion, the boundary CR071
accepted. The +160 ms on Python-routed skills was not separately timed in this
session; see Review.

## Review

**Proportionality.** 110 lines across 36 files plus ~60 lines of checker, for a
defect that made four Delivery Stories' flips invisible to skill-driven
sessions. Proportionate, and the checker is the part that lasts. CR071's
rejected alternative — generating the three copies from one source — stays
rejected: the per-runtime differences are deliberate content.

**What the sequencing bought.** Writing the assertion *before* the rewrite
found 21 lines the plan's own count had missed and made the rewrite rule and
the CI rule the same function. Had the rewrite gone first, `mm-soul`'s five
lines, `mm-explore`'s and `mm-build`'s one each would have survived as
agreed-upon Python across all three copies — invisible to CR071 and to a
hand-written scope list.

**Debt — deferred, folded into an existing trigger.** `PYTHON_ALLOWLIST` names
an owner per entry, but nothing checks the entry is still *true*. When US11
flips `journal`, the line must be removed by hand or CI keeps permitting Python
for a command that no longer needs it — the same "truth depends on someone
remembering" class this CR exists to close, one level up. The fix is the design
already named in [CR068](cr068-stop-reporting-unported-llm-gated-leaves-as-burned-down.md)'s
deferred debt: make `routing.ts`'s refusal reasons the single source of
ownership truth, then derive both the ledger's Remainder table and this
allowlist from it, so a stale entry is a failing assertion rather than a
memory. Same revisit trigger, unchanged: **when the last of US11 / TS4 / DS8
lands.**

**Plan item deliberately not completed — recorded, not dropped.** The plan's
validation route asked for the measured `mirror load --query` latency through
the front door. It was not captured, and I am recording `no_action` rather than
chasing it: the quantity CR072 controls is the process-start overhead, already
measured at ~160 ms, and the absolute figure for that command is dominated by
the embedding and reception calls this CR does not touch. The number would
describe the model, not the change. If the daily turn ever feels slower before
DS8, the overhead figure is the one to reason with.

## Outcome

**Done 2026-09-09.** Implemented, validated on the real home, reviewed. Twelve
skills now enter the front door; the four that still reach Python do so through
an allowlist that names the story owning each one.

## Provenance

Found during the CR068 inspection on 2026-09-09, while establishing what
"routed to TS" means for a real session. Captured separately from CR068
because CR068 corrects the ledger's accounting of *unported* leaves and this
corrects the reach of *ported* ones. Not captured under CR071 because CR071 is
done and its scope — copy agreement — was delivered as specified.
