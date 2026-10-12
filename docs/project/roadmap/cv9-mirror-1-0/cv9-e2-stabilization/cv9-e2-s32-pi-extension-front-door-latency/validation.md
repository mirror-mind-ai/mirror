[< CV9.E2.S32](index.md)

# Validation — CV9.E2.S32 Pi Extension Front-Door Latency

## Automated gate (2026-10-12, implementation checkout)

```text
npm run typecheck      clean
npm test               3081 tests, 3079 pass, 0 fail, 2 skipped (pre-existing)
npm run lint           637 files, clean
git diff --check       clean
checkSkillCommandParity   25 skills clean; probe with `session-start --welcome`
                          in a SKILL.md refused by name (then reverted)
checkDocLinks          clean
```

New suites:

- `ts/test/frontDoor/sessionStartWelcomeRoute.test.ts` — 8 tests through the
  real CLI (byte-identity against the standalone commands, write-before-read,
  disabled welcome, both refusals, unresolvable home parity, one front-door
  log entry) plus the injected render failure.
- `ts/test/pi/mirrorLoggerExtension.test.ts` — 15 tests driving the real
  extension with a fake `pi`: composite argv, envelope → notify/status,
  unreadable envelope, no-UI path, non-blocking prompt log, serialization of
  consecutive prompts, assistant-after-user on success / failure / timeout,
  aborted turn, shutdown-after-chain with map delete, session switch
  independence, the test knob on and inert.

## Front-door path timing (pre-registered: median of five, pass `after ≤ before − 300 ms`)

Same isolated home, same env (`MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off`), the
exact argv the extension sends, measured around the `node bin/mirror.js`
invocations. "Before" is the three sequential processes the extension
spawned until this story; "after" is the one composite.

| run | before (3 processes) | after (1 process) |
|-----|---------------------:|------------------:|
| 1 | 874 ms | 387 ms |
| 2 | 851 ms | 395 ms |
| 3 | 850 ms | 391 ms |
| 4 | 846 ms | 381 ms |
| 5 | 856 ms | 387 ms |
| **median** | **851 ms** | **387 ms** |

Delta **464 ms**. Pass (≥ 300 ms).

Per turn, the awaited `log-user` (~200 ms) is no longer on the path before the
agent starts; it is a chain link the turn's `agent_end` settles instead.

## `front-door.log`, one composite open

```text
2026-10-12T19:01:35.578Z	INFO	conversation-logger	ts	exit=0
```

One entry where the extension used to leave three (`conversation-logger`,
`welcome`, `welcome`). Metadata only.

## Navigator validation (pending)

The in-Pi routes in the test guide (steps 1–6) require an interactive
session and remain for the Navigator: startup rendering against the pre-change
capture, three-prompt turn order, the in-Pi `front-door.log`, the
`mirror-logger.log` timestamp medians, the quit-mid-write confirmation with
`MEMORY_ENV=test MIRROR_TEST_FRONT_DOOR_DELAY_MS=3000`, and the full Pi smoke.

Pre-change capture for step 1, from the same isolated home (the real home's
card differs only in the numbers):

```text
◇ Mirror · home
Version 0.32.1 · channel main
0 journeys · 0 personas · 0 memories · 0 conversations · since today

→ Where shall we begin?
```

Status line: `◇ home · ◌ Mirror Mode · ✓`. The composite's `welcome` and
`statusLine` fields equal these byte for byte (route test 1).
