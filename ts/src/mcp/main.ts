// Mirror MCP server entry point (CV22.DS9.US1).
//
// Launched by an MCP client over stdio. Unreferenced by any route until
// CV22.DS9.TS2 flips the plugin manifest to it; US1 ships it so the parity
// harness can spawn the real process the way a client would.
//
// Warning suppression is load-bearing, not cosmetic. `node:sqlite` emits an
// ExperimentalWarning on import under the Node 24 floor this package declares,
// and the Mirror skills silence it with `NODE_OPTIONS=--no-warnings` -- an
// environment variable NO MCP CLIENT WILL SET. stderr is the client's log for
// this server, and the parity harness asserts it stays empty, so the
// suppression has to live in-process and run before anything reaches for the
// database. (RS005: what lands in that log is read by the host.)

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning") return;
  process.stderr.write(`${warning.name}: ${warning.message}\n`);
});

const { serve } = await import("./serve.ts");

await serve();

// Input ended and every response has drained (`serve` does not resolve before
// that). Exiting explicitly keeps the process from lingering on an open stdin
// handle in clients that leave the pipe half-open.
process.exit(0);
