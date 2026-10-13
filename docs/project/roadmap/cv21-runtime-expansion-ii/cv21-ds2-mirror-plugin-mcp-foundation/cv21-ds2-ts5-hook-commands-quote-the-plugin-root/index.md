[< CV21.DS2 Mirror Plugin & MCP Foundation](../index.md)

# CV21.DS2.TS5 — Hook commands quote the plugin root

**Status:** ✅ Done
**Type:** Technical Story
**Delivery Story:** CV21.DS2 — Mirror Plugin & MCP Foundation

---

## Technical Story

In order to ship a plugin that Claude Code's validator accepts without a warning and
that runs from a path with a space,
as the Driver of CV21,
I want every hook command in the plugin to quote `${CLAUDE_PLUGIN_ROOT}`, and every
hook timeout to be the seconds the runtimes read it as,
so that an installed plugin's hooks cannot split into several words, and a hung hook
cannot hold a turn for hours.

## Outcome

`claude plugin validate plugins/mirror-mind` passes with no warnings. The four
commands in `hooks/hooks.json` are `"${CLAUDE_PLUGIN_ROOT}/hooks/<name>.sh"`, and the
checkout's `.claude/settings.json` quotes `$CLAUDE_PROJECT_DIR` the same way. The
`timeout` values are seconds: SessionStart 300, inject 30. A test holds both
properties for every handler either file registers, so a handler added later cannot
regress them.

## Acceptance Behavior

```text
Given the plugin in this working tree
When `claude plugin validate plugins/mirror-mind` runs on Claude Code 2.1.296
Then it passes with no warnings, where it passed with 4 before
And `grok plugin validate plugins/mirror-mind` still passes on Grok 1.0.52

Given the plugin copied under a path with a space
When a hook command runs the way Claude Code runs it, through a shell with
  CLAUDE_PLUGIN_ROOT set
Then the wrapper runs and answers

Given any handler in hooks.json or .claude/settings.json
When the registrations test runs
Then its command is the quoted root-relative path of a wrapper that exists
And its timeout, when set, is an integer of 1 to 300 seconds
```

## Scope

- `plugins/mirror-mind/hooks/hooks.json` and `.claude/settings.json`.
- `ts/test/hooks/hookRegistrations.test.ts`.

## Out Of Scope

- The exec form (`command` + `args`) the validator offers as an alternative: Grok
  skips any handler that sets `args`.
- Grok's 1.5-second bound on a SessionEnd hook without its own `timeout`: DS10's.

## Why These Seconds

Claude Code and Grok read `timeout` in seconds. The plugin carried `15000` on
SessionStart and `30000` on inject, which read as 4 and 8 hours, so no hook ever timed
out. The values were written as milliseconds, as Gemini CLI's settings take them.

- **SessionStart: 300.** The hook runs `conversation-logger session-start`, the full
  session maintenance: stale-orphan closes, Pi backfill, retitling, and extraction,
  each of which can call the LLM, and only then prints the Operating Instructions. The
  15 the old value intended would cut the instructions off on a slow maintenance run.
  300 bounds a hung hook without cutting a working one.
- **Inject: 30.** What the old value intended. The hook runs one `mirror load`.
- **The loggers keep the runtime default** (60 on Claude Code).

## Evidence

Measured on 2026-10-13, Claude Code 2.1.296 (`~/.local/share/claude/versions/2.1.296`)
and Grok 1.0.52 (`~/.grok/downloads/grok-1.0.52-macos-aarch64`):

| # | Finding | How it was measured | Result |
|---|---------|---------------------|--------|
| 1 | The validator passes with no warnings | `claude plugin validate plugins/mirror-mind`, scratch `CLAUDE_CONFIG_DIR` | ✓ `Validation passed`; 4 warnings before the change |
| 2 | Grok still validates the plugin | `grok plugin validate plugins/mirror-mind`, scratch `HOME` | ✓ `hooks, MCP servers` |
| 3 | A quoted command runs from a path with a space | the plugin copied to `…/with space/mirror-mind`, `sh -c "\"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\""` | ✓ the SessionStart JSON with the Operating Instructions |
| 4 | The registrations test fails on the old files and passes on the new | `node --test ts/test/hooks/hookRegistrations.test.ts` | ✓ 4 failures before, 7 passes after |

## Validation

`bash route.sh static` re-runs findings 1 and 2 with the versions recorded. The test
runs with `npm test`.
