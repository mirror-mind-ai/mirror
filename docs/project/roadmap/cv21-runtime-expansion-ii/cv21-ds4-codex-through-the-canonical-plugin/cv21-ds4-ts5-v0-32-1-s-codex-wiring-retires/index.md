[< Parent](../index.md)

# CV21.DS4.TS5 — v0.32.1's Codex wiring retires

**Status:** ✅ Done
**Type:** Technical Story

---

## Technical Story

In order to leave the shipped plugin as the only Codex path,
As the engineering system,
I want the v0.32.1 Codex wiring — the wrapper script, its generated hooks, the
`codex:*` hook family, the JSONL backfill it drove, their guards, and their CI
step — removed from the tree, the tarball, and the docs,
So that a Codex user meets one install (the marketplace plugin) and no document
or guard still ships or names the retired path.

## Outcome

The gate is met: US4 measured Codex at L4 through the shipped plugin, live.
After this story, `scripts/codex-mirror.sh`, `scripts/codex-hooks/`, and the
`codex:*` hook entries no longer exist; the pack-contents guards no longer
require or allow them; CI no longer runs `smoke_codex.sh`; and README, Getting
Started, REFERENCE, and the runtime interface contract name the marketplace
install and nothing else. The Codex JSONL backfill
(`conversation-logger backfill-codex-session`) retires with the wrapper: its
only caller was the wrapper's session-end hook, and the plugin's SessionEnd
fallback (`claudeSessionEnd`) closes the session without reading it — the
condition the Delivery Story set for keeping it is not met.

## Acceptance Behavior

```text
Given US4 proved Codex at L4 through the shipped plugin
When the v0.32.1 Codex wiring is removed
Then the tree holds no scripts/codex-mirror.sh, scripts/codex-hooks/, or
  ts/src/hooks/codex.ts, and the hook entry knows no codex:* name
And the packed tarball neither requires nor allows those files, proven by the
  pack-contents guard and the npm package smoke
And CI runs the remaining runtime smokes without smoke_codex.sh
And backfill-codex-session is no longer a route, a logger subcommand, or a
  documented command
And README, Getting Started, REFERENCE, the runtime interface contract, and
  the architecture doc describe Codex only through the marketplace install
And unrelated DS4 scope (TS6, the plugin cache after an update) remains
  untouched
```

## Scope

- Delete the wrapper surface: `scripts/codex-mirror.sh`, `scripts/codex-hooks/`,
  `ts/src/hooks/codex.ts`, the `codex` case in `ts/src/hooks/main.ts`, and the
  two codex rows in `scripts/generate_hook_wrappers.sh`.
- Retire the Codex JSONL backfill: `backfillCodexSession`, its
  `backfill-codex-session` route and subcommand, its tests and fixtures, and
  `scripts/smoke_codex.sh`, whose only subject it was.
- Remove the guards and CI: the codex entries in `ts/src/guards/packContents.ts`
  and `package.json` `files`, the codex wrapper step in
  `scripts/smoke_npm_package.sh`, and `smoke_codex` in
  `.github/workflows/tests.yml`.
- Update the tests that assert the wrapper surface: `ts/test/hooks/hooks.test.ts`
  (wrapper lists, the Codex wrapper describe), `ts/test/scripts/packContents.test.ts`,
  and the backfill/logger/routing tests that cover the codex cases.
- Update the docs: `docs/getting-started.md`, `REFERENCE.md`,
  `docs/product/specs/runtime-interface/index.md`,
  `docs/product/architecture.md`, and
  `docs/process/development-guide.md` name the marketplace install and the
  remaining smokes only.

## Out Of Scope

- CV21.DS4.TS6 (an updated Mirror reaches Codex's plugin cache).
- The `codex` runtime detection in `ts/src/hooks/runtimeDetection.ts` and the
  plugin's Claude-family hooks: that is the living path, not the retiring one.
- `session-end-pi`, `backfill-pi-sessions`, and `backfill-assistant-messages`:
  other callers and features keep them.
- Historical records (worklog, refinement, roadmap history, shipped release
  notes, the v0.32.0 cutoff document) keep their text.

## Validation

Automated: the full `node --test` suite, the pack-contents guard, and
`scripts/smoke_npm_package.sh` (packs the tree, installs from nothing, no
codex wrapper step). Navigator-visible: a residue sweep
(`git grep` for `codex-mirror`, `codex-hooks`, `codex:session`,
`backfill-codex`) returns only historical records, and the packed tarball
contains no codex wiring file.
