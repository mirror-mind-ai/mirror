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

_Pending Navigator selection._ Proposed shape:

1. Repair the nine skills across all three copies, in the CR071 form, without
   touching argument spellings, the Portuguese/English examples, or the
   per-runtime Usage sections.
2. Extend `check_skill_command_parity.py` with the unported-command allowlist
   assertion; record the allowlist in the script with the owning story per
   entry.
3. Validate the same way CR071 did: a fresh Pi session running one repaired
   skill per family, `front-door.log` showing `ts` with no `fell_back`
   marker, and the expected observation that nothing visible changed.
4. Correct DS10's Skill Invocation Gate residue list (done in the same
   2026-09-09 edit that captured this CR) and the ledger's family rows'
   "routed to TS" footnote once the skills enter.

Boundaries: this CR changes no routing decision and ports nothing. It changes
which engine a skill *reaches*, not which engine a command *has*.

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
