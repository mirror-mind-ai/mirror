// The hook layer (CV22.DS10.TS5 plateau 1, decision D4).
//
// Twelve shell scripts across four runtimes used to spawn the interpreter
// between one and five times per event, and reach into `memory.hooks.*` and
// `memory.cli.*` internals that were never commands. Their replacement is one
// Node entry point, and these are the properties it has to keep.
//
// The cross-engine proof lives elsewhere and can only exist now:
// `scripts/ts5/hook_rowdiff.sh` runs the old hook and the new one against two
// copies of the same database and diffs the rows. It dies with Python at
// plateau 3; these cases do not.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { needsInject } from "#hooks/mirrorState.ts";
import { parseHookPayload } from "#hooks/payload.ts";
import { noteHookFailure } from "#hooks/runtime.ts";
import {
  hookNodeFindings,
  RETIRED_REVERT_GATES,
  staleRevertGateFindings,
} from "#runtime/diagnose.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function tmpHome(): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-hooks-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("payload parsing", () => {
  test("reads prompt and session id", () => {
    const payload = parseHookPayload('{"session_id":"abc","prompt":"hello"}');
    assert.equal(payload.sessionId, "abc");
    assert.equal(payload.prompt, "hello");
  });

  test("malformed JSON is empty, never a throw", () => {
    // Python's `extract_prompt` caught JSONDecodeError and returned "". A hook
    // that throws on an unrecognized payload breaks the user's turn.
    for (const input of ["", "not json", "null", "[]", "{", '{"prompt":123}']) {
      const payload = parseHookPayload(input);
      assert.equal(payload.prompt, "", input);
      assert.equal(payload.sessionId, "", input);
    }
  });

  test("a non-string prompt is not coerced", () => {
    assert.equal(parseHookPayload('{"prompt":{"text":"x"}}').prompt, "");
  });
});

describe("mirror state", () => {
  test("injection is owed only when Mirror Mode is active and nothing was injected", () => {
    const state = (active: boolean, hookInjected: boolean) => ({
      active,
      hookInjected,
      persona: "",
      journey: "",
    });
    assert.equal(needsInject(state(true, false)), true);
    assert.equal(needsInject(state(true, true)), false, "already injected");
    assert.equal(needsInject(state(false, false)), false, "Mirror Mode is off");
  });
});

describe("the hooks log", () => {
  test("records the hook and the reason, and NEVER the prompt", () => {
    // The invariant the security lens asked for. Hook entries run in-process
    // and bypass the CLI, where `frontDoorLog` enforces redaction -- so the
    // rule is restated here and tested directly rather than inherited.
    const home = tmpHome();
    noteHookFailure("claude:inject", "boom: something failed", {
      MIRROR_HOME: home,
      MIRROR_USER: "",
    } as NodeJS.ProcessEnv);

    const line = readFileSync(join(home, "hooks.log"), "utf8");
    assert.match(line, /claude:inject: boom/);
    assert.doesNotMatch(line, /prompt/i);
  });

  test("only the first line of a multi-line failure is written", () => {
    const home = tmpHome();
    noteHookFailure("gemini:log-user", "first line\nSECRET SECOND LINE", {
      MIRROR_HOME: home,
      MIRROR_USER: "",
    } as NodeJS.ProcessEnv);

    const line = readFileSync(join(home, "hooks.log"), "utf8");
    assert.match(line, /first line/);
    assert.doesNotMatch(line, /SECRET SECOND LINE/);
  });

  test("an unconfigured home is silent rather than throwing", () => {
    assert.doesNotThrow(() => noteHookFailure("claude:inject", "reason", {} as NodeJS.ProcessEnv));
  });
});

describe("diagnose reports the transition's leftovers", () => {
  test("a stale revert gate is named as inert", () => {
    const findings = staleRevertGateFindings({
      MIRROR_TS_BUILD: "0",
      MIRROR_TS_SEARCH: "0",
    } as NodeJS.ProcessEnv);

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, "stale_revert_gate");
    assert.match(findings[0]?.subject ?? "", /MIRROR_TS_BUILD, MIRROR_TS_SEARCH/);
    assert.match(findings[0]?.detail ?? "", /inert/);
  });

  test("a replay fixture gate is NOT reported: it chooses a fixture, not an engine", () => {
    assert.deepEqual(
      staleRevertGateFindings({ MIRROR_TS_BUILD_LLM_REPLAY: "1" } as NodeJS.ProcessEnv),
      [],
    );
  });

  test("an empty value is not a set gate", () => {
    assert.deepEqual(staleRevertGateFindings({ MIRROR_TS_BUILD: "" } as NodeJS.ProcessEnv), []);
  });

  test("a LIVE control that shares the prefix is not called inert (F8)", () => {
    // The first version matched every non-_REPLAY `MIRROR_TS_*` name, and would
    // have told a user to delete the MCP wallet guards' switch and consult's
    // context input -- both of which still do something.
    assert.deepEqual(
      staleRevertGateFindings({
        MIRROR_TS_MCP_GUARDS: "0",
        MIRROR_TS_CONSULT_CONTEXT: "some context",
      } as NodeJS.ProcessEnv),
      [],
    );
  });

  test("no retired gate is still READ anywhere in the core", () => {
    // The list is a claim that these names choose nothing any more. A name on
    // it that some module still reads would make diagnose call a live control
    // inert. CODE is graded, not prose: a comment recording that a gate left
    // is history, while a declaration or a read is a gate that did not.
    const src = join(import.meta.dirname, "..", "..", "src");
    const readers: string[] = [];
    for (const file of readdirSync(src, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".ts") || file === join("runtime", "diagnose.ts")) continue;
      const text = readFileSync(join(src, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const gate of RETIRED_REVERT_GATES) {
        if (new RegExp(`${gate}(?![A-Z_])`).test(text)) readers.push(`${file}: ${gate}`);
      }
    }
    assert.deepEqual(readers, []);
  });

  test("unresolvable node is a warning, because every hook would skip silently", () => {
    const findings = hookNodeFindings(
      { PATH: "/nowhere", HOME: "/nohome" } as NodeJS.ProcessEnv,
      () => false,
    );

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, "hook_node_unresolvable");
    assert.match(findings[0]?.recommendation ?? "", /MIRROR_NODE/);
  });

  test("node on PATH, or MIRROR_NODE set, reports nothing", () => {
    assert.deepEqual(
      hookNodeFindings({ PATH: "/usr/bin", HOME: "/h" } as NodeJS.ProcessEnv, () => true),
      [],
    );
    assert.deepEqual(
      hookNodeFindings(
        { MIRROR_NODE: "/opt/node", PATH: "", HOME: "/h" } as NodeJS.ProcessEnv,
        (p) => p === "/opt/node",
      ),
      [],
    );
  });
});

describe("the twelve wrappers", () => {
  const WRAPPERS = [
    ".claude/hooks/session-start.sh",
    ".claude/hooks/log-user-prompt.sh",
    ".claude/hooks/log-session-end.sh",
    ".claude/hooks/mirror-inject.sh",
    ".gemini/hooks/session-start.sh",
    ".gemini/hooks/log-user.sh",
    ".gemini/hooks/log-assistant.sh",
    ".gemini/hooks/session-end.sh",
    "plugins/mirror-mind/hooks/session-start.sh",
    "plugins/mirror-mind/hooks/log-user-prompt.sh",
    "plugins/mirror-mind/hooks/log-session-end.sh",
    "plugins/mirror-mind/hooks/mirror-inject.sh",
  ];

  test("differ only in the hook name and the depth to the repository root", () => {
    // CR071 is why this is asserted rather than trusted: eleven skills reached
    // the front door on Pi while still calling Python on Claude Code and the
    // published plugin, for commands flipped as far back as DS3, and nothing
    // failed -- because Python answered correctly. Copies drift silently.
    // These can only differ in two lines, and the generator writes both.
    const normalized = WRAPPERS.map((path) =>
      readFileSync(join(REPO_ROOT, path), "utf8")
        .replace(/^HOOK=".*"$/m, 'HOOK="<NAME>"')
        .replace(/\$HERE\/\.\.[./]*/g, "$HERE/<DEPTH>"),
    );
    for (const [index, body] of normalized.entries()) {
      assert.equal(body, normalized[0], `${WRAPPERS[index]} differs beyond its hook name`);
    }
  });

  test("none of them INVOKES an interpreter", () => {
    // Matched on invocation shapes, not on the word: the template's comment
    // explains why Node resolution matters by contrasting it with
    // /usr/bin/python3, and a guard that cannot tell a comment from a command
    // is one people learn to work around.
    for (const path of WRAPPERS) {
      const body = readFileSync(join(REPO_ROOT, path), "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      assert.doesNotMatch(body, /python3? /, path);
      assert.doesNotMatch(body, /\buv (run|sync)\b/, path);
      assert.doesNotMatch(body, /-m memory/, path);
    }
  });

  test("each resolves the repository from its own file, never the cwd", () => {
    // A runtime spawns hooks from whatever directory the session is in.
    for (const path of WRAPPERS) {
      const body = readFileSync(join(REPO_ROOT, path), "utf8");
      assert.match(body, /BASH_SOURCE/, path);
    }
  });

  test("the generator reproduces exactly what is committed", () => {
    const result = execFileSync(
      "bash",
      [join(REPO_ROOT, "scripts/ts5/generate_hook_wrappers.sh"), "--check"],
      { encoding: "utf8" },
    );
    assert.match(result, /in sync/);
  });

  test("every wrapper on disk is covered by this list", () => {
    // A wrapper added to a hooks directory and not listed here would escape
    // every assertion above.
    const found: string[] = [];
    for (const dir of [".claude/hooks", ".gemini/hooks", "plugins/mirror-mind/hooks"]) {
      for (const entry of readdirSync(join(REPO_ROOT, dir))) {
        if (entry.endsWith(".sh")) found.push(`${dir}/${entry}`);
      }
    }
    assert.deepEqual(found.sort(), [...WRAPPERS].sort());
  });
});

describe("the MCP launcher", () => {
  test("has no Python branch and no engine gate left", () => {
    const body = readFileSync(join(REPO_ROOT, "plugins/mirror-mind/mcp/launch.sh"), "utf8");
    assert.doesNotMatch(body, /exec python3/);
    assert.doesNotMatch(body, /MIRROR_TS_MCP[^ ]*=/);
    assert.match(body, /exec node/);
  });
});

describe("the Claude allowlist", () => {
  test("grants node BY PATH, never a bare `node *`", () => {
    // `Bash(node *)` is an auto-approved arbitrary-execution grant, strictly
    // wider than the `python3 -m memory*` it replaces. Dropping
    // `Bash(python3 -c *)` is a security improvement in its own right: that
    // one was already arbitrary execution.
    const settings = JSON.parse(readFileSync(join(REPO_ROOT, ".claude/settings.json"), "utf8")) as {
      permissions: { allow: string[] };
    };
    const allow = settings.permissions.allow;

    assert.ok(allow.includes("Bash(node ts/src/frontDoor/cli.ts *)"));
    assert.ok(allow.includes("Bash(node ts/src/hooks/main.ts *)"));
    assert.ok(!allow.some((entry) => /^Bash\(node \*\)$/.test(entry)), "no blanket node grant");
    assert.ok(!allow.some((entry) => entry.includes("python")), "no interpreter grant remains");
  });
});

describe("the entry point runs", () => {
  test("an unknown hook name is recorded and exits 0", () => {
    // A hook must never fail the user's turn, whatever it is asked to do.
    const home = tmpHome();
    mkdirSync(home, { recursive: true });
    const result = execFileSync(
      process.execPath,
      [join(REPO_ROOT, "ts/src/hooks/main.ts"), "nonsense:hook"],
      {
        encoding: "utf8",
        env: { ...process.env, MIRROR_HOME: home, MIRROR_USER: "", NODE_OPTIONS: "--no-warnings" },
        input: "",
      },
    );
    assert.equal(result, "");
    assert.match(readFileSync(join(home, "hooks.log"), "utf8"), /unknown hook name/);
  });

  test("a hook with no stdin at all does not hang or throw", () => {
    const home = tmpHome();
    writeFileSync(join(home, "placeholder"), "", "utf8");
    assert.doesNotThrow(() =>
      execFileSync(
        process.execPath,
        [join(REPO_ROOT, "ts/src/hooks/main.ts"), "gemini:session-end"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            MIRROR_HOME: home,
            MIRROR_USER: "",
            NODE_OPTIONS: "--no-warnings",
          },
          input: "",
          timeout: 30_000,
        },
      ),
    );
  });
});
