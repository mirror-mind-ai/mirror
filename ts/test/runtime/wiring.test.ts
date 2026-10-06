// The per-runtime wiring step `init` prints (CV22.DS10.US3 plateau 3).
//
// "One documented step per runtime" was proven for Pi and untested for the
// rest (second panel pass, product-designer). Counted at plateau 3 against
// each runtime's own docs and verified from a scratch config directory:
// Pi 1, Claude Code 1, Gemini CLI 2, Codex 2. Printing is not automating --
// the `runtime install <runtime>` non-goal stands -- but a person who just ran
// `init` should not have to find a page to learn the next line.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { detectRuntimes, RUNTIME_WIRING, runtimeWiringLines } from "#runtime/wiring.ts";

describe("detectRuntimes", () => {
  test("names the runtimes whose command is on the PATH, in a fixed order", () => {
    const present = new Set(["/usr/local/bin/claude", "/opt/homebrew/bin/pi"]);
    assert.deepEqual(
      detectRuntimes({ PATH: "/opt/homebrew/bin:/usr/local/bin" } as NodeJS.ProcessEnv, (path) =>
        present.has(path),
      ),
      ["pi", "claude"],
    );
  });

  test("an empty PATH detects nothing and does not throw", () => {
    assert.deepEqual(
      detectRuntimes({} as NodeJS.ProcessEnv, () => true),
      [],
    );
  });
});

describe("the wiring steps", () => {
  const root = "/prefix/lib/node_modules/mirror-mind";

  test("every runtime's steps name the package path, never a relative one or the cwd", () => {
    for (const runtime of Object.keys(RUNTIME_WIRING) as (keyof typeof RUNTIME_WIRING)[]) {
      const lines = runtimeWiringLines(runtime, root).join("\n");
      assert.match(lines, new RegExp(root.replace(/[./]/g, "\\$&")), runtime);
      assert.doesNotMatch(lines, /\$\(npm root -g\)|\.\.\//, runtime);
    }
  });

  test("the counts are the honest ones: Pi 1, Claude Code 1, Gemini CLI 2, Codex 2", () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(RUNTIME_WIRING).map(([runtime, wiring]) => [runtime, wiring.steps.length]),
      ),
      { pi: 1, claude: 1, gemini: 2, codex: 2 },
    );
  });

  test("Pi: a local-path package install (D6)", () => {
    assert.match(
      runtimeWiringLines("pi", root).join("\n"),
      /pi install "\/prefix\/lib\/node_modules\/mirror-mind"/,
    );
  });

  test("Claude Code: the plugin as a skills-directory plugin, loaded every session", () => {
    const lines = runtimeWiringLines("claude", root).join("\n");
    assert.match(
      lines,
      /ln -s "\/prefix\/lib\/node_modules\/mirror-mind\/plugins\/mirror-mind" ~\/\.claude\/skills\/mirror-mind/,
    );
  });

  test("Gemini CLI: link the skills, then the four hooks in the user settings", () => {
    const lines = runtimeWiringLines("gemini", root).join("\n");
    assert.match(
      lines,
      /gemini skills link --consent "\/prefix\/lib\/node_modules\/mirror-mind\/\.pi\/skills"/,
    );
    assert.match(lines, /~\/\.gemini\/settings\.json/);
    for (const event of ["SessionStart", "BeforeAgent", "AfterAgent", "SessionEnd"]) {
      assert.match(lines, new RegExp(event));
    }
    assert.match(lines, /\/prefix\/lib\/node_modules\/mirror-mind\/\.gemini\/hooks\/log-user\.sh/);
  });

  test("Codex: the skills and the global AGENTS.md, then run through the wrapper", () => {
    const lines = runtimeWiringLines("codex", root).join("\n");
    assert.match(
      lines,
      /ln -s "\/prefix\/lib\/node_modules\/mirror-mind\/\.pi\/skills" ~\/\.codex\/skills\/mirror-mind/,
    );
    assert.match(lines, /~\/\.codex\/AGENTS\.md/);
    assert.match(lines, /\/prefix\/lib\/node_modules\/mirror-mind\/scripts\/codex-mirror\.sh/);
  });
});
