[< Parent](../index.md)

# CV21.DS4.TS6 — An updated Mirror reaches Codex's plugin cache

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order for a Codex user to keep receiving the Mirror they installed,
As the runtime's own health surfaces,
I want `runtime diagnose` and `runtime update` to know the plugin wiring —
Codex's versioned cache and Claude Code's link — and to say, when the cache
is behind the installed package, exactly which command brings it level,
So that an npm update does not silently leave Codex running last month's
hooks, skills, and MCP entry.

## Outcome

Codex copies the plugin into its cache at a version
(`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<version>`); an npm
update changes the install but not that copy. After this story,
`runtime diagnose` reports the cache as behind when its newest version is
lower than the installed package's, recommending the re-add command the
installed Codex actually offers (0.163.0 has no plugin-update verb:
`codex plugin add mirror-mind@mirror-mind` is the measured route), and a
successful `runtime update` says the same in its post-update hints. The debt
US1 carried is paid: diagnose also knows Claude Code's link and reports it
when it dangles.

## Acceptance Behavior

```text
Given an installed package whose plugin is at version X
When a Codex cache holds mirror-mind only at versions lower than X
Then runtime diagnose reports codex_plugin_cache_behind, naming the cached
  and installed versions and the measured re-add command
And a successful runtime update whose install carries that stale cache names
  the same command in its post-update hints
When the cache's newest version equals X, or no Codex cache exists
Then no Codex finding is reported — absence of wiring is not drift
When ~/.claude/skills/mirror-mind exists but its target does not
Then runtime diagnose reports the dangling link with a repair route
And unrelated Delivery Story scope remains untouched
```

## Scope

- A reader for the plugin wiring state: the Codex cache's versions under
  `$CODEX_HOME` (default `~/.codex`) and the Claude Code link's target.
- Two diagnose finding families: the Codex cache behind the install, and the
  Claude link dangling.
- The post-update hint in `runtime update` for a stale Codex cache.
- REFERENCE's diagnose and update sections name the new findings and hint.
- The live measurement record: what Codex 0.163.0 offers for updating a
  plugin, and that re-add lands the new version in a scratch `CODEX_HOME`.

## Out Of Scope

- Sibling Delivery Story scope; CV21's other runtime stories.
- Running any `codex` command from Mirror's own code: Mirror reads the cache
  directory read-only and prints a command for the person to run.
- Gemini CLI and Pi wiring knowledge: their wiring has no versioned copy.
- The frozen `runtime-diagnose` goldens: their fixture homes carry no Codex
  cache or Claude link, so the recorded scenarios stay byte-identical.

## Validation

Automated: unit tests over fixture `CODEX_HOME` trees and link states; the
full suite proves the frozen diagnose goldens are untouched.
Navigator-visible: a scratch `CODEX_HOME` with an old cached version makes
`runtime diagnose` name the finding and the command; the same tree after the
re-add reports clean; the live re-add is exercised once against the installed
Codex in a scratch `CODEX_HOME`.
