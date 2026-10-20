// A closed stdout or stderr ends the command quietly (CR148).
//
// `mirror ext <id> | head -1` is a shell idiom, not an error: `head`, `tail`,
// a pager that quit, a `grep -q` that matched -- every one of them closes its
// read end on purpose. Node ignores SIGPIPE and surfaces the next write as an
// `error` event on the stream, and with nobody listening that event is an
// uncaught exception: `Unhandled 'error' event`, `Error: write EPIPE`, a
// stack, exit 1. Nothing of ours failed; the reader asked us to stop.
//
// One listener at each entry (`frontDoor/cli.ts`, `hooks/main.ts`), nothing
// per route. On EPIPE: exit 0 and write nothing. The exit status follows
// `npm`, `cargo`, and `kubectl`, not git's 141: under `set -o pipefail`, 141
// fails a pipeline the person wrote on purpose, and the fix they reach for is
// `|| true`, which then hides the real failures too.
//
// Stop means stop. The exit happens at the next write after the reader
// closes, and work the command had not done by then -- a commit after a
// progress line, a log after an `await` -- is abandoned, exactly as SIGPIPE
// abandons git's. That is the shell's contract, recorded in the CR.
//
// Anything that is not EPIPE is rethrown: a real stream failure keeps the
// trace it had before. On Linux pipes are synchronous and on macOS
// asynchronous; in both the failure arrives as this event, never as a throw
// from `write()`. libuv maps ERROR_BROKEN_PIPE to EPIPE on Windows.

type Exit = (code: number) => void;

/**
 * Install the handler. `exit` is `process.exit` for the CLI; the hook passes
 * one that leaves a line in `hooks.log` first, because the hook's promise
 * that every path returns 0 cannot be kept by its try/catch -- a stream's
 * `error` event is not a throw in that `await` chain.
 *
 * Called once per process by `runAsEntry`; no guard against a second call,
 * because there is no second call, and no test runs an entry in-process.
 */
export function exitQuietlyOnBrokenPipe(
  exit: Exit,
  streams: readonly NodeJS.WritableStream[] = [process.stdout, process.stderr],
): void {
  let exiting = false;
  for (const stream of streams) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error;
      // Both streams on one pipe (`2>&1 | head`) fail together. A real
      // `process.exit` never returns; an injected one must still count once.
      if (exiting) return;
      exiting = true;
      exit(0);
    });
  }
}
