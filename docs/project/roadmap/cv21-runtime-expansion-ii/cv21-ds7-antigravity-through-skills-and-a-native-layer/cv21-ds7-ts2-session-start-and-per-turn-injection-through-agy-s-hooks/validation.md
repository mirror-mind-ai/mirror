# Validation — CV21.DS7.TS2

## Status

Passed

## Automated Checks

- node --test: 3292 pass 0 fail (6 agy handler cases incl. the invocationNum!=0 fast path, quiet/unbound session, one ephemeralMessage step, hostile-conversationId inertness, non-JSON stdin, session-start contract; three wrapper form-groups incl. the new agy form; the grown generated hooks.json); npx biome check clean; generate_hook_wrappers.sh --check in sync; the gated wrapper answers {} in 12ms with no Node spawn

Checks status: passed

## E2E

Decision: required

Evidence: Live on agy 1.4.2 in a scratch HOME (route.sh live, evidence committed sanitized). Obs1: hooks.log empty, Mirror handlers ran; capture shows PreInvocation only at invocationNum 0. Obs2: staged-only rules marker quoted by the model. Obs3: agy recorded the injection as type=EPHEMERAL_MESSAGE source=SYSTEM_SDK status=DONE, content=the mirror-load card. Two first-run bugs (shell-vs-symlink shim, false-positive detector) found and fixed. The model-quote sub-check was inconclusive due to agy --print auto-denying a tool permission (headless limitation, orthogonal to injection); the transcript envelope is the proof

## Navigator Validation

Route: 1) hooks.log empty + invocationNum-0-only capture. 2) rules marker quoted (carrier = rules/AGENTS.md; SessionStart fallback not needed, decision 1). 3) transcript step envelope EPHEMERAL_MESSAGE/SYSTEM_SDK/DONE (ephemeral held, no privacy flip, decision 2)

Navigator accepted: yes

Expected observation: Mirror's agy handlers fire without hooks.log failures; injection only at invocationNum 0; the Operating Instructions reach the model; Mirror Mode context reaches the model's trajectory as an ephemeral step once per turn

Pass condition: empty hooks.log, gate holds, rules marker at the model, an EPHEMERAL_MESSAGE injection recorded by agy

Fail condition: a hook failure in hooks.log, injection on every invocation, instructions absent, or a systemMessage persisting identity in agy's trajectory

## Missing Evidence

- none
<!-- ariad-seal sha256:dcda9ab76e120a955f10e831d86471927019e1c9f3bec2dd2424ec043d90c610 — Ariad wrote this file and rewrites it only while this line matches the text above it. Edit the file and Ariad will leave it as it is. -->
