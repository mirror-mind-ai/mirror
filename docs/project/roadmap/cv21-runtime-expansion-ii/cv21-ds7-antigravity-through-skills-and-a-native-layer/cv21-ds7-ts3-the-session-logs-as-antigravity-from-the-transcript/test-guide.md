[< Story](index.md)

# Test Guide — CV21.DS7.TS3

## Automated Validation

- `node --test` — the transcript reader over a fixture captured from the
  installed agy (selects the user turn and the model's final answer by step
  type, composes a multi-step answer into one reply via the shared
  composition helper, preserves order, carries `step_index`); the
  `agy:stop` handler (appends turns past the high-water mark as
  `antigravity` with the reply beside its prompt; a re-fired Stop whose max
  `step_index` has not advanced adds nothing; an absent, empty, or
  unreadable transcript answers the contract and records nothing; a
  `/mirror-mind:mm:*` skill turn is not logged, tested against the USER
  step's real transcript text; the open-append-then-orphan-close lifecycle,
  and that a returning SessionStart closes the prior orphan); the grown
  `hooks.json` `Stop` array and the three-wrapper agy form-group; the full
  suite proving Claude, Gemini, and Codex logging unchanged.
- `npx biome check .`

## E2E Decision

The live route is the E2E: the real agy (1.4.2, `route.sh verify` pins it),
the staged plugin, the real transcript, in a scratch HOME. CI has no agy;
the reader and handler are unit-covered over the captured fixture, the split
US1 and TS2 used.

## Navigator Validation

1. Two turns logged — a two-turn live session in a scratch HOME. The
   scratch Mirror database holds both turns labelled `antigravity`, each
   reply beside its prompt. Pass: both turns, labelled, paired. Fail: a
   turn missing, mislabelled, or a reply unpaired.
2. Idempotent — re-run `agy:stop` against the same transcript. Pass: no new
   rows. Fail: duplicates.
3. The conversation closes and extracts — with
   `MIRROR_STALE_ORPHAN_MINUTES=0` in the scratch, a returning agy
   SessionStart (or session maintenance) closes the prior conversation and
   extracts its memories, inheriting Codex's path and its latency. Pass:
   closed with its metadata. Fail: open with no close path on an agy-only
   machine.

Evidence is sanitized: the step shape and the row labels prove the
behavior; conversation content is never committed.

## Validation Evidence

Pending implementation and validation.
