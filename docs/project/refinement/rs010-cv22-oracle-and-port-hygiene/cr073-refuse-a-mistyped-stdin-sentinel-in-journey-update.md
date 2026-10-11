[< RS010](index.md)

# CR073 — Refuse a mistyped stdin sentinel in `journey update`

**Status:** done
**RS:** RS010
**Driver:** @viniciusteles
**Delivery:** `mirror-ts-core`

## Problem

`journey update <slug> <content>` replaces a journey's path text wholesale.
Its stdin sentinel is the single character `-`. Any other string is accepted
as literal content:

```python
# src/memory/cli/journey.py
def cmd_update(journey: str, content: str, *, mirror_home: str | None = None) -> None:
    if content == "-":
        content = sys.stdin.read()
    mem = MemoryClient(db_path=db_path_from_mirror_home(mirror_home))
    mem.set_journey_path(journey, content)
    print(f"Journey path '{journey}' updated.", file=sys.stderr)
```

The usage string both engines print is
`journey update <slug> <content|-stdin>`. It is meant as "content, or `-` for
stdin". It reads as "content, or `-stdin`". A caller who follows the usage
string literally and runs:

```bash
cat journey.md | uv run python -m memory journey update my-journey -stdin
```

destroys the journey path and replaces it with the six-character string
`-stdin`. The command prints `Journey path 'my-journey' updated.` and exits 0.
The piped document is discarded unread.

This happened on 2026-09-09 during the CR068 session, to the `mirror-ts-core`
journey, from exactly that command. It was caught only because the following
command in the same turn was a verification read, and because the previous
value happened to be visible in the session scrollback — the `build load`
surface had printed it minutes earlier. Neither is a control.

Three properties combine into the defect:

1. **The usage string teaches the wrong sentinel.** `<content|-stdin>` is the
   only documentation the command offers, and it is misread naturally.
2. **No sentinel validation.** `-stdin`, `--stdin`, `-`, `—` (em dash from a
   copy-paste), and every other near-miss are silently valid content.
3. **No empty or implausible-content guard.** The sibling write command through
   the *same* upsert primitive, `identity set`, refuses empty content
   (`Error: content is empty.`) and has no sentinel at all — it takes
   `--content` or reads stdin when the flag is absent. Two commands writing the
   same table have different argument designs, and the less safe one has no
   guard.

**Both engines reproduce it.** The TypeScript port is faithful:

```ts
// ts/src/frontDoor/cli.ts:819
if (content === "-") content = readStdinContent();
```

So this is not a port defect and not an oracle drift — parity is intact. It is
a shared product defect that the port copied correctly, which is why it belongs
to port hygiene rather than to routing correctness.

Adjacent, same family, recorded but not this CR's scope: `journey update` also
performs no check that the journey slug exists (documented in the TS route's
own comment), so a mistyped slug silently creates an orphan `journey_path`
row instead of failing.

## Expected Behavior

A near-miss sentinel is refused, not stored.

- `journey update <slug> -stdin` (and `--stdin`, `-s`, `--content`, and any
  other **flag-shaped** argument — `^--?[A-Za-z]` — that is not exactly `-`)
  exits non-zero with a message naming the correct sentinel, and writes
  nothing.

  > **Corrected at Plan review, 2026-09-09.** As captured, this section said
  > *"any argument that begins with `-`"* and asserted that such an argument is
  > *"never plausible journey path text."* That is false: four of the six
  > journey-path rows in the Navigator's database contain markdown lists, and a
  > path written as a list from line one begins with `- `. A guard on `^-`
  > would have refused legitimate content with the same confidence it refuses
  > `-stdin`. The guard is flag-shaped; list-shaped input (`- `, hyphen-space)
  > and an em-dash lead are accepted. The original premise is left visible
  > rather than silently rewritten.
- The usage string stops teaching the wrong thing. Either spell the sentinel
  unambiguously (`<slug> <content>` / `<slug> -` with a line explaining that
  `-` means stdin), or — preferred, because it removes the sentinel class
  entirely — give `journey update` the `identity set` shape: `--content`, or
  stdin when the flag is absent.
- Empty or whitespace-only content is refused, as `identity set` already
  refuses it.
- Both engines behave identically, and the parity golden pins the refusals.

A flag-shaped argument is never plausible journey path text; a list-shaped one
is. Refusing the former costs nothing and closes the near-miss family that
matters — every sentinel typo is a letter after one or two hyphens — without
touching the latter.

## Impact

**Medium-high for a command with no undo.** The write is a full replacement of
a live journey's path text with no confirmation, no dry run, no diff, and a
success message identical to a correct write. The blast radius is one journey's
path, but the recovery route depends on which engine answered:

- **Through the front door (TS):** `withLiveWriteDb` calls `ensureBackup`, so a
  fixed-name pre-write snapshot exists. Recovery is possible, one write deep —
  the next write overwrites the snapshot.
- **Calling Python directly:** no snapshot at all. `cmd_update` opens the client
  and writes. Recovery depends on the last dated `backup` zip, or on the value
  being visible somewhere.

The 2026-09-09 incident took the Python path, so nothing protected it. The
value was recovered from conversation scrollback. Skills and agents are the
likely repeat callers: `mm-journey` documents this command, an agent composing
the invocation from the usage string is precisely the caller that will type
`-stdin`, and an agent is also the caller least likely to notice that the
success message is lying.

No user-visible defect exists today beyond the incident already repaired.

## Plan Or Decision

**Batched with [CR072](../rs009-cv22-front-door-routing-correctness/cr072-route-every-skill-through-the-front-door.md)
(RS009) by Navigator decision, 2026-09-09.** One branch, one Plan — recorded in
CR072 — two CR records, two validations, two closures. Batched because CR072
rewrites skill invocations and this CR fixes a CLI contract that the
`mm-journey` skill documents, so both edit the same skill files.

**Argument-shape decision (step 4 below): recommended NO.** Converging
`journey update` onto `identity set`'s `--content`-or-stdin shape is a breaking
change for any caller passing content positionally, and the guard in step 1
closes the defect without one. The divergence between the two sibling commands
is recorded as accepted. Pending Navigator approval with the batch Plan.

_Approved by the Navigator 2026-09-09 as part of the CR072 batch plan; implementation started the same day._

Proposed shape, smallest first:

1. Refuse any content argument matching `^--?[A-Za-z]` that is not exactly `-`,
   in both engines, with a message naming the sentinel. Python first (it is the
   oracle), then TS, red-before-green on both. List-shaped (`- `) and em-dash
   input are accepted — see the corrected Expected Behavior.
2. Add the empty/whitespace guard `identity set` already has.
3. Fix the usage string in both engines and in the `mm-journey` skill copies.
4. ~~Decide whether to converge `journey update` on the `identity set` argument
   shape.~~ **Decided at Plan review: no.** Breaking for positional callers; the
   guard closes the defect without a contract change. The divergence between
   the two sibling commands is accepted and recorded.
5. Golden coverage for the full accept/refuse matrix (in CR072's plan of
   record), generated from Python, registered in the drift tripwire. **New
   scope:** no `journey update` golden exists today and `src/memory/cli/journey.py`
   is not in `ts/parity/oracle-baseline.json`; both are created here.

Boundaries: this CR changes argument validation and messages. It does not
change what a successful `journey update` writes, does not add confirmation
prompts or a dry run, does not touch the missing slug-existence check, and does
not revisit any routing decision.

## Evidence

Reproduction on the real home, 2026-09-09:

```text
$ cat /tmp/journey-mts.md | uv run python -m memory journey update mirror-ts-core -stdin
Journey path 'mirror-ts-core' updated.

$ python -c "...get_journey_status('mirror-ts-core')['journey_path']"
'-stdin'
```

Previous value, from the `build load` surface earlier in the same session:
`DS7 — Command Burn-Down (10/14; US7–US9, TS4 remain)`. Restored with the
correct invocation (positional content, no sentinel).

Source, both engines:

- `src/memory/cli/journey.py:60` — `if content == "-":`
- `src/memory/cli/journey.py:100` — `Usage: python -m memory journey update <slug> <content|-stdin>`
- `ts/src/frontDoor/cli.ts:819` — `if (content === "-") content = readStdinContent();`
- `ts/src/frontDoor/cli.ts:816` — `Usage: journey update <slug> <content|-stdin>`

Sibling comparison, same `setIdentity` upsert primitive:

- `ts/src/frontDoor/cli.ts:626-628` — `optionValue(args, "--content") ?? readStdinContent()`,
  then `if (!content.trim())` → `Error: content is empty.`
- `src/memory/cli/identity_cmd.py:83-113` — `--content` or stdin, same empty guard.

Grep for the sentinel across both cores returns exactly the two `journey
update` sites, so the pattern is not used anywhere else and fixing it is
local.

## Implementation Evidence (2026-09-09, commit `8097cdd`)

Evidence, not validation. Navigator validation is the route in CR072's Plan.

- **Python first, red-before-green.** 16 tests over the accept/refuse matrix:
  8 failed before the guard (all four flag-shaped refusals, all three empty
  refusals, the usage string), 0 after. The accept cases and the `-` sentinel
  passed before and after — they had to.
- **Golden.** `ts/parity/generate_journey_update_golden.py` drives the real
  `cli.journey.main` on a fresh home per case: 13 cases, 8 refusals, 5
  accepts, byte-exact stderr and post-write path. Regenerate is a no-op.
  Registered in the determinism gate.
- **TS.** 14 golden-driven tests: 8 red before the port — the front door was
  faithfully reproducing the defect, writing `-stdin` and reporting success —
  14 green after. Full TS suite 1719/0.
- **Two things found and corrected in scope:**
  - the TS route exited **2** on the usage path where Python exits **1** — a
    pre-existing parity divergence on a flipped write path, pinned by a test
    that asserted the divergent value. Aligned to the oracle; the golden now
    pins it.
  - `src/memory/cli/journey.py` was never in the oracle-drift tripwire, though
    ported and flipped in DS7.US1. Registered; the baseline gained exactly one
    line and no other sha moved.
- **One planned change not needed:** the `mm-journey` skill already taught `-`
  correctly in all three copies. The only teacher of `-stdin` was the
  command's own usage string — the Mirror read it from the CLI, not the skill.
- **The incident, replayed on a scratch home against Python:**
  `echo "# doc" | journey update probe -stdin` → exit 1, `Error: '-stdin'
  looks like an option, not journey path text. Pass '-' as <content> to read
  it from stdin.`, path unchanged.

## Validation

**Accepted 2026-09-09** by @viniciusteles, as part of the CR072 batch route.

The incident replayed on the real home: `echo "# doc" | journey update
mirror-ts-core -stdin` was refused, exit 1, with the journey path intact —
read back to confirm. The false positive the Plan review caught was proven
absent in the same pass: list-shaped content (`- a` / `- b`) was **accepted**,
exit 0.

Both halves mattered. A guard that only refused would have passed a validation
that only tested refusals; the accept case is what proves the review's
correction was implemented and not merely written down.

**Limits.** Two cases were exercised live, of thirteen in the golden. The rest
rest on the corpus and the drift tripwire, which is the intended division: the
golden grades the matrix, the Navigator grades the incident.

**Residue removed.** Step 4's accept case wrote a real `journey_path` row for
the non-existent slug `cr073-scratch` — test residue from a sheet I authored,
on the production database. Removed after a dated backup
(`memory_20260910_125457.zip`); `journey_path` returned from 7 rows to 6 and
`mirror-ts-core` was verified intact. It also *demonstrated* the adjacent
defect below, on live data, which is why that finding now has evidence rather
than a code reading.

## Review

**Proportionality.** A six-line guard, a 13-case golden, a tripwire
registration, and 16 Python tests for a defect that silently destroyed data
with no undo. The golden looks generous against the guard, but it paid for
itself immediately: it caught the exit-code divergence below, which no test
targeting the sentinel would have found.

**Scope discipline.** The batch stayed inside its boundaries. The one planned
edit that proved unnecessary — the `mm-journey` skill — was dropped rather than
made to justify the plan, and the reason recorded: the skill taught `-`
correctly all along; the command's own usage string was the only teacher of
`-stdin`.

**Debt 1 — exit-code parity is unaudited. Deferred with a trigger.** This CR
found, by accident, that the TS route exited 2 where Python exits 1 on the
usage path — a divergence on a *flipped* command, protected by a test that
asserted the wrong value. Nothing systematically checks exit-code parity across
the ~26 flipped commands; goldens cover it only where a golden exists, and the
oldest flips predate the practice. One divergence found by accident implies
others.

- **Decision:** defer.
- **Revisit trigger:** when **CV22.DS7.US8 is planned**. US8 is the largest
  remaining flip (27 leaves, every one a refusal-heavy lifecycle command), so
  the audit is cheapest as a US8 plan input and most valuable before its
  surface multiplies the problem.

**Debt 2 — `journey update` still accepts a non-existent slug. Deferred with a
trigger.** Named as adjacent-and-out-of-scope at capture; the validation route
then created a live orphan row, so it now has evidence. A mistyped slug writes
a `journey_path` row for a journey that does not exist, silently, exit 0 — the
same silent-acceptance family the sentinel belonged to.

- **Decision:** defer.
- **Revisit trigger:** when **TS4 or US11 next touches journey/identity
  writes**, whichever comes first. Recommend capturing it as its own CR before
  then if the Navigator wants it owned rather than triggered.

## Outcome

**Done 2026-09-09.** Implemented on both engines, validated on the real home
by replaying the incident, reviewed. `journey update` refuses a mistyped
sentinel, refuses empty content, and states the real sentinel in its usage —
and the file is now in the oracle-drift tripwire it was missing from.

## Provenance

Found by making the mistake. During the CR068 session on 2026-09-09 the Mirror
ran `journey update mirror-ts-core -stdin` while fixing the stale journey stage
string, having taken the sentinel from the command's own usage string. The
verify step in the same turn showed the stage unchanged, which exposed the
write; the field then read `-stdin`. Repaired in the same turn, before any
other work.

Captured because the failure is in the command, not only in the caller: a
write path with no undo accepted an obviously malformed sentinel, reported
success, and discarded piped input. The Navigator asked for it to be captured
rather than left as an anecdote.
