#!/usr/bin/env node
// CV21.DS5.TS1 — the probe MCP server (shape (c)).
//
// CV21.DS10.TS2's `control-mcp.mjs` with `prompts/list` and `prompts/get` in place of
// `tools/list` and `tools/call` (plan amendment 2). A stdio MCP server that serves one
// prompt, `ext-review-copy`, whose text is the inert skill the route placed, and no
// tools. It is carried by a scratch plugin's manifest exactly as Mirror's server is
// carried by the shipped one, so what a runtime does with a plugin-carried prompt is
// measured without changing `mirror mcp`, which declares tools only.
//
// Test fixture, not product: no dependencies, installed only in a scratch HOME, reads
// one file named on its command line, writes nothing. Protocol version as the package
// smoke speaks it (ts/smoke/mcp_entry.ts).
import { readFileSync } from "node:fs";
import readline from "node:readline";

const PROTOCOL = "2025-06-18";
const PROMPT_NAME = "ext-review-copy";
const skillPath = process.argv[2];
const skillText = skillPath ? readFileSync(skillPath, "utf8") : "# Review Copy\n\n(no skill file given)\n";
const PROMPTS = [
  {
    name: PROMPT_NAME,
    description: "Sends copy to multiple LLMs and generates structured HTML reviews",
    arguments: [],
  },
];

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}
function fail(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // a notification: nothing to answer
  switch (msg.method) {
    case "initialize":
      reply(msg.id, {
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : PROTOCOL,
        capabilities: { prompts: {} },
        serverInfo: { name: "ds5-ts1-probe", version: "0.0.1" },
      });
      break;
    case "ping":
      reply(msg.id, {});
      break;
    case "prompts/list":
      reply(msg.id, { prompts: PROMPTS });
      break;
    case "prompts/get":
      if (msg.params?.name !== PROMPT_NAME) {
        fail(msg.id, -32602, `Unknown prompt: ${String(msg.params?.name)}`);
        break;
      }
      reply(msg.id, {
        description: PROMPTS[0].description,
        messages: [{ role: "user", content: { type: "text", text: skillText } }],
      });
      break;
    case "tools/list":
      reply(msg.id, { tools: [] });
      break;
    default:
      fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});
