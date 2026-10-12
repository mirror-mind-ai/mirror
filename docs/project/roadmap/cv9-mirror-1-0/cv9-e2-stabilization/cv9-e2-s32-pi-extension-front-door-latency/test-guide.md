[< CV9.E2.S32](index.md)

# Test Guide — CV9.E2.S32 Pi Extension Front-Door Latency

## Automated Validation

Focused (paths to be confirmed with implementation):

```bash
node --test ts/test/frontDoor/sessionStartWelcomeRoute.test.ts
node --test ts/test/pi/mirrorLoggerExtension.test.ts
node --test ts/test/conversation/loggerCli.test.ts ts/test/frontDoor/runtimeTailCli.test.ts ts/test/frontDoor/routing.test.ts ts/test/frontDoor/noPythonSpawn.test.ts
```

Required full gate:

```bash
npm run typecheck
npm test
npm run lint
git diff --check
```

Expected:

- composite route tests pass, including byte-identity against the standalone
  `session-start --fast`, `welcome`, and `welcome --status-line` outputs;
- extension harness tests pass, including every ordering case;
- the existing logger, welcome, routing, and no-Python-spawn suites pass
  unchanged;
- no model, network, or credential is required.

## Required Test Matrix

| Boundary | Scenario | Expected |
|---|---|---|
| route | `--fast --welcome --format json` on an isolated home | exit 0; one JSON line; `schemaVersion`, `sessionStart`, `welcome`, `statusLine` present |
| route | `sessionStart` vs standalone `session-start --fast` | identical text |
| route | `welcome` vs standalone `welcome` | identical minus trailing `\n` |
| route | `statusLine` vs standalone `welcome --status-line --session-id X` | identical minus trailing `\n` |
| route | after the call | mute flag cleared; session orientation reset |
| route | welcome disabled by env | `welcome` and `statusLine` are `""`; `sessionStart` populated |
| route | `--welcome` without `--fast` | exit 2; one stderr line; no write |
| route | `--welcome` without `--format json` | exit 2; one stderr line; no write |
| route | unresolvable mirror home | same exit/stderr as standalone `session-start --fast`; empty stdout |
| route | injected render failure after write | envelope with `""` render fields; write stands; `front-door.log` carries the category |
| route | `front-door.log` | exactly one entry for the process |
| extension | `session_start` | one `exec` with the composite argv; `notify(card)`; `setStatus(line [· ext N])`; `session-maintenance` detached |
| extension | `session_start`, empty `welcome` | no `notify` |
| extension | `session_start`, unparseable stdout | `WARN` in `mirror-logger.log`; no `notify`; status `◇ Mirror · ?` |
| extension | `before_agent_start` | handler settles while `log-user` exec is still pending |
| extension | two prompts in a row | second `log-user` starts only after the first resolves |
| extension | `agent_end` with pending `log-user` | `log-assistant` spawned only after it resolves |
| extension | `agent_end` with rejected `log-user` | `log-assistant` still spawned |
| extension | `session_shutdown` with pending `log-user` | `session-end-pi` runs only after it settles; map entry deleted |
| extension | `agent_end` with timed-out `log-user` | `log-assistant` spawned after it resolves, never before |
| extension | `agent_end` with no assistant text (aborted turn) | returns early; chain intact for the next event |
| extension | session switch (A pending, `session_start` new → B, `agent_end` B) | A does not gate B; A's write completes |
| extension | welcome disabled then enabled across two `session_start` | second envelope carries the card |
| extension | quit-mid-write via `MIRROR_TEST_FRONT_DOOR_DELAY_MS` under `MEMORY_ENV=test` | `session-end-pi` waits for the delayed `log-user` |
| extension | slash-command prompt | no `log-user` |
| guard | `--welcome` in any `SKILL.md` | `checkSkillCommandParity` refuses |
| test hygiene | assertion messages | never contain argv payloads |

## Navigator Validation

Prerequisite: the implemented extension loaded in Pi inside this tree, with a
real mirror home.

1. **Startup rendering.** Open Pi. Compare the welcome card and status line
   against the pre-change capture in `validation.md`.
   Pass: identical. Fail: any textual difference.
2. **Turn order.** Send three short prompts in quick succession, wait for the
   responses, then list the conversation's messages.
   Pass: `user, assistant, user, assistant, user, assistant` in prompt order.
   Fail: any inversion or missing message.
3. **Front-door log.** Read `<mirror home>/front-door.log` for the session.
   Pass: one `conversation-logger`/`session-start` entry at startup.
   Fail: three startup entries, or none.
4. **Startup time, pre-registered.** Five cold starts before, five after,
   from `<mirror home>/mirror-logger.log` (`session_start fired` → the
   status set after the welcome). Medians.
   Pass: `after ≤ before − 300 ms`. Fail: otherwise.
5. **Quit mid-write, confirmed once.** `MEMORY_ENV=test
   MIRROR_TEST_FRONT_DOOR_DELAY_MS=3000`, send a prompt, quit within three
   seconds of the response. Reopen and inspect the previous conversation.
   Pass: the user message is present and the conversation is closed.
   Fail: message missing, or conversation closed with the message landing in a
   later one.
6. **Full Pi smoke.** On the real home: open Pi, `/mm-mirror`, one
   reflection, `/mm-build mirror`, quit.
   Pass: both conversations logged, messages in order, status line correct
   throughout. Fail: any missing or misordered message, or a stale status.

## Validation Evidence

Recorded in [validation.md](validation.md): the automated gate, the
pre-registered front-door timing (851 ms → 387 ms median of five), the
`front-door.log` excerpt, and the pre-change card capture. The Navigator's
in-Pi validation (steps 1–6, 2026-10-12) is recorded there too, including where
steps 2 and 6 as written did not test what they meant to: a prompt sent during
a run joins that run, and a bare `pi` in the checkout sends the skills to
another home. The routes above are left as pre-registered.
