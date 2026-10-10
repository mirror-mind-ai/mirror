[< Story](index.md)

# Handoff — CV22.DS10.US3

Written 2026-10-09 at the end of plateau 6, for the next session and for the Mirror that
loads this journey next ([collaboration strategy](../../collaboration-strategy.md)).

## What is now true

- **The repository is the npm package `mirror-mind`** (D2): manifest at the root, a `files`
  whitelist, 467 packed files with the same paths as a checkout, two bins (`mirror`,
  `mirror-hook`) on a shared loader shim that strips types for its own package only (D15).
  `npm pack` → `npm install -g <tarball>` → `mirror init` → `mirror seed` → a migrating open
  → the four runtimes' wrappers → `mirror mcp` → `runtime update --check` with the registry
  shadowed: `scripts/smoke_npm_package.sh`, 68 checks, in CI, no interpreter spawned.
- **Configuration is read by the core**, in one order, nothing overridden: environment,
  `<clone>/.env`, `~/.config/mirror/env` (D3). `init` writes `MIRROR_USER` there, `0600` in
  `0700`, and never reads a key from argv. No invocation passes a flag.
- **Every skill copy says `mirror`** — 399 lines, three copies — and a guard forbids the
  checkout form (D7). The Pi extension spawns the core it ships with, says when `mirror`
  is off the `PATH`, appends `AGENTS.md` when Pi did not load it (D6, D13).
- **Each runtime wires by a counted step** — Pi 1, Claude Code 1, Gemini CLI 2, Codex 2 —
  printed by `init`, verified against each runtime at plateau 3. Claude Code's plugin
  hooks find `mirror-hook` wherever the plugin is copied; the hook window TS5 left is closed.
- **The updater's package lane is complete** (D9, D-026 and D-027 paid); `runtime channel`
  sets the channel per install kind; `status`/`version` print the install; a clone update
  names `npm link` once; `release:promote` runs `npm publish --dry-run` and prints the
  publication step without running it.
- **The Windows Frame and installer are retired** (D4; cutoff; decision entry), held absent by
  the `frame-installer` row; **the DS10 Zero Python gate is satisfied for the shipped
  artifact**: the pack guard grades paths and content, importing the tree guard's list.
- **The documentation says `mirror` and nothing else**; getting started is written for a
  stranger with no checkout and has "Upgrading from a clone"; the briefing's D2/D6/D8 and
  Builder baseline describe the Node core (D11); CR093's other half is a recorded handoff.
- **The plateau-0 capture replays through `mirror` 28/29 identical**, the one difference the
  `Install:` line §E added on purpose (route 4).
- **The thirteen inherited items** are each closed or recorded ([inherited.md](inherited.md)).
- **Nothing is published, tagged, promoted, or bumped.**

## What remains intentionally undone

- Publication, dist-tags, tag, stable promotion, GitHub Release, version bump — the release
  gate, with P2 (the unpublished name) and `--provenance` on its list.
- F1 / P1: the empty `ego/constraints` template makes a fresh `seed` exit 1. The Navigator's
  line to write, before the release.
- CR121's decision (first-run import of the Pi history) — a release precondition.
- The `automation` and `extensions/*` substitutions (CR093): recorded, the Navigator's to run.
- Two candidate CRs: the capture normalizer's BSD `sed` masks (N1); the plugin smoke's
  global-bin isolation (N2, with N3).
- The two plateau-3 options, not built: a Gemini extension; Codex hooks.

## Next

Validation (route 4 is the Navigator's to run; routes 1–3 are accepted), then Debt Review
with the [handoff review](handoff-review.md)'s dispositions, Coherence, Done. After Done,
DS10 collapses (8/8) and CV22 reaches its release gate.

## Evidence

The story index's *Plateau Progress* names each plateau's commits and CI run; the
[test guide](test-guide.md) carries the four routes and their outcomes; the
[handoff review](handoff-review.md) classifies what is left. Verified at `ccf8b1cc`:
typecheck, lint, 3046 tests, the five repository checks, the package smoke, CI green.
