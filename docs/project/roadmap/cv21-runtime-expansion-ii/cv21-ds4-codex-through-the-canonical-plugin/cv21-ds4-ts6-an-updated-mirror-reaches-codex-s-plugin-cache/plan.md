# Plan — CV21.DS4.TS6

## Objective

Make the two health surfaces know the plugin wiring. Codex copies the plugin
into its cache at a version (US1 proved the path:
`$CODEX_HOME/plugins/cache/mirror-mind/mirror-mind/<version>`), so an npm
update leaves that copy behind until the user re-adds it — today nothing
tells them. After this story, `runtime diagnose` reports a stale cache with
the exact command, a successful `runtime update` says the same in its
post-update hints, and the debt US1 carried is paid: diagnose also knows
Claude Code's link (`~/.claude/skills/mirror-mind`) and reports it when it
dangles.

**The measured affordance (recorded here, per the story's gate):** on the
installed Codex 0.163.0, `codex plugin` offers `add`, `list`, `marketplace`,
`remove` — no update verb for a plugin. `codex plugin marketplace upgrade`
refreshes **Git** marketplace snapshots; Mirror's marketplace is **local**
(the package root), so the directory is always current and only the plugin
copy goes stale. The level-up command is therefore the re-add:
`codex plugin add mirror-mind@mirror-mind`. Whether re-add over an existing
cache needs a `remove` first is measured live in the validation route, and
the message says what the measurement shows.

## Scope

**New reader — `ts/src/runtime/pluginWiring.ts`** (final name may settle in
implementation, beside `wiring.ts`):

- `codexPluginCacheState(codexHome, installedVersion)`: reads the versioned
  directories under `plugins/cache/mirror-mind/mirror-mind/`, read-only;
  returns absent / current / behind / ahead (with the newest cached
  version). Versions compare through `compareSemver` (the comparator the
  package strategy's `channel_behind` already uses) — never a string
  sort, which reads `0.33.10 < 0.33.4`. **Ahead is silence**: `runtime
  update` refuses downgrades but `npm install -g mirror-mind@old` does not
  ask, and the person who downgraded on purpose needs no Codex advice from
  the older tree; a test names the case.
- `claudePluginLinkState(claudeHome, installRoot)`: reads
  `skills/mirror-mind` under the given Claude home; returns absent /
  healthy / dangling (link exists, target unreadable). A link that
  *resolves but points at another install tree* (the nvm-prefix-switch
  case) is a **documented silence** in this story: healthy means the
  target reads, and a test records that choice so it is a decision, not a
  hole — a stale-target finding is a one-line amendment to the reader if
  it bites.
- **Strict injection (the CR123/128/137/142 lesson):** both readers take
  their roots as arguments, always. The defaulting — `$CODEX_HOME` else
  `~/.codex`, and the Claude home — happens once, at the diagnose entry,
  from the env the report already carries, never inside the readers. A
  test proves the seam: a fixture home on a machine with a real cache or a
  real link must not see them.
- Pure functions over injected paths, unit-testable without either runtime
  installed.
- The re-add command string: check during implementation whether it can be
  derived from `RUNTIME_WIRING` (`ts/src/runtime/wiring.ts`), so `mirror
  init`'s wiring lines and the diagnose recommendation cannot disagree —
  the CR071 lesson at the string level. If the shapes differ (wiring takes
  a root; the recommendation is rootless), one shared constant for the
  `codex plugin add mirror-mind@mirror-mind` sentence suffices.

**Diagnose — `ts/src/runtime/diagnose.ts`:**

- `codex_plugin_cache_behind` (warning): subject the cache path, detail the
  cached-newest and installed versions, recommendation the measured re-add
  command, repair route the same command. Absent cache: no finding — absence
  of wiring is not drift. Current cache: no finding.
- `claude_plugin_link_dangling` (warning): subject the link path, detail
  where it points, recommendation to relink
  (`ln -s "<pkg>/plugins/mirror-mind" ~/.claude/skills/mirror-mind`) or
  remove. Healthy or absent link: no finding.
- Installed plugin version read from the install tree's
  `plugins/mirror-mind/.claude-plugin/plugin.json`. That file is
  *generated* by `ts/src/guards/claudePlugin.ts` from `packageVersion()`,
  and the guard holds the committed manifest equal to the generated one —
  the sync is already paid for, so plugin.json is the authority, not an
  assumption (0.33.4 today).

**Update — `ts/src/runtime/update.ts`:**

- `postUpdateHints` gains the Codex line for a successful update of any
  install kind whose Codex cache is now behind: one paste-able sentence
  naming `codex plugin add mirror-mind@mirror-mind`. No cache, no line.
- **The hint's version authority is the landed version, not the running
  tree's.** `postUpdateHints` executes in the process that performed the
  update — the old version's code — so comparing the cache against
  `packageVersion()` of the running tree would read a just-staled cache as
  current. The comparison uses the version the update landed, which the
  update pipeline already resolved. A test pins exactly this trap: old
  process at X, update lands Y, cache at X ⇒ the hint fires.

**Docs:**

- `REFERENCE.md`: the diagnose findings list gains the two codes; the
  `runtime update` section names the post-update hint; the existing "a Codex
  user re-installs the plugin" note points at the finding.

**Tests (characterization-first):**

- Unit tests for both readers over fixture trees: absent / current / behind /
  multiple versions / unreadable, dangling and healthy links.
- Diagnose tests: each finding fires on its fixture state and stays
  silent on the empty home, on a current cache, and on an **ahead** cache —
  which also proves the frozen `runtime-diagnose` goldens cannot move
  (their fixture homes hold no Codex cache and no Claude link; the full
  suite is the proof). The strict-injection test proves a fixture home
  cannot see the machine's real `~/.codex` or `~/.claude`.
- `postUpdateHints` tests beside the existing clone-hint cases.

## Non-Goals

- Do not implement sibling roadmap scope (DS4 has no other open story; DS7,
  DS10's runtimes stay untouched).
- Do not run `codex` from Mirror's code — read the filesystem, print the
  command.
- Do not watch, auto-refresh, or mutate Codex's cache or Claude's link.
- Do not edit the frozen `runtime-diagnose` / `runtime-status` goldens.
- Do not extend the welcome card or the status line; diagnose and update are
  the story's two surfaces.

## Acceptance Behavior

```text
Given an installed package whose plugin is at version X
When a Codex cache holds mirror-mind only at versions lower than X
Then runtime diagnose reports codex_plugin_cache_behind, naming the cached
  and installed versions and `codex plugin add mirror-mind@mirror-mind`
And a successful runtime update over that machine state prints the same
  command as a post-update hint
When the cache's newest version equals X, exceeds X, or no cache exists
Then no Codex finding and no hint appear
When ~/.claude/skills/mirror-mind is a link whose target cannot be read
Then runtime diagnose reports claude_plugin_link_dangling with a relink route
And the frozen diagnose goldens are byte-identical, proven by the full suite
```

## Validation Route

Automated:

- `node --test` — the new reader, diagnose, and hint tests; the whole suite
  green proves the goldens did not move.
- `npx biome check .`

Navigator-visible route:

- Observation 1: build a scratch `CODEX_HOME` whose cache holds
  `mirror-mind/mirror-mind/0.1.0/`, run
  `CODEX_HOME=<scratch> mirror runtime diagnose` — pass: the finding names
  0.1.0, the installed version, and the re-add command; fail: no finding or
  a command the installed Codex does not accept.
- Observation 2: live, in a scratch `CODEX_HOME` against the real Codex
  0.163.0, **leading with the version bump** — the claim under test is
  refresh, not idempotence: marketplace add + plugin add from a scratch
  package copy at an old version, bump the copy's version, re-add, watch
  the cache directory change to the new version. Then the same-version
  re-add once, as the secondary recording of idempotent behavior. Pass:
  the cache ends at the bumped version and the message's wording matches
  what worked (including whether a `remove` must precede it); fail: re-add
  refuses and the message misleads.
- Observation 3: `mirror runtime diagnose` on this machine — pass: no
  finding fires on **absence or health** (an absent Codex cache stays
  silent; a real, healthy Claude link stays silent); fail: a finding fires
  with nothing stale.

E2E decision: observation 2 is the E2E — the real Codex against a scratch
`CODEX_HOME`. The npm-package smoke is not extended: the smoke has no codex
binary in CI, and the readers are filesystem-pure and fully covered by unit
fixtures.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV21.DS4.TS6`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected — anything that would mutate Codex's cache or
  Claude's link from Mirror's code.
- plan_rule_conflict.
- failing_required_check_without_clear_fix — in particular, any frozen
  golden moving.
- navigator_decision_needed — the live measurement shows re-add alone does
  not refresh the cache (the message's command would then need `remove`
  first, and the recorded wording changes).

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
