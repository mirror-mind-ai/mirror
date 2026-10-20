[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR152 — Under `codex exec`, the plugin's Stop and SessionEnd hooks never reach Mirror

## Problem

The canonical plugin registers its Claude-family hooks for Codex as they are
(CV21.DS12.TS2): `SessionStart` and the inject `UserPromptSubmit` synchronous, the
logging `UserPromptSubmit`, `Stop` (`log-assistant-reply.sh`), and `SessionEnd`
(`log-session-end.sh`) **async**. CV21.DS4.US4 measured Codex at L4 in the TUI, where
the process lives on after each hook fires. Headless `codex exec` was never measured.

Under `codex exec` 0.163.0, with the plugin's hooks trusted, a plain prompt logs its
user turn as `codex` and nothing after it: no reply, no close. Mirror's
`front-door.log` shows two hook calls for the session (session start, user prompt)
and no third or fourth; the backup `SessionEnd` always runs after the close is absent.
Codex itself reports `running async SessionEnd hook synchronously in <cache>/hooks/hooks.json`
as an item of the turn, and the call still never reaches Mirror. The conversation is
left open with a prompt and no reply, its runtime session `active`, until session
maintenance closes it as a stale orphan thirty minutes later.

Which of two causes holds is not yet measured: that `exec` exits before an async
`Stop` runs, or that it runs both hooks under its 1 s bound and kills them before the
front door writes. A probe hook beside the plugin's, as DS4.US4 used, tells them
apart.

## Expected Behavior

A Codex session run headless logs its reply as the TUI does, and closes: or, if `codex
exec` cannot run a hook to completion, the contract says so where a person scripting
Codex reads it, as DS10 documented Grok's ceiling. The likely fix, once the probe says
which cause holds, is registering `Stop` (and `SessionEnd`) synchronously for Codex
with a timeout that fits its bound.

## Impact

Anyone scripting Codex with Mirror — an automation, a cron job, an eval — loses every
reply, and the memory extracted from those conversations sees only prompts. And each
such session leaves exactly the shape [CR151](cr151-the-transcript-backfill-writes-a-session-s-replies-into-other-sessions-conversations.md)
needs: an open conversation with a prompt and no reply, into which the next Claude Code
session's transcript backfill copies its replies. Until CR151 is fixed, the two
compound.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CV21.DS5.US3's live route, at the plan's stop
condition ("a hook that does not log"). Current Focus unchanged.

## Evidence

CV21.DS5.US3 route, 2026-10-20, scratch home from the registry's `mirror-mind@0.36.0`,
codex 0.163.0 (`/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`). The plugin's hooks
trusted in the cell by one interactive session (`[hooks.state]` in the cell's
`config.toml`: trusted hashes for `session_start`, `user_prompt_submit`,
`session_end`, and the rest). Then `codex exec --json "Reply with the single word:
ready."` at 21:10 UTC: Codex answered `ready`; the `codex` conversation holds one user
message and no assistant message, `ended_at` empty, its runtime session `active = 1`;
`front-door.log` shows `conversation-logger` at 21:10:14.134 and 21:10:14.954 and
nothing after; `hooks.log` records no failure. For comparison, Grok's TUI probe the
same evening logged four `conversation-logger` calls and the backup, its conversation
closed with one user and one assistant message.

## Outcome

Open.
