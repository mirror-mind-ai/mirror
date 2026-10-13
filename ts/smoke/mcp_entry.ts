// Run a plugin's MCP entry exactly as its manifest states it (CV21.DS2.US6).
//
//     node ts/smoke/mcp_entry.ts <plugin dir>   < mcp messages on stdin
//
// The smokes and the guard probe used to run `plugins/mirror-mind/mcp/launch.sh`.
// The manifest no longer names a file of the plugin's: its entry is a command
// and args a runtime spawns as written, so that is what this does -- the
// command, the args, stdin through, stdout and stderr through, the exit code
// through. No shell of this script's between the manifest and the server.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pluginDir = process.argv[2];
if (!pluginDir) {
  process.stderr.write("usage: node ts/smoke/mcp_entry.ts <plugin dir>\n");
  process.exit(2);
}

const manifest = JSON.parse(
  readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"),
) as {
  mcpServers?: Record<string, { command: string; args?: string[] }>;
};
const entry = manifest.mcpServers?.["mirror-mind"];
if (!entry) {
  process.stderr.write(`${pluginDir}: no mcpServers.mirror-mind entry\n`);
  process.exit(2);
}

const result = spawnSync(entry.command, entry.args ?? [], { stdio: "inherit" });
process.exit(result.status ?? 1);
