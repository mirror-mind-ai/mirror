// The hook layer (CV22.DS10.TS5 plateau 1, decision D4).
//
// Twelve shell scripts across four runtimes used to spawn the interpreter
// between one and five times per event, and reach into the Python core's hook
// and CLI internals, which were never commands. Their replacement is one
// Node entry point, and these are the properties it has to keep.
//
// The cross-engine proof lived elsewhere and could only exist while Python
// did: `scripts/ts5/hook_rowdiff.sh` ran the old hook and the new one against
// two copies of the same database and diffed the rows (10/10 identical, TS5
// test guide). It died with Python at plateau 3; these cases did not.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { openDatabaseForBootstrap } from "#db/database.ts";
import { needsInject } from "#hooks/mirrorState.ts";
import { parseHookPayload } from "#hooks/payload.ts";
import { noteHookFailure } from "#hooks/runtime.ts";
import {
  HOOK_NODE_CANDIDATES,
  hookFailureFindings,
  hookNodeFindings,
  RETIRED_REVERT_GATES,
  staleRevertGateFindings,
} from "#runtime/diagnose.ts";
import type { RuntimeStatusReport } from "#runtime/status.ts";

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

/** A mirror home whose database this core refuses: it carries a migration from a newer core. */
function refusingHome(): string {
  const home = tmpHome();
  bootstrapDatabase(join(home, "memory.db")).close();
  const db = openDatabaseForBootstrap(join(home, "memory.db"));
  try {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
      "999_from_the_future",
      "2026-09-25T00:00:00Z",
    );
  } finally {
    db.close();
  }
  return home;
}

function runHook(hook: string, home: string, payload: Record<string, unknown>): void {
  execFileSync(process.execPath, [join(REPO_ROOT, "ts/src/hooks/main.ts"), hook], {
    encoding: "utf8",
    env: {
      ...process.env,
      // Pinned: CI runs the suite with MEMORY_ENV=test, which names
      // memory_test.db -- a fresh file the core would NOT refuse.
      MEMORY_ENV: "production",
      MIRROR_HOME: home,
      MIRROR_USER: "",
      OPENROUTER_API_KEY: "",
      NODE_OPTIONS: "--no-warnings",
    },
    input: JSON.stringify(payload),
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  });
}

describe("the hooks log", () => {
  // The invariant the security lens asked for at the Plan review: nothing a hook
  // entry logs -- on success or on failure -- contains what the user said or
  // what the model answered. Hook entries run in-process and bypass the CLI,
  // where `frontDoorLog` enforces redaction, so the rule is tested here.
  //
  // Through a REAL failure, not a hand-written reason. The first version of this
  // test called `noteHookFailure` with a reason that never held a prompt and
  // asserted the line did not say "prompt" -- it could not fail, and the Gemini
  // CLI hooks were writing both sides of the conversation into this file
  // whenever the logger exited non-zero (TS5 handoff review, finding P1). That
  // runtime retired (CV21.DS8.US1); the invariant did not, so the same walk
  // runs through the Claude-family hooks every living plugin runtime shares.
  test("a failed turn is recorded without the prompt or the reply", () => {
    const home = refusingHome();
    runHook("claude:user-prompt", home, {
      session_id: "s-p1",
      hook_event_name: "UserPromptSubmit",
      prompt: "SENTINEL-PROMPT about something private",
    });
    runHook("claude:stop", home, {
      session_id: "s-p1",
      hook_event_name: "Stop",
      last_assistant_message: "SENTINEL-RESPONSE with private advice",
    });

    const log = readFileSync(join(home, "hooks.log"), "utf8");
    assert.match(log, /claude:user-prompt: `conversation-logger user-prompt` exited \d+/);
    assert.match(log, /claude:stop: `conversation-logger stop` exited \d+/);
    assert.doesNotMatch(log, /SENTINEL|private|s-p1/);
    assert.doesNotMatch(readFileSync(join(home, "front-door.log"), "utf8"), /SENTINEL/);
  });

  test("only the first line of a multi-line failure is written", () => {
    const home = tmpHome();
    noteHookFailure("claude:user-prompt", "first line\nSECRET SECOND LINE", {
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

/** A stand-in for a Node too old to run a hook: it fails as one does, before main.ts starts. */
function brokenNode(): string {
  const path = join(tmpHome(), "node");
  writeFileSync(path, '#!/bin/sh\necho "node: bad option: --env-file-if-exists" >&2\nexit 9\n', {
    mode: 0o755,
  });
  return path;
}

describe("a hook that cannot run is recorded, never silent (N1)", () => {
  // The wrappers promised that an UNRESOLVABLE Node is recorded. A Node that is
  // found and cannot run the hook -- a stale one earlier on a GUI runtime's
  // PATH -- used to fail before main.ts started, with exit 9 on a stderr no
  // runtime shows and nothing in hooks.log: "Mirror stopped remembering" (TS5
  // handoff review, finding N1).
  test("a Node that is found but cannot run the hook: exit 0 and one hooks.log line", () => {
    const home = tmpHome();
    const result = spawnSync("bash", [join(REPO_ROOT, ".claude/hooks/log-user-prompt.sh")], {
      env: { HOME: home, MIRROR_HOME: home, MIRROR_NODE: brokenNode(), PATH: "/usr/bin:/bin" },
      input: "{}",
      encoding: "utf8",
    });

    assert.equal(result.status, 0, "a hook never fails the user's turn");
    const log = readFileSync(join(home, "hooks.log"), "utf8");
    assert.match(log, /claude:user-prompt: node exited 9/);
    assert.match(log, /Node 24 or later/);
  });

  test("the line lands in the home the core uses, even when MIRROR_USER is only in .env", () => {
    // The first wrappers fell back to ~/.mirror-minds/default -- a home the core
    // never resolves and nobody reads -- whenever the environment lacked
    // MIRROR_HOME, which is every GUI launch of a checkout configured by .env.
    const root = tmpHome();
    const repo = join(root, "checkout");
    const home = join(root, "home");
    mkdirSync(join(repo, ".claude/hooks"), { recursive: true });
    mkdirSync(home);
    copyFileSync(
      join(REPO_ROOT, ".claude/hooks/session-start.sh"),
      join(repo, ".claude/hooks/session-start.sh"),
    );
    writeFileSync(join(repo, ".env"), 'OTHER=1\nMIRROR_USER="someone"\n');

    const result = spawnSync("bash", [join(repo, ".claude/hooks/session-start.sh")], {
      env: { HOME: home, MIRROR_NODE: brokenNode(), PATH: "/usr/bin:/bin" },
      input: "",
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(
      readFileSync(join(home, ".mirror-minds/someone/hooks.log"), "utf8"),
      /claude:session-start: node exited 9/,
    );
    assert.ok(!existsSync(join(home, ".mirror-minds/default")), "no invented home");
  });

  test("the wrappers and diagnose search the same places for Node", () => {
    // Two copies of one list had already drifted: diagnose counted
    // /usr/bin/node as resolvable, the wrappers never looked there. The
    // wrappers look first in one place diagnose cannot know: beside the entry
    // they found, since an npm global bin holds the `node` that installed the
    // package next to `mirror-hook` -- and a system /usr/local/bin/node can be
    // years older (CI's Ubuntu runner has one that cannot run the shim).
    const body = readFileSync(join(REPO_ROOT, ".claude/hooks/session-start.sh"), "utf8");
    const listed = body.match(/^for candidate in (.*); do$/m)?.[1] ?? "";
    const quoted = (candidate: string) => (candidate.includes("$") ? `"${candidate}"` : candidate);
    assert.equal(
      listed,
      ['"$(dirname "$ENTRY")/node"', ...HOOK_NODE_CANDIDATES.map(quoted)].join(" "),
    );
  });

  test("diagnose reports recent hook failures from hooks.log, never their reasons", () => {
    // Diagnose runs in the caller's shell, which is not a GUI runtime's, so its
    // node check cannot see what a hook sees. hooks.log can: it is written from
    // hook context. Reasons stay in the file -- a diagnosis gets pasted.
    const home = tmpHome();
    writeFileSync(
      join(home, "hooks.log"),
      [
        "2026-09-01T00:00:00Z claude:inject: an old failure, outside the window",
        "2026-09-24T10:00:00Z claude:user-prompt: node exited 9 SECRET-REASON",
        "2026-09-25T09:00:00.123Z claude:stop: `conversation-logger stop` exited 2",
        "not a log line",
        "",
      ].join("\n"),
    );
    const report = { db_path: join(home, "memory.db") } as RuntimeStatusReport;

    const findings = hookFailureFindings(report, new Date("2026-09-25T12:00:00Z"));

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, "hook_failures_recorded");
    assert.match(findings[0]?.detail ?? "", /2 hook failure\(s\) in the last 7 days/);
    assert.match(findings[0]?.detail ?? "", /latest 2026-09-25T09:00:00\.123Z, claude:stop/);
    assert.doesNotMatch(JSON.stringify(findings), /SECRET|exited|conversation-logger/);
  });

  test("no hooks.log, or nothing recent in it, is no finding", () => {
    const home = tmpHome();
    const report = { db_path: join(home, "memory.db") } as RuntimeStatusReport;
    assert.deepEqual(hookFailureFindings(report, new Date("2026-09-25T12:00:00Z")), []);
    writeFileSync(join(home, "hooks.log"), "2026-08-01T00:00:00Z claude:inject: old\n");
    assert.deepEqual(hookFailureFindings(report, new Date("2026-09-25T12:00:00Z")), []);
  });
});

describe("the wrapper forms", () => {
  // Three forms, counted per group, never as a total baked into a name (the
  // TS5 lesson): five tree wrappers resolve the tree from their own file;
  // the plugin's five bin wrappers find the installed `mirror-hook`,
  // because Claude Code copies a plugin into its own cache; and the
  // plugin's two agy wrappers (CV21.DS7.TS2) are the bin search behind a
  // stdin gate, because Antigravity's PreInvocation fires before every
  // model call and blocks the agent loop on each hook.
  const TREE_WRAPPERS = [
    ".claude/hooks/session-start.sh",
    ".claude/hooks/log-user-prompt.sh",
    ".claude/hooks/log-session-end.sh",
    ".claude/hooks/mirror-inject.sh",
    ".claude/hooks/log-assistant-reply.sh",
  ];
  const BIN_WRAPPERS = [
    "plugins/mirror-mind/hooks/session-start.sh",
    "plugins/mirror-mind/hooks/log-user-prompt.sh",
    "plugins/mirror-mind/hooks/log-session-end.sh",
    "plugins/mirror-mind/hooks/mirror-inject.sh",
    "plugins/mirror-mind/hooks/log-assistant-reply.sh",
  ];
  const AGY_WRAPPERS = [
    "plugins/mirror-mind/agy/session-start.sh",
    "plugins/mirror-mind/agy/pre-invocation.sh",
    "plugins/mirror-mind/agy/stop.sh",
  ];
  const WRAPPERS = [...TREE_WRAPPERS, ...BIN_WRAPPERS, ...AGY_WRAPPERS];

  const normalized = (path: string) =>
    readFileSync(join(REPO_ROOT, path), "utf8")
      .replace(/^HOOK=".*"$/m, 'HOOK="<NAME>"')
      .replace(/^GATE='.*'$/m, "GATE='<GATE>'")
      .replace(/\$HERE\/\.\.[./]*/g, "$HERE/<DEPTH>");

  test("within a form, differ only in the hook name and the depth to the tree root", () => {
    // CR071 is why this is asserted rather than trusted: eleven skills reached
    // the front door on Pi while still calling Python on Claude Code and the
    // published plugin, for commands flipped as far back as DS3, and nothing
    // failed -- because Python answered correctly. Copies drift silently.
    for (const group of [TREE_WRAPPERS, BIN_WRAPPERS, AGY_WRAPPERS]) {
      const bodies = group.map(normalized);
      for (const [index, body] of bodies.entries()) {
        assert.equal(body, bodies[0], `${group[index]} differs beyond its hook name`);
      }
    }
  });

  test("the two forms share everything but how the entry is found", () => {
    // The generator fills two placeholders per form; nothing else may differ.
    // Both forms run the same entry the same way, so a fix to the Node search
    // or the hooks.log contract reaches the plugin and the tree alike.
    const strip = (body: string) =>
      body
        .replace(/^# Resolve the tree from THIS FILE[\s\S]*?^REPO_ROOT=.*$/m, "<LOCATE>")
        .replace(/^# This wrapper is the Claude plugin's[\s\S]*?^REPO_ROOT=""$/m, "<LOCATE>")
        .replace(/^ENTRY="\$REPO_ROOT\/bin\/mirror-hook\.js"$/m, "<ENTRY>")
        .replace(/^# Find the bin\.[\s\S]*?^fi$/m, "<ENTRY>");
    const tree = strip(normalized(TREE_WRAPPERS[0] ?? ""));
    const bin = strip(normalized(BIN_WRAPPERS[0] ?? ""));
    assert.match(tree, /<LOCATE>[\s\S]*<ENTRY>/);
    assert.equal(tree, bin);
  });

  test("both forms run the bin, never ts/src/hooks/main.ts, and pass no flag", () => {
    // Under `npm root -g` every wrapper sits below node_modules, where Node
    // will not strip types (D15); and `--env-file` could only ever name a
    // checkout's .env (D3).
    for (const path of WRAPPERS) {
      const body = readFileSync(join(REPO_ROOT, path), "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      assert.doesNotMatch(body, /hooks\/main\.ts/, path);
      assert.doesNotMatch(body, /--env-file|--no-warnings|NODE_OPTIONS/, path);
      assert.match(body, /"\$NODE" "\$ENTRY" "\$HOOK" "\$@"/, path);
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

  test("the tree form resolves the tree from its own file, never the cwd", () => {
    // A runtime spawns hooks from whatever directory the session is in.
    for (const path of TREE_WRAPPERS) {
      const body = readFileSync(join(REPO_ROOT, path), "utf8");
      assert.match(body, /BASH_SOURCE/, path);
      assert.match(body, /ENTRY="\$REPO_ROOT\/bin\/mirror-hook\.js"/, path);
    }
  });

  test("the bin form takes no relative path to any tree, and reads no tree .env", () => {
    // Claude Code copies a plugin into its cache; `../../..` from there is
    // nothing. The TS5 "hook window" was exactly this, and the bin form closes it.
    for (const path of BIN_WRAPPERS) {
      const body = readFileSync(join(REPO_ROOT, path), "utf8")
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
      assert.doesNotMatch(body, /BASH_SOURCE|\.\.\//, path);
      assert.match(body, /^REPO_ROOT=""$/m, path);
      assert.match(body, /MIRROR_BIN/, path);
      assert.match(body, /command -v mirror-hook/, path);
    }
  });

  test("the generator reproduces exactly what is committed", () => {
    const result = execFileSync(
      "bash",
      [join(REPO_ROOT, "scripts/generate_hook_wrappers.sh"), "--check"],
      { encoding: "utf8" },
    );
    assert.match(result, /in sync/);
  });

  test("every wrapper on disk is covered by this list", () => {
    // A wrapper added to a hooks directory and not listed here would escape
    // every assertion above.
    const found: string[] = [];
    for (const dir of [".claude/hooks", "plugins/mirror-mind/hooks", "plugins/mirror-mind/agy"]) {
      for (const entry of readdirSync(join(REPO_ROOT, dir))) {
        if (entry.endsWith(".sh")) found.push(`${dir}/${entry}`);
      }
    }
    assert.deepEqual(found.sort(), [...WRAPPERS].sort());
  });
});

// The MCP launcher's cases moved to `ts/test/mcp/mcpEntry.test.ts` with the
// launcher itself: since CV21.DS2.US6 the manifest carries its search inline,
// and the entry's text is held equal to the wrappers' search there.

describe("the Claude allowlist", () => {
  const allow = (
    JSON.parse(readFileSync(join(REPO_ROOT, ".claude/settings.json"), "utf8")) as {
      permissions: { allow: string[] };
    }
  ).permissions.allow;

  test("grants no blanket node and no interpreter", () => {
    // `Bash(node *)` is an auto-approved arbitrary-execution grant. So were the
    // interpreter grants TS5 dropped (`python3 -c` ran any code it was given).
    assert.ok(!allow.some((entry) => /^Bash\(node \*\)$/.test(entry)), "no blanket node grant");
    assert.ok(!allow.some((entry) => entry.includes("python")), "no interpreter grant remains");
  });

  test("grants the model nothing under ts/src/hooks: hooks run outside permissions", () => {
    // Claude Code runs hooks itself; `permissions.allow` governs the model's
    // Bash tool. A hook-entry grant therefore authorizes nothing a hook needs
    // and lets the model run hook entries unasked -- `claude:session-end`
    // closes the session and pays for extraction (TS5 handoff review, P2).
    assert.deepEqual(
      allow.filter((entry) => entry.includes("ts/src/hooks")),
      [],
    );
  });

  test("any front-door grant matches the invocation the skills actually make", () => {
    // A prefix rule is only a grant if the command starts with it. The skills
    // used to run the front door behind NODE_OPTIONS and --env-file, so the
    // grant TS5 first wrote, `Bash(node ts/src/frontDoor/cli.ts *)`, matched no
    // skill invocation -- and the Python-era grant it replaced had not matched
    // the interpreter form the skills used then either. The walk had to
    // approve every call. Since CV22.DS10.US3 (D7) every skill invokes
    // `mirror <command>`, so a grant, if one is ever written, is `Bash(mirror:*)`
    // and nothing else. Checked against the real form, so a stale grant cannot
    // pass as a live one.
    const invocations = new Set<string>();
    const skillsDir = join(REPO_ROOT, ".claude/skills");
    for (const skill of readdirSync(skillsDir)) {
      const body = readFileSync(join(skillsDir, skill, "SKILL.md"), "utf8");
      for (const match of body.matchAll(/^\s*(mirror [a-z][^\n]*)/gm))
        invocations.add(match[1] ?? "");
    }
    assert.ok(invocations.size > 0, "the skills invoke the front door");
    assert.ok(
      [...invocations].every(
        (invocation) => !/node |cli\.ts|NODE_OPTIONS|--env-file/.test(invocation),
      ),
      "no skill names the checkout form",
    );

    for (const entry of allow.filter((grant) => /^Bash\(mirror[ :]/.test(grant))) {
      const prefix = entry.replace(/^Bash\(/, "").replace(/(:\*| \*)\)$/, "");
      for (const invocation of invocations) {
        assert.ok(
          invocation.startsWith(prefix),
          `${entry} does not match the skills' invocation: ${invocation}`,
        );
      }
    }
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

  test("SessionStart hands the runtime the Operating Instructions, unless the project is this tree (D13)", () => {
    // An installed package reaches Claude Code (and, until CV21.DS8.US1,
    // Gemini CLI) through hooks, skills, and an MCP server -- nothing that
    // reads a CLAUDE.md. Without this a session wired to the package answers
    // /mm-mirror and still routes no mode and signs no persona (US3's second
    // panel pass). The runtime reads SessionStart's
    // `hookSpecificOutput.additionalContext`, so the session-start hook hands
    // over AGENTS.md from its own tree, where it matches the core it ships
    // with -- and stays quiet inside the checkout, whose CLAUDE.md imports
    // that same file.
    const home = tmpHome();
    const run = (hook: string, projectDir: string) =>
      execFileSync(process.execPath, [join(REPO_ROOT, "ts/src/hooks/main.ts"), hook], {
        encoding: "utf8",
        env: {
          ...process.env,
          MEMORY_ENV: "production",
          MIRROR_HOME: home,
          MIRROR_USER: "",
          CLAUDE_PROJECT_DIR: projectDir,
          NODE_OPTIONS: "--no-warnings",
        },
        input: "{}",
        timeout: 30_000,
      });
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    const context = (output: string) =>
      (
        JSON.parse(output) as {
          hookSpecificOutput: { hookEventName: string; additionalContext: string };
        }
      ).hookSpecificOutput;

    const elsewhere = context(run("claude:session-start", join(home, "some-project")));
    assert.equal(elsewhere.hookEventName, "SessionStart");
    assert.equal(elsewhere.additionalContext, agents);

    // Inside the checkout the project already carries the file.
    assert.equal(run("claude:session-start", REPO_ROOT), "", "Claude printed nothing before D13");
  });

  test("a hook with no stdin at all does not hang or throw", () => {
    const home = tmpHome();
    writeFileSync(join(home, "placeholder"), "", "utf8");
    assert.doesNotThrow(() =>
      execFileSync(
        process.execPath,
        [join(REPO_ROOT, "ts/src/hooks/main.ts"), "claude:session-end"],
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
