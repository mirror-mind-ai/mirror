[< RS010](index.md)

# CR073 — Refuse a mistyped stdin sentinel in `journey update`

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

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

- `journey update <slug> -stdin` (and `--stdin`, `-­-`, and any argument that
  begins with `-` but is not exactly `-`) exits non-zero with a message naming
  the correct sentinel, and writes nothing.
- The usage string stops teaching the wrong thing. Either spell the sentinel
  unambiguously (`<slug> <content>` / `<slug> -` with a line explaining that
  `-` means stdin), or — preferred, because it removes the sentinel class
  entirely — give `journey update` the `identity set` shape: `--content`, or
  stdin when the flag is absent.
- Empty or whitespace-only content is refused, as `identity set` already
  refuses it.
- Both engines behave identically, and the parity golden pins the refusals.

An argument that begins with `-` is never plausible journey path text. Refusing
it costs nothing and closes the whole near-miss family, including spellings
nobody has thought of yet.

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

_Awaiting Navigator approval; status stays `captured` until approved._

Proposed shape, smallest first:

1. Refuse any content argument matching `^-` that is not exactly `-`, in both
   engines, with a message naming the sentinel. Python first (it is the oracle),
   then TS, red-before-green on both.
2. Add the empty/whitespace guard `identity set` already has.
3. Fix the usage string in both engines and in the `mm-journey` skill copies.
4. Decide whether to converge `journey update` on the `identity set` argument
   shape (`--content` or stdin). This is a CLI contract change, so it needs an
   explicit decision: it would break any existing caller passing content
   positionally. Recommend deciding it here rather than leaving two shapes for
   the same primitive.
5. Golden coverage for each refusal, registered in the drift tripwire.

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

## Outcome

_Pending._

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
