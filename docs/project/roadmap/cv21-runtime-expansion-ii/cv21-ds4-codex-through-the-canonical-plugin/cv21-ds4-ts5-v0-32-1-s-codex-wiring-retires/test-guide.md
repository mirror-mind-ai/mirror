[< Story](index.md)

# Test Guide — CV21.DS4.TS5

## Automated Validation

- `node --test` — the full suite. The codex cases leave
  `hooks.test.ts` (wrapper lists, the Codex wrapper describe),
  `packContents.test.ts`, `routing.test.ts`, `backfill.test.ts`,
  `loggerCli.test.ts`, and `loggerRuntime.test.ts`; everything that remains
  passes.
- `bash scripts/smoke_npm_package.sh <scratch>` — packs the tree, installs the
  tarball from nothing, exercises `mirror`, `mirror-hook`, and the plugin
  surfaces, with no Codex wrapper step.
- `bash scripts/smoke_gemini_cli.sh`, `smoke_claude_plugin.sh`,
  `smoke_mirror_mcp.sh` — the remaining runtime smokes, unchanged and green.

## E2E Decision

`scripts/smoke_npm_package.sh` is the E2E: it proves the shipped artifact from
nothing. A live `codex plugin add` walk is not repeated — US4 measured Codex at
L4 through the shipped plugin, and this story removes code that path never
touches.

Coverage residue (named, not hidden): step 10 of the npm smoke was the only
automated check that Codex-labeled rows reach the database from the shipped
artifact. After this story that confidence rests on `runtimeDetection.test.ts`
(unit), `smoke_claude_plugin.sh` (the shared Claude-family hook path), and
US4's live measurement. Codex logging is not end-to-end tested after this
story, by decision.

## Navigator Validation

1. Residue sweep —
   `git grep -In "codex-mirror\|codex-hooks\|codex:session\|backfill-codex" -- ':!docs/project' ':!docs/process/worklog.md' ':!docs/releases'`.
   Expected observation: no live matches outside the retired-surfaces guard's
   own seed strings. Pass: zero live matches. Fail: any match in code, guards'
   active paths, CI, or user-facing docs. Then one unfiltered pass
   (`git grep -In "codex-mirror\|backfill-codex"`) read with eyes: every
   remaining match is a historical record, an open-story plan that names the
   retirement itself, or a guard seed.
2. Tarball contents — `npm pack --dry-run`. Expected observation: the file
   list holds `.agents/plugins/marketplace.json` and `plugins/mirror-mind/`,
   and no `scripts/codex-mirror.sh` or `scripts/codex-hooks/`. Pass: both
   absent. Fail: either ships.
3. Docs read one install — open `docs/getting-started.md` and
   `docs/product/specs/runtime-interface/index.md` at their Codex sections.
   Expected observation: two steps, `codex plugin marketplace add "<pkg>"`
   then `codex plugin add mirror-mind@mirror-mind`, and no wrapper
   instruction. Pass: the marketplace install and nothing else. Fail: a
   wrapper step or `backfill-codex-session` survives as a documented command.

## Validation Evidence

Pending implementation and validation.
