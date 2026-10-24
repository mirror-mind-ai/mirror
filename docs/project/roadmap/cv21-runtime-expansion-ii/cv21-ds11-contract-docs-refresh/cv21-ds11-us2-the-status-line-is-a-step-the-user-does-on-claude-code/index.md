[< Parent](../index.md)

# CV21.DS11.US2 — The status line is a step the user does on Claude Code

**Status:** 🟢 Implemented — awaiting DS11's aggregate Navigator validation
**Type:** User Story
**Delivery Story:** CV21.DS11 — Contract & Docs Refresh

---

## User Story

As a Claude Code user of Mirror,
I want one line I add to my Claude Code settings that shows Mirror's status line,
with my session's own mode,
So that I can see the Mirror home, the journey, and the mode I am in, as a Pi user
does, even though the plugin cannot add a status line for me.

## Outcome

The step, measured on Claude Code 2.1.310 (`~/.local/share/claude/versions/2.1.310`),
2026-10-24, and written in Getting Started ("Mirror's status line in Claude Code", under
What's Next, with a pointer from the Claude Code section), REFERENCE, and the contract:

```json
{
  "statusLine": {
    "type": "command",
    "command": "mirror welcome --status-line --session-id $CLAUDE_CODE_SESSION_ID"
  }
}
```

What the route measured, two sessions side by side in the scratch cell, one running
`mirror build load personal-growth` from the agent's shell as `/mirror-mind:mm:build`
does, with a probe running every candidate form on each refresh:

- Claude Code gives the command `CLAUDE_CODE_SESSION_ID`, equal on every refresh (all 9
  recorded in drives 2 and 3) to the `session_id` in the JSON it writes to the command's stdin,
  and to the session the plugin's hooks registered. So the step needs no JSON parsing,
  no `jq`, and no new front-door route (stop condition 1 not reached).
- With `--session-id`, only the session that activated Builder Mode showed
  `Personal Growth on ■ Builder Mode`; the other showed `◌ Mirror Mode` (drives 1 and 3).
  The mode bound to the session that asked for it (stop condition 6 not reached).
- Without `--session-id`, neither footer ever showed Builder Mode: the activation is
  bound to the session, and the plain line reads the global mode. A missing variable
  degrades to that line, exit 0.
- The journey beside Mirror Mode is the global sticky journey: the session that chose
  no journey showed `Personal Growth`, the other session's choice. Written in the step,
  not fixed here.
- Each run is one `mirror` process: 289–872 ms with one form per refresh (drive 1),
  up to 1.75 s while both sessions were busy and the probe ran three forms in a row
  (drive 3); 0.7–1.5 s idle from a shell, on an Apple M3 Pro. Claude Code ran it at a
  session's start and as each turn changed the conversation.
- `mirror` is a `#!/usr/bin/env node` script, so a desktop launch needs both `mirror`
  and `node` reachable; the step says to write their full paths then.

The contract's status line section names Claude Code with the command, the reason it is
a user step (DS12.TS1 static 3 and L7), and the measurement; Codex, Antigravity, and
Grok Build keep "may ignore". `mirror init` prints nothing for it.

## Acceptance Behavior

```text
Given a Claude Code user with the plugin wired
When they add the statusLine step Getting Started prints and open two sessions
Then each footer shows Mirror's line with that session's own mode
And a session that runs /mirror-mind:mm:build shows ■ Builder Mode, the other does not
And the step says what each run costs and what a desktop launch needs
```

## Scope

- The step, measured; Getting Started, REFERENCE, and the contract.

## Out Of Scope

- A status line on Codex, Antigravity, or Grok Build; an `init` step; a front-door
  route that reads the runtime's payload.
- The global sticky journey shown beside Mirror Mode in a session that chose none.

## Validation

The route: `route.sh statusline scoped-env` and `route.sh drive` (the Driver's, under
`expect`), `route.sh read-statusline`; `route.sh statusline printed` and two
`route.sh session` windows (the Navigator's, DS11 test guide step 2).
