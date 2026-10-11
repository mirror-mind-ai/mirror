// Test fixture (CV22.DS9.US1): the MCP server with one stub tool that returns a
// very large text, used to prove the loop drains stdout before exiting.
//
// It exists as a separate entry point because the drain hazard is a property of
// a REAL process writing to a REAL pipe -- an in-process test with a mock
// writable stream cannot reproduce it, since the truncation comes from
// libuv's asynchronous pipe write on macOS being abandoned at exit.

process.removeAllListeners("warning");

const { serve } = await import("#mcp/serve.ts");
const { buildRegistry } = await import("#mcp/registry.ts");

const size = Number(process.env.LARGE_RESPONSE_BYTES ?? "1000000");

await serve({
  serverVersion: "0.0.0-golden",
  registry: buildRegistry([
    {
      name: "__large",
      description: "Stub tool returning a large text.",
      inputSchema: { type: "object", properties: {} },
      handler: () => "x".repeat(size),
    },
  ]),
});

process.exit(0);
