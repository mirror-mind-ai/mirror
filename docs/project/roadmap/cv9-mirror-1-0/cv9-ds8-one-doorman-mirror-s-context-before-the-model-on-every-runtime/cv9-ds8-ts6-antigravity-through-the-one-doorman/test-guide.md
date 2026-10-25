[< Story](index.md)

# Test Guide — CV9.DS8.TS6

## Automated Validation

From the repository root:

```bash
node --test ts/test/hooks/agy.test.ts           # 21 tests: the doorman path, the pre-1.4.7 path, Stop, SessionStart
node --test ts/test/hooks/claudeInject.test.ts  # 6 tests: Claude's hook on the shared doorman fixture
node --test ts/test/hooks/*.test.ts ts/test/mirror/doorman.test.ts ts/test/frontDoor/mirrorModeCli.test.ts
npm run typecheck && npm run lint && npm test && git diff --check
bash scripts/smoke_claude_plugin.sh && bash scripts/smoke_mirror_mcp.sh   # the story touches hooks
```

What `agy.test.ts` holds (red before the change, 8 of 21 failing; green after):

- the plugin's explicit form (`/mirror-mind:mm:mirror <q>`) in a conversation no
  `SessionStart` activated gets ONE `systemMessage` step opening with
  `=== mirror context delivered by the runtime for this turn: full`, and the session
  is marked active with the routed persona; the payload's `transcriptPath` names no
  file and `hooks.log` stays empty — the hook reads no transcript;
- after `SessionStart`, the first ordinary turn is the full folder (the refresh), a turn
  in another persona's domain is a delta naming it with one `llm_calls` embedding row,
  and the same domain again carries no persona section;
- a skill turn (`/mirror-mind:mm:build mirror`) answers `{}` and pays no embedding; an
  ordinary turn outside Mirror Mode answers `{}`, writes no row, takes no snapshot; a
  conversation switched to Builder gets `{}`;
- a global Builder stamp does not silence a new conversation: `SessionStart` stamps the
  session's own mode;
- flag- and shell-shaped prompts and ids cannot forge argv or fail the turn — a prompt
  that is exactly `--session-id` is read as the prompt (mutation-checked: with
  `--prompt` first in the argv the test fails);
- a doorman that cannot run answers `{}` and leaves one `hooks.log` line, without the
  prompt (`` `mirror doorman` exited 2 ``);
- `invocationNum != 0` answers `{}` without creating the database, with the field and
  without it;
- without `lastUserInput`, the pre-1.4.7 path's tests stand unchanged: the quiet
  session answers `{}`, an active one gets ONE `ephemeralMessage` step;
- `agy:session-start` sets `mirror_active`, the session's Mirror Mode stamp, and
  `doorman_refresh`, on a fresh and on a returning conversation.

## E2E Decision

required — the live walk on the installed agy is the story's bar. The Driver's isolated
smoke ([evidence/driver-smoke-20261025.md](evidence/driver-smoke-20261025.md)) ran the
headless rows it could reach before the walk; it does not replace it.

## Navigator Validation

### Step by step

About 15 minutes and some 15 agy turns on your plan; with a key, a few cents of
OpenRouter. Nothing touches your real agy or Mirror setup.

1. **Point at the route** (from the repository root):

   ```bash
   ROUTE=docs/project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/route.sh
   bash $ROUTE verify
   ```

   Expect `match` (agy 1.4.7). `DIFFERS` → stop: the probe has to be re-run first.

2. **Start the walk**, with the key for real cost and timing numbers, or without it:

   ```bash
   TS6_OPENROUTER_API_KEY=<your key> bash $ROUTE walk
   bash $ROUTE walk
   ```

3. **Log in, once.** Under `0. log in inside the scratch HOME`, agy prints a URL: open
   it, approve, paste the code back if it asks. It answers `ready`. A fresh HOME also
   gets agy's Terms & data-use screen, which can surface in the middle of the run with
   its data-use box shown checked: choose your own preference if it asks.

4. **Wait** — three to five minutes, nothing to type. Nine turns print
   `llm_calls +N` each; then `READINGS` and `VERDICTS`.

5. **Read the verdicts.** Every line `[PASS]` (4b's PASS is the known limit, seen).
   Any `[FAIL]` → stop and send the output. An `[OBSERVE]` → note it. In `READINGS`,
   note which turns are `signed "◇ …"`: a signature is observed, not a verdict.

6. **Read the timing.** Four lines; with a key, `full` must stay well under 15 s.

7. **Walk the interactive rows.** agy opens. If it asks to trust the workspace or the
   plugin's hooks, accept. Type, one at a time:

   | type | expect |
   |---|---|
   | `/mirror-mind:mm:mirror how should I plan my budget for next year?` | an answer as the mirror, likely signed `◇ demo-finance-coach`; it should not run `mirror mirror load` itself |
   | `What should I plant in my garden this spring, given clay soil?` | signed `◇ demo-garden-planner` |
   | `Should I add compost before planting?` | still signed |
   | `/mirror-mind:mm:build demo-root-active` | the Builder card (it runs `mirror build load`; approve if asked) |
   | `How should I name a function that parses a hook payload?` | a plain answer: no mirror voice, no `◇` (a personal question here would send the model to Mirror on its own: its routing, not a delivery) |

   Then `/quit`.

8. **Read the last printout.** The interactive conversation's readings: one Mirror
   step on each of the first three turns, none on the last two; `hooks.log still
   empty`. Then `CLEANUP`: credential files removed and verified — or, if it found
   none, look in Keychain Access for an Antigravity entry created at this time and
   delete it if it is the scratch login.

9. **Send it back**: the output from `ENVIRONMENT` to the end (synthetic prompts,
   fictional personas, step envelopes — nothing personal), and what you saw in step 7:
   the voice, the signatures, any `mirror mirror load` it ran.

### The walk, row by row

One command, from the repository root; it asks you to log in to agy once inside a
scratch HOME (open the URL it prints, paste the code), then runs the headless rows,
prints the readings and verdicts, times the hook, and opens agy for the interactive
rows:

```bash
bash docs/project/roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/route.sh walk
```

To make the cost and timing rows read real numbers (the doorman's embedding, the full
load's reception — a few cents), give it a key for this run only:

```bash
TS6_OPENROUTER_API_KEY=<key> bash …/route.sh walk
```

The world it builds: the checkout's plugin staged by `agy plugin install`, the
checkout's `mirror-hook` and `mirror` behind `MIRROR_BIN`, a scratch Mirror home with
the synthetic demo database (personas `demo-finance-coach`, `demo-garden-planner`,
`demo-code-reviewer`, routed by keyword; fictional memories), and agy allowed to run
`mirror …` without asking and nothing else. Nothing is read from the tree's `.env` or
`~/.config/mirror/env`; the workdir and the scratch login are removed on exit.

Two bars, kept apart: **step delivered** is the story's (the verdicts); **model signed**
is observed (the readings' `signed "◇ …"` / `unsigned`): agy runs Gemini, and a miss
with the step present and correct is recorded for the prompt engineer.

| # | row | step delivered — pass | observe | fail |
|---|-----|-----------------------|---------|------|
| 1 | explicit form, new conversation | ONE Mirror step (`SYSTEM_MESSAGE`/`SYSTEM_SDK`), `full — answer as the mirror; sign ◇ demo-finance-coach` | the model's own `mirror … load` count (0 expected: the skill trusts the delivered line); signed? | two steps, an ephemeral step, no step, a load by the model |
| 2 | another domain, resumed process | ONE step, `delta (persona: demo-garden-planner …)`; no `doorman_refresh` (no SessionStart on resume) | signed `◇ demo-garden-planner`? | `full` again, wrong persona, no step |
| 3 | later turns, same domain | ONE step each | still signed? | a turn without its step |
| 4a | `/mirror-mind:mm:build demo-root-active`, then an ordinary turn | the skill turn gets no step; the switch lands on this session (its mode reads Builder), and the next ordinary turn gets no step | no mirror voice, no signature | a step on either turn |
| 4b | back to Mirror, another runtime's session touched later, the switch again | the limit, observed: the switch stamps the newer session, this one stays Mirror and still gets a delta — recorded as the known limit (the model's shell cannot name the agy session) | — | the limit not recorded |
| 6 | Stop-hook logging | user = assistant rows as `antigravity`; no `/mirror-mind:` prompt logged | — | unequal; a skill turn logged |
| 7 | `hooks.log` | empty, headless and after the interactive session | — | any line |
| — | cost | `llm_calls` rows per turn, as numbers: with a key, one embedding per delta turn, the full turns' reception and attachment embedding, none on a skill turn; without a key, 0 | — | an embedding on a skill turn or outside Mirror Mode |
| — | timing | the hook's wall time per path, against agy's 15 s `PreInvocation` budget | how close a full turn with a key comes to it | over budget |
| I | interactive: the explicit question, a garden question, one more, the Builder switch and an ordinary question | the readings show one Mirror step per Mirror turn, none after the switch | the voice and the signature as you saw them | a second load, a step after the switch |

Record in the evidence: agy version and binary, the date, whether a key was given;
the verdict lines, the readings (they hold only synthetic prompts, fictional persona
names, and step envelopes), the cost and timing lines, and what you observed in the
interactive session.

## Validation Evidence

**Accepted by the Navigator, 2026-10-25** 
([evidence/walk-20261025.md](evidence/walk-20261025.md)): `route.sh walk` on agy 1.4.7
(`~/.local/bin/agy`), real providers, then the interactive rows.

- Every verdict PASS: one `full` step on each explicit turn; one `delta` step per
  ordinary turn with the persona re-routed, on resumed processes with no
  `SessionStart` refresh; no step on a skill turn or after a switch that landed on
  the session; the 4b limit observed; 6 user and 6 assistant rows as `antigravity`;
  `hooks.log` empty, headless and after the interactive session.
- The model signed every delta turn, on Gemini, headless and interactive; on the
  explicit turns the signature follows the Mirror Mode card (the route's reading looks
  at the first line only and printed "unsigned" there).
- Cost: one embedding per delta turn, one reception per full turn, nothing from the
  doorman on a skill turn; the skill turns' +5 and +2 are `mirror build load`'s own.
- Timing with real providers: quiet 0.23 s, full 0.90 s, delta 0.96–1.02 s, against
  the 15 s budget.
- Interactive row 5: no step (right), and the model loaded Mirror itself from its
  shell after the switch — its own routing; that load cannot name the agy session,
  so the doorman stays silent until the next `/mirror-mind:mm:mirror`. A Debt Review
  finding, with the route's two artifacts.
- The scratch login's token file sat at 1.4.2's location and was removed, verified.

Driver-side, before it:

- `agy.test.ts` 21/21, `claudeInject.test.ts` 6/6 on the shared fixture, both also
  green on a PATH with no `mirror`; the hooks, doorman, and Mirror CLI suites 157
  pass, 1 skipped (a global `mirror-hook` is installed on this machine —
  pre-existing), 0 fail; `npm test` 3524 pass, 0 fail, 3 skipped (the same
  machine condition); `typecheck`, `lint` (one pre-existing warning, in
  `testTempHomes.test.ts`), `git diff --check`, the doc-link, pack-contents,
  plugin-sync, skill-parity, and retired-surface checks clean.
- `smoke_mirror_mcp.sh` passed. `smoke_claude_plugin.sh` fails at its step 6 ("no
  hooks.log line after mirror-hook went missing") **identically with this story's
  code stashed**: the wrapper's fallback search finds the global
  `/opt/homebrew/bin/mirror-hook` (a `mirror-mind` installed on this machine on
  2026-10-25), so nothing is missing. A machine condition the smoke does not detect,
  where the unit test it mirrors skips with that reason; CI has no global install.
  Recorded for Debt Review, not this story's.
- [evidence/probe-20261025.md](evidence/probe-20261025.md): the payload carries
  `lastUserInput` on agy 1.4.7; `systemMessage` persists, `ephemeralMessage` does not.
- [evidence/driver-smoke-20261025.md](evidence/driver-smoke-20261025.md): the shipped
  plugin's hooks inside agy 1.4.7, headless: one `full` step on the explicit form, one
  `delta` step on each resumed turn with the persona re-routed and the model signing
  `◇ demo-garden-planner`, no step on the skill turn, `hooks.log` empty; the hook costs
  about 0.22 s per turn locally.
