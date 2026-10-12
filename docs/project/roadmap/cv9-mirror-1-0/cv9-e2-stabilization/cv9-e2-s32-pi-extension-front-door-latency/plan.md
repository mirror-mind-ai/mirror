[< CV9.E2.S32](index.md)

# Plan — CV9.E2.S32 Pi Extension Front-Door Latency

## Pull

Pull `CV9.E2.S32` as one implementable Technical Story. It is independently
releasable as a PATCH, it has one new front-door contract and one extension
change, both are verifiable without a model or network, and it does not close
CV9.E2.

## Prepare

### What runs today

`.pi/extensions/mirror-logger.ts` is a thin dispatcher: every event reaches
the core by spawning `node bin/mirror.js …` — `runMirror` (awaited, through
`pi.exec`, 30 s timeout) or `runMirrorBackground` (detached `spawn`, output to
`mirror-logger.log`).

Measured on the development machine: ~180 ms fixed per call (loader shim,
type-strip, import of `cli.ts`), ~290 ms for `welcome`. The user-visible cost
is in two handlers:

| Handler | Calls today | Awaited | Felt as |
|---|---|---|---|
| `session_start` | `conversation-logger session-start --fast` → `welcome` → `welcome --status-line --session-id …` | all three, in sequence | ~0.8–0.9 s before Pi is usable |
| `before_agent_start` | `conversation-logger log-user <id> <prompt> --interface pi` | yes | ~0.2 s before every turn |
| `agent_end` | `log-assistant` (background) + `welcome --status-line` | status line only | not felt (post-response) |
| `session_shutdown` | `session-end-pi` → `backup --silent` | both | not felt |

### Two dependencies that shape the fix

1. **Startup is write-then-read.** `sessionStartFast`
   (`ts/src/conversation/sessionComposites.ts`) calls `setMute(false)` and
   `resetSessionOrientation(db)`. Both `composeWelcome` and `composeStatusLine`
   read what that reset wrote. The three calls cannot be fired in parallel.
   They can be one process, as long as the write commits before the reads.

2. **Per-turn order is a contract.** `log-user` must land before
   `log-assistant` for the same turn, and user messages must land in prompt
   order. `log-assistant` is already detached. Making `log-user` non-blocking
   with no sequencing turns message order into a race the database would
   faithfully record.

### Where the composite belongs

Not in `loggerCli.ts`: that module is the `conversation` domain and should not
learn to render the welcome card. Not in `runWelcomeRoute`: it is read-only by
contract ("no bootstrap, no migrate-on-open", `cli.ts` ~1750) and must stay so.
The composition belongs in the front-door route layer, which already composes
across modules (`conversationLoggerRoute.ts` wires the backup; `cli.ts`
dispatches by family). A new route module sequences the existing pieces and
emits one envelope; neither piece changes.

### Applicable rules

- TypeScript is the sole product authority (CV22 done).
- CLI remains transport; domain modules are not edited for this story.
- Behavior changes use TDD; runtime tests use an isolated Mirror home.
- The front door's fail-quietly contract for the extension stays: a child
  failure is a log line, never a Pi failure.
- The welcome card and status line are rendered by the same code path as the
  standalone commands, so they stay byte-identical.
- Output never leaks prompt content; the new envelope carries renders, not
  arguments.
- Release intent is PATCH (next after `v0.32.1`).

## Scope

- **Front door:** `conversation-logger session-start --fast --welcome
  [--session-id <id>] [--format json]`. Composite route that (1) runs the
  existing `session-start --fast` write through `withMirrorWriteDb`, (2) after
  the write handle closes, renders the welcome card and the status line through
  `runWelcomeRoute` with captured `io`, (3) writes one JSON object.
- **Extension `session_start`:** one `runMirror` call with the composite; parse
  the envelope; keep the existing log lines and UI calls (`notify` for the
  card, `setStatus` for the line, external-skill suffix) unchanged.
- **Extension `before_agent_start`:** start `log-user` without awaiting it;
  chain it onto a per-session pending promise so consecutive prompts serialize.
- **Extension `agent_end` and `session_shutdown`:** await the session's pending
  promise (settled, not necessarily succeeded) before `log-assistant` and before
  `session-end-pi`.
- **Tests:** route tests for the composite; an extension harness test that
  drives the handlers with a fake `pi` and asserts call order.
- **Docs:** `REFERENCE.md` entry for the new flags; extension header comment;
  worklog; `validation.md` with before/after timings.

## Non-Goals

- No in-process use of `ts/src` from the extension (decision in the story).
- No change to `sessionStartFast`, `composeWelcome`, `composeStatusLine`, or
  the standalone `welcome` route.
- No change to the skills path or to the Gemini/Codex/Claude hook wrappers
  (`ts/src/hooks/*` already compose in one process per event).
- No change to `agent_end`'s status-line refresh or to `session_shutdown`'s
  backup.
- No loader-level caching (`bin/loader.js` compile cache, snapshots).
- No change to how `log-user` carries the prompt (argv today). Moving it to
  stdin is a separate hardening item, registered in the technical-debt ledger
  by this story, not done by it.
- No version bump, tag, release, or production update inside this story's
  implementation; those have their own gates.

## Front-Door Contract

### Command

```bash
mirror conversation-logger session-start --fast --welcome --format json [--session-id <id>]
```

`--welcome` is only honored with `--fast`; without `--fast` the route refuses
with the usual one-line stderr and exit 2 (the full `session-start` runs
maintenance and must not block on a welcome render). `--format json` is
required with `--welcome`; the composite has no text form, because the three
outputs have no safe text delimiter (the card is free text). `--session-id` is
already a `conversation-logger` global option and reaches the status line as
it does today.

### Output

One JSON object on stdout, one line, exit 0:

```json
{
  "schemaVersion": "1.0.0",
  "sessionStart": "Conversation logging ACTIVE. Maintenance deferred.",
  "welcome": "<card text as `mirror welcome` prints it, without the trailing newline, or \"\" when disabled>",
  "statusLine": "<line as `mirror welcome --status-line` prints it, without the trailing newline, or \"\" when empty>"
}
```

- `sessionStart` is the logger's stdout joined with `\n` — the same lines the
  standalone call prints.
- `welcome` and `statusLine` are the captured stdout of `runWelcomeRoute` with
  the same `argv` the extension sent before, minus the final `\n`. When
  `welcomeDisabled(env)` holds, both are `""`, as the standalone calls print
  nothing.
- The welcome card's bounded remote update check keeps its current TTL and
  opt-out; the composite does not add a network call and does not remove one.

### Failure

- Write-side failure (unresolved home, schema state, `SQLITE_BUSY`): the route
  returns the same exit code and stderr the standalone `session-start --fast`
  returns today. No JSON is emitted; the extension treats empty stdout as it
  does now (`session-start result: (empty)`) and falls back to no card and the
  `◇ Mirror · ?` status.
- Render-side failure after a successful write: the write stands (it was
  committed), the envelope is still emitted with `welcome` and/or `statusLine`
  as `""`, and the render error category goes to `front-door.log`. The
  extension must never lose the unmute because the card failed to render.

### Observability

One `front-door.log` entry per process, as today: command `conversation-logger`,
route `session-start`, exit code, no argv payload.

### Audience

`--welcome --format json` is **extension-internal**. It exists for the Pi
`mirror-logger` extension and is documented as such in `REFERENCE.md`. No
`SKILL.md` may mention it: the envelope would put card text in front of the
model through a structured channel the Ariad surface rules do not cover.
`checkSkillCommandParity.ts` gains a refusal for the flag in any skill file.

## Extension Contract

```ts
// per Pi session file: the chain of pending user-prompt writes
const pendingUserLog = new Map<string, Promise<void>>();

function enqueueUserLog(sessionId: string, args: string[]): void {
  const prior = pendingUserLog.get(sessionId) ?? Promise.resolve();
  const next = prior.then(() => runMirror(args)).then(() => undefined, () => undefined);
  pendingUserLog.set(sessionId, next);
}

async function settleUserLog(sessionId: string): Promise<void> {
  await (pendingUserLog.get(sessionId) ?? Promise.resolve());
}
```

- `before_agent_start`: `enqueueUserLog(sessionId, [...log-user args])`;
  return immediately. `runMirror` already swallows and logs failures; the
  `.then(undefined, undefined)` is belt-and-braces so a rejected link never
  breaks the chain.
- `agent_end`: `await settleUserLog(sessionId)` before
  `runMirrorBackground([...log-assistant args])`. The status-line refresh is
  unchanged.
- `session_shutdown`: `await settleUserLog(sessionId)` before `session-end-pi`,
  then `pendingUserLog.delete(sessionId)`. A prompt logged after the
  conversation closes would land in the wrong place; the await is the guard.
  The delete keeps the map from growing across `session_start` reasons
  (`startup | reload | new | resume | fork`), each of which may bring a new
  session file.
- **The invariant being protected:** the `log-user` process has *exited*
  before the `log-assistant` process is *spawned*. Message reads are
  `ORDER BY created_at, id` and `created_at` is stamped by the writing process
  at insert time, so order in the database is wall-clock order of the inserts.
  Tests assert on exec resolution order, not on call order.
- **Worst case:** `runMirror` carries `pi.exec`'s 30 s timeout. A hung
  `log-user` (a `busy_timeout` wait, say) gates `log-assistant` for up to
  30 s. That is post-response and bounded; the alternative is misordering.
  Stated here so it is a choice, not a surprise.
- Aborted turns: when `agent_end` carries no assistant text the handler
  returns before touching the chain, as today. The pending `log-user` still
  completes on its own and the next `agent_end` or `session_shutdown` awaits
  it.
- `runMirror` stays on `pi.exec`, not a detached `spawn`: the chain needs a
  promise, and shutdown awaits it, so the child never outlives what depends on
  it.
- The extension does not import from `ts/src`. It parses the JSON envelope
  with `JSON.parse` and a shape check; a parse failure is a `WARN` line and the
  existing empty-result behavior.

## Implementation Approach

Order of work, each step red → green:

1. **Route module** `ts/src/frontDoor/sessionStartWelcomeRoute.ts`, named
   after the command. Exports `isSessionStartWelcome(argv)` and
   `runSessionStartWelcomeRoute(argv, deps)`. The only injectable dependency
   is `renderWelcome` (defaulting to `runWelcomeRoute`), so the render-failure
   test can throw from it; the write path is the real `withMirrorWriteDb` +
   `runConversationLoggerRoute` in every test. The route: validate the flag
   combination; run the write; let the handle close; render both reads with
   captured `io`; emit the envelope.
2. **`conversationLoggerRoute.ts`:** accept an optional `io` so stdout/stderr
   lines can be captured instead of written. Default behavior unchanged.
3. **`cli.ts` dispatch:** inside the `isConversationLoggerCommand` branch, test
   `isSessionStartWelcome` first and hand off; otherwise the existing
   `runConversationLoggerWrite`.
4. **Route tests** `ts/test/frontDoor/sessionStartWelcomeRoute.test.ts` — see
   Test Strategy.
5. **Extension harness test** `ts/test/pi/mirrorLoggerExtension.test.ts` —
   loads `.pi/extensions/mirror-logger.ts` through a computed-path dynamic
   `import()` (the file is outside `tsconfig` `include` and its only external
   import is `import type` from Pi, erased at load; a computed path keeps `tsc`
   from trying to resolve that package). Sets `MEMORY_DIR` to a temp dir before
   loading so `mirror-logger.log` lands there. Installs a fake `pi` whose
   `on` records handlers and whose `exec` records `[cmd, args]` and resolves
   on a controllable deferred.
6. **Extension changes** against that harness: `session_start` composite call
   and envelope parse; `pendingUserLog` chain; the two awaits.
7. **Test knob:** the extension honors `MIRROR_TEST_FRONT_DOOR_DELAY_MS` only
   when `MEMORY_ENV=test`, sleeping that long before each `runMirror` exec,
   so the quit-mid-write case is automated rather than hand-timed.
8. **Skill parity guard:** `checkSkillCommandParity.ts` refuses `--welcome`
   under any `conversation-logger` invocation in a `SKILL.md`.
9. **Docs:** `REFERENCE.md` (flag marked extension-internal), extension
   header, worklog entry, technical-debt ledger entry for argv→stdin on
   `log-user`, `validation.md` with the pre-registered timing and the
   `front-door.log` excerpt.

The envelope shape and the extension's parser are written together and
committed together; the extension ships beside the bin and never meets a core
of another version.

## Test Strategy

### Route (automated, `node --test`)

- `--fast --welcome --format json` against an isolated home: exit 0; stdout is
  one JSON line; `sessionStart` equals the standalone `session-start --fast`
  stdout; `welcome` equals standalone `welcome` stdout minus `\n`; `statusLine`
  equals standalone `welcome --status-line --session-id X` minus `\n`.
  Byte-identity is asserted by running the standalone commands in the same test
  against the same home with the same env.
- Mute flag is cleared and orientation is reset after the call (the write
  really happened before the reads).
- `MIRROR_WELCOME=off`-style disable: `welcome` and `statusLine` are `""`,
  `sessionStart` is still populated.
- `--welcome` without `--fast`: exit 2, one stderr line, no write.
- `--welcome` without `--format json`: exit 2, one stderr line, no write.
- Unresolvable home: same exit code and stderr as standalone
  `session-start --fast`; no stdout.
- Render failure after write (inject a throwing `runWelcomeRoute` through
  `deps`): envelope emitted with `""` fields; mute flag still cleared;
  `front-door.log` carries the category.
- `front-door.log` has exactly one entry for the process.
- Existing `loggerCli.test.ts`, `runtimeTailCli.test.ts`, `routing.test.ts`,
  `noPythonSpawn.test.ts` still pass unchanged.

### Extension (automated, fake `pi`)

- `session_start`: exactly one `exec` with argv
  `[MIRROR_BIN, "conversation-logger", "session-start", "--fast", "--welcome", "--format", "json", …]`;
  `notify` receives the card; `setStatus` receives the status line with the
  external-skill suffix logic unchanged; `session-maintenance` is spawned
  detached.
- `session_start` with an envelope whose `welcome` is `""`: no `notify`.
- `session_start` with unparseable stdout: `WARN` logged, no `notify`,
  status falls back to `◇ Mirror · ?`.
- `before_agent_start` resolves before the `log-user` exec resolves (the
  deferred is still pending when the handler's promise settles).
- Two `before_agent_start` in a row: the second `log-user` exec is not started
  until the first resolves.
- `agent_end` with a pending `log-user`: `log-assistant` is not spawned until
  the deferred resolves; after it resolves, `log-assistant` is spawned.
- `agent_end` with a rejected `log-user`: `log-assistant` is still spawned.
- `agent_end` with a timed-out `log-user` (exec resolves late with an error):
  `log-assistant` is spawned after it, not before.
- `agent_end` with no assistant text (aborted turn): returns without awaiting;
  the chain is intact for the next event.
- `session_shutdown` with a pending `log-user`: `session-end-pi` is not run
  until the deferred settles; the map entry is deleted afterward.
- Session switch: `before_agent_start` on session A, `session_start` with
  reason `new` and session B, `agent_end` on B — A's chain does not gate B,
  and A's write still completes.
- Welcome disabled by env at one `session_start` and enabled at the next:
  the second envelope carries the card (env is re-read per process).
- Slash-command prompts still skip logging.
- Assertion messages never include argv payloads (same discipline as
  `hookPayloadRedaction.test.ts`).

### Gate

```bash
npm run typecheck
npm test
npm run lint
git diff --check
```

## Validation Route

1. Open Pi in this tree with the implemented extension. Observe the welcome
   card and status line; compare against the pre-change rendering (captured in
   `validation.md`). Pass: identical text. Fail: any difference.
2. Send three prompts quickly. Pass: the three user messages and three
   assistant messages are in the database in turn order
   (`mirror conversations …` or a direct read). Fail: any inversion.
3. Read `<mirror home>/front-door.log` for the session. Pass: one
   `session-start` entry, then `log-user` / `log-assistant` pairs. Fail: three
   startup entries.
4. Startup time, pre-registered: five cold starts before and five after,
   measured from the extension's own log timestamps (`session_start fired` →
   the status set that follows the welcome). Compare medians. Pass:
   `after ≤ before − 300 ms`. Fail: otherwise. Record all ten in
   `validation.md`.
5. Quit-mid-write is automated in the harness through the test knob; confirm
   once by hand with `MEMORY_ENV=test MIRROR_TEST_FRONT_DOOR_DELAY_MS=3000`:
   send a prompt, quit within three seconds of the response. Pass: the user
   message is in the database and the conversation is closed. Fail: message
   missing or conversation closed before it.
6. Full Pi smoke on the real home after the change: open Pi, `/mm-mirror`,
   one reflection, `/mm-build mirror`, quit. Pass: both conversations logged
   with messages in order, status line correct throughout. This proves the
   seams still compose; the matrix only proves the seams.

## Checkpoint

Implementation must not start until the Navigator approves this plan.
