[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR169 — On Antigravity the model's own `mirror` commands cannot name the session: the Builder switch guesses, and a self-started Mirror load leaves the doorman silent

## Problem

agy hands its hooks the `conversationId`, and since CV9.DS8.TS6 the `PreInvocation`
hook names the session to the doorman with it. The commands the model runs from its
own shell name nothing: no variable carries the conversation into agy's command tool
that Mirror reads (Claude Code's `CLAUDE_CODE_SESSION_ID`, Codex's `CODEX_SESSION_ID`,
and the `MIRROR_SESSION_ID` Pi's extension sets were measured by CV9.DS8.TS1; agy was
not). Two consequences, both seen in TS6's walk:

- `/mirror-mind:mm:build <journey>` runs `mirror build load`, which stamps Builder Mode
  on a **guessed** session — the most recently updated one ([CR100](cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md)).
  It is usually the agy conversation, because its Stop handler writes the row every
  turn; when another runtime's session was touched later, the switch lands there, and
  the agy conversation keeps its Mirror deltas.
- After a switch, a personal question can send the model to Mirror Mode on its own: it
  runs `mirror mirror load --query …`, which names no session, so the agy session's own
  stamp stays Builder and the doorman delivers nothing on the turns that follow. The
  model has to load by itself on each turn — the L3 shape — until the next explicit
  `/mirror-mind:mm:mirror`, which the hook sees and which re-enters properly.

## Expected Behavior

A `mirror` command the model runs inside an agy conversation names that conversation,
as it does on Claude Code, Codex, and Pi: the Builder switch stamps this session, and a
self-started Mirror load marks it, so the doorman takes over from the next turn
(DS8's policy rule 3).

## Impact

Medium for Antigravity's mode switches: the Builder boundary and the Mirror re-entry
depend on a guess or on the explicit form. No effect on the explicit form, on ordinary
turns in Mirror Mode, or on any other runtime.

## Plan Or Decision

Captured, unassigned, 2026-10-25, from CV9.DS8.TS6's Debt Review, at the Navigator's
direction. Two routes to weigh, measured first: whether agy's command tool carries a
conversation id in its environment (TS1's question, asked of agy); or a `PreToolUse`
hook on `run_command` whose `overwrite` appends `--session-id <conversationId>` to a
`mirror …` command — agy 1.4.7's hooks document the shallow argument merge, and the
agent is told a hook rewrote the call; TS1 found the same kind of rewrite workable on Pi
and did not choose it. Filed in RS010 beside CR100 and CR101. **Revisit:** the next
Antigravity story, or before release notes describe mode switches on Antigravity.

## Evidence

[TS6's walk](../../roadmap/cv9-mirror-1-0/cv9-ds8-one-doorman-mirror-s-context-before-the-model-on-every-runtime/cv9-ds8-ts6-antigravity-through-the-one-doorman/evidence/walk-20261025.md), agy 1.4.7, 2026-10-25: headless row 4b
(the switch stamped the newer session; this one kept its deltas), and interactive row 5
(after the switch the model ran `mirror mirror load --query "…"` itself and answered
signed; the turn carried no Mirror step, and the session stayed Builder for the doorman).
