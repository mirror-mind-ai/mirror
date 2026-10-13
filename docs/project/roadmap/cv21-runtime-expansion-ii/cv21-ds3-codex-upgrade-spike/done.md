# Done — CV21.DS3

## Status

Done

## History Action

Codex upgrade spike completed on 2026-06-15 (commit `de538bac`), read-only and
measured on `codex 0.139.0`: hook lifecycle mapped against Mirror's contract,
`UserPromptSubmit` `additionalContext` confirmed as the per-turn injection field,
skill discovery through `.agents/skills/` confirmed, and L4 confirmed reachable.
Renamed from CV21.E3 during the CV21 Ariad taxonomy migration (Epic → Delivery
Story).

## Roadmap Update

CV21.DS3 records that Codex can reach L4 through hooks, with two caveats for the
implementation: `async` hooks are skipped and there is no `SessionEnd`.

## Next Recommendation

The findings describe `codex 0.139.0`. The CV21 index says how they are checked
against the installed version before the Delivery Story that implements them is
pulled.

## Missing Done

- none
