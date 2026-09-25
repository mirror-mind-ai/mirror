[< Refinement Workbench](../index.md) · [RS010](index.md)

# CR093 — Every documented Mirror invocation names a Python entry point that TS5 deletes

**Refinement Story:** RS010 — CV22 Oracle And Port Hygiene
**Status:** promoted
**Driver:** —
**Delivery:** `CV22.DS10.US3`

## Problem

Effectively every command Mirror documents — to its users, to its agents, and to
extension authors — is written as `python -m memory ...` or `uv run python -m
memory ...`. **CV22.DS10.TS5 deletes `src/memory/`.** On that day every one of
those documented invocations becomes a command that does not exist.

Found on 2026-09-22 during CV22.DS10.TS2's Navigator validation, when the
installed `ext-session-export` skill was observed instructing an agent to run
`uv run python -m memory ext session-export export` — a path that bypasses the
TypeScript front door entirely.

The measured surface, same day:

| Where | Files | Occurrences |
|---|---:|---:|
| `automation/mirror-extensions/*/SKILL.md` | 8 | 93 |
| `extensions/*/SKILL.md` (finances, maestro, testimonials) | 3 | 28 |
| materialized copies in `~/.mirror-minds/vinicius-ts/runtime/skills/pi/` | 6 | 68 |
| this repository's `REFERENCE.md` | 1 | 56 |
| this repository's `.pi/skills/*/SKILL.md` | 1 | 1 |

The materialized copies are not a separate problem — they are generated from
the extension sources — but they are what an agent actually reads at runtime,
so they are where the breakage will be felt.

This was first reported inside TS2's Debt Review as "the ext-* SKILL.md files",
scoped at two files. That sizing was wrong: the grep used `uv run python -m
memory`, and most call sites use the bare `python -m memory` form.

## Expected Behavior

Every documented invocation names an entry point that still exists after the
Python core is deleted, and no documentation instructs an agent to reach around
the front door.

**The blocker is that the replacement does not exist yet.** As of 2026-09-22:

- `ts/package.json` declares no `bin`;
- `mirror-ts`, `mirror-dev`, and `mirror-journey` are Pi *launchers*, not a CLI;
- the only working front-door invocation is `node --env-file=.env
  ts/src/frontDoor/cli.ts …`, which is **relative to a dev checkout**.

Writing that last form into extension documentation would hard-code one
developer's working copy into a different repository, and would be wrong for the
production runtime (`vinicius`, branch `stable`) in any case. It is strictly
worse than the status quo, which is why TS2 declined to do it.

## Impact

None today: `python -m memory` works, and for commands TypeScript has already
strangled the front door is what answers anyway.

The impact is **entirely deferred and entirely certain**. At TS5 the documented
command disappears for every extension, every runtime skill, and every reader of
`REFERENCE.md` at once. The failure mode is the worst kind for a local-first
tool: it does not surface in CI, it surfaces as "my Ads commands stopped
working" on a user's machine, weeks after the change that caused it.

`scripts/check_skill_command_parity.py` guards the `mm-*` skills' entry points
and reports clean, so this class of drift is exactly the kind the project
already believes it is watching for. It is not watching the extension skills.

## Plan Or Decision

Not planned. Captured at TS2's Debt Review (2026-09-22) after the Navigator
chose `pay_now` and the Driver reported that payment was unavailable: there is
no correct command to write until a stable entry point exists.

Natural owner is **CV22.DS10.US3** (npm distribution), which is where a stable
entry point is created — "the Pi, Gemini CLI, Codex, and Claude Code install
paths resolve from it". Rewriting 245 call sites before that entry point is
defined would be doing US3's work with a placeholder.

Worth deciding at the same time, and deliberately not decided here:

1. whether the skill-command parity check should be extended to extension
   skills, so this cannot rot again after it is fixed;
2. whether extension SKILL.md files should name a command at all, or describe
   the capability and let the runtime supply the invocation.

## Evidence

```text
# the observation that started it, in the installed runtime skill
~/.mirror-minds/vinicius-ts/runtime/skills/pi/ext-session-export/SKILL.md:33
  uv run python -m memory ext session-export export

# no stable entry point exists to replace it
$ rg -n '"bin"' ts/package.json
(no output)
$ head -12 "$(command -v mirror-ts)"
# mirror-launch — open Pi in a Mirror runtime (production or a dev clone).

# the guard that already exists for the mm-* skills, and does not cover these
$ uv run python scripts/check_skill_command_parity.py
skill command parity: clean -- 25 skills agree on every entry point.
```

**Progress, 2026-09-24 (CV22.DS10.TS5 plateau 4).** This repository's half is
done: `REFERENCE.md`'s 56 occurrences and every other document in the tree now
name the program `mirror`, the name the front door gives itself (D12), with one
bridge paragraph showing the front-door invocation and a shell alias until an
entry point exists (D14); skills keep the explicit invocation. The extension
template's `SKILL.md` uses the front-door form the TS2 cutoff prescribes, and
the `python-core-mentions` guard row, enforced in CI, fails any new Python
invocation in this repository. The half in the extension repositories
(`automation/mirror-extensions/`, `extensions/`) and their materialized copies
is untouched and remains US3's, as planned above. Status is the Navigator's to
change.

## Outcome

**Promoted 2026-09-25 to CV22.DS10.US3**, by the Navigator in [CV22.DS10.TS5's Debt Review](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-ts5-python-core-deletion/review.md). This repository's half was done at TS5 plateau 4: every documented invocation in Mirror Mind's own docs names `mirror`, `REFERENCE.md`'s 56 Python invocations are 0, and the `python-core-mentions` guard enforces it in CI. The extension repositories' half depends on the npm entry point, which US3 defines. It is item 8 of US3's [inheritance list](../../roadmap/cv22-typescript-core-port/cv22-ds10-python-retirement-npm-distribution/cv22-ds10-us3-npm-distribution/inherited.md).
