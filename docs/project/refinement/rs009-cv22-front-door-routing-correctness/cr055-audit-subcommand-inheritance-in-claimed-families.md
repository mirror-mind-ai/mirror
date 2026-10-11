[< RS009](index.md)

# CR055 — Audit subcommand inheritance across claimed command families

**Status:** captured
**RS:** RS009
**Driver:** —
**Delivery:** —

## Problem

`routeMemoryCommand` matches on the top-level command. When a family is claimed
for TypeScript, every argv shape under it routes to TS — including subcommands
that were never ported, and including subcommands that do not exist yet.

This shipped once. `conversations append` (v0.31.13) inherited DS7.US1's
listing route:

```text
$ conversations append --format json  < valid request
**2026-09-02** | `c1` [j1] (0 msgs)     # a listing, not a receipt
exit=0                                   # success
messages written: 0                      # silently discarded
```

An external shell calling a published contract received exit 0 and lost its
payload. Fixed for that route in DS7.US5 with a guard and a regression test;
the general shape is unaudited.

## Why it matters

The failure mode is the worst available: no error, success exit code, plausible
stdout, and data loss. It is invisible to anything except reading the routing
table against the current Python command surface. It also grows on its own —
every subcommand main adds under an already-claimed family is a new instance,
which makes this a standing risk for as long as CV22 runs, not a one-off bug.

## Proposed shape

1. Enumerate the current `python -m memory <command> <subcommand>` surface.
2. For each family already routed to TS, list the subcommands it actually
   implements and compare against that surface.
3. For every gap, add an explicit guard routing the unported subcommand to
   Python, with a regression test naming it.
4. Prefer an allowlist per family over a denylist, so the default for an
   unknown subcommand is Python rather than silent inheritance.
5. Record the convention in the burn-down ledger: a family marked done means
   *the subcommands that existed when it was ported*.

## Boundaries

- No new ports; unported subcommands route to Python, they do not get
  implemented here.
- No flip decisions revisited.
- Regression tests are part of the fix, not follow-up work.

## Provenance

Found during CV22.DS7.US5 slice B while inspecting where `conversations append`
routes, and recorded in that story's Debt Review as the item promoted to its own
Change Request.
