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
2. **The status line, Claude Code.** `route.sh statusline printed` puts the step
   exactly as Getting Started prints it in the route's config directory (logged in by
   `route.sh login`, done). Then two terminals, each with the command `route.sh session`
   prints. In one, `/mirror-mind:mm:build personal-growth`; then one plain turn in the
   other, so its footer refreshes.
   Expected: both footers show `◇ ds11user · …`; only the Builder session's shows
   `■ Builder Mode`, the other `◌ Mirror Mode` (with the sticky journey beside it, as
   the step says). Pass: as expected. Fail: no line, or Builder Mode in the wrong
   footer.
3. **A project's `AGENTS.md`, Claude Code.** The Driver's headless turns, read from
   the API request blobs each transcript records, not from the model's answer:
   `route.sh agents-md` (a project with only `AGENTS.md`), `route.sh agents-md
   beside-claude-md` (the same beside a `CLAUDE.md` that does not import it), and
   `route.sh checkout` (worktrees with and without the import). Any of them can be
   re-run; each prints what the request carried.
   Expected: the evidence below, and the contract's Claude Code section and Getting
   Started saying exactly that, with version and date. Pass: they do, and claim no
   precedence. Fail: a doc claims more than the blobs show.
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

**Navigator, 2026-10-24 — `route.sh login`.** The scratch Claude Code login, in
`$D/claude-login/.claude`, the project folder trusted.

**Driver, 2026-10-24 — steps 2 and 3 measured** on Claude Code 2.1.310
(`~/.local/share/claude/versions/2.1.310`), model `claude-haiku-5-5`, the plugin wired
in the route's config directory (`claude plugin list`: `mirror-mind@skills-dir`
0.36.3, loaded; nothing of the real `~/.claude/skills` listed).

- TS3, from the request blobs: (a) a project with only `AGENTS.md`: the canary in the
  user blob, Mirror's instructions once in the system blob from the plugin's hook;
  (a′) beside a `CLAUDE.md` without the import: the canary absent, Mirror's
  instructions once; (b) a checkout worktree, the plugin unwired: `CLAUDE.md` and the
  imported `AGENTS.md`, one copy, no hook context, 28,443 input tokens; (b′) without
  the import: no copy, 25,033. The tree's hooks ran in (b) and (b′), each session
  logged as `claude_code`. US$ 0.004 a turn.
- US2, three drives of two sessions under `expect`, A running `mirror build load
  personal-growth` from the agent's shell. Drive 1 (the stdin form shown): A's footer
  `Personal Growth on ■ Builder Mode`, B's `◌ Mirror Mode`, the stdin session ids the
  hooks' own. Drive 2: A's prompt was typed before the TUI was ready and lost; its
  three refreshes still showed `CLAUDE_CODE_SESSION_ID` equal to the stdin id. The
  driver now waits for the input footer. Drive 3 (all forms on every refresh): the
  stdin and env forms showed A's Builder Mode and B's Mirror Mode; the plain form
  never showed Builder Mode. `CLAUDE_CODE_SESSION_ID` equal to the stdin id on all 9
  refreshes of drives 2 and 3. Per run 289–872 ms (drive 1), up to 1.75 s with three
  forms in a row under two busy sessions (drive 3), 0.7–1.5 s idle from a shell; Apple
  M3 Pro.
- Found, not fixed: a session that chose no journey shows the global sticky journey
  beside Mirror Mode, the other session's choice. Written in the step.

The cell now carries the step as printed (`route.sh statusline printed`), for step 2.

**Driver, 2026-10-24 — `route.sh untouched`**, 3 passed: the 13 real files and links
as at setup; no `claude_code` or `antigravity` conversation in either real home since
setup (11:24 UTC). The production home's count moved by 16 `pi` conversations,
14:00–14:14 UTC, the Navigator's own sessions. The first `untouched` read the counts
as empty: `sqlite3 -readonly` cannot open a WAL database with no `-shm` beside it, so
the route now falls back to an immutable read-only open, and fails only on a changed
file or on a conversation of the kind its own sessions write.
