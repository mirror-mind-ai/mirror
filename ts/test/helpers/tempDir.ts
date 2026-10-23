// CR163 — every temp home the suite makes, made in one place and removed when
// the test file's process exits.
//
// `tempDir(prefix)` makes a fresh directory named for the prefix under
// `os.tmpdir()` and returns, by its real path, a `tmp` directory inside it. The
// real path, so a test that compares the product's resolved paths with its own
// never meets macOS's `/var` → `/private/var`. A `tmp` directory, because the
// product's copy-only guard (`assertCopyTarget`, CR030) refuses a database write
// whose resolved path has no `tmp` segment, and the system temp folder has none
// on macOS (`/var/folders/…/T`): the reason the suite once hardcoded `/tmp`. The
// prefix stays on the directory removed at exit, so a leftover names its test.
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

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeSync } from "node:fs";
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

/**
 * A fresh `tmp` directory, by its real path, inside one named for `prefix` under
 * the system temp folder; both removed when the process exits.
 */
export function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  const home = join(dir, "tmp");
  mkdirSync(home);
  return home;
}
