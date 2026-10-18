[< Story](index.md)

# Test Guide — CV21.DS8.US3

## Automated Validation

- `node ts/scripts/buildClaudePlugin.ts` first, then `npm test` — the version guard is
  `claudePlugin.test.ts` ("the file in the tree equals the generated text"); it goes red if
  `package.json` moves before the build runs.
- `node ts/scripts/buildClaudePlugin.ts --check` — `plugins/mirror-mind/.claude-plugin/plugin.json`
  carries `0.35.0` from `package.json`.
- `node ts/scripts/checkRetiredSurfaces.ts` — the un-wiring guidance in Getting Started and
  troubleshooting needed no `gemini-cli` exemption.
- `node ts/scripts/checkDocLinks.ts` — the note's links (the decision, DS7.US4, the DS8 package,
  Getting Started) resolve.
- `npx biome check .` — clean.
- `npm run release:doctor -- --target v0.35.0` — read-only preflight. At Validation, on the
  dirty tree: two expected non-passes (tree clean, release tag), everything else green. After
  the release commit, before Done: only the tag warning.
- `mirror runtime release-notes latest --ref HEAD --no-fetch` — the runtime reader renders the
  note from the frontmatter it needs.

## E2E Decision

Not required for the story. The release route — `release:promote`, the trusted publisher's
workflow, the GitHub Release — is the E2E, and it runs after Done on the Navigator's word with
the publish workflow's own checks. `release:doctor` proves the commit will be accepted.

## Navigator Validation

1. Read `docs/releases/v0.35.0.md` as a Gemini CLI user.
   Expected: the cutoff section answers, in order — what no longer exists; why (the decision,
   Google's deprecation, DS7.US4's L4 on agy 1.4.2); what to do instead (`agy plugin install`,
   one step); what still works (Gemini models; `gemini_cli` conversations); what happens if
   you do nothing (the four `mirror-*` entries, the `~/.gemini/skills/` links, Gemini CLI's own
   words where measured); the `v0.34.0` pin.
   Pass: every answer present and sourced, or honestly "not measured". Fail: one missing or
   guessed.
2. Read the Antigravity section of `docs/getting-started.md` and the new troubleshooting entry.
   Expected: a user whose Gemini CLI reports a missing Mirror hook finds how they would know
   they wired it, the four entries to remove, the links, and the pin — without opening a
   release note.
   Pass: found. Fail: not found, or the text names the deleted path.
3. `npm run release:doctor -- --target v0.35.0`
   Expected at Validation: `git tree clean: fail` (the commits do not exist yet) and
   `release tag: warn`, every other check pass. Expected after the release commit: only the tag
   warning. Pass: as expected for the moment it runs. Fail: any other check fails.
4. `git grep -n "0.35.0" package.json plugins/mirror-mind/.claude-plugin/plugin.json docs/releases/index.md`
   Expected: three hits. Pass: three. Fail: a copy lags.
5. `rg -n "v0.35.0" docs/project/roadmap/cv21-runtime-expansion-ii/index.md docs/project/roadmap/cv21-runtime-expansion-ii/cv21-ds8-gemini-cli-sunset/index.md`
   Expected: the DS8 row and the DS8 index read Done with the version.
   Pass: both. Fail: one still reads In Progress.

## Validation Evidence

Driver run, 2026-10-18, on this checkout:

- **Probe 1, Gemini CLI 0.61.0** (`/opt/homebrew/bin/gemini`), scratch `HOME`, run from a
  scratch directory, `GEMINI_CLI_TRUST_WORKSPACE=true`, a placeholder (not a credential)
  `GEMINI_API_KEY` so the CLI starts, `gemini -p "say ok"`. With `SessionStart` registered to
  a command that does not exist: the CLI started, loaded settings, reached the model call
  (which failed on the placeholder key), and printed **nothing** about the hook. Control: the
  same run with a command that exists and writes a marker — the marker was written, so
  `SessionStart` hooks do fire in `-p` mode. **Measured: a registered hook whose command is
  missing is skipped in silence; the session proceeds.** Headless mode; interactive not run.
- **Probe 2, Antigravity 1.4.2**: the plugin installed into a scratch `HOME` (25 skills
  staged), a probe skill written to `~/.gemini/skills/`, then `agy --print`. agy asked for its
  own OAuth login — its login is not a file this checkout can copy (not in
  `~/.gemini/antigravity-cli/settings.json`; DS7.US4's route logged in interactively). **Not
  measured.** `probe-agy-skills.sh` in this package is the re-runnable route (auth URL on turn
  0, two print turns, a verdict line); the note says "not measured" and tells the user to
  remove the links either way.
- `node ts/scripts/buildClaudePlugin.ts` then `npm test`: 3311 tests, 3308 pass, 0 fail, 3
  pre-existing skips. `buildClaudePlugin.ts --check`: in sync (`plugin.json` carries 0.35.0).
- `node ts/scripts/checkRetiredSurfaces.ts`: clean. The literal skills-link command in the
  "how you would know" sentence tripped the `gemini-cli` row once (Getting Started and
  troubleshooting); rephrased to "Gemini CLI's `skills link` command", per the plan's rule —
  no exemption.
- `node ts/scripts/checkDocLinks.ts`: clean (the note's links to the decision, Getting
  Started's Antigravity anchor, and the troubleshooting anchor resolve).
- `npx biome check .`: clean.
- `npm run release:doctor -- --target v0.35.0` on the dirty tree: repository ✓, **git tree
  clean ✗ (expected)**, package version 0.35.0 ✓, release note exists ✓, heading ✓, index
  links v0.35.0 ✓, **release tag: not created yet (expected)**, stable ref: origin/stable
  behind HEAD (the unpushed commits). Re-run after the release commit, before Done.
- `mirror runtime release-notes latest` (this `mirror` is the clone): renders
  `v0.35.0 — Four Runtimes, One Successor` from the frontmatter digest.

One finding outside the plan: D-031 (recorded at US1) duplicates CR142 (captured at
DS4.TS5); the ledger entry now cross-references CR142 and closes with it. Taken to Debt
Review.

Navigator route, observed by the Driver (acceptance is the Navigator's):

1. `docs/releases/v0.35.0.md`, "The Cutoff: Gemini CLI": what you keep; removed; why (the
   decision, the 2026-06-18 deprecation, DS7.US4 on agy 1.4.2); what to do instead (one `agy`
   command, same home); what still works (Gemini models; `gemini_cli` conversations); if you
   do nothing (the silent loss, measured; the four entries by name and event; the links; agy
   "not measured"); the v0.34.0 pin with its consequence.
2. Getting Started's Antigravity section carries "If you used Gemini CLI before this
   version" with how you would know, the four entries, the links, the pin; troubleshooting
   carries "Gemini CLI runs a Mirror hook that no longer exists" first in Contents.
3. The doctor, as above: two expected non-passes, everything else green.
4. `git grep -n "0.35.0" package.json plugins/mirror-mind/.claude-plugin/plugin.json docs/releases/index.md`: three hits.
5. The DS8 index reads "✅ Done — released as v0.35.0, 2026-10-18"; the CV21 DS8 row reads
   Done with the version; the CV21 narrative and tree name v0.35.0.
