[< Story](index.md)

# Test Guide — CV21.DS2

## Aggregate Validation

DS2 is validated once, at the Delivery Story level. The check is that the canonical
plugin, installed as it is, does four things on Claude Code, Codex, and Grok:

- its hook commands quote the plugin root, and its timeouts are seconds;
- its MCP entry starts without `${CLAUDE_PLUGIN_ROOT}`, from a GUI launch too;
- its inject hook recognizes every runtime's explicit Mirror Mode form;
- its shared hooks log each session under that runtime's own label, Mirror questions
  and every reply included, each reply beside its prompt.

Driver checks, before hand-over and before Validation:

- `npm run typecheck`, `npm run lint`, and `npm test`, all green. Tests are written first
  for:
  - runtime detection;
  - the reply rule: by turn id, by last message, the skips, the counted skip;
  - the Stop handler's silence, and its redacted failure line;
  - the explicit-form grammar, and the Mirror turn logged without its form;
  - the turn id in `messages.metadata`;
  - the generated MCP entry: no `${…}`, no positional parameters, the search
    directories equal to the wrappers', the GUI-launch run under `env -i`, and the one
    line with exit 1 when `mirror` is missing.
- `bash scripts/generate_hook_wrappers.sh --check`, and the plugin drift guard in
  `claudePlugin.test.ts`.
- `bash scripts/smoke_claude_plugin.sh` and `bash scripts/smoke_npm_package.sh`.
- `node ts/scripts/checkPackContents.ts`, `node ts/scripts/checkRetiredSurfaces.ts`, and
  `node ts/scripts/checkDocLinks.ts`.
- `bash -n route.sh`, and every static step of the route run end to end in a fresh
  scratch directory. The static steps are:
  - `claude plugin validate` and `grok plugin validate`, versions recorded;
  - the MCP entry as each runtime renders it, and as written, printing which of
    `PATH`, `HOME`, `MIRROR_BIN`, and `MIRROR_NODE` reached the server;
  - the inject wrapper fed each explicit form;
  - the scripted journey, per runtime shape, against the expected message list below.

### The scripted journey

One sequence of recorded payloads per runtime shape, piped through the plugin's
wrappers into the scratch database, with no model call:

1. a Mirror turn in the runtime's form, then its Stop;
2. an ordinary prompt, then its Stop;
3. a repeat Stop for the same turn;
4. a command turn (`/mm-journeys`), then its Stop;
5. SessionEnd, with a transcript on Claude Code's shape.

Grok's shape adds its session-end Stop, without `promptId`. The expected conversation,
the same on every shape:

| # | role | content | turn id |
|---|------|---------|---------|
| 1 | user | the Mirror question, without its form | turn 1's |
| 2 | assistant | turn 1's reply | turn 1's |
| 3 | user | the ordinary prompt | turn 2's |
| 4 | assistant | turn 2's reply | turn 2's |

Nothing else: the repeat Stop, the command turn, its reply, Grok's session-end Stop, and
the transcript add no row. The conversation and the runtime session both carry the
shape's label. `hooks.log` holds the skipped-reply line for the command turn and for
the repeat, and no prompt or reply text.

## Child Work Packages

- CV21.DS2.TS5 — Hook commands quote the plugin root
- CV21.DS2.US6 — The MCP server starts wherever the plugin is installed
- CV21.DS2.US7 — Mirror Mode's explicit form works from every runtime's skill syntax
- CV21.DS2.US8 — Every runtime's session is logged under its own name, replies included

## Navigator Validation

All commands run from this package's directory. The route installs this tree's package
into a scratch npm prefix, with a scratch Mirror home that has no provider key. Every
runtime runs on a scratch config at mode `700`: `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or
`HOME`. A login, if one is asked for, happens there. Run step 5 even if an earlier step
failed.

1. **`bash route.sh static`**: no model call.
   - **Expected:**
     - `claude plugin validate` passes, with no warnings. It had 4 before TS5. The
       validator's version is printed beside the result.
     - `grok plugin validate` passes.
     - The MCP entry, as Claude Code, Codex, and Grok render it, is the one in the
       manifest, with no variable rewritten. Run as written, it answers
       `initialize` and `tools/list` with 7 tools, and the step prints which
       variables reached it.
     - The inject wrapper returns Mirror context for each explicit form:
       `/mm:mirror`, `/mirror-mind:mm-mirror`, `/mirror-mind:mm:mirror`,
       `$mirror-mind:mm:mirror`, `/mm-mirror`, and `$mm-mirror`. It returns none for
       `/mm-mirrors` or for a prompt that only mentions the form.
     - The scripted journey matches the table above on every shape.
   - **Pass:** every line is ✓.
   - **Fail:** any warning, a rewritten entry, a form that returns no context, a
     look-alike that returns some, or a journey row that differs.
2. **`bash route.sh live-claude`, then `live-codex`, then `live-grok`**: one session
   each, two turns, typed as the step prints them. After each session, run
   `bash route.sh check <claude|codex|grok>` (step 3). Each turn carries a `DS2-<id>`
   marker, which `untouched` searches the real Mirror homes for.
   - **Turn 1:** a Mirror Mode question in that runtime's own form:
     - Claude Code: `/mirror-mind:mm-mirror …`;
     - Codex: `$mirror-mind:mm:mirror …`;
     - Grok: `/mm-mirror …`.
   - **Turn 2:** an ordinary prompt. It asks the model to list the `mirror-mind` MCP
     tools it can see.
   - **Expected:**
     - Mirror Mode answers in each runtime.
     - On Claude Code and Codex, turn 2 lists the server's 7 tools.
     - No "MCP startup failed" warning on any runtime.
   - **Pass:** both turns complete, and no runtime shows an MCP start failure.
   - **Fail:** a third turn was needed, the server failed to start, or a step needed a
     login or a change outside the scratch config.
3. **`bash route.sh check <runtime>`**: reads the scratch Mirror home and the runtime's
   logs. For Codex it also prints the variable names a scratch-only probe server
   (`ds2-env-probe`, no tools) received, which shows what Codex hands an MCP server.
   - **Expected:** one conversation per runtime, labelled `claude_code`, `codex`, and
     `grok_build`, and its runtime session labelled the same. Each holds four messages:
     the Mirror question without its form, its answer, turn 2's prompt, and turn 2's
     reply, in that order, each reply carrying its prompt's turn id.
     - The step prints one reply's text. It is the answer you saw.
     - The count of skipped-reply lines in `hooks.log` is zero. A non-zero count is
       the async race, and it decides whether the prompt logger stays `async`.
     - `hooks.log` holds no failure line, and no prompt or reply text.
     - On Grok, `logs/mcp/mirror-mind.stderr.log` exists and is empty. Whether Grok
       attached the server is DS10's.
     - Whether Codex's conversation closed at exit is printed and recorded as a
       finding. It does not decide pass or fail (Non-Goals).
   - **Pass:** every label is right, every logged prompt has exactly one reply after
     it with the same turn id, no reply appears without its prompt, every assistant row
     carries a turn id (so the Stop hook wrote it, not a `mirror mirror log` by hand),
     and the reply you read is the one you saw.
   - **Fail:** a mislabelled conversation, a missing reply, a reply logged twice, a
     reply under the wrong prompt, or a Mirror question missing.
4. **`bash route.sh untouched`.**
   - **Expected:** the real runtime config files match the checksums taken at setup,
     and the real Mirror homes hold no scratch session.
   - **Pass:** nothing changed.
   - **Fail:** any changed config, or a scratch session in a real home.
5. **`bash route.sh clean`.**
   - **Expected:** the scratch directory is removed, including any login made inside
     it.
   - **Pass:** the step reports what it deleted, and the directory is gone.

## Validation Evidence

### The Driver's checks, 2026-10-13

On Claude Code 2.1.296, Codex 0.162.1, and Grok 1.0.52, the versions DS12 recorded.

| Check | Result |
|-------|--------|
| `npm run typecheck`, `npm run lint` | ✓ clean |
| `npm test` | ✓ 3150 pass, 0 fail, 3 skipped (two are the entry's "nothing anywhere" cases, which skip where a global install exists and run on CI) |
| `generate_hook_wrappers.sh --check`, the plugin drift guard, `checkPackContents`, `checkRetiredSurfaces`, `checkDocLinks`, `checkSkillCommandParity` | ✓ in sync, clean |
| `smoke_npm_package.sh` | ✓ 68 pass, 0 fail, the installed plugin's manifest entry starting the server included |
| `smoke_mirror_mcp.sh` | ✓ 7 tools through the manifest entry; 2 production databases checked |
| `smoke_claude_plugin.sh` | ✓ steps 1–5, the MCP entry included. Step 6 stops on a machine with a global `mirror-hook` (CR123, CR128), as before this story |
| `bash route.sh setup`, then `bash route.sh static`, fresh scratch install of this tree | ✓ 7/0, then 22/0 |
| `DS2_DRY=1 bash route.sh live-claude`, `live-codex`, `live-grok` | ✓ each prepared, no session started |
| `bash route.sh untouched` | ✓ 3/0: no real config changed, no scratch session or live turn in a real home |

`route.sh static`, in detail: Claude Code's validator passed with no warnings (4
before TS5) and Grok's passed. The shipped MCP entry started as written, from a
GUI-launch PATH, inside Claude Code (`claude mcp list`, both PATHs), and through
Grok's handshake (`grok mcp doctor`, 7 tools), and Codex rendered it byte for byte.
The plugin's inject wrapper returned 7,065 bytes of context for each of the six forms
and nothing for `/mm-mirrors` or `/mm:journeys`; before US7 the plugin's own form
returned 0 (DS12.TS1 static 6). The scripted journey wrote the four expected rows
under each runtime's label on the Claude Code, Codex, and Grok shapes, printed
nothing, and counted 4 skipped replies in `hooks.log` without their text.

### The Navigator's sessions

**Claude Code, attempt 1 (`DS2-mczk01`, 2026-10-13T20:09Z): stopped at turn 1 by the
route, not by DS2.** `mirror mirror load` exited 2 with "MIRROR_HOME
(/private/tmp/cv21-ds2/home/.mirror-minds/ds2) conflicts with MIRROR_USER (vinicius)",
and the MCP server closed its connection for the same reason. The route kept the
Navigator's HOME for Claude Code's login and unset `MIRROR_USER`, so Mirror's config
loader filled it, and `OPENROUTER_API_KEY` with it, from the real
`~/.config/mirror/env`. Mirror's home check refused the mismatched pair before any
database was opened or provider called: the scratch home holds nothing from the
attempt, and `untouched` passed 3/0. The route now gives the Claude session a config
directory of its own and sets `MIRROR_USER=ds2` beside `MIRROR_HOME`, and every live
step runs a preflight that resolves the home and the key the way the session's Mirror
processes will, and starts no session when either is wrong. The preflight reproduces
the attempt's error on the old environment, and passes on the new one for all three
runtimes.

**Claude Code, attempt 2 (live step `DS2-s4fabs`, 2026-10-13T20:19:32Z; the turns typed
carried attempt 1's `DS2-mczk01`): US7 and US8 held live, and the MCP server never
started.**

- One conversation, labelled `claude_code` on the conversation and the runtime session:
  the Mirror question without its form, the `◇ financial` answer, the probe, and its
  reply, each reply carrying its prompt's turn id. SessionEnd closed it (20:23:26Z).
  `hooks.log` holds no line from the session: no failure, no skipped reply.
- The MCP server did not connect, and Claude Code did not try. It had recorded attempt
  1's failure at 20:11:48Z in the scratch config dir (`mcp-needs-auth-cache.json`), and
  holds a failed server back for 15 minutes. With the session's exact environment,
  `claude mcp list` started the server and connected it (20:34Z).
- `route.sh check` itself failed: a `case` inside `$(...)`, which macOS's `/bin/bash`
  3.2 cannot parse. And `route.sh static` could not be repeated on the same scratch
  home: its fixed session ids appended a second run to the first run's conversations.

The route now clears that cache before each Claude attempt (keeping a copy), `check`
finds a session by time when its turns carry another run's marker and grades the tool
list 7 of 7, and `static` uses session ids of its own per run. Every step was re-run
under `/bin/bash` 3.2: `static` 22/0, `check claude` reports attempt 2 as above (7/1,
the MCP line), and the three live steps prepare with their preflight green.

**Claude Code, attempt 3 (live step `DS2-kbngqv`, 2026-10-13T20:43:16Z; the turns again
carried `DS2-mczk01`, recalled from Claude Code's prompt history in the reused scratch
config): passed, `route.sh check claude` 8/0.**

- One conversation, `claude_code` on the conversation and the runtime session: the
  Mirror question without its form, the `◇ financial` answer from the scratch identity,
  the probe, and its reply, each reply carrying its prompt's turn id
  (`a72e751a-…`, `4bacec60-…`).
- The MCP server started: `/mcp` showed `plugin:mirror-mind:mirror-mind · 7 tools`, and
  turn 2's reply named all seven, as `mcp__plugin_mirror-mind_mirror-mind__<name>`,
  deferred. The startup banner "1 MCP server needs authentication" was Claude Code's
  built-in `plugin:adobe-for-creativity`, not Mirror.
- No reply skipped for want of a prompt (the async race did not show), and no hook
  recorded a failure.

The remaining sessions are recorded at Validation.
