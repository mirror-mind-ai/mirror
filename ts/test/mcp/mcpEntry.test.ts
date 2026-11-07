// The plugin's MCP entry (CV21.DS2.US6).
//
// Replaces `launcher.test.ts`: the manifest no longer names a file of the
// plugin's (`${CLAUDE_PLUGIN_ROOT}/mcp/launch.sh`, which Codex never
// expanded, DS12.TS2 L6) but carries the launcher's search inline, run by
// `/bin/sh`. What these cases pin is what the US6 spike measured on Claude
// Code 2.1.296, Codex 0.162.1, and Grok 1.0.52: the text survives every
// runtime's rendering, it starts the server from a GUI-launch PATH, and it
// fails in one line when `mirror` is nowhere.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import { buildManifest, GLOBAL_BIN_DIRS, MCP_ENTRY, MCP_LOCATOR } from "#guards/claudePlugin.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "mirror-mcp-entry-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const INITIALIZE = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "t", version: "0" },
  },
})}\n`;

/** A bin directory the way npm's global bin links `mirror`, with `node` beside it. */
function scratchBin(root: string, withNode = true): string {
  const bin = join(root, "global-bin");
  mkdirSync(bin);
  symlinkSync(join(REPO_ROOT, "bin", "mirror.js"), join(bin, "mirror"));
  if (withNode) symlinkSync(process.execPath, join(bin, "node"));
  return bin;
}

function runEntry(root: string, env: Record<string, string>) {
  const dbPath = join(root, "memory.db");
  if (!existsSync(dbPath)) bootstrapDatabase(dbPath).close();
  return spawnSync(MCP_ENTRY.command, [...MCP_ENTRY.args], {
    // A cwd that is not the repository: a client spawns this from the user's
    // project, and the plugin contract forbids a repo-cwd assumption.
    cwd: root,
    env: { DB_PATH: dbPath, MEMORY_ENV: "production", ...env },
    input: INITIALIZE,
    encoding: "utf8",
    timeout: 60_000,
  });
}

function serverName(stdout: string): string | undefined {
  const line = stdout.split("\n").filter(Boolean)[0];
  if (!line) return undefined;
  return (JSON.parse(line) as { result?: { serverInfo?: { name?: string } } }).result?.serverInfo
    ?.name;
}

function globalBinHolds(name: string): boolean {
  const home = process.env.HOME ?? "";
  return [`${home}/.nvm/current/bin`, "/opt/homebrew/bin", "/usr/local/bin"].some((dir) =>
    existsSync(join(dir, name)),
  );
}

describe("the MCP entry's text", () => {
  test("is what the manifest carries, run by /bin/sh", () => {
    const manifest = buildManifest("0.0.0") as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    assert.deepEqual(manifest.mcpServers["mirror-mind"], {
      command: "/bin/sh",
      args: ["-c", MCP_LOCATOR],
    });
  });

  test("names nothing a runtime must expand: no brace expansion, no positional parameter, no backtick", () => {
    // Claude Code expands `${VAR}` in MCP configuration; Grok substitutes set
    // variables by name; the text crosses two JSON encoders. What is left is
    // plain `$name` references to variables the locator sets itself or the
    // user does, and command substitution.
    assert.doesNotMatch(MCP_LOCATOR, /\$\{/);
    assert.doesNotMatch(MCP_LOCATOR, /\$[0-9@*#?!$-]/);
    assert.doesNotMatch(MCP_LOCATOR, /`/);
    assert.doesNotMatch(MCP_LOCATOR, /CLAUDE_PLUGIN_ROOT|launch\.sh|MIRROR_TS_MCP|python/);
  });

  test("uses variable names no one exports, because Grok substitutes set ones at load time", () => {
    const names = new Set(
      [...MCP_LOCATOR.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    );
    assert.deepEqual([...names].sort(), [
      "HOME",
      "MIRROR_BIN",
      "MIRROR_NODE",
      "mmbin",
      "mmbindir",
      "mmdir",
      "mmjs",
      "mmnode",
      "mmwhy",
    ]);
  });

  test("reads MIRROR_NODE once, because Grok pastes a set variable's value into the text (CR192)", () => {
    // Each `$MIRROR_NODE` is a place Grok would paste the value into shell
    // text at load time; the locator copies it into `mmnode` and uses that.
    assert.equal(MCP_LOCATOR.split("$MIRROR_NODE").length - 1, 1);
  });

  test("reads MIRROR_BIN once, for the same reason (CR197)", () => {
    assert.equal(MCP_LOCATOR.split("$MIRROR_BIN").length - 1, 1);
  });

  test("parses as POSIX sh", () => {
    const result = spawnSync("sh", ["-n", "-c", MCP_LOCATOR], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  });

  test("searches the directories the hook wrappers search, in their order", () => {
    // The plugin's wrappers have the plugin's problem -- no relative path to
    // the tree -- and solve it with the same list. One list, held equal here,
    // so a directory added to one search reaches the other.
    const wrapper = readFileSync(
      join(REPO_ROOT, "plugins/mirror-mind/hooks/session-start.sh"),
      "utf8",
    );
    const wrapperDirs = /^for candidate in (.*); do$/m.exec(wrapper)?.[1] ?? "";
    assert.equal(wrapperDirs, GLOBAL_BIN_DIRS.join(" "));
    const nodeSearch = /for mmdir in "\$\(dirname "\$mmbin"\)" (.*?); do \[ -n "\$mmnode" \]/.exec(
      MCP_LOCATOR,
    )?.[1];
    assert.equal(nodeSearch, GLOBAL_BIN_DIRS.join(" "));
  });
});

describe("the MCP entry, run as written", () => {
  test("starts the server through the mirror bin on the PATH, and stderr stays the client's", () => {
    const root = scratch();
    const bin = scratchBin(root);
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${bin}:/usr/bin:/bin`,
      MIRROR_HOME: join(root, "mirror-home"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(serverName(result.stdout), "mirror-mind");
  });

  test("from a GUI launch: no npm bin and no node on the PATH, MIRROR_BIN set", () => {
    // The reason the entry is a locator and not `mirror mcp`: the spike
    // measured `mirror mcp` failing exactly here, as written and inside
    // Claude Code (`claude mcp list`: ENOENT), and the locator connecting.
    const root = scratch();
    const bin = scratchBin(root);
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: "/usr/bin:/bin",
      MIRROR_BIN: bin,
      MIRROR_HOME: join(root, "mirror-home"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(serverName(result.stdout), "mirror-mind");
  });

  test("MIRROR_NODE outranks the PATH's node", () => {
    const root = scratch();
    const bin = scratchBin(root, false);
    const marker = join(root, "node-ran");
    const fakeNode = join(root, "fake-node");
    writeFileSync(fakeNode, `#!/bin/sh\ntouch "${marker}"\nexec "${process.execPath}" "$@"\n`, {
      mode: 0o755,
    });
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${bin}:${resolve(process.execPath, "..")}:/usr/bin:/bin`,
      MIRROR_NODE: fakeNode,
      MIRROR_HOME: join(root, "mirror-home"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(marker), "the node MIRROR_NODE names ran the server");
    assert.equal(result.stderr, "", "a value it uses is not reported");
  });

  test("a relative MIRROR_NODE is never run: one stderr line says why, and the server starts through the PATH (CR192)", () => {
    // The cwd is the user's project, and this one holds an executable bin/node.
    const root = scratch();
    const bin = scratchBin(root);
    const marker = join(root, "project-node-ran");
    mkdirSync(join(root, "bin"));
    writeFileSync(join(root, "bin", "node"), `#!/bin/sh\ntouch "${marker}"\n`, { mode: 0o755 });

    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${bin}:/usr/bin:/bin`,
      MIRROR_NODE: "bin/node",
      MIRROR_HOME: join(root, "mirror-home"),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(serverName(result.stdout), "mirror-mind");
    assert.ok(!existsSync(marker), "the project's bin/node never ran");
    assert.equal(
      result.stderr,
      "mirror-mind: MIRROR_NODE=bin/node is relative; searching the PATH and the usual places instead\n",
    );
  });

  test("each value it will not use is refused with its reason, printed intact on one line (CR192)", () => {
    // Stand-ins for `mirror` and `node`, so each case is one process, not a
    // server start. The installer's value goes through printf: dash's echo
    // would turn the `\n` of `\nodejs` into a newline.
    const root = scratch();
    const standIns = join(root, "stand-ins");
    const ran = join(root, "path-node-ran");
    const notExecutable = join(root, "node-without-x");
    mkdirSync(standIns);
    writeFileSync(join(standIns, "mirror"), "", { mode: 0o755 });
    writeFileSync(join(standIns, "node"), `#!/bin/sh\ntouch "${ran}"\n`, { mode: 0o755 });
    writeFileSync(notExecutable, "", { mode: 0o644 });
    const cases: [value: string, reason: string, printed?: string][] = [
      [root, "a directory"],
      [join(root, "nowhere", "node"), "missing"],
      [notExecutable, "not executable"],
      ["C:node.exe", "relative"],
      ["C:\\Program Files\\nodejs\\node.exe", "missing"],
      ["bin/node\nforged", "relative", "bin/nodeforged"],
    ];
    for (const [value, reason, printed = value] of cases) {
      rmSync(ran, { force: true });
      const result = spawnSync(MCP_ENTRY.command, [...MCP_ENTRY.args], {
        cwd: root,
        env: {
          HOME: join(root, "home"),
          PATH: `${standIns}:/usr/bin:/bin`,
          MIRROR_BIN: standIns,
          MIRROR_NODE: value,
        },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, `${value}: ${result.stderr}`);
      assert.equal(
        result.stderr,
        `mirror-mind: MIRROR_NODE=${printed} is ${reason}; searching the PATH and the usual places instead\n`,
        value,
      );
      assert.ok(existsSync(ran), `${value}: the server still started, through the PATH`);
    }
  });

  test("a relative MIRROR_BIN is never used: the project's bin/mirror never runs, one stderr line says why, and the server starts through the PATH (CR197)", () => {
    // The cwd is the user's project, and this one holds an executable bin/mirror.
    const root = scratch();
    const bin = scratchBin(root);
    const marker = join(root, "project-mirror-ran");
    mkdirSync(join(root, "bin"));
    writeFileSync(
      join(root, "bin", "mirror"),
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
      { mode: 0o755 },
    );

    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${bin}:/usr/bin:/bin`,
      MIRROR_BIN: "bin",
      MIRROR_HOME: join(root, "mirror-home"),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(marker), "the project's bin/mirror never ran");
    assert.equal(serverName(result.stdout), "mirror-mind");
    assert.equal(
      result.stderr,
      "mirror-mind: MIRROR_BIN=bin is relative; searching the PATH and the usual places instead\n",
    );
  });

  test("each MIRROR_BIN it will not use is refused with its reason, printed intact on one line (CR197)", () => {
    // Stand-ins for `mirror` and `node` on the PATH, so each case is one
    // process, not a server start.
    const root = scratch();
    const standIns = join(root, "stand-ins");
    const ran = join(root, "path-node-ran");
    mkdirSync(standIns);
    writeFileSync(join(standIns, "mirror"), "", { mode: 0o755 });
    writeFileSync(join(standIns, "node"), `#!/bin/sh\ntouch "${ran}"\n`, { mode: 0o755 });
    const aFile = join(root, "a-file");
    writeFileSync(aFile, "");
    const empty = join(root, "empty-bin");
    mkdirSync(empty);
    const notExecutable = join(root, "bin-without-x");
    mkdirSync(notExecutable);
    writeFileSync(join(notExecutable, "mirror"), "", { mode: 0o644 });
    const binIsDirectory = join(root, "bin-holding-a-directory");
    mkdirSync(join(binIsDirectory, "mirror"), { recursive: true });
    const without = "a directory without an executable mirror";
    const cases: [value: string, reason: string, printed?: string][] = [
      [join(root, "nowhere"), "missing"],
      [aFile, "not a directory"],
      [empty, without],
      [notExecutable, without],
      [binIsDirectory, without],
      ["./bin", "relative"],
      ["C:bin", "relative"],
      ["C:/Users/someone/.mirror/bin", "missing"],
      ["bin\nforged", "relative", "binforged"],
    ];
    for (const [value, reason, printed = value] of cases) {
      rmSync(ran, { force: true });
      const result = spawnSync(MCP_ENTRY.command, [...MCP_ENTRY.args], {
        cwd: root,
        env: { HOME: join(root, "home"), PATH: `${standIns}:/usr/bin:/bin`, MIRROR_BIN: value },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, `${value}: ${result.stderr}`);
      assert.equal(
        result.stderr,
        `mirror-mind: MIRROR_BIN=${printed} is ${reason}; searching the PATH and the usual places instead\n`,
        value,
      );
      assert.ok(existsSync(ran), `${value}: the server still started, through the PATH`);
    }
  });

  test("a valid absolute MIRROR_BIN outranks the PATH's mirror and says nothing (CR197)", () => {
    const root = scratch();
    const bin = scratchBin(root);
    const decoys = join(root, "decoys");
    mkdirSync(decoys);
    const marker = join(root, "decoy-ran");
    writeFileSync(
      join(decoys, "mirror"),
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
      { mode: 0o755 },
    );

    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${decoys}:/usr/bin:/bin`,
      MIRROR_BIN: bin,
      MIRROR_HOME: join(root, "mirror-home"),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(serverName(result.stdout), "mirror-mind");
    assert.ok(!existsSync(marker), "the PATH's mirror did not run");
    assert.equal(result.stderr, "", "a value it uses is not reported");
  });

  test("an npm shell shim beside node_modules, as Windows's global prefix is shaped: the package's own bin runs (PR #53)", () => {
    // On Windows npm writes no symlink: `mirror` in its prefix is a POSIX
    // shell shim with `node_modules/` beside it. Handed to Node, the shim
    // died on its second line ("SyntaxError: missing ) after argument list")
    // and the MCP server never started. Modeled on POSIX: a prefix in that
    // shape, the shim a script Node cannot run, the real bin one fixed path
    // away. The server answering `initialize` is the proof the bin ran.
    const root = scratch();
    const prefix = join(root, "npm-prefix");
    const pkgBin = join(prefix, "node_modules", "mirror-mind", "bin");
    mkdirSync(pkgBin, { recursive: true });
    writeFileSync(
      join(prefix, "mirror"),
      '#!/bin/sh\nbasedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")\nexec node "$basedir/node_modules/mirror-mind/bin/mirror.js" "$@"\n',
      { mode: 0o755 },
    );
    symlinkSync(join(REPO_ROOT, "bin", "mirror.js"), join(pkgBin, "mirror.js"));
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${resolve(process.execPath, "..")}:/usr/bin:/bin`,
      MIRROR_BIN: prefix,
      MIRROR_HOME: join(root, "mirror-home"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(serverName(result.stdout), "mirror-mind");
  });

  test("a .env beside the plugin is not read, and the client's environment reaches the server", () => {
    // A plugin is copied into the runtime's cache; nothing of the tree is
    // beside it, and the launcher used to pass `--env-file-if-exists` for a
    // .env three levels up. DB_PATH from the environment is the proof.
    const root = scratch();
    const bin = scratchBin(root);
    writeFileSync(join(root, ".env"), "DB_PATH=/nonexistent/should-not-be-read.db\n");
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: `${bin}:/usr/bin:/bin`,
      MIRROR_HOME: join(root, "mirror-home"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(serverName(result.stdout), "mirror-mind");
  });

  test("with no mirror anywhere: one line on stderr naming the install step, exit 1", {
    skip: globalBinHolds("mirror") && "a global mirror is installed on this machine",
  }, () => {
    const root = scratch();
    const result = runEntry(root, { HOME: join(root, "home"), PATH: "/usr/bin:/bin" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim().split("\n").length, 1);
    assert.match(result.stderr, /mirror not found on PATH; the MCP server cannot start/);
    assert.match(result.stderr, /npm install -g mirror-mind/);
  });

  test("with mirror but no node anywhere: one line, exit 1", {
    skip: globalBinHolds("node") && "a global node is installed on this machine",
  }, () => {
    const root = scratch();
    const bin = scratchBin(root, false);
    const result = runEntry(root, {
      HOME: join(root, "home"),
      PATH: "/usr/bin:/bin",
      MIRROR_BIN: bin,
    });
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /node not found on PATH; the MCP server cannot start. Set MIRROR_NODE/,
    );
  });
});
