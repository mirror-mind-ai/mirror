[< RS010](index.md)

# CR065 — Make parity fixture generators hermetic by construction

**Status:** captured
**RS:** RS010
**Driver:** —
**Delivery:** —

## Problem

Every parity generator and probe hand-rolls its own environment hygiene, and
the same class of defect has now appeared four times across three stories.

`memory.config` walks upward for a `.env` and applies it with
`os.environ.setdefault` **at import time**. A generator that clears ambient
variables before importing `memory` therefore has them quietly restored by the
import it was clearing them for. The failure is silent in both directions: the
generator produces a corpus, and the corpus looks fine.

Observed instances:

- **CV22.DS7.US10 slice D (2026-09-07).** `generate_session_composite_golden.py`
  ran the real extraction pipeline; the summary embedding went live through the
  developer's `OPENROUTER_API_KEY` and quarantined in CI without one. The
  committed golden was correct but had been produced with network access.
- **CV22.DS7.TS3 plateau 3a (2026-09-08).** `generate_runtime_status_golden.py`
  resolved the **developer's real mirror home** and wrote its absolute path,
  live extension list, and database state into a committed golden.
- **CV22.DS7.TS3 plateau 3b (2026-09-08).** The diagnose generator and the
  lifecycle smoke would have made a live OpenRouter call from
  `probe_model_pins`, because a *deleted* `OPENROUTER_API_KEY` comes back from
  `.env`. Setting it **empty** is what actually suppresses it.
- **CV22.DS7.TS3 plateau 5 (2026-09-08).** The `welcome_status_line`
  real-DB-copy probe overrode `MEMORY_ENV` on the TypeScript side while the
  oracle read the ambient value. `MEMORY_ENV` moves both the status line's
  environment segment and the database *name* the mode segment looks for, so
  the two cores answered about different files. It passed locally, where
  nothing was set and both fell into production by accident, and **failed in
  CI**, which is the only reason it was caught.

Each was fixed where it was found. The pattern was not.

## Expected Behavior

A generator or probe cannot silently depend on the machine that runs it.

- Ambient clearing happens **after** the `memory` import, or the helper makes
  the ordering impossible to get wrong.
- A generator **refuses to write** when a leak indicator is present, rather
  than writing a corpus that looks plausible. The two guards written by hand in
  TS3 are the shape: refuse if the unconfigured-home scenario resolved a real
  home; refuse if the model-pin probe returned findings, which can only mean it
  reached the network.
- A probe reads **the same environment the oracle read**. Overriding it grades
  something the oracle never did.

## Impact

The blast radius is not test flakiness, it is committed artifacts and privacy.
A leaked golden carries a real person's absolute paths, installed extension
list, and database state into version control. A generator that reaches the
network produces a corpus nobody can reproduce, and turns an offline
determinism gate into a lie. A probe that overrides the environment reports
`match: true` for a comparison that was never made.

Three of the four were caught by hand. The fourth escaped to CI. Nothing
guarantees the fifth is caught at all.

## Plan Or Decision

Extract one shared helper for `ts/parity/` — clearing the ambient key set,
callable before *and* after the import with the post-import call being the one
that matters, plus a `refuse_if_leaked()` assertion generators run before
writing. Adopt it in every generator, replacing the hand-rolled blocks. For
probes, state the rule explicitly in the development guide: a probe never
overrides an environment variable the oracle read.

Consider whether the guard can be made structural rather than conventional —
for example, generators writing through a wrapper that refuses when a
configured mirror home, a live API key, or an unexpected `MEMORY_ENV` is
visible at write time.

## Evidence

_Pending._

## Outcome

_Pending._

## Provenance

Captured at CV22.DS7.TS3's Debt Review on 2026-09-08, after the fourth
instance was caught by CI rather than by review. The three TS3 fixes are in
`generate_runtime_status_golden.py`, `generate_runtime_diagnose_golden.py`,
`conversation_lifecycle_smoke.ts`, and `realDbCopyParity.ts`; the US10
instance is recorded in the DS7 burn-down ledger's 2026-09-07 entries.
