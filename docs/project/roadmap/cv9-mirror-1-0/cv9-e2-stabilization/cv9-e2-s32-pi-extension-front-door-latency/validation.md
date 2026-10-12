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

## Navigator validation (2026-10-12, real Pi, home `vinicius-dev`)

**Verdict:** accepted by the Navigator. Every seam this story changed behaved
as specified. Step 2's criterion failed as run, for a cause that predates this
story. Steps 2 and 5 did not force the races they were written to probe; the
harness covers those. Step 6 reached Builder Mode in a correctly launched
session but did not repeat the Mirror half there. Each step is recorded below
as it happened. Times are UTC.

### Launch environment

The in-Pi routes are valid only through the launcher `mirror-dev [slug]`, which
puts `~/.local/mirror-dev/bin` first on `PATH` and exports
`MIRROR_USER=vinicius-dev`. A bare `pi` in the checkout loads this tree's
extension, which finds the dev home through `.env`, while the skills' `mirror`
resolves through the shell's `PATH` to the global package (v0.32.1, home
`vinicius`). `which mirror` answered `/opt/homebrew/bin/mirror` in the three
bare sessions (19:40, 19:47, 19:48) and `~/.local/mirror-dev/bin/mirror` in the
`mirror-dev mirror` session (19:49).

### Step 1 — startup rendering: pass

The Navigator confirmed the welcome card and the status line in the session
opened at 19:21:58. Pre-change capture, from the same isolated home (the real
home's card differs only in the numbers):

```text
◇ Mirror · home
Version 0.32.1 · channel main
0 journeys · 0 personas · 0 memories · 0 conversations · since today

→ Where shall we begin?
```

Status line: `◇ home · ◌ Mirror Mode · ✓`. The composite's `welcome` and
`statusLine` fields equal these byte for byte (route test 1).

### Step 2 — turn order: criterion failed as run, cause pre-existing; order holds

Run twice (19:19 and 19:30), with `one`, `two`, `three` typed in quick
succession. Pi delivered `two` and `three` as steering messages inside the run
`one` had started: its transcript reads user, assistant, user, assistant, user,
assistant within one run. `before_agent_start` and `agent_end` each fired once,
so the record (`16c951d5`) holds `one` and a single assistant message carrying
the three replies. Against the criterion that is a fail: two user messages are
missing.

The cause predates this story. The extension at `470c4107` has the same single
`before_agent_start` hook and the same assistant-only extraction at
`agent_end`. Registered as
[D-029](../../../../debt.md#d-029--the-pi-extension-records-only-the-first-prompt-of-an-agent-run).

The run also could not exercise what the step was written for. A prompt sent
during a run joins that run, so consecutive `log-user` writes never contend on
the chain; their serialization rests on the harness test "two prompts in a row
serialize: the second log-user starts only after the first exits". What the
chain protects (each prompt recorded before its reply, and prompts in order)
holds in the record across separate runs: `1cc0d3db` (the 19:40 session, four
runs) reads user, assistant four times, in prompt order.

### Step 3 — front-door log: pass

Every startup on the new path left one awaited `conversation-logger` entry and
no `welcome` entry before its first `agent_end`. Every startup on the old path
left `conversation-logger`, `welcome`, `welcome` (for example 17:34:58.622,
17:34:58.943, 17:34:59.133). On both paths the detached `session-maintenance`
process adds its own `conversation-logger` entry a moment later.

### Step 4 — startup time: pass, 846 ms → 470 ms (Δ 376 ms)

Endpoint: `session_start fired` → `session-maintenance started` in
`mirror-logger.log`. The status set is not logged. In both versions of the
extension, the maintenance spawn is the line logged right after it, so this
measures the pre-registered "status set after the welcome" on both sides. The
`welcome:` line is not a fair endpoint, because on the old path the status-line
process ran after it.

Selection: no sample was a controlled cold start. The rule applied is the five
starts adjacent to the change on each side (the last five on the old path, the
first five on the new) with no exclusions.

| run | before (old path, 3 processes) | after (composite) |
|-----|-------------------------------:|------------------:|
| 1 | 1143 ms (17:26:24) | 473 ms (19:16:31) |
| 2 | 1095 ms (17:34:12) | 470 ms (19:16:52) |
| 3 | 846 ms (17:34:58) | 476 ms (19:17:01) |
| 4 | 843 ms (17:36:22) | 458 ms (19:19:01) |
| 5 | 813 ms (17:38:12) | 461 ms (19:21:58) |
| **median** | **846 ms** | **470 ms** |

`470 ≤ 846 − 300`: pass. Sensitivity checks:

- Back-to-back starts only (the last three before, the five after): 843 → 470 ms.
- Every start of the day on each path (eight old; ten new, leaving out 19:37,
  which ran under the 3,000 ms test delay): 1,091 → 472 ms.

The old path took about 1.1 s when the previous start was eight or more minutes
earlier, and about 0.83 s back to back. The one new-path start after a long gap
(19:16:31, 98 minutes after the previous start in this home) took 473 ms.

### Step 5 — quit mid-write: criterion met; the race was not forced by hand

Run once at 19:37 under `MEMORY_ENV=test MIRROR_TEST_FRONT_DOOR_DELAY_MS=3000`,
so the writes went to `memory_test.db`. The knob was honored: the startup
composite took 3,391 ms, and the `log-user` process for `ping`, sent at
19:37:50.695, exited at 19:37:53.973. `log-assistant` was spawned after it
(19:37:54.146), and the session closed at 19:38:04.452. The record (`069a99c0`)
holds `ping`, then `pong`, and is closed.

The reply took 3.45 s, longer than the delay, and the quit came about seven
seconds after it. So neither the `agent_end` wait nor the `session_shutdown`
wait found a write still pending. Both waits rest on the harness: "agent_end
spawns log-assistant only after the pending log-user has exited" and
"session_shutdown runs session-end-pi only after the pending log-user has
exited".

### Step 6 — full Pi smoke: this story's seams pass; the clean launch covered the Builder half

- **19:40, bare `pi`.** `/mm-mirror`, a reflection, `/mm-build mirror`,
  `which mirror`, quit. The extension's side was correct throughout: one
  startup composite, the record in turn order (`1cc0d3db`), and the
  conversation closed at quit (19:46:58). The status line stayed on
  `◌ Mirror Mode` after `/mm-build`. The production home's `front-door.log`
  holds this session's `mirror` calls (19:40:32, 19:41:11) and its
  `build load` (19:42:01), and the dev home holds none. The status line read
  the dev home correctly; Builder Mode had been activated in the other home.
- **19:49, `mirror-dev mirror`.** `build load` ran in the dev home (19:49:19,
  19:49:25), and the Navigator saw the status line switch to `■ Builder Mode`.
  `/mm-mirror`, the reflection, and the quit were not repeated in this launch.

### Observed, not caused by this story

- **Prompts queued into a run are not recorded.**
  [D-029](../../../../debt.md#d-029--the-pi-extension-records-only-the-first-prompt-of-an-agent-run),
  from step 2.
- **A bare `pi` in the checkout splits the runtime across two homes.** The
  extension writes the dev home and the skills write the production home. The
  launcher is the supported entry. Not registered.
- **The turn that runs `build load` is split across two conversations.** The
  activating prompt is logged before `build load` opens the new conversation,
  so the prompt stays alone in the previous conversation and the reply opens the
  new one. On 2026-10-12 the dev home holds ten lone, one-message
  `Change to journey mirror` conversations: six opened on the old path (14:42
  to 17:38) and four on the new. Not registered; raised to the Navigator.
