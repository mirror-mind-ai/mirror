// `identity edit <layer> <key>` (CV22.DS7.TS4 plateau 6, Scope F).
//
// Port of `cmd_edit` in `src/memory/cli/identity_cmd.py`. The command is small
// and its risk is not: it hands a human's identity content to an arbitrary
// program and saves whatever comes back, so the three refusals matter more than
// the happy path.
//
//   * **A failed editor saves nothing.** A non-zero exit is an abort, not an
//     empty buffer -- someone who quits `vim` with `:cq` means "discard".
//   * **Blank content is refused, never stored.** An identity layer emptied by
//     accident is a silent loss the next Mirror Mode load would inherit.
//   * **An unchanged buffer writes nothing at all**, so `updated_at` does not
//     move and the content's history stays honest.
//
// The temp file carries the content of a person's identity, so it is created
// 0600 (Python gets this from `NamedTemporaryFile`) and removed on EVERY path,
// including the ones that refuse. Both are asserted by tests rather than
// assumed: they are the security-engineer's plan-stage requirement.

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WritableDatabase } from "#db/database.ts";
import { applyIdentitySet } from "#frontDoor/identityWrite.ts";

export interface IdentityEditResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface IdentityEditDeps {
  /** The editor argv[0], resolved the way Python resolves it. */
  editor?: string | undefined;
  visual?: string | undefined;
  nowIso: () => string;
  /** Injected so a test can watch the buffer without driving a real editor. */
  spawn?: typeof spawnSync;
  /** Injected so a test can assert the temp file is gone afterwards. */
  onTempFile?: (path: string) => void;
  newId: () => string;
}

/** Python's `os.environ.get("EDITOR") or os.environ.get("VISUAL") or "nano"`. */
export function resolveEditor(deps: IdentityEditDeps): string {
  return deps.editor || deps.visual || "nano";
}

/**
 * Python's `NamedTemporaryFile(prefix=..., suffix=".md", delete=False)`: a
 * fresh name in the system temp directory, created 0600 by the open itself.
 *
 * `wx` is what makes it safe: creating with exclusive intent means the command
 * can never write identity content into a path that already exists, which is
 * the whole difference between a temp file and a target of someone else's
 * choosing.
 */
function writePrivateTempFile(prefix: string, content: string): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const path = join(tmpdir(), `${prefix}${suffix}.md`);
    try {
      const handle = openSync(path, "wx", 0o600);
      try {
        writeSync(handle, content);
      } finally {
        closeSync(handle);
      }
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("could not create a private temporary file for identity edit");
}

/** Port of `cmd_edit`. */
export function runIdentityEdit(
  db: WritableDatabase,
  layer: string,
  key: string,
  deps: IdentityEditDeps,
): IdentityEditResult {
  const existing = db
    .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
    .get(layer, key) as { content: string } | undefined;
  const currentContent = existing?.content ?? "";
  const editor = resolveEditor(deps);

  const tempPath = writePrivateTempFile(`mirror-identity-${layer}-${key}-`, currentContent);
  deps.onTempFile?.(tempPath);

  let newContent: string;
  try {
    const spawn = deps.spawn ?? spawnSync;
    const result = spawn(editor, [tempPath], { stdio: "inherit", shell: false });
    if (result.error) {
      // Python raises FileNotFoundError here and the traceback escapes. Same
      // exit code, one line, on the same stream: the recorded divergence class.
      return {
        stdout: "",
        stderr: `Editor '${editor}' could not be started.\n`,
        exitCode: 1,
      };
    }
    if (result.status !== 0) {
      return {
        stdout: "",
        stderr: `Editor exited with code ${result.status}. Aborted.\n`,
        exitCode: 1,
      };
    }
    newContent = readFileSync(tempPath, "utf8");
  } finally {
    // Every path, including the refusals above: the buffer holds identity
    // content and must not outlive the command.
    rmSync(tempPath, { force: true });
  }

  if (!newContent.trim()) {
    return {
      stdout: "",
      stderr: "Content is empty after editing. No changes saved.\n",
      exitCode: 1,
    };
  }
  if (newContent === currentContent) {
    return { stdout: "No changes detected.\n", stderr: "", exitCode: 0 };
  }

  // The same write `identity set` routes through, including its created/updated
  // verb: two commands that disagree about whether a key existed would be two
  // truths about one row.
  const outcome = applyIdentitySet(db, {
    layer,
    key,
    content: newContent,
    id: deps.newId(),
    nowIso: deps.nowIso(),
  });
  return { stdout: `✓ ${layer}/${key} ${outcome.action}\n`, stderr: "", exitCode: 0 };
}
