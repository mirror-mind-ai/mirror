[< RS009](index.md)

# CR072 — Route every skill through the front door

**Status:** captured
**RS:** RS009
**Driver:** —
**Delivery:** —

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

_Awaiting Navigator approval; status stays `captured` until approved._

### Scope

**CR072 — skills**

1. Rewrite **89 `uv run python -m memory` invocation lines across 27 files**
   (nine skills × three copies) to the front-door form CR071 established:
   `NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts <command>`.
   Argument spellings, the Portuguese examples in `.pi`, and the per-runtime
   Usage sections are untouched.

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
shares this plan: refuse a content argument matching `^-` that is not exactly
`-`, add the empty guard `identity set` already has, and fix the misleading
`<content|-stdin>` usage string — Python first as the oracle, then TS, then the
`mm-journey` skill copies.

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

### Affected files

- 27 `SKILL.md` files under `.pi/skills/`, `.claude/skills/`,
  `plugins/mirror-mind/skills/`
- `scripts/check_skill_command_parity.py`
- `src/memory/cli/journey.py`, `ts/src/frontDoor/cli.ts` (CR073)
- `.pi/skills/mm-journey/SKILL.md` + two copies (CR073 usage string)
- goldens and tests for the CR073 refusals; `ts/parity/oracle-baseline.json`
- `docs/.../burn-down-ledger.md`, DS10 index note

### Acceptance

1. No skill copy in any runtime invokes `uv run python -m memory` for a command
   outside the allowlist.
2. The checker fails on injected drift for **both** new failure modes: a skill
   reverted to Python off-allowlist, and copies that disagree.
3. `journey update <slug> -stdin` exits non-zero, writes nothing, and names the
   correct sentinel — on both engines, proven red-before-green.
4. `journey update <slug> ""` is refused on both engines.
5. A correct `journey update` and a correct piped `-` are unchanged.
6. Every repaired skill still produces its previous output.

### Validation route (Navigator)

Same prediction-then-observation shape CR068 used, with its three guards (log
delta exact, every `exit=0`, engine column discriminates):

1. Run one repaired skill per engine class in a fresh Pi session — one
   TS-routed (`/mm-tasks`) and one Python-routed (`/mm-consult`) — and confirm
   the visible output is unchanged.
2. `front-door.log` gains one line per invocation, correct engine, `exit=0`.
   Before this CR those calls left **no** log line at all, which is itself the
   observation: absence → presence proves the skill entered.
3. `journey update mirror-ts-core -stdin` is refused with the journey path
   intact — read it back to confirm. This is the incident replayed.
4. Injected-drift proof for the checker.

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

## Outcome

_Pending._

## Provenance

Found during the CR068 inspection on 2026-09-09, while establishing what
"routed to TS" means for a real session. Captured separately from CR068
because CR068 corrects the ledger's accounting of *unported* leaves and this
corrects the reach of *ported* ones. Not captured under CR071 because CR071 is
done and its scope — copy agreement — was delivered as specified.
