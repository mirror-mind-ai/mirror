[< RS010](index.md)

# CR074 — Harden the `week plan` pending file

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

`week plan` writes its proposed items to a fixed path in the system temp
directory, and `week save` reads them back:

```python
# src/memory/cli/week.py
PENDING_FILE = Path(tempfile.gettempdir()) / "mm_week_pending.json"
...
PENDING_FILE.write_text(json.dumps(pending, ensure_ascii=False, indent=2))
```

Four properties combine, none of them a defect alone:

1. **The name is fixed and predictable** — `mm_week_pending.json`, no PID, no
   random suffix, no per-user component.
2. **The contents are personal.** The file carries the user's weekly plan:
   commitments, meeting times, journey slugs, free-text context.
3. **The mode is whatever the umask gives** — `0644` in a default shell.
4. **`write_text` follows an existing symlink.** A pre-created symlink at that
   exact path redirects the write to wherever it points, with the writing
   user's privileges.

**The exposure is platform-dependent, and this CR should not overstate it.**
Measured 2026-09-09 on this machine: `tempfile.gettempdir()` resolves to a
per-user `/var/folders/.../T/` directory whose mode is `0700`, so on macOS the
enclosing directory already prevents both the read and the symlink plant. On
Linux — including CI, and any Linux user of Mirror — `gettempdir()` is
normally `/tmp`, mode `1777`: world-readable, world-writable, sticky. There a
`0644` file with a predictable name is readable by every local account, and the
symlink plant is available to any local user who wins the race to create the
path first.

So: low risk on macOS today, real on Linux, and the difference is invisible
from the code.

## Expected Behavior

The pending file is created so that only its owner can read it, and so that an
attacker-controlled path cannot redirect the write.

- The file is created with mode `0600`, not the ambient umask.
- The write does not follow a pre-existing symlink (create-exclusive, or
  open with `O_NOFOLLOW`, or write to a fresh per-run path).
- Behaviour is unchanged for the ordinary user: `week plan` still hands off to
  `week save` on the same machine, and a stale file from a previous run is
  still consumed or replaced as it is today.

**Both engines change together, and that constraint is the point.** TypeScript
must not tighten this alone: `ts/parity/week_pending_cross_engine.py` proves
that either core can write the file and the other can consume it, which is what
makes a half-flipped `week` safe while `week plan` is replay-gated and `week
save` is not. A TS-only mode or path change would break that proof and, worse,
could leave a user whose `plan` ran on Python unable to `save` on TS.

## Impact

**Low-to-medium, and it is a confidentiality issue rather than an integrity
one for the common case.** Nobody has reported a leak; the file is short-lived,
removed by `week save` immediately after the tasks are created. But it is
written on every `week plan`, it survives indefinitely if the user never runs
`week save`, and its contents are exactly the kind of thing a person would not
expect to be world-readable on a shared machine.

The symlink property is the sharper half: it is a write primitive, not a read
one, and it does not require the attacker to be present when the user runs the
command — only to have created the symlink beforehand.

Related, same family, already recorded: **CR062** (backup archives written
owner-only) fixed the analogous property for the dated zip. This is the same
lesson on a different write path, which is why it lands in RS010 beside it.

## Plan Or Decision

_Pending Navigator selection._ Proposed shape:

1. Decide the mechanism: `0600` plus create-exclusive is the smallest change;
   a per-run filename would also close the race but changes the handoff
   contract between `plan` and `save` and needs more thought.
2. Change Python first, as the oracle, with a test asserting the mode and the
   symlink refusal.
3. Change TypeScript in the same commit, and re-run
   `ts/parity/week_pending_cross_engine.py` — it must stay green, because a
   divergence there is a user-visible break, not a test failure.
4. Consider whether the same treatment is owed anywhere else that writes
   user text to a predictable temp path (a grep, not an assumption).

Boundaries: this CR changes file creation only. It does not change the pending
file's JSON shape, the `plan`/`save` handoff, or any routing decision.

## Evidence

Measured 2026-09-09:

```text
PENDING_FILE          /var/folders/5k/…/T/mm_week_pending.json
default file mode     0o644
temp dir mode (macOS) 0o700   ← per-user, so macOS exposure is low today
```

On Linux `tempfile.gettempdir()` returns `/tmp` (mode `1777`) unless `TMPDIR`
is set, which is the configuration CI uses and the one most Linux users will
have.

The TypeScript side reproduces the Python path deliberately —
`ts/src/planning/weekPending.ts:defaultPendingPath()` uses `os.tmpdir()` — and
the cross-engine harness compares the serialized bytes both directions.

## Outcome

_Pending._

## Provenance

Raised by the security-engineer lens during the CV22.DS7.US11 Plan review
(2026-09-09) as "capture at Debt Review, do not tighten TS alone", and captured
at that Debt Review after the story's validation was accepted. The porting work
did not introduce any of it: `week save` and `week plan` reproduce Python's
existing behaviour, which is exactly why the fix has to be made on both engines
at once rather than quietly improved on the new one.
