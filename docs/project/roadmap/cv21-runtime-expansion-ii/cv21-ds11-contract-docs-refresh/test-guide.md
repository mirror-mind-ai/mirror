[< Story](index.md)

# Test Guide — CV21.DS11

## Aggregate Validation

DS11 is validated as one delivery: the five docs name the same five runtimes, and the
contract's matrix and the architecture give each the same level, every matrix row
sourced with version, binary, and date; a guard test holds that; the two Claude Code
facts (the status line as a user step, a project `AGENTS.md` read natively) are
measured on the installed Claude Code and written where a user reads them; and
`runtime diagnose` and the post-update hint know a stale agy copy of the canonical
plugin.

Automated, before the Navigator route:

```bash
npm run typecheck
npm run lint
npm test
node ts/scripts/checkDocLinks.ts
node ts/scripts/checkSkillCommandParity.ts
```

Written first, and seen failing before the change:

- TS1's guard, `ts/test/scripts/runtimeParityDocs.test.ts`: every doc names the five
  runtimes; one matrix row per runtime with version, binary, date, and record; the
  architecture's levels equal the matrix's.
- TS4's tests, hermetic under a scratch `HOME`: `agy_plugin_copy_behind` for a staged
  `mirror-mind` copy behind the installed version; nothing for current, ahead, or
  absent; the post-update hint with the copy behind; one install command shared by
  `init`, the finding, and the hint.

Checked by eye, because no guard ties them: the finding code `agy_plugin_copy_behind`
in `ts/src/runtime/diagnose.ts`, in REFERENCE's `runtime diagnose` paragraph, and in the
contract's Antigravity wiring row.

## Child Work Packages

- CV21.DS11.TS1
- CV21.DS11.US2
- CV21.DS11.TS3
- CV21.DS11.TS4

## Navigator Validation

The route is `route.sh` in this package. Every live step runs under `DS11_DIR`
(default `/tmp/cv21-ds11`, resolved to its physical path, since `/tmp/…` and
`/private/tmp/…` are two Claude Code logins).

1. **The matrix.** Read the contract's `## Parity Matrix`, then README's "How It
   Works", Getting Started's "How the mirror reaches each runtime", REFERENCE's
   Commands introduction, and architecture §6.
   Expected: five runtimes in every doc; the same level in the matrix and the
   architecture; every matrix row with version, binary, date, and record, or "not
   recorded". Pass: no disagreement, and the guard green. Fail: a doc drops a runtime, a
   level differs, or a cell claims a measurement its record does not hold.
2. **The status line, Claude Code.** `route.sh login claude` once (the Navigator's
   `/login` in the route's config directory, then `/exit`). Then two sessions side by
   side, each opened as the route prints, wired by the printed step; in one,
   `/mm-build` with the scratch journey.
   Expected: each footer shows Mirror's line; under the session-scoped form only the
   Builder session's footer shows `■ Builder Mode`; under the fallback, one session
   and the line. Pass: as expected, and the step's per-run time matches the probe log.
   Fail: no line, or a mode in the wrong footer under the scoped form.
3. **A project's `AGENTS.md`, Claude Code.** The Driver's headless turns (a) and (b),
   read from the transcripts, not from the model's answer.
   Expected: (a) the project file loaded natively and the plugin hook's
   `additionalContext`, both in the transcript; (b) the number of copies of the
   Operating Instructions in a checkout session and the input-token difference with
   and without `CLAUDE.md`'s import. Pass: the contract and Getting Started say exactly
   that, with version and date, and claim no precedence. Fail: a doc claims more than
   the transcript shows.
4. **The agy finding.** In the route's scratch agy `HOME` (this machine has no agy copy:
   `agy plugin list` reports none): the v0.36.2 plugin staged by `agy plugin install`
   from a worktree at v0.36.2; `mirror runtime diagnose` from this tree.
   Expected: `agy_plugin_copy_behind`, 0.36.2 < 0.36.3, with the install command; run
   it; diagnose again, and the finding is gone. Pass: both readings, the text matching
   REFERENCE. Fail: no finding while behind, or a finding after the reinstall.

E2E: steps 2–4 run the real binaries; the matrix is sourced, not re-run.

Cleanup, `route.sh clean`: the scratch directory, both scratch worktrees of this
checkout and the v0.36.2 worktree (`git worktree remove`, then `git worktree prune`),
the scratch Mirror home, the scratch agy `HOME`; the scratch login's
`Claude Code-credentials-<hash>` keychain entry is named for the Navigator to delete.
`route.sh untouched` compares the real `~/.claude` settings, the real Mirror homes'
conversation counts, and `~/.gemini/config/plugins` against the baseline `setup`
recorded.

## Validation Evidence

**Driver, 2026-10-24 — setup and step 4 (TS4).** `route.sh setup`: the baseline (15
entries of the real configuration, the two real homes' conversation counts), Claude
Code 2.1.310 (`~/.local/share/claude/versions/2.1.310`), agy 1.4.7 (`~/.local/bin/agy`),
Mirror 0.36.3 from this tree; the scratch home `ds11user` initialized and seeded with
the `personal-growth` journey; a worktree at v0.36.2. `route.sh agy`, 4 passed: agy
staged the v0.36.2 plugin at `.gemini/config/plugins/mirror-mind/.claude-plugin/plugin.json`
(0.36.2); `mirror runtime diagnose` reported `agy_plugin_copy_behind`, copied 0.36.2 <
installed 0.36.3, with `agy plugin install "<tree>/plugins/mirror-mind"`; that command
replaced the copy (0.36.3), and diagnose reported nothing for agy. v0.36.2 is staged
again for the Navigator's reading. Automated: TS4's tests failed first (the missing
export; the hint `0 !== 1`), then `npm test` 3,458 passed, 0 failed, before TS1's guard
was added.

Steps 2 and 3 wait on `route.sh login` (the Navigator's).
