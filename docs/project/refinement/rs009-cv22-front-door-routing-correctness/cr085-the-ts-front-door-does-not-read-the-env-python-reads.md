[< Refinement Workbench](../index.md) · [RS009](index.md)

# CR085 — The TypeScript front door does not read the `.env` Python reads

**Refinement Story:** RS009 — CV22 Front-Door Routing Correctness
**Status:** captured
**Driver:** —
**Delivery:** —

## Problem

`python -m memory` loads the repository's `.env` itself, so `MIRROR_USER` (and
anything else declared there) reaches it for free. The TypeScript front door
does not: `node ts/src/frontDoor/cli.ts <command>` answers

```text
Mirror TS front door: Mirror home is not configured. Set MIRROR_HOME or
MIRROR_USER (or pass an explicit MEMORY_DIR/DB_PATH override).
```

unless the caller passes `--env-file=.env`, which every documented invocation in
`AGENTS.md` does.

So the same command, typed at the two engines from the same shell, behaves
differently — one runs, the other refuses. In production this is invisible,
because the runtime harnesses always pass the flag. It becomes visible exactly
where it hurts most: a HUMAN comparing the two engines by hand.

Found during CV22.DS7.TS4's Navigator validation, on the first command of the
route. The Navigator ran the Python half, got output, ran the TypeScript half,
and got a configuration refusal for a home that is plainly configured. The
command sheet was corrected, but the sheet was not the defect — it merely
exposed one.

This is not a TS4 regression: `journeys`, flipped months ago, behaves
identically. It is a property of every TypeScript command, and it has been true
since the front door existed.

## Expected Behavior

Decide, deliberately, which of these the front door owes — the choice is a
product decision, not an implementation detail:

1. **Read `.env` itself**, as Python does, so the two engines resolve a home
   from the same inputs and a hand comparison needs no flag. Closest to parity;
   costs a dotenv read at startup and a decision about precedence (an explicit
   environment variable must still win over the file).
2. **Refuse with the real remedy.** Keep the current resolution, but have the
   message say what actually fixes it in a repository checkout — `--env-file`,
   or `MIRROR_USER=<user>` — instead of naming variables the user believes are
   already set. A human who has `.env` in front of them is told to set something
   that *is* set, as far as they can see.
3. **Document it as the invocation contract** and stop treating any other
   invocation as supported.

Whichever is chosen, the parity claim should be explicit somewhere a person
comparing engines will read, because "same command, same inputs, different
answer" is precisely what the port promises does not happen.

## Impact

Low in production, real in verification.

No user-facing behavior changes: every runtime harness passes the flag, and a
missing home is a refusal rather than a wrong answer — the safe failure. But the
CV22 port is validated by humans running both engines side by side, and this
asymmetry makes the first attempt fail for a reason that has nothing to do with
the port. It cost one validation round trip in TS4 and will cost one in every
story whose Navigator route starts from a clean shell.

It also weakens a claim the migration rests on: that a command means the same
thing on both engines. Here the same command with the same environment does not.

## Plan Or Decision

Not planned. Captured during CV22.DS7.TS4 plateau 7→8 with the Navigator's
explicit authorization, and deliberately not folded into that story: TS4 owns
the extension catalog family, and this belongs to every command.

Option 1 is the one that ends the asymmetry; option 2 is the cheapest honest
improvement if the front door should stay flag-driven. The choice needs a
Navigator decision about whether the TypeScript core reads project files at all
during home resolution.

## Evidence

From the repository root, with `MIRROR_USER=vinicius-ts` present in `.env` and
no mirror variables exported in the shell:

```text
$ uv run python -m memory ext session-export folder list
admin -> /Users/vinicius/Dropbox/Projetos/pi-sessions/admin
...

$ node --no-warnings ts/src/frontDoor/cli.ts journeys
Mirror TS front door: Mirror home is not configured. Set MIRROR_HOME or
MIRROR_USER (or pass an explicit MEMORY_DIR/DB_PATH override).

$ node --env-file=.env --no-warnings ts/src/frontDoor/cli.ts journeys
🚧 **admin** (active)
...
```

`journeys` is used above on purpose: it has been answered by TypeScript for
months, which is what establishes that this is not TS4's.

## Outcome

Open.
