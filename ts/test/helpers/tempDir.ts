// CR163 — every temp home the suite makes, made in one place and removed when
// the test file's process exits.
//
// `tempDir(prefix)` makes a fresh directory under `os.tmpdir()` and returns its
// real path, so a test that compares the product's resolved paths with its own
// never meets macOS's `/var` → `/private/var`.
//
// Removal happens on the process's `exit` event, not in a `node:test` `after`
// hook: hooks run in the order they are registered, so one registered when this
// module is imported would run before the file's own `after` hooks, and those
// may still use their homes. `exit` comes after every hook, in every isolation
// mode, and whether the file's tests passed or not.
//
// It removes only the directories it recorded — never a path from an argument
// or the environment. A removal that fails prints one line to stderr and
// changes nothing else: what is left is the run-level check's to report
// (`scripts/test_leaves_nothing.sh`), not the test's verdict to change.

import { mkdtempSync, realpathSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const made: string[] = [];

process.on("exit", () => {
  for (const dir of made.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? String(error);
      // Synchronous: an asynchronous stderr write may be lost at exit.
      writeSync(2, `tempDir: could not remove ${dir}: ${code}\n`);
    }
  }
});

/** A fresh directory under the system temp folder, by its real path; removed when the process exits. */
export function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}
