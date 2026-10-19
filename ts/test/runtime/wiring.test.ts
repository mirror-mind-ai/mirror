// The per-runtime wiring step `init` prints (CV22.DS10.US3 plateau 3).
//
// "One documented step per runtime" was proven for Pi and untested for the
// rest (second panel pass, product-designer). Counted at plateau 3 against
// each runtime's own docs and verified from a scratch config directory:
// Pi 1, Claude Code 1, Codex 2, Antigravity 1, Grok Build 2 (Gemini CLI's 2
// retired with CV21.DS8.US1). Printing is not automating --
// the `runtime install <runtime>` non-goal stands -- but a person who just ran
// `init` should not have to find a page to learn the next line.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  detectRuntimes,
  EXTENSION_PLUGIN_GROK_TRUST_NOTE,
  extensionPluginReinstallCommand,
  extensionPluginWiringSteps,
  grokPluginReinstallCommand,
  RUNTIME_WIRING,
  runtimeWiringLines,
} from "#runtime/wiring.ts";

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

  test("the counts are the honest ones: Pi 1, Claude Code 1, Codex 2, Antigravity 1, Grok Build 2", () => {
    // No `gemini` key: the runtime is retired (CV21.DS8.US1), and a wiring
    // entry is what makes `init` know a runtime at all.
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(RUNTIME_WIRING).map(([runtime, wiring]) => [runtime, wiring.steps.length]),
      ),
      { pi: 1, claude: 1, codex: 2, antigravity: 1, grok: 2 },
    );
  });

  test("the display order names every wired runtime once (CV21.DS10.US1)", () => {
    // `Record<RuntimeName, …>` makes the compiler demand an entry; the order
    // list is a second source of truth, and a runtime left out of it would be
    // wired but never printed.
    const present = new Set(Object.values(RUNTIME_WIRING).map((w) => `/bin/${w.command}`));
    const detected = detectRuntimes({ PATH: "/bin" } as NodeJS.ProcessEnv, (path) =>
      present.has(path),
    );
    assert.deepEqual([...detected].sort(), Object.keys(RUNTIME_WIRING).sort());
    assert.equal(detected.at(-1), "grok");
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
      /mkdir -p ~\/\.claude\/skills && ln -s "\/prefix\/lib\/node_modules\/mirror-mind\/plugins\/mirror-mind" ~\/\.claude\/skills\/mirror-mind/,
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

  test("Grok Build: the trusted install, then the Operating Instructions as a home rule (CV21.DS10.US1)", () => {
    // The probe on grok 1.0.62 (2026-10-18): `grok plugin install <plugin>
    // --trust` copies the plugin under ~/.grok/installed-plugins/ and enables
    // it in one step; a link in ~/.grok/plugins/ loads no skills without a
    // hand-written config entry, and the Claude link alone gives skills with
    // no hooks. A link under ~/.grok/rules/ is loaded as a global rule
    // (~2,233 tokens by Grok's count), in every project; the plugin's
    // SessionStart context, which carries the instructions on Claude Code
    // and Codex, is ignored by Grok (DS12.TS4 L2).
    const lines = runtimeWiringLines("grok", root).join("\n");
    assert.match(
      lines,
      /1\. grok plugin install "\/prefix\/lib\/node_modules\/mirror-mind\/plugins\/mirror-mind" --trust/,
    );
    assert.match(
      lines,
      /2\. ln -s "\/prefix\/lib\/node_modules\/mirror-mind\/AGENTS\.md" ~\/\.grok\/rules\/mirror-mind\.md/,
    );
    // Consent lives in the printed line (security review, 2026-10-18): what
    // --trust activates, and that Grok does not ask again.
    assert.match(lines, /--trust activates the plugin's hooks and MCP server/);
    assert.match(lines, /does not ask again/);
    // And the cost of the rule, so a person can decline step 2 knowingly.
    assert.match(lines, /every project/);
    assert.match(lines, /tokens/);
    // No marketplace, no config edit, no enable verb: none of them is the step.
    assert.doesNotMatch(lines, /marketplace|config\.toml|plugin enable|~\/\.grok\/plugins/);
  });

  test("Grok's level-up is uninstall then install with the printed path (CV21.DS10.US1)", () => {
    // The probe: `grok plugin update` is a no-op for a local source (it prints
    // "local symlink, already live" over a real copy), a re-install over the
    // same path is refused, and a differently spelt path installs a SECOND
    // copy. One function, so `diagnose` and `update` print the path `init`
    // printed (the CR071 lesson at the string level).
    assert.equal(
      grokPluginReinstallCommand(root),
      'grok plugin uninstall mirror-mind --confirm && grok plugin install "/prefix/lib/node_modules/mirror-mind/plugins/mirror-mind" --trust',
    );
    assert.match(runtimeWiringLines("grok", root).join("\n"), /runtime diagnose/);
  });
});

describe("the extensions plugin's wiring (CV21.DS5.US2)", () => {
  // DS5.TS1 measured how each runtime takes a per-home plugin and what brings a
  // copy level: Claude Code links and reads in place; Codex re-adds from its
  // marketplace; agy installs again; Grok uninstalls, then installs. One function
  // per string, so `extensions install`, `diagnose`, and `update` cannot spell a
  // path two ways (the CR071 lesson).
  const dir = "/Users/ana/.mirror-minds/ana/runtime/plugin/mirror-ext-ana";
  const marketplace = "/Users/ana/.mirror-minds/ana/runtime/plugin";
  const name = "mirror-ext-ana";

  test("the one-time wiring per runtime, as functions of the plugin's paths and name", () => {
    assert.deepEqual(extensionPluginWiringSteps("claude", { dir, marketplace, name }), [
      `mkdir -p ~/.claude/skills && ln -s "${dir}" ~/.claude/skills/${name}`,
    ]);
    assert.deepEqual(extensionPluginWiringSteps("codex", { dir, marketplace, name }), [
      `codex plugin marketplace add "${marketplace}"`,
      `codex plugin add ${name}@${name}`,
    ]);
    assert.deepEqual(extensionPluginWiringSteps("antigravity", { dir, marketplace, name }), [
      `agy plugin install "${dir}"`,
    ]);
    assert.deepEqual(extensionPluginWiringSteps("grok", { dir, marketplace, name }), [
      `grok plugin install "${dir}" --trust`,
    ]);
    assert.deepEqual(extensionPluginWiringSteps("pi", { dir, marketplace, name }), []);
  });

  test("the reinstall per copying runtime; none for Claude Code's link", () => {
    assert.equal(extensionPluginReinstallCommand("claude", { dir, marketplace, name }), null);
    assert.equal(
      extensionPluginReinstallCommand("codex", { dir, marketplace, name }),
      `codex plugin add ${name}@${name}`,
    );
    assert.equal(
      extensionPluginReinstallCommand("antigravity", { dir, marketplace, name }),
      `agy plugin install "${dir}"`,
    );
    assert.equal(
      extensionPluginReinstallCommand("grok", { dir, marketplace, name }),
      `grok plugin uninstall ${name} --confirm && grok plugin install "${dir}" --trust`,
    );
  });

  test("Grok's consent line says what there is to trust: skills only", () => {
    // The generated plugin carries no hooks and no server (security amendment 14).
    assert.match(EXTENSION_PLUGIN_GROK_TRUST_NOTE, /skills only/);
    assert.match(EXTENSION_PLUGIN_GROK_TRUST_NOTE, /no hooks/);
    assert.match(EXTENSION_PLUGIN_GROK_TRUST_NOTE, /no (MCP )?server/);
  });

  test("the canonical wiring is unchanged by the extension plugin's", () => {
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(RUNTIME_WIRING).map(([runtime, wiring]) => [runtime, wiring.steps.length]),
      ),
      { pi: 1, claude: 1, codex: 2, antigravity: 1, grok: 2 },
    );
  });
});
