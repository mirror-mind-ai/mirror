[< CV21.DS4 Codex Through The Canonical Plugin](../index.md)

# CV21.DS4.US4 — Codex at L4 through the shipped plugin, measured live

**Status:** ✅ Done
**Type:** User Story
**Delivery Story:** CV21.DS4 — Codex Through The Canonical Plugin

---

## User Story

As a Codex user who installed Mirror the way `mirror init` now says,
I want one live session to show that I have what a Claude Code user has — the
skills, the Operating Instructions, Mirror Mode on every turn, the MCP tools, a
session logged as `codex` with its replies, and a clean exit —
So that Codex's parity row reads L4 on evidence, and the wrapper can retire.

## Outcome

One live session on the installed Codex, Mirror installed only through the shipped
marketplace, with the Navigator's real provider key: four turns and two slash
readings. The scratch database afterwards holds one `codex` conversation with the
Mirror question (form stripped), the probe, the MCP question, and their replies, each
with its turn id; the `$mirror-mind:mm:journeys` turn is absent; the session closed
inside Codex's 1 s with the tail deferred, backed up, and no `hooks.log` line; Codex's
log shows the MCP client initialized and the rollout a developer message holding the
Operating Instructions. The next start's maintenance finishes the tail and extracts.
The parity row moves to **L4** with version, binary, and date. One named scope change:
Codex 0.163.0 detaches the TUI on `/quit` and fires SessionEnd when its daemon reaps the
thread 30 minutes later; Mirror gained a safety net (an idle conversation on a session
that outlives its TUI is closed and the session deactivated), a live-binding rule (a
closed conversation is not reopened by `codex resume`), and a not-closed-twice guard.
Proven live twice, the second time by a pre-registered, self-checked route v2.

## Acceptance Behavior

```text
Given Codex 0.162.1 with Mirror installed only through the shipped marketplace,
      a seeded scratch Mirror home, and the Navigator's provider key in the session
When the Navigator runs the four turns and quits
Then the conversation is labelled codex and holds six messages with their turn ids:
     the Mirror question without its form, the probe, the MCP question, and three replies
And the $mirror-mind:mm:journeys turn and its rendering are absent
And the probe reply says the Operating Instructions and the Mirror context were present
And the MCP reply names a seeded journey, reached through tool_search
And the session is inactive within 2 s of ended_at, flagged, backed up, with no
     LLM call at exit and no hooks.log line
And Codex's log shows the mirror-mind MCP client initialized, and the rollout a
     developer message holding the Operating Instructions

Given that database
When the next start's maintenance runs with the key
Then the deferred tail is finished and reported, and the conversation has memories

Given all of the above
Then the parity row for Codex reads L4, with version, binary, and date
```

## Scope

- `route.sh`: `setup`, `live` (with `DS4_US4_DRY=1`), `check`, `finish`, `untouched`,
  `clean`, on DS2's live pattern; the install through the shipped marketplace.
- The evidence in `test-guide.md`; the CV21 index's parity text and DS4 row; one
  decision entry.

## Out Of Scope

- Any code change: a defect found live is a stop condition and a Navigator decision.
- Grok (DS10), Antigravity (DS7), the wrapper's removal (TS5), the plugin cache (TS6).
- The parity matrix across every doc (DS11).

## Validation

Driver: `setup`, a dry `live`, `check` against nothing. Navigator: `live` with the
four turns and two readings, `check`, `finish`, `untouched`. Details in
[plan.md](plan.md) and [test-guide.md](test-guide.md).
