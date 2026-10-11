[< RS010](index.md)

# CR071 — Collapse the triplicated skill command references

**Status:** done
**RS:** RS010
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

Each skill exists three times — `.pi/skills/`, `.claude/skills/`, and
`plugins/mirror-mind/skills/` — with the command invocations written out in
full in each copy. `mm-soul` carries 20 invocations per copy, 60 in total, and
CV22.DS7.US6 had to rewrite all 60 by search-and-replace when `soul` flipped to
the front door.

### Correction, 2026-09-09 (inspection before mutation)

This CR was captured with two claims that turned out to be wrong, and the
correction changes what paying it means.

**"The copies differ only in the frontmatter `name`" is false.**
`.claude/skills/**` and `plugins/mirror-mind/skills/**` are byte-identical
across all 25 skills, so there are TWO variants, not three. `.pi` differs from
them in three systematic ways: the frontmatter name (`mm-soul` vs `mm:soul`),
the Usage section (`.pi` documents all three runtimes, the others only their
own), and the natural-language examples — **Portuguese in `.pi`, English in the
others**. That last one is deliberate content, not duplication to collapse.

**The predicted failure has already happened, across eleven skills.** The CR
treats "a missed copy silently leaves one runtime calling Python" as a risk. It
is the current state:

| Copy | Skills invoking the front door |
|------|-------------------------------:|
| `.pi` | 13 |
| `.claude` | 2 |
| `plugins/mirror-mind` | 2 |

The two are `mm-soul` and `mm-explore` — CV22.DS7.US6 and US7, the only stories
that updated all three copies. Everything flipped before them updated `.pi`
alone.

Eleven skills therefore reach the front door on Pi and call
`uv run python -m memory` directly on Claude Code and the published plugin:
`mm-backup`, `mm-build`, `mm-conversations`, `mm-identity`, `mm-journey`,
`mm-journeys`, `mm-memories`, `mm-recall`, `mm-release-notes`, `mm-seed`,
`mm-welcome`. `.claude/skills/mm-journeys` still runs
`uv run python -m memory journeys` — a command flipped in **DS3**.

Nothing is broken today, because Python answers those commands correctly. What
is broken is the claim: the burn-down's "answers from TS" is true for Pi and
not for the other two runtimes, and nowhere says so. TS-only fixes — TS3's
`diagnose` false alarm, US3's migrate-on-open, the front-door log — never reach
those users.

**And it is a DS10 blocker.** DS10 deletes the Python core. At that moment 24 of
25 skill copies in two of three distributions invoke a module that no longer
exists.

## Expected Behavior

A command's invocation form is written once. A flip updates one place, and the
three runtimes cannot drift apart — or, if they must stay separate files, a
check fails when their command bodies diverge.

## Impact

Rising, and this is the argument for acting rather than tolerating it. Every
remaining CV22 flip pays the same tax: DS7.US7 (`explore`), DS7.US8 (the Builder
tree, the largest skill surface in the product), and DS7.TS4. A missed copy does
not fail any test — it silently leaves one runtime calling Python after the flip,
which is the CR059 defect in a different costume: a route that is flipped in the
routing table but not in what actually invokes it.

## Plan Or Decision

**Decided 2026-09-09** (Navigator: pay now, in full, inside this CR; Driver
@viniciusteles; Delivery `mirror-ts-core`).

**Rejected: generate the runtime copies from one source.** It would have to
model the Portuguese/English examples and the per-runtime Usage sections, which
are legitimate differences. That is a larger machine than the problem needs.

**Chosen: repair the drift, then guard the property that matters.** A guard
alone would turn CI red on its first run, and baselining the known drift would
defeat its purpose, so both land together.

The guarded property is the ENTRY POINT, not the prose. For every command a
skill documents, all three copies must reach it through the same entry point
— front door or Python. Argument spellings are deliberately NOT policed: `.pi`
documents `memories [args]` where `.claude` documents
`memories [--type TYPE] [--layer LAYER] ...`, and forcing those identical would
flatten documentation for no correctness gain.

### Scope

1. Repair the eleven drifted skills in `.claude/skills/` and
   `plugins/mirror-mind/skills/`: switch the invocation prefix from
   `uv run python -m memory` to the front door for exactly the commands where
   `.pi` already does, leaving every argument and all prose untouched.
2. Add `scripts/check_skill_command_parity.py`, asserting two invariants:
   - `.claude/skills/**` and `plugins/mirror-mind/skills/**` are byte-identical;
   - for each skill and each documented command, the entry point agrees across
     all three copies.
3. Wire it into the Docs workflow beside the existing doc-link check.
4. Record the DS10 consequence where DS10 will read it.

### Affected files

- 22 `SKILL.md` files (eleven skills × `.claude` and `plugins/mirror-mind`)
- `scripts/check_skill_command_parity.py` (new)
- `.github/workflows/docs.yml`
- `docs/project/roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/index.md`

### Acceptance

- The check FAILS on the current tree, naming the eleven skills.
- After the repair it passes.
- It fails again when a single invocation is reverted in one copy.
- All three copies of the eleven skills reach the front door.

### Validation

Run the check before the repair (must fail), after the repair (must pass), and
with an injected single-line drift (must fail, naming the skill). Navigator
confirms a `/mm-journeys` invocation still behaves on Pi.

### Exclusions

Argument-spelling differences; the Portuguese/English examples; the per-runtime
Usage sections; generation from a single source; any change to `.pi`; any change
to skills that legitimately call Python because their command is unported.

### Authority boundary

This CR changes documentation and adds a check. It grants no commit, push,
release, or flip authority, and it does not change any routing decision — the
routing table already sends these commands to TS; only the invocations lagged.

## Evidence

CV22.DS7.US6 plateau 7: `uv run python -m memory soul` → front door, 20
invocations replaced in each of three files, verified only by grepping that zero
remained.

### Implementation evidence, 2026-09-09

**Before.** `scripts/check_skill_command_parity.py` written first, and failing
on the untouched tree with eleven named skills:

```text
skill command parity: DRIFT DETECTED
  mm-backup: `backup` disagrees on entry point -> .pi=front-door, .claude=python, plugins/mirror-mind=python
  ... (eleven skills)
```

**Repair.** 22 files, 44 invocations, driven by the `(command, subcommand)`
pairs `.pi` already reaches through the front door — not a blanket replacement.
That distinction is load-bearing: `mm-identity` documents `identity list/get/set`
through the front door and `identity edit` through Python, because `edit` spawns
`$EDITOR` and is an interactive seam kept on Python by design. A blanket `sed`
would have converted it and quietly misdocumented the one command in that skill
that must not move.

The repair pass itself had a defect worth recording, because it is the same
class this CR exists to prevent. Its first key function FILTERED argument tokens
instead of BREAKING at the first one, so `[--limit N]` leaked `N]` into the key
and `conversations [args]` looked like a different command from
`conversations [--limit N]`. Three skills were silently skipped. The check —
which breaks rather than filters — caught it on the next run.

**After.**

```text
skill command parity: clean -- 25 skills agree on every entry point.
```

Front-door coverage moved from 13 / 2 / 2 to **13 / 13 / 13**.

**Guard proven to bite.** Reverting one invocation in one copy fails both
invariants independently:

```text
  mm-journeys: .claude and plugins/mirror-mind copies are not byte-identical
  mm-journeys: `journeys` disagrees on entry point -> .pi=front-door, .claude=python, plugins/mirror-mind=front-door
```

**Checks:** `scripts/check_skill_command_parity.py` clean;
`scripts/check_doc_links.py` clean; wired into the Docs workflow beside the
link check, with the script's own path in the trigger paths so a change to the
checker re-runs it.

## Outcome

The drift is repaired and guarded. Eleven skills that reached the front door on
Pi and Python on Claude Code and the published plugin now agree across all three
copies, and CI fails when a future flip updates one copy and not the others.

What this did NOT do, deliberately: it did not collapse the copies into a
generated artifact, did not touch argument spellings, did not touch the
Portuguese/English examples or the per-runtime Usage sections, and did not
change a single routing decision. The routing table already sent these commands
to TypeScript; only the documented invocations lagged.

What it exposed and handed on: DS10 now carries a
[Skill Invocation Gate](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/index.md#skill-invocation-gate).
This check guarantees the three copies AGREE; it does not guarantee they have
stopped calling Python, and after Python retirement they must. The known residue
is `mm-build` (unported until DS7.US8) and `mm-identity`'s `identity edit`.

Paid inside CV22.DS7.US7's Debt Review as a `pay_now` decision, which the Ariad
runtime held the story open for until it was done.

## Navigator Validation

**Accepted 2026-09-09** by @viniciusteles.

Route: run `/mm-journeys` on Pi in a fresh session — one of the eleven repaired
skills. The expected observation was that **nothing changes**, which is the point:
the repair touched `.claude` and `plugins/mirror-mind` only, so the runtime the
Navigator actually uses must be undisturbed. Confirmed working.

Evidence recorded above is not validation and did not substitute for it: the
before/after check output, the injected-drift proof, and green CI at `b8c9c2d`
establish that the guard bites, not that the product still behaves.

## Review

**Proportionality.** A 130-line checker and a mechanical repair, against a
defect that had already reached two of three shipped distributions and blocks
DS10. Proportionate. The rejected alternative — generating the copies from one
source — would have been a build step modelling deliberate per-runtime
differences, which is a larger machine than the problem.

**Debt introduced.** One: the checker is a fourth thing that knows how a skill
invocation is spelled, alongside the three copies. If the invocation FORM changes
(a different node flag, a different entry path), the checker's two regexes must
change with it. Bounded, and it fails loudly rather than silently — an unmatched
line is simply not checked, which is the weaker failure direction. Recorded, not
deferred to a CR.

**Debt carried forward.** The DS10 Skill Invocation Gate, linked below. This CR
deliberately did not resolve it: `mm-build` cannot leave Python until US8, and
`identity edit` is an interactive `$EDITOR` seam whose disposition is a product
decision, not a port decision.

**Not done, and deliberately.** No copy was collapsed, no argument spelling was
touched, no Portuguese/English example was flattened, and no routing decision
changed.

## Provenance

Found while flipping `soul` in CV22.DS7.US6 plateau 7 and captured at that
story's Debt Review on 2026-09-08.
