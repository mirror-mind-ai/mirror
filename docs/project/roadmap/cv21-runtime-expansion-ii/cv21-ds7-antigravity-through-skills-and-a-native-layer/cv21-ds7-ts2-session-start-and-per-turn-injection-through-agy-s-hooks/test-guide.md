[< Story](index.md)

# Test Guide — CV21.DS7.TS2

## Automated Validation

- `node --test` — the agy handler units over payload fixtures sourced
  from US1's committed evidence bytes: the `invocationNum != 0` fast path
  (answers `{}`, reaches nothing), the injection at 0 (shape, step type,
  once), the SessionStart contract, the quiet/unbound session answering
  `{}` (one fixture, both faces), the argv/log inertness of payload
  fields (metacharacters, spaces, newlines), and the never-fail posture
  (a throwing handler still exits 0 and records facts, never payload
  text, in hooks.log); the grown `hooks.json` and the two `agy`-form
  wrappers under the committed-equals-generated and form-group guards;
  the full suite proving Claude, Gemini, and Codex hook paths unchanged.
- `npx biome check .`

## E2E Decision

The live route is the E2E: the real agy (1.4.2, `route.sh verify` pins
it), the staged plugin, the real hooks, in a scratch workspace. CI has no
agy binary; the handlers' logic is fully unit-covered and the live route
is scripted in the story's `route.sh`, evidence committed.

## Navigator Validation

1. The handlers fire correctly — one scripted session (`agy --print`,
   else Navigator-run interactive): session-start's record appears in the
   scratch home; the pre-invocation adapter fires at `invocationNum == 0`
   and answers `{}` above it. Pass: both, with capture evidence. Fail: a
   handler missing, firing every invocation, or failing the turn.
2. The instructions carrier is measured, attributably — the marker is
   added to the **staged** rules file after staging (the shipped bytes
   exist in both carriers, so a shipped marker proves nothing), and the
   scratch workspace holds no `AGENTS.md` of its own. Pass: rules carry
   bar 2, recorded. Fail: the SessionStart `systemMessage` fallback flips
   on — recorded as a privacy decision: it persists Mirror context in
   the stored trajectory.
3. The injection reaches the model — with Mirror Mode active, the model
   quotes an injected marker from the `invocationNum == 0` step; the
   marker is unique and added post-staging. The route also records the
   gated wrapper's residual per-invocation cost. Pass: visible at the
   model. Fail: the step type flips (ephemeral → systemMessage), is
   re-measured, and the privacy delta is recorded.

## Validation Evidence

Pending implementation and validation.
