// Mirror MCP server entry point (CV22.DS9.US1 + US2).
//
// Launched by an MCP client over stdio. Unreferenced by any route until
// CV22.DS9.TS2 flips the plugin manifest to it; it ships now so the parity
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

const { resolveDbPath } = await import("#frontDoor/dbPath.ts");
const { resolveSearchEmbeddingProvider } = await import("#frontDoor/searchRoute.ts");
const { openDatabaseReadOnly } = await import("#db/database.ts");
const { wiredRegistry } = await import("./registry.ts");
const { serve } = await import("./serve.ts");

// READ-ONLY, by Navigator decision (CV22.DS9.US2, option (d)).
//
// The alternatives were a full pre-write backup on every launch -- measured at
// 399 ms and a 49.3 MB snapshot on the owner's database, paid each time a
// client spawns this process -- or opening writable without that gate, which
// would narrow the DS4 write discipline inside a wiring story. Read-only is the
// strongest posture and matches the DS9 threat model, which calls this server a
// read oracle over private memory: it now cannot write even if a tool tried.
//
// The cost is named rather than hidden: the embedding-ledger row that a query
// search would record (AI-09/D-003) is NOT written, so agent-initiated searches
// go uncounted as spend. CV22.DS9.TS1's wallet guard reads that ledger, so TS2
// must settle how this server opens its database before TS1 can guard what it
// cannot see. Recorded in the DS9 package.
//
// Opened eagerly, as Python does: `serve()` constructs its MemoryClient before
// reading the first line, so an unconfigured install fails at startup rather
// than answering `initialize` and then failing all seven tools.
const databasePath = resolveDbPath([]);
const db = openDatabaseReadOnly(databasePath);

// The live provider resolves its config lazily, so a missing key degrades the
// search to lexical-only instead of failing the server -- the same posture the
// `memories --search` route takes.
const embeddingProvider = await resolveSearchEmbeddingProvider();

await serve({
  registry: wiredRegistry({
    db,
    runtime: {
      embeddingProvider,
      databasePath,
      ...(process.env.MIRROR_HOME ? { mirrorHome: process.env.MIRROR_HOME } : {}),
      ...(process.env.MIRROR_USER ? { user: process.env.MIRROR_USER } : {}),
    },
  }),
});

// Input ended and every response has drained (`serve` does not resolve before
// that). Exiting explicitly keeps the process from lingering on an open stdin
// handle in clients that leave the pipe half-open.
process.exit(0);
