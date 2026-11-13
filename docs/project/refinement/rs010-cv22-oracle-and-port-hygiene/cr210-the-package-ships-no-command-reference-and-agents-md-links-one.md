[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR210 · The installed package ships no command reference, and the operating instructions link a `REFERENCE.md` that is not there

## Problem

Since CV22.DS10.US3 made the repository the package (2026-10-05), the `files` field in
`package.json` ships `AGENTS.md`, `README.md`, `docs/releases`, the skills and `ts/src`.
It does not ship `REFERENCE.md`, and it ships nothing else from `docs/`.

The installed runtimes receive `AGENTS.md` as their operating instructions: Claude Code
and Codex through the plugin's SessionStart hook, Antigravity as the plugin's rules, and
Pi through the extension. Its last line, `Full command reference:`, links to a relative
`REFERENCE.md`.
In an install, that file exists neither in the package nor in the person's project.

What an agent can learn about commands in an installed 0.44.0:

- **`mirror --help`:** the 31 command families, one line each, with no subcommands or
  flags (1,904 bytes).
- **`<command> --help`:** not safe to probe on a write command (CR109).
- **On disk:** 327 TypeScript files (2.8 MB) and 804 KB of release notes. Six of those
  notes name Python's `MemoryClient`, which was deleted in v0.32.

So any task that needs a Mirror command no skill names sends the agent into the source
or the release notes. In one report, that is what happened: the agent found the Python
`MemoryClient` first, then went looking for its TypeScript equivalent (CR209).

## Expected Behavior

- An installed runtime can answer "which command does X" from something the package
  ships that is smaller than the source. That is either the reference itself or a
  compact command index (each family's subcommands and flags) that the instructions
  point to.
- The reference link in `AGENTS.md` resolves in an install, or names a command that
  prints the reference. The generated plugin copy follows.

## Impact

Every command lookup outside the skills costs a search through the source. That is a
token cost and a source of wrong answers: the Python API in old release notes reads as
current to a model that finds it.

## Plan Or Decision

Captured, unassigned, 2026-11-09, at the Navigator's direction, from investigating two
reports from Codex users whose small requests used up a five-hour usage window.

Not planned.

## Evidence

- `package.json` `files`: `bin`, `lib`, `ts/src`, `templates`, `docs/releases`,
  `.pi/extensions`, `.pi/skills`, `.claude/hooks`, `plugins/mirror-mind`,
  `.agents/plugins`, `AGENTS.md`, `README.md`, `LICENSE`. There is no `REFERENCE.md`.
  Introduced by `ef282869` (2026-10-05, "US3 plateau 1 (D1, D2): the repository is the
  package").
- The installed package `/opt/homebrew/lib/node_modules/mirror-mind`, 0.44.0, installed
  on 2026-11-09, holds `AGENTS.md`, `README.md`, `docs/releases/` (804 KB), `ts/src/`
  (327 `.ts` files, 2,772,004 bytes) and no `REFERENCE.md`.
- `AGENTS.md:189` and `plugins/mirror-mind/rules/AGENTS.md:189`:
  `Full command reference:` with a relative link to `REFERENCE.md`. The link checker
  reads a link inside inline code as a real one (CR110), so it is not quoted here.
- `grep -rl MemoryClient docs/releases` in the install finds `v0.8.0.md`, `v0.10.0.md`,
  `v0.10.6.md`, `v0.16.1.md`, `v0.32.0.md` and `pending-cutoffs.md`.
- `mirror --help` (0.44.0) prints families only, 1,904 bytes.

## Outcome

Pending: captured, not planned.
