#!/usr/bin/env node
// CV21.DS10.TS2 — the control MCP server (shape S3).
//
// A stdio MCP server that does nothing but exist: `initialize`, `tools/list` with
// one `ping` tool, `tools/call` returning a constant. It is carried by a scratch
// plugin's manifest exactly as Mirror's server is carried by the shipped one, so a
// session that attaches this and not Mirror's says the difference is in the server,
// and a session that attaches neither says it is in how Grok reads the plugin.
//
// Test fixture, not product: no dependencies, installed only in a scratch HOME,
// inert. Protocol version as the package smoke speaks it (ts/smoke/mcp_entry.ts).
import readline from "node:readline";

const PROTOCOL = "2025-06-18";
const TOOLS = [
  {
    name: "ping",
    description: "Answers pong. A control tool for CV21.DS10.TS2; it reads and writes nothing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "ds10-ts2-control", version: "0.0.1" },
      });
      break;
    case "ping":
      reply(msg.id, {});
      break;
    case "tools/list":
      reply(msg.id, { tools: TOOLS });
      break;
    case "tools/call":
      if (msg.params && msg.params.name === "ping") {
        reply(msg.id, { content: [{ type: "text", text: "pong" }] });
      } else {
        fail(msg.id, -32602, `unknown tool: ${msg.params && msg.params.name}`);
      }
      break;
    default:
      fail(msg.id, -32601, `method not found: ${msg.method}`);
  }
});
