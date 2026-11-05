// CR192: every reader uses MIRROR_NODE only as an absolute path to an
// executable file. The shell readers -- the generated hook wrappers and the
// plugin's MCP locator -- share one `case` pattern for "absolute", and it has to
// be the Windows rule: under Git Bash the Windows installer writes a
// drive-letter path, `C:\Users\…\AppData\Local\Programs\MirrorMind\node\node.exe`,
// which a POSIX-only `/*` would refuse on every hook (Rodrigo Immaginario, PR #47).
//
// This is the file the Windows CI job runs under Git Bash, so every case here
// must hold on win32 as on POSIX: no shell-script stubs, which a native Node
// cannot run there, only Node itself and a JavaScript entry. The POSIX-only
// cases -- each refusal reason, the daily rule, the three wrapper forms -- are
// in `hooks.test.ts`; the locator's are in `mcpEntry.test.ts`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve, win32 } from "node:path";
import { after, describe, test } from "node:test";
import { ABSOLUTE_PATH_CASE, MCP_LOCATOR } from "#guards/claudePlugin.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const WINDOWS = process.platform === "win32";
const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-node-rule-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A generated wrapper's text, with LF endings whatever the checkout did. */
function wrapperText(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8").replace(/\r\n/g, "\n");
}

/** The pattern a generated wrapper tests MIRROR_NODE against. */
function wrapperPattern(path: string): string {
  return /case "\$MIRROR_NODE" in\n\s*(\S+)\)\n/.exec(wrapperText(path))?.[1] ?? "";
}

// Every shape the rule has to tell apart: POSIX-rooted; Windows drive-rooted
// with either slash and either case; UNC and root-relative backslash paths;
// and the relative ones -- a bare name, `./`, `../`, `~` (which nothing
// expands in an environment variable), and drive-relative `C:node.exe`.
const VALUES = [
  "/opt/homebrew/bin/node",
  "C:\\Program Files\\nodejs\\node.exe",
  "C:/Program Files/nodejs/node.exe",
  "c:\\n\\x",
  "\\\\server\\share\\node.exe",
  "\\node.exe",
  "C:node.exe",
  "node",
  "./node",
  "../bin/node",
  "~/node",
  "CC:\\x",
  "1:\\x",
  "C:",
  "C:\\",
];

// bash everywhere -- Git Bash on Windows -- and dash where it is installed:
// the MCP locator runs under /bin/sh, which is dash on Ubuntu and bash on a Mac.
const SHELLS = ["bash", ...(!WINDOWS && existsSync("/bin/dash") ? ["/bin/dash"] : [])];

describe("CR192: one rule for what the shell readers call an absolute MIRROR_NODE", () => {
  test("the wrappers, in all three forms, and the MCP locator carry the same pattern", () => {
    for (const path of [
      ".claude/hooks/session-start.sh",
      "plugins/mirror-mind/hooks/session-start.sh",
      "plugins/mirror-mind/agy/session-start.sh",
    ]) {
      assert.equal(wrapperPattern(path), ABSOLUTE_PATH_CASE, path);
    }
    assert.ok(
      MCP_LOCATOR.includes(`case "$mmnode" in ${ABSOLUTE_PATH_CASE}) `),
      "the locator tests its copy of MIRROR_NODE against the same pattern",
    );
  });

  for (const shell of SHELLS) {
    test(`the pattern classifies exactly as path.win32.isAbsolute, in ${shell}`, () => {
      // The script and the values go in as file bytes and stdin, never as
      // arguments: a Windows command line has its own rules for backslashes.
      const root = scratch();
      writeFileSync(
        join(root, "classify.sh"),
        `while IFS= read -r v; do case "$v" in ${ABSOLUTE_PATH_CASE}) echo absolute ;; *) echo relative ;; esac; done\n`,
      );
      const result = spawnSync(shell, ["classify.sh"], {
        cwd: root,
        input: `${VALUES.join("\n")}\n`,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(
        result.stdout.trim().split(/\r?\n/),
        VALUES.map((value) => (win32.isAbsolute(value) ? "absolute" : "relative")),
      );
    });
  }
});

/**
 * A scratch tree shaped like the checkout: one copied tree-form wrapper and a
 * JavaScript stub at `bin/mirror-hook.js` that records the Node that ran it.
 * The wrapper is copied, not run in place, so the stub is its entry.
 */
function treeWithStub(root: string): { wrapper: string; ran: string; home: string } {
  const tree = join(root, "tree");
  mkdirSync(join(tree, ".claude", "hooks"), { recursive: true });
  mkdirSync(join(tree, "bin"));
  writeFileSync(
    join(tree, ".claude", "hooks", "log-user-prompt.sh"),
    wrapperText(".claude/hooks/log-user-prompt.sh"),
    { mode: 0o755 },
  );
  const ran = join(root, "entry-ran");
  writeFileSync(
    join(tree, "bin", "mirror-hook.js"),
    `require("node:fs").writeFileSync(${JSON.stringify(ran)}, process.argv[2] ?? "");\n`,
  );
  // Relative to the cwd, with forward slashes: what Git Bash makes of a
  // Windows path passed as the script is not this test's subject.
  return { wrapper: "tree/.claude/hooks/log-user-prompt.sh", ran, home: join(root, "home") };
}

/** The wrapper, run from the scratch root as a runtime runs it from a project. */
function runWrapper(root: string, wrapper: string, home: string, env: Record<string, string>) {
  // On Windows the child keeps the runner's environment, which Git Bash needs;
  // its keys are case-insensitive there, so `Path` goes before `PATH` is set.
  const base: Record<string, string | undefined> = WINDOWS ? { ...process.env } : {};
  const overridden = new Set(["MIRROR_NODE", "MIRROR_BIN", "MIRROR_USER", "XDG_CONFIG_HOME"]);
  for (const name of [...overridden, ...Object.keys(env), "HOME", "MIRROR_HOME"]) {
    for (const key of Object.keys(base)) {
      if (key.toUpperCase() === name.toUpperCase()) delete base[key];
    }
  }
  return spawnSync("bash", [wrapper], {
    cwd: root,
    env: { ...base, HOME: home, MIRROR_HOME: home, ...env },
    input: "{}",
    encoding: "utf8",
  });
}

function hooksLog(home: string): string[] {
  const path = join(home, "hooks.log");
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [];
}

describe("CR192: a wrapper run as a runtime runs it", () => {
  test("a node under a path with a space, named in the platform's absolute form, runs the hook with no refusal", () => {
    // On Windows this is the installer's shape, a drive-letter path with a space in
    // it (the installer's is under the user's folder), read under Git Bash. Elsewhere, the same directory names on a POSIX path.
    const root = scratch();
    const { wrapper, ran, home } = treeWithStub(root);
    const nodeDir = join(root, "Program Files", "nodejs");
    mkdirSync(nodeDir, { recursive: true });
    const node = join(nodeDir, WINDOWS ? "node.exe" : "node");
    // A copy on Windows, where a symlink needs a privilege; elsewhere a link
    // to this Node, which `[ -f ]` and `[ -x ]` follow.
    if (WINDOWS) copyFileSync(process.execPath, node);
    else symlinkSync(process.execPath, node);

    const result = runWrapper(root, wrapper, home, {
      MIRROR_NODE: node,
      // Off Windows, no node is on this PATH, so only MIRROR_NODE could have
      // run the hook. On Windows the runner's PATH holds one, and a refused
      // MIRROR_NODE would show as a line in hooks.log.
      PATH: WINDOWS ? (process.env.PATH ?? "") : "/usr/bin:/bin",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(hooksLog(home), [], "no refusal and no failure");
    assert.equal(readFileSync(ran, "utf8"), "claude:user-prompt", "the hook ran");
  });

  test("a drive-relative MIRROR_NODE is refused as relative, and the hook still runs through the PATH", () => {
    const root = scratch();
    const { wrapper, ran, home } = treeWithStub(root);

    const result = runWrapper(root, wrapper, home, {
      MIRROR_NODE: "C:node.exe",
      PATH: [dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
    });

    assert.equal(result.status, 0, result.stderr);
    const lines = hooksLog(home);
    assert.equal(lines.length, 1, lines.join("\n"));
    assert.match(
      lines[0] ?? "",
      / claude:user-prompt: MIRROR_NODE=C:node\.exe is relative; searching the PATH and the usual places instead$/,
    );
    assert.equal(readFileSync(ran, "utf8"), "claude:user-prompt", "the hook ran through the PATH");
  });
});
