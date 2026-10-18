[< Story](index.md)

# Test Guide — CV21.DS8.US2

## Automated Validation

- `npm test` — the guards that hold the copies together: `operatingInstructions.test.ts`
  (AGENTS.md against CLAUDE.md), `claudePlugin.test.ts` (`plugins/mirror-mind/rules/AGENTS.md`
  byte-equal to `AGENTS.md`; the skill copies generated from their sources), and
  `retiredSurfaces.test.ts` with the widened `gemini-cli` row — its seed tests and "is clean
  against this repository".
- `node ts/scripts/buildClaudePlugin.ts --check` — no drift between `.pi/skills/mm-build`,
  `.claude/skills/mm-build`, `plugins/mirror-mind/skills/mm-build`, and between `AGENTS.md`
  and the plugin's `rules/AGENTS.md`.
- `node ts/scripts/checkRetiredSurfaces.ts` — the release tripwire's own check; this is the
  one that refused `v0.32.0` over a sentence in Getting Started.
- `node ts/scripts/checkDocLinks.ts` — the sweep broke no link.

## E2E Decision

Not required. Prose and one guard table change; no runtime behavior moves. The guards and
the tripwire are the end-to-end proof that the tree says one thing everywhere.

## Navigator Validation

1. The Driver's inventory grep, so the two cannot disagree:
   `git grep -In -i "\bgemini\b" -- ':!docs/project' ':!docs/releases' ':!docs/process/worklog.md' | rg -v -i "gemini-2\.5|gemini flash|gemini-3|google/gemini|\| gemini \||consult gemini|gemini.*(family|families|model)|\.gemini-plugin|~/\.gemini/config"`
   Expected: only past-tense history — a lesson ("found live in Gemini CLI"), a "retired by
   CV21.DS8.US1" note, the `gemini_cli` history label — and the guard's own table.
   Pass: no sentence presents Gemini CLI as supported, wired, or an option. Fail: one does.
2. Read `docs/getting-started.md` §1 (subscriptions and harnesses), §6 (wiring), §7 (seed),
   §8 (first session) as a new user.
   Expected: four runtimes; one wiring row each; an "### Antigravity" run section with the
   plugin-form skills; the seed line gives the Antigravity form.
   Pass: no Gemini CLI step anywhere, and nothing said of Antigravity that DS7 did not
   measure. Fail: a Gemini CLI instruction survives, or an Antigravity claim is unsourced.
3. `node ts/scripts/checkRetiredSurfaces.ts`
   Expected: exit 0. Pass: no `gemini-cli` problem. Fail: any.
4. `diff AGENTS.md plugins/mirror-mind/rules/AGENTS.md`
   Expected: empty. Pass: empty. Fail: any difference.
5. `rg -n "gemini" .pi/skills/mm-consult/SKILL.md .pi/skills/mm-help/SKILL.md`
   Expected: the `gemini` model-family rows are still there.
   Pass: present. Fail: a model mention was swept with the runtime.

## Validation Evidence

Driver run, 2026-10-18, on this checkout:

- Guard first: the widened `gemini-cli` row went red on exactly the five documents the
  plan named (Getting Started 186, troubleshooting 687, architecture 61, the
  runtime-interface spec 56, configuration 237); its fixture tests passed as written —
  the routes and the skills link flagged, `~/.gemini/settings.json` and
  `~/.gemini/config/` passing. After the sweep: 50/50, "clean against this repository"
  green.
- `node ts/scripts/buildClaudePlugin.ts --check`: in sync (the build regenerated
  `.claude/skills/mm-build`, `plugins/mirror-mind/skills/mm-build`, and
  `plugins/mirror-mind/rules/AGENTS.md` from their sources).
- `node ts/scripts/checkRetiredSurfaces.ts`: clean, `gemini-cli stayed retired` — the
  release tripwire passes on this tree.
- `npm test`: 3309 tests, 3306 pass, 0 fail, 3 pre-existing skips. Biome clean.
- `node ts/scripts/checkDocLinks.ts`: 2 broken on the clean tree, 1 after. The one fixed
  here was US1's consequence — the CV8.E3 history package *linked* to
  `scripts/smoke_gemini_cli.sh` (the Codex precedent only named its smoke in inline
  code); the link is now inline code with a "retired by" note, the text unchanged. The
  one remaining predates DS8: `plugins/mirror-mind/rules/AGENTS.md:189` carries
  AGENTS.md's root-relative `REFERENCE.md` link, which does not resolve under `rules/`
  (since DS7.US1, 947179ef). Taken to Debt Review.

Navigator route, observed by the Driver (acceptance is the Navigator's):

1. The inventory grep: every remaining match is a past-tense note ("retired by
   CV21.DS8"), a lesson (the spec's "found live in the Gemini CLI integration", the dev
   guide's hooks paragraph), a Gemini model mention, a test about the retirement, or the
   guard's own table. No sentence presents the runtime as supported, wired, or an option.
2. Getting Started: §1 two subscriptions, "these are the subscriptions Mirror's authors
   have used", Antigravity named with its link and no invented row; §6 "two for Codex",
   four wiring rows; §7 the seed line gives the Antigravity form; §8 a "### Antigravity"
   section stating only what DS7.US4 measured (plugin-form skills, rules, once-per-turn
   injection, `antigravity` label, close at the next session start); §9's checklist
   names the four.
3. `node ts/scripts/checkRetiredSurfaces.ts`: exit 0.
4. `diff AGENTS.md plugins/mirror-mind/rules/AGENTS.md`: empty.
5. `.pi/skills/mm-consult/SKILL.md` keeps its `gemini` family rows (18, 37, 65); the
   plugin `mm-help` keeps its families row. (The Pi `mm-help` never had one.)

One line outside the plan's inventory was edited: the wiring table's Antigravity row in
the runtime-interface spec said injection and logging "land with DS7.TS2/TS3" — they
landed; one clause, same row the sweep touched.
