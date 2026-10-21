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
      "mmdir",
      "mmjs",
      "mmnode",
    ]);
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
