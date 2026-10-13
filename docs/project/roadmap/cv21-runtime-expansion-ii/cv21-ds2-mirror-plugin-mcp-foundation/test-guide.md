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
   each, two turns, typed as the step prints them.
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
3. **`bash route.sh check`**: reads the scratch Mirror home and the runtimes' logs.
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
     it with the same turn id, no reply appears without its prompt, and the reply you
     read is the one you saw.
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

Recorded here during implementation, from the Driver's checks, and at Validation, from
the Navigator's sessions.
