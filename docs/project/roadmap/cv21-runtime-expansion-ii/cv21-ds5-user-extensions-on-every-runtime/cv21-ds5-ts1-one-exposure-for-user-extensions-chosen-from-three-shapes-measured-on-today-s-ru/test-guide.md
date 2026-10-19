[< Story](index.md)

# Test Guide — CV21.DS5.TS1

## Automated Validation

This story writes no product code, so it adds no test. The checks that must stay green
are the ones its two documents and its fixtures can break:

- `node ts/scripts/checkDocLinks.ts`: the decisions.md entry and the reworded CV21
  index link to the story packages they cite.
- `bash route.sh static`: the CV21 index no longer says "riding the same plugin/MCP
  package" or "via the shared package"; the decisions entry names the chosen shape and
  carries a row per runtime with a version, a binary, and a date.
- `bash scripts/smoke_npm_package.sh` and `bash scripts/smoke_claude_plugin.sh`: the
  shipped package and plugin, unchanged by this story, still pass; run once to show
  the tree is as it was.
- `npm test`, once, for the same reason.

The route is a committed script in this story package, as DS7's and DS10's are, so it
re-runs when a runtime updates and US2 can start from it. Raw outputs stay under its
scratch directory and are not committed; the summary each step prints is what this
file records.

## E2E Decision

Required. The headless turns of step 4 are the E2E: the model on each installed
runtime, from the shipped package, asked for the extension by name. The static readers
say what a runtime lists; only the turn says what the model finds.

## Navigator Validation

Every step runs with a scratch `HOME` and each runtime's own home variable
(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME`; agy under the scratch `HOME`), from
an empty project, and records the version, binary, and date it ran on.

**Step 0 — the probe.** `bash route.sh setup`, then `bash route.sh probe`. Expected
observation: four runtimes with version, binary, and date; per runtime and shape, the
reader the route will use, or "headless turn" where none exists; the `runtimes:` keys
of the installed manifests in the evidence. Pass: all four present, every named reader
runs. Fail: a binary absent, or a reader that does not run.

Every shape step opens with a negative read of every reader on the clean scratch home;
that cell must say "not listed" before anything is placed. The skill placed in every
shape is the inert one: `review-copy`'s frontmatter, a body of heading, a per-run
canary, and "do nothing else". Every step re-reads the four versions and refuses when
one differs from the probe's.

**Step 1 — shape (a).** `bash route.sh shape-a`. Expected observation: a runtime × root
table, every cell listed or not listed, and Grok's two-root cell once or twice; Claude
Code's `~/.agents/skills/` cell measured under a scratch `HOME` or marked not
measurable by this route. Pass: no unreadable cell. Fail: a cell the reader could not
read, or a write into the real `~/.agents/`.

**Step 2 — shape (b).** `bash route.sh shape-b`. Expected observation: per runtime,
listed or not; after the in-place change, listed or stale, and for the stale ones the
reinstall command run and the skill listed again; the second-plugin column; the
fixture's file list recorded before any `--trust` install. Pass: no unreadable cell.
Fail: an install refused for a reason the record cannot name.

**Step 3 — shape (c).** `bash route.sh shape-c`. Expected observation: per runtime,
attached or not, prompt offered to the user or not, and its name as the runtime shows
it. Pass: no unreadable cell. Fail: the probe server failing to start under a runtime for a reason
the record cannot name.

**Step 4 — the headless turns.** `bash route.sh live <runtime> <shape>`, once per
listed cell, at most twelve first turns plus one retry per miss. Expected observation:
the answer carries this run's canary, or two turns miss it and the record says not
found; the model name per turn; for shape (c), the documented invocation form sent as
a turn too where one exists. Pass: every listed cell has a found or not-found answer
with its model. Fail: a session that does not start, or Grok past US$ 1.00.

**Step 5 — the decision.** The Driver fills the table and applies plan.md's rule;
the Navigator accepts or corrects the choice. Expected observation: one shape, or the
reason none qualifies on all four. Pass: the Navigator's acceptance, then
decisions.md and the CV21 index written and `route.sh static` green. Fail: a choice
the table does not support.

**Step 6 — clean, then untouched.** `bash route.sh clean`, then `bash route.sh
untouched`. Expected observation: no process the route spawned still running, the
scratch directory gone with any login copied into it; every entry of the real
`~/.claude`, `~/.codex`, `~/.gemini`, `~/.grok`, `~/.agents`, and the `extensions/`
and `runtime/skills/` trees of `~/.mirror-minds/vinicius/` and `vinicius-dev/` hashes
as the baseline recorded it. Pass: zero changed. Fail: any change, or a credential
copy still present.

## Validation Evidence

Measured 2026-10-19 (16:05–16:59 UTC, the logins and the last turns to 17:54 UTC) with `bash route.sh` on the scratch install of
package 0.35.0: claude 2.1.296 (`~/.local/share/claude/versions/2.1.296`, model
`claude-opus-5-5`), codex 0.163.0 (`/opt/homebrew/Caskroom/codex/0.163.0/bin/codex`),
agy 1.4.2 (`~/.local/bin/agy`), grok 1.0.62 (`~/.grok/downloads/grok-1.0.62-macos-aarch64`,
model `grok-4.7`). The cells are in [`evidence/table.tsv`](evidence/table.tsv) and
the versions in [`evidence/versions.tsv`](evidence/versions.tsv); the raw outputs
stayed under the scratch directory. The canary was `CANARY-DS5-00q0wa`; the (b) copies
on Codex, agy, and Grok carried `-v2` after the refresh step, and a turn that answered
`-v2` is a find.

**Step 0, `setup` 6 passed, `probe` 4 passed.** `review-copy` installed into the scratch
Mirror home with catalogs for `claude` and `pi` only; `expose-claude` wrote
`ext-review-copy/SKILL.md`, and the inert body replaced the skill's. Readers: Grok
`inspect --json`; Codex `debug prompt-input` and `mcp list`; Claude Code `plugin list`
and `details`, no listing for a personal skill (reader: model); agy `plugin list
--json`, `mcp list` (user-configured servers only), no skills listing (reader: model).
The installed manifests, 20 across the two real homes: 18 declare `pi` and `claude`,
2 declare `pi` alone; none declares another runtime. Baseline: 841 entries.

**Step 1, `shape-a` 3 passed.** Every negative read clean. `~/.claude/skills/`: Grok
listed (source `user`), Codex not. `~/.agents/skills/`: Grok listed, Codex listed.
`~/.gemini/config/skills/`: neither. Both Claude and agents roots at once: Grok listed
it **once**. agy and Claude Code: reader model (step 4).

**Step 2, `shape-b` 4 passed.** The fixture: `.claude-plugin/plugin.json`, the root
`plugin.json` marker, `skills/ext-review-copy/SKILL.md`, no hooks, no server. Every
negative read clean. Listed on all four: Claude Code `plugins [mirror-ext-ts1user]`;
Codex `mirror-ext-ts1user:ext-review-copy` with its cache path; agy staged under
`~/.gemini/config/plugins/mirror-ext-ts1user/`; Grok source `plugin:mirror-ext-ts1user`.
A changed skill: Claude Code in place (a link); Codex stale, `codex plugin add
mirror-ext-ts1user@mp-mirror-ext-ts1user` again brought it level (the marketplace
serves the live directory; the route's first marketplace held a copy and measured
nothing, corrected); agy stale, `agy plugin install <dir>` again brought it level; Grok
stale, `grok plugin uninstall mirror-ext-ts1user --confirm && grok plugin install <dir>
--trust` brought it level. A second plugin `mirror-ext-ts1other` installed beside the
first on all four; Codex refused a second marketplace under the first's name, so one
marketplace name per home.

**Step 3, `shape-c` 1 passed.** The fixture: the manifests with one `mcpServers` entry
(`node probe-mcp.mjs <skill>`), `mcp_config.json` for agy, no skill directory (a first
version carried the skill too and would have confounded a find; corrected and re-run).
`prompts/list` names `ext-review-copy` on its own. Attached: Claude Code `MCP servers
(1)`; Codex one `mirror-ext-ts1user` row (`Auth Unsupported`); agy the staged
`mcp_config.json`, `agy mcp list` empty by design; Grok `mirror-ext-ts1user/stdio`,
`mcp doctor` `0 tools discovered`. No runtime has a static reader for prompts.

**Step 4, the headless turns: 15 first turns, 5 retries, 3 form turns, 3 login
probes.** Every turn's tool calls classified by `turn.js`.

| cell | result |
|---|---|
| Claude Code (a) `~/.claude/skills/` | found, from context |
| Claude Code (a) `~/.agents/skills/` | not measurable: the login needs the real `HOME`, and the real `~/.agents/` is not written |
| Claude Code (b) | found, from context |
| Claude Code (c) | not found by name ("not in this session's list of available skills"); not found by `/mcp__mirror-ext-ts1user__ext-review-copy` ("isn't installed in this session") |
| Codex (a) `~/.agents/skills/` | found: read the path the runtime listed |
| Codex (b) | found: read the listed cache path; also by `$mirror-ext-ts1user:ext-review-copy`, from context |
| Codex (c) | **not found by the shape**: no prompt offered; `rg --files` over `/Users` found the route's own copy of the skill and read it, rejected by the classifier |
| agy (a) `~/.gemini/config/skills/` | found, from context |
| agy (a) `~/.agents/skills/` | not found ×2: tried to run a command, denied in headless mode |
| agy (b) | not found by name ×1; **found** by `/mirror-ext-ts1user:ext-review-copy`, from context |
| agy (c) | not found ×2: tried to run a command, denied |
| Grok (a) `~/.claude/skills/` | found: read the path the runtime listed; US$ 0.031 |
| Grok (b) | found: read the listed path; US$ 0.051 |
| Grok (c) | not found ×2: the init lists the server; the model ran `grep` and `find` over the scratch directory and hit the turn limit; US$ 0.047 and 0.047 (a third, confounded turn before the fixture fix: 0.047) |

Grok: five turns, US$ 0.22. Mirror's ledger in the scratch home: 0 calls. Claude Code,
Codex, and agy on their plans.

**Logins.** Claude Code: keyed to the config directory and to `HOME`; `/tmp/…` and
`/private/tmp/…` are two logins; the Navigator logged in once inside
`claude-login/.claude` and the turns ran with the real `HOME`. Codex: `codex login`
inside `codex-login/.codex`, its `auth.json` borrowed into each cell and verified
removed. agy: an interactive auth inside `agy-login`, its
`.gemini/antigravity-cli/antigravity-oauth-token` (1.4.2's location; DS7.US4 named
`oauth_creds.json` on 1.3.x) borrowed and verified removed; a copy of the real login
was not honoured. Grok: `GROK_AUTH_PATH` at the real `auth.json`, in place.

**Step 5, the decision.** The rule applied: (c) fails criterion 1 on all four; (a) is
three roots, none reaching all four, each shared by every home; (b) qualifies on all
four. **(b)**, accepted by the Navigator on 2026-10-19; the entry in decisions.md; the
CV21 index reworded; `static` 4 passed.

**Step 6, `clean` then `untouched`.** `clean` stopped nothing (no process of the route's
was running), removed the agy and Codex scratch credentials with their directories,
and removed the scratch directory. It also removed the route's own baseline, which
the first version of the route kept inside the scratch directory, so the hash
comparison the plan promised could not run on this pass: the route now keeps the
baseline beside the scratch directory (`/tmp/cv21-ds5-ts1.baseline`). For this pass
the real configuration was checked by modification time instead: across the 27
entries of the baseline set, no file or link was modified after the route's setup
(18:00 local); the latest change in the set is `~/.claude.json` at 17:24 local, before
it. Weaker evidence than the plan's, stated as such. Claude Code's scratch login left
its token in the keychain as `Claude Code-credentials-9784ff54` (created 16:40 UTC),
keyed to the removed config dir; the Navigator decides its removal, and `clean` now
names the entry.
