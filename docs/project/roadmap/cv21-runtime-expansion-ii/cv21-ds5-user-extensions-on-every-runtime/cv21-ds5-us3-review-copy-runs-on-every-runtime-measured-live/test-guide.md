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

Measured 2026-10-20, 18:10–21:20 UTC, with `bash route.sh` on `mirror-mind@0.36.0`
packed **from the registry**, its tarball matching the published `dist.integrity`,
installed under a prefix whose path holds a space. Runtimes, from
[`evidence/versions.tsv`](evidence/versions.tsv): claude 2.1.304
(`~/.local/share/claude/versions/2.1.304`, model `claude-opus-5-5`), codex 0.163.0
(`/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`, model not reported by `codex exec
--json`), agy 1.4.3 (`~/.local/bin/agy`, model not reported by `agy --print`), grok
1.0.62 (`~/.grok/downloads/grok-1.0.62-macos-aarch64`, model `grok-4.7`). Claude Code
and agy are newer than TS1's 2.1.296 and 1.4.2; the per-home plugin held on both, and
agy 1.4.3 keeps its login where 1.4.2 did (CR144). Every cell, row by row, is in
[`evidence/table.tsv`](evidence/table.tsv); raw outputs stayed in the scratch directory
and were removed with it.

**Step 0 — setup and probe.** `setup registry` 9 passed: the baseline (848 entries,
the two real homes' conversation counts among them), the registry tarball and its
integrity, the install, `mirror init us3user` and `mirror seed`, the canonical plugin's
steps as `init` printed them. `probe` 5 passed: four runtimes on the `PATH`, every
reader "not listed" on an empty cell.

**Step 1 — the installs.** 6 passed. `review-copy` from `examples/extensions` with its
real body and `hello` from `fixtures/hello/` — the authoring guide's six listings,
extracted verbatim, installing through the shipped package as written. The second
install printed `plugin: mirror-ext-us3user 0.1.2, 2 skills` and four `not wired` lines,
one per runtime, the steps the next step replays.

**Step 2 — the logins.** The Navigator's, once each, in the route's scratch login
directories; each answered `ready` to a probe turn. Grok read its `auth.json` in place.

**Step 3 — the wiring.** On all four, both skills not listed before the printed steps
and listed after: Claude Code through a link read in place (`$CLAUDE_CONFIG_DIR/skills/
mirror-ext-us3user`, the step's `~/.claude` resolved to the cell's config dir); Codex
naming `mirror-ext-us3user:ext-review-copy` and `…:ext-hello` in its prompt; agy staged
both under `~/.gemini/config/plugins/mirror-ext-us3user/`; Grok listing both from
`plugin:mirror-ext-us3user`.

**Step 4 — the live sessions,** each the literal invocation in the runtime's spelling,
one canary per cell:

| runtime | `hello` | `review-copy` | turn classified |
|---|---|---|---|
| Claude Code | `/ext-hello` → `ping: US3-claude-2bee9a` | `/ext-review-copy` → report | ran the command (both) |
| Codex | `$mirror-ext-us3user:ext-hello` → ping | `$mirror-ext-us3user:ext-review-copy` → report | read the listed path; ran the command |
| Antigravity | `/mirror-ext-us3user:ext-hello` → ping | `/mirror-ext-us3user:ext-review-copy` → report | read the listed path; ran the command |
| Grok Build | `/ext-hello` → ping | `/ext-review-copy` → report | read the listed path; ran the command |

No session searched the disk. Two readings kept beside their retries: Grok's first
`review-copy` turn wrote the report and was cut by `--max-turns 6` before its closing
message (exit 1; the cap for `review-copy` is now 10, and the retry passed); Claude's
first `hello` ran under `--output-format json`, which carries no tool calls, so it was
re-run under `stream-json` for a classified turn (both pinged). Grok: US$ 0.30 over four
turns; Claude Code, Codex, and agy on their plans.

**Step 5 — the reads,** each a delta bounded by the next session's before-count: every
`review-copy` session **+1** `consult` call (`google/gemini-2.5-flash-lite`, US$ 0.0004)
and its report at the named path carrying that model id; every `hello` session **+1**
ping carrying its own cell's canary; every extension session **+0** conversations — a
skill invocation is a command turn the logger skips by design (CV21.DS4.TS3). The
interface, from each runtime's probe turn: `claude_code` +1, reply logged, closed at
session end; `antigravity` +1, reply logged, open until session maintenance closes it
as a stale orphan 30 minutes after its last turn; `grok_build` +1 from a TUI probe
(Grok runs no hooks in `-p`, DS10.US3), reply logged, closed; `codex` +1 after the
plugin's hooks were trusted in one interactive session, **the prompt only, open** — the
async Stop and SessionEnd never reached Mirror under `codex exec` (CR152). OpenRouter:
US$ 0.0022 for the five `consult` calls. No evidence file carries the key's value.

**Step 6 — clean, then untouched.** `clean` removed the scratch directory and every
borrowed login and named the keychain entry Claude Code's scratch login left
(`Claude Code-credentials-c0973ed6`, the Navigator's to remove). `untouched` 2 passed:
every entry of the baseline set but one hashes as before, and both real homes'
conversation counts are unmoved (1611, 1309); `~/.claude.json` changed at 23:13:28
local, a time no route Claude session ran at, and names no path of this route — the
write of another Claude process (the desktop app was running); no new
`*AI_Reviews*.html` in the real `~/Downloads`.

**Found, captured, decided by the Navigator: fixed in their own Change Requests.**

- [CR151](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr151-the-transcript-backfill-writes-a-session-s-replies-into-other-sessions-conversations.md)
  — the SessionEnd transcript backfill fills conversations by time window alone; the
  Claude probe's reply was copied into an unrelated open conversation, one a hand-run
  diagnostic (`mirror-hook claude:user-prompt` at 18:17, by the Driver) had left
  reply-less.
- [CR152](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr152-under-codex-exec-the-plugin-s-stop-and-session-end-hooks-never-reach-mirror.md)
  — under `codex exec`, the plugin's async Stop and SessionEnd hooks never reach Mirror.
- [CR153](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md)
  — a home's Pi backfill imports another home's sessions. **The route exposed it on the
  person's own data:** the Claude cell runs on the real `HOME`, and its first session's
  maintenance imported four of the person's Pi sessions written after the scratch
  home's birth and titled them through the provider (seven `conversation_title` calls,
  US$ 0.009); no memories were extracted; the database was `0600` and was deleted by
  `clean`. The route now points every cell's `PI_SESSIONS_DIR` at an empty directory,
  and `verify` asserts the scratch home holds no `pi` conversation — a check this run
  failed, which is how it is known to work.

**The route's own defects, found by running it and fixed in it,** each a reader or a
cell that was wrong while the session was right: the classifier missing a quoted
`find`; the prefix's space split by an unquoted substitution; `wire`'s idempotence
matching "not listed"; Claude's reader not following the skills link; the classifier
reading a `write`'s content as a search, and a `grep consult` as a hunt for the skill;
Claude's and agy's JSON outputs carrying no tool calls (now `stream-json` and agy's
brain transcript); `verify`'s deltas subtracted from now, and the interface counted
since setup rather than since the probe; the Claude cell reading the person's Pi
history; `untouched` reading another process's `~/.claude.json` write as the route's.
