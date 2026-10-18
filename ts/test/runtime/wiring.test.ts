// The per-runtime wiring step `init` prints (CV22.DS10.US3 plateau 3).
//
// "One documented step per runtime" was proven for Pi and untested for the
// rest (second panel pass, product-designer). Counted at plateau 3 against
// each runtime's own docs and verified from a scratch config directory:
// Pi 1, Claude Code 1, Codex 2, Antigravity 1 (Gemini CLI's 2 retired with
// CV21.DS8.US1). Printing is not automating --
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

  test("the counts are the honest ones: Pi 1, Claude Code 1, Codex 2, Antigravity 1", () => {
    // No `gemini` key: the runtime is retired (CV21.DS8.US1), and a wiring
    // entry is what makes `init` know a runtime at all.
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(RUNTIME_WIRING).map(([runtime, wiring]) => [runtime, wiring.steps.length]),
      ),
      { pi: 1, claude: 1, codex: 2, antigravity: 1 },
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

  test("Codex: the package as a marketplace, then the plugin from it (CV21.DS4.US1)", () => {
    // DS12.TS2 static 5: Codex installs the Claude-format plugin from a local
    // marketplace, `<plugin>@<marketplace>`. The skills link, the AGENTS.md link,
    // and the wrapper were v0.32.1's wiring; `init` no longer names them.
    const lines = runtimeWiringLines("codex", root).join("\n");
    assert.match(
      lines,
      /1\. codex plugin marketplace add "\/prefix\/lib\/node_modules\/mirror-mind"/,
    );
    assert.match(lines, /2\. codex plugin add mirror-mind@mirror-mind/);
    // L1: Codex asks once to trust the plugin's hooks; the note says so.
    assert.match(lines, /trust/);
    assert.doesNotMatch(lines, /~\/\.codex\/skills|~\/\.codex\/AGENTS\.md|codex-mirror\.sh/);
  });

  test("Antigravity: one step, the plugin with its native layer (CV21.DS7.US1)", () => {
    // The probe on agy 1.4.2: `agy plugin install <plugin dir>` stages the 25
    // skills and the agy-native layer in one command. Within the bar DS12.TS3
    // set (no more documented steps than Gemini CLI's two, when it had them)
    // with one.
    const lines = runtimeWiringLines("antigravity", root).join("\n");
    // One step renders unnumbered, as Pi's and Claude Code's do.
    assert.match(
      lines,
      /agy plugin install "\/prefix\/lib\/node_modules\/mirror-mind\/plugins\/mirror-mind"/,
    );
    // No succession language: the replacement sentence belongs to DS8's
    // cutoff note, not a wiring line.
    assert.doesNotMatch(lines, /[Gg]emini|successor|replac/);
    // Injection and logging land with TS2/TS3; the wiring promises neither.
    assert.doesNotMatch(lines, /inject|logg/);
  });
});
