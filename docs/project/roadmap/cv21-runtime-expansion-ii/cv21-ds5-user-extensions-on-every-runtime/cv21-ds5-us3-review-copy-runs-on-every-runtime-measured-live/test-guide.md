[< Story](index.md)

# Test Guide — CV21.DS5.US3

## Automated Validation

This story writes no product code; the route and the fixture are the deliverable, and
the live evidence is the test. The checks that must stay green are the ones the
documents, the fixture, and the evidence files can break:

- `npm test` and `node ts/scripts/checkDocLinks.ts`, once, to show the tree is as it
  was.
- `bash route.sh static`: `fixtures/hello/` installs and validates through the
  checkout's `mirror` into a throwaway home (the authoring guide's listings, as
  written, are an installable extension); `turn.js` classifies the two committed
  transcripts under `evidence/classifier/` as a find and a search; `evidence/versions.tsv`
  and `evidence/table.tsv` parse with one row per runtime and per cell; the DS5 index
  row names this story.

The route is a committed script in this story package, as TS1's is, so it re-runs
when a runtime or the package updates. Raw outputs stay under its scratch directory
and are not committed; the summary each step prints is what this file records.

## E2E Decision

Required. The eight live sessions of step 4 are the E2E: a model on each installed
runtime, from the registry's `mirror-mind@0.36.0`, invoking the real `review-copy`
and the guide's `hello` through the per-home plugin and doing their work. The
readers say what a runtime lists; only the session says what the model does.

## Navigator Validation

Every step runs with a scratch `HOME` and each runtime's own home variable
(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME`; agy under the scratch `HOME`), from
an empty project, with `MIRROR_HOME` and `MIRROR_USER` naming the one scratch Mirror
home, and records the version, binary, and date it ran on. The Claude Code cell keeps
the real `HOME` with the route's logged-in scratch config directory (TS1's finding:
the login is keyed to both).

**Step 0 — setup and probe.** `bash route.sh setup`, then `bash route.sh probe`.
Expected observation: `mirror-mind@0.36.0` from the registry under a prefix whose
path holds a space; four runtimes with version, binary, and date; per runtime the
skill reader and the `conversations.interface` the hooks write. Pass: all four present
at the versions the record will carry, the package at 0.36.0. Fail: a binary absent, a
reader that does not run, or a different package version.

**Step 1 — the installs.** `bash route.sh install`. Expected observation:
`review-copy` and `hello` installed into the scratch Mirror home, migrations applied,
the plugin `mirror-ext-us3user` at generation 2 with two skills, and the four `not
wired` lines naming each runtime's step. Pass: both installed, the plugin as stated.
Fail: a refused install, or a plugin that carries one skill.

**Step 2 — the logins.** `bash route.sh login claude`, `login codex`, `login agy`,
once each, the Navigator's, inside the route's scratch login directories; Grok reads
its `auth.json` in place. Expected observation: `bash route.sh live <runtime> probe`
answers `ready` on each. Pass: four `ready`. Fail: a login that does not hold.

**Step 3 — the wiring.** `bash route.sh wire <runtime>`, once per runtime. Expected
observation: the reader says "not listed" for both skills before the steps; the
canonical plugin's steps as `mirror init` printed them, then the extensions plugin's
step as the install printed it; the reader lists `ext-review-copy` and `ext-hello`
after. Pass: both listed on all four. Fail: a step refused for a reason the record
cannot name, or a skill not listed after it.

**Step 4 — the live sessions.** `bash route.sh live <runtime> review-copy` and
`bash route.sh live <runtime> hello`, once per runtime, one retry per miss with both
readings kept; the prompt is the literal invocation in the runtime's spelling with the
skill's own arguments; the agy cell with `--dangerously-skip-permissions`, and as
`live agy <extension> tui` only if that still denies the command, the Navigator driving
the session and the route reading the scratch home afterwards. Expected observation per
session: the before-counts, the runtime's model id, exit 0, and `turn.js`'s reading of
the turn — the skill invoked from context, or a search named as such. Spend: OpenRouter
at most US$ 0.50 for the story (`gemini lite`, one model per session), Grok at most
US$ 1.00; `live` reads both sums and refuses past a cap. Pass: every session has a
reading. Fail: a session that does not start, or a cap reached.

**Step 5 — the reads.** `bash route.sh verify <runtime>`, once per runtime. Expected
observation, per runtime, each a delta against the session's before-count: the
`consult` calls in the scratch ledger from the review-copy session, with model id and
cost; the report file at the path the prompt named, carrying that model id; this
cell's canary in `ext_hello_pings`; the runtime's `interface` on both conversations
(for Antigravity, one open conversation per session until a later start); the
classifier's reading; the two spend sums. Pass: all as stated, or a miss diagnosed into
its kind — skill never loaded, model did the work itself, command ran and failed — with
the measurement. Fail: a read missing with no diagnosis, or an `interface` row missing
for a runtime whose hooks were wired.

**Step 6 — clean, then untouched.** `bash route.sh clean`, then `bash route.sh
untouched`. Expected observation: no process the route spawned still running; the
scratch directory and every borrowed login gone; the keychain entry named if Claude
Code left one; every entry of the real `~/.claude`, `~/.codex`, `~/.gemini`, `~/.grok`,
`~/.agents`, and the `extensions/` and `runtime/` trees of `~/.mirror-minds/vinicius/`
and `vinicius-dev/` hashing as the baseline recorded them; the two real homes'
`conversations` counts unmoved; any new `*_AI_Reviews_*.html` in the real `~/Downloads`
named, never deleted. Pass: zero changed, counts unmoved. Fail: any change, a moved
count, or a credential copy still present.

## Validation Evidence

Pending implementation and validation.
