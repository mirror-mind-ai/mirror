[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR211 · The operating instructions bound nothing about a task's size, so a small request can grow into an investigation nobody asked for

## Problem

Two Codex users reported the same behavior on 2026-11-09, paraphrased here:

- **A small implementation.** The person asked for one specific implementation. The
  agent used the whole five-hour usage window and did not finish. Asked why, it agreed
  that it had gone too far, then did the same in new situations.
- **A session-only journey.** The person asked how to set the journey for the current
  session only (CR209), then asked for a skill so the answer would not have to be found
  again. The agent decided to discover, develop, test and plan. The window ran out
  partway through; it had been at 60% used when the request started.
- **A shared screenshot.** The agent, signing `◇ engineer`, says it turned the doubt into
  an excessive investigation, and should have made one targeted lookup or stated the
  limitation. The person had already asked it to check with them first, and that did
  not hold.

Here is what the instructions Mirror ships say about the size of a task:

- **`AGENTS.md`:**
  - The Builder activation boundary covers activation only ("After loading the context
    and required docs, stop and ask what work should be done next"). It says nothing
    once work is authorized.
  - The hard constraint reads "Service: intellectual partner, not task executor.
    Question, refine, align — do not execute without thinking."
- **`mm-build` §4:** "Keep project docs updated as the code evolves" and "Commit at the
  end of each session".
- **The engineer persona template:** "First I clarify the desired behavior, the
  constraints, the existing design, and the smallest useful change", "implement with
  tests whenever behavior changes", and "Keep documentation aligned with runtime
  behavior".

Nothing tells the agent to:

- do what was asked, at the size it was asked;
- make one bounded lookup when the route is unknown, then ask or state the limitation;
- ask before widening into plans, tests, docs or refactors nobody requested.

A correction the person makes in one conversation does not reach the next one.

**Not shown:** that these lines cause the behavior. Neither transcript has been read,
and the runtime's model and its defaults are just as likely a cause.

**Also not the cause:** a recent instruction change. Between v0.36.0 and v0.44.0,
`AGENTS.md`, the skills and the identity templates changed in only two places. In v0.37.0
`mm-mirror` gained the doorman's delivered-line rule, and later two skills gained a
`--file` note.

## Expected Behavior

- `AGENTS.md` carries a short scope rule that every runtime receives:
  - answer the request at its size;
  - a lookup that does not settle in a few steps ends in a question or a stated
    limitation, not a wider search;
  - work beyond the request (plans, tests, docs, refactors) is proposed, not done.
- The generated plugin copy follows.
- The rule is measured before it ships. The same small request runs on a scratch home on
  Codex, before and after, and the tool calls and tokens are counted.

## Impact

This is the behavior both reports describe. Its cost is the person's usage window and
their trust that a small request stays small. Both reporters had to buy usage resets to
keep working.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, from the two reports
above.

Not planned. Before planning, ask the reporters for the transcripts (Codex rollout files
under `~/.codex/sessions/`) and for `mirror mode status`. Those show which instructions
and which mode were in play.

## Evidence

- The reports and the screenshot, as summarized above (shared with the Navigator on
  2026-11-09).
- `AGENTS.md` lines 73–79 (Builder activation boundary) and lines 143–144 (hard
  constraint "Service").
- `.pi/skills/mm-build/SKILL.md` §4, "Work In Builder Mode".
- `templates/identity/personas/engineer.yaml`, `templates/identity/ego/behavior.yaml`.
- `git diff --stat v0.39.0 HEAD -- AGENTS.md .pi/skills plugins/mirror-mind/skills`:
  `mm-identity` and `mm-journey` change (`--file`, CR194), plus the hook wrappers. Byte
  sizes of `AGENTS.md`, `mm-build`, `mm-explore` and `mm-soul` are identical from v0.36.0
  to v0.44.0. `mm-mirror` grew from 3,748 to 4,910 bytes in v0.37.0, for the doorman's
  delivered line.

## Outcome

Pending: captured, not planned.
