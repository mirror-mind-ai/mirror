[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR148 — The front door dies with a stack trace when its stdout closes early

## Problem

`mirror ext <id> | head -1` — or any pipe that stops reading before the front door
stops writing — ends in an unhandled `EPIPE`:

```text
node:events:487
      throw er; // Unhandled 'error' event
      ^
Error: write EPIPE
    at afterWriteDispatched (node:internal/stream_base_commons:159:15)
    …
    at emit (…/ts/src/frontDoor/extensionCatalogRoute.ts:83:39)
```

The route's `emit` writes `process.stdout.write(rendered.stdout)` and nothing in the
tree listens for `error` on `process.stdout` (`grep EPIPE ts/src` finds nothing). A
closed pipe is the reader's business, not an error of ours: `head`, `tail`, a pager
that quit, a `grep -q` that matched — every one of them closes stdout early on
purpose, and every one of them gets the stack trace instead of silence.

Seen on `mirror-mind@0.35.0` during CR145's validation, from a mistyped `tail -`;
the write path is the same on `main`.

## Expected Behavior

A closed stdout ends the command quietly: no stack trace, no partial line on
stderr, exit status as the shell convention has it (the reader's exit decides the
pipeline; the writer's `EPIPE` is not news). One handler at the front door's
entry — `process.stdout.on("error", …)` that swallows `EPIPE` and exits — covers
every route, including the ones that never see `extensionCatalogRoute.ts`.

## Impact

Low in frequency, high in how it reads: a Node stack trace on a shell idiom as
ordinary as `| head` is the kind of first impression the front door exists to
avoid. One listener, one test.

The hook entry is the production case. `ts/src/hooks/main.ts` promises that every
path returns 0 and wraps `dispatch()` in a try/catch as its last line of defense —
but an unhandled `error` event on a stream is not a throw in that `await` chain. It
becomes an `uncaughtException` and exits 1 *around* the catch. A runtime that gives
up on a hook (Grok bounds `SessionEnd` at 1.5 s) closes the pipe, and today the hook
answers with a stack trace into the host's log and the one exit code the contract
forbids.

Accepted, and written here so nobody later reads it as a database bug: **stop means
stop.** When the reader closes the pipe, the process exits at the next write, and
work the command had not yet done — a commit after a progress line, a log after an
`await` — is abandoned, exactly as `SIGPIPE` abandons git's. The shell's contract
is that the reader decides; `mirror … | head -1` asks for one line, not for the
command's side effects.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's validation (the first run, step 8),
at the Navigator's direction. Current Focus unchanged.

Selected as Current Focus 2026-10-20.

Reviewed 2026-10-20 through three lenses — engineering, operations, quality
assurance — and seven amendments folded in at the Navigator's direction: the hook's
`exit` writes one `hooks.log` line first and its call site names the contract hole;
the handler is installed before configuration; "stop means stop" recorded in Impact;
the integration test asserts its own precondition and the CR keeps the control run;
unit tests for both-streams-once and non-`EPIPE`-rethrown; the validation route
gains a negative control on the published package; exit 0 kept, with the
`pipefail` rationale. Plan approved 2026-10-20 → `planned`. Started the same day:
Driver @viniciusteles, Delivery `main` → `in_progress`. Implemented and committed
the same day (`314b2cb8`). Navigator validation route run by @viniciusteles on
2026-10-20, every step observed as stated → `validated`.

### Plan (approved 2026-10-20)

**Objective.** A closed stdout or stderr ends the command quietly, on every route
of both entries, with one listener and one test that reproduces the trace.

**Behavior.**

1. *One handler, at the entry.* `runAsEntry()` in `ts/src/frontDoor/cli.ts`
   (`mirror`, which includes `mirror mcp`) and in `ts/src/hooks/main.ts`
   (`mirror-hook`) both call a new `exitQuietlyOnBrokenPipe()`. Order in each:
   the warning filter, then this handler, then `loadConfiguration` — the handler
   before any code that could write. Nothing per route: `emit` and the ~40
   `process.stdout.write` sites in `cli.ts` stay as they are. No guard against
   double registration: `runAsEntry` runs once per process, and no test calls it
   in-process.
2. *What it does.* Listens for `error` on `process.stdout` and `process.stderr`.
   On `EPIPE` it calls the injected `exit(0)` and writes nothing: the reader asked
   us to stop, and nothing of ours failed. Any other error is **rethrown**, so
   today's behavior for a real stream failure — the trace — is unchanged. A second
   `EPIPE` (both streams on the same pipe, `2>&1 | head`) never fires: the first
   exit wins.
3. *The two entries differ in one line.* The CLI passes `process.exit`. The hook
   passes `(code) => { noteHookFailure(name, "stdout closed early"); process.exit(code); }`
   — one line in `<mirror-home>/hooks.log`, where a person debugging a runtime
   will look, then silence. The hook's call site says why it is there: the
   try/catch around `dispatch()` cannot catch a stream's `error` event, and this
   is the path on which "every hook returns 0" was not true.
4. *Why 0 and not 141.* Git and coreutils die of `SIGPIPE` and report 141, which
   under `set -o pipefail` — which every CI script worth trusting sets — fails a
   pipeline the person wrote on purpose; the fix they reach for is `|| true`,
   which then hides the real failures too. Node ignores `SIGPIPE` and surfaces
   `EPIPE`, which gives us the choice; `npm`, `cargo`, and `kubectl` exit 0. We
   follow them: `mirror … | head -1` is a successful pipeline.
5. *Out of the handler's reach, by design.* An extension subcommand's streams are
   inherited; if it writes to the closed pipe it gets its own `EPIPE`, and Mirror
   reports the child's status as it does today. The MCP server's stdout is its
   protocol channel; an `EPIPE` there is the client having died mid-response, and
   its careful draining is moot with nobody to drain to — `serve.ts` is untouched.
   libuv maps `ERROR_BROKEN_PIPE` to `EPIPE` on Windows, so the one code covers
   all three platforms; on Linux pipes are synchronous and on macOS asynchronous,
   and in both the failure arrives as the stream's `error` event, never as a
   throw from `write()`.

**Affected files.**

- `ts/src/runtime/brokenPipe.ts` — new: `exitQuietlyOnBrokenPipe(exit, streams?)`,
  both injectable.
- `ts/src/frontDoor/cli.ts`, `ts/src/hooks/main.ts` — one call each in `runAsEntry`,
  in the order above; the hook's with its `hooks.log` line and the comment.
- `ts/test/runtime/brokenPipe.test.ts` — new. Unit, on fake streams: `EPIPE` on one
  stream calls `exit(0)` exactly once; `EPIPE` on both streams, once; a non-`EPIPE`
  error (`ECONNRESET`, and a plain `Error`) is rethrown and `exit` is not called.
  Integration: spawn the real `cli.ts --help` with stdout piped, destroy the
  parent's read end at once, assert `child.exitCode === null` right after (the
  child had not finished — the precondition that makes the test mean something),
  then assert exit 0 and an empty stderr. The same test on `main` exits 1 with
  `Unhandled 'error' event`; that control run is recorded in Evidence, because if
  this test ever flakes it flakes toward a false pass, and the control is what
  proves it can fail.
- `REFERENCE.md` — no section documents exit codes or pipes; untouched.

**Acceptance.**

1. On `main`, the integration test fails with exit 1 and `Unhandled 'error' event`
   on stderr; with the change, it passes: exit 0, stderr empty, precondition held.
2. `mirror ext <id> | true` in a scratch home — a reader that closes without
   reading, which is what makes a 2 KB output hit a closed pipe at all — exits 0
   with nothing on stderr; `mirror ext <id> 2>&1 | true` and `mirror --help | true`
   the same. `| head -1` still prints the first line and exits 0, but proves
   nothing: the write lands in the pipe buffer before `head` quits.
3. A non-`EPIPE` stream error still surfaces as it does today; `EPIPE` on both
   streams exits once (unit tests).
4. `mirror-hook`'s `runAsEntry` installs the handler with the `hooks.log` line
   (read in review; the hook's existing tests keep passing).

**Validation route (Navigator).** The reader that reproduces the trace is one that
closes *without reading*: `| true`. (`| head -1` does not: a 2 KB listing is
written whole into the pipe buffer before `head` quits, so there is no `EPIPE` to
handle — the Driver found this when the planned control failed to fail.) Exit
codes are read with `${PIPESTATUS[0]}` in bash or `$pipestatus[1]` in zsh, since
`$?` is `true`'s.

First the negative control, on the published package:
`/opt/homebrew/bin/mirror --help | true; echo "exit=${PIPESTATUS[0]}"` → the
`Unhandled 'error' event` trace on stderr and `exit=1` (0.35.0 has no handler; if a
release carrying this CR is installed by then, the control is moot and says so).
Then the checkout binary by path (`"$M" runtime status | grep '^Install:'` →
`clone`), in a scratch home with any installed extension:
`"$M" ext <id> | true; echo "exit=${PIPESTATUS[0]}"` → `exit=0`, nothing on stderr;
`"$M" ext <id> 2>&1 | true; …` → the same; `"$M" --help | true; …` → the same.
Then the ordinary idiom once, for the eye: `"$M" ext <id> | head -1` → the
`=== subcommands …` line, exit 0.
Pass: the control shows the old trace with exit 1, and the three `| true` runs
show nothing on stderr with exit 0. Fail: any `EPIPE` or stack-trace text on the
three runs, or a non-zero exit.

**Exclusions.** `SIGPIPE`-faithful 141. Handling `EPIPE` inside extension
subcommands. Documenting exit codes in `REFERENCE.md`. Any observability beyond the
hook's one log line. Accepted and written down, not tested: work after the reader
closes is abandoned; `EBADF` cannot occur (Node reopens fds 0–2 to `/dev/null` at
startup); the Windows mapping is libuv's claim, not ours.

**Authority boundaries.** Approval → `planned`; Driver and Delivery at start; no
commit, push, or release from this document.

## Evidence

The Navigator's transcript, 2026-10-20, 0.35.0 (`/opt/homebrew/lib/node_modules/mirror-mind`):
the trace above. `ts/src/frontDoor/extensionCatalogRoute.ts:83–87` (`emit`) on `main`.

### Implementation evidence (2026-10-20, Driver)

**Control run, recorded because the test's only failure mode is a false pass.**
`ts/test/runtime/brokenPipe.test.ts` with the handler written but not yet wired
into either entry: the three unit cases pass, the integration case fails with
`stderr must be empty, got: … Unhandled 'error' event … Error: write EPIPE …` and
exit 1, the precondition `child.exitCode === null` having held. Wired: 4 of 4.

**Checks.** `npm run typecheck` clean; `biome check .` clean (672 files);
`npm test` 3386 tests, 3383 pass, 0 fail, 3 skipped (pre-existing).

**Smoke through the real binaries**, scratch home, the `notes` fixture copied in:

- Negative control, `/opt/homebrew/bin/mirror --help | true` (0.35.0): exit 1,
  `node:events:487 / throw er; // Unhandled 'error' event` on stderr.
- `$M ext notes | true` → exit 0; `$M ext notes 2>&1 | true` → exit 0;
  `$M --help | true` → exit 0 with 0 bytes on stderr.
- `$M ext notes | head -1` → the `=== subcommands of extension/notes ===` line,
  exit 0 — and the same on 0.35.0, which is how the Driver learned that `head -1`
  is not a reproduction: the planned control "failed to fail", and the route was
  corrected to `| true` before validation.
- The hook entry: `ts/src/hooks/main.ts claude:session-start` spawned with its
  stdout destroyed before it wrote and `{}` on stdin → exit 0, empty stderr, and
  `<mirror-home>/hooks.log` gained one line:
  `2026-10-20T13:51:05.305Z claude:session-start: stdout closed early`.

### Navigator validation (2026-10-20, @viniciusteles)

The corrected route, run once, against the checkout's binary by path
(`Install: clone`) in a scratch home with the `notes` fixture:

- Negative control, `/opt/homebrew/bin/mirror --help | true` (0.35.0): the full
  `Unhandled 'error' event` / `Error: write EPIPE` trace, `exit=1`.
- `"$M" ext notes | true` → `exit=0`, nothing on stderr.
- `"$M" ext notes 2>&1 | true` → `exit=0`, nothing.
- `"$M" --help | true` → `exit=0`, nothing.
- `"$M" ext notes | head -1` → `=== subcommands of extension/notes ===`.

Accepted: five of five, control included.

### Debt review (2026-10-20)

**Proportionality.** Six files: one module of ~50 lines, one call per entry, one
test file. No route touched. Proportionate.

**What the work taught, recorded rather than owed:** `| head -1` is not a
reproduction for an output smaller than the pipe buffer; the route and the
acceptance say `| true` and why. The plan's original control would have validated
nothing — the same lesson CR145's first run taught about the binary on PATH, now
twice in one day: a validation route has to be shown failing before it is trusted
passing.

**Accepted and written, not tested** (from the plan's exclusions): work after the
reader closes is abandoned; `EBADF` cannot occur; libuv's Windows mapping of
`ERROR_BROKEN_PIPE` to `EPIPE`.

**Not captured, the Navigator's call:** the package smoke
(`scripts/smoke_npm_package.sh`) exercises the published layout's bins and could
carry one `| true` line so the handler is proven on the `npm install -g` path too —
the loader shim is the only difference, and it is upstream of `runAsEntry`, so the
risk is small. Nothing else found.

## Outcome

Open.
