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
const { openDatabaseForLedgerAppend, openDatabaseReadOnly } = await import("#db/database.ts");
const { ensureDatabaseReady } = await import("#db/readyOnOpen.ts");
const { embeddingLedgerHook } = await import("#observability/ledgerHooks.ts");
const { MCP_LEDGER_SESSION } = await import("./guards.ts");
const { basename } = await import("node:path");
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

// Activate before opening, also as Python does: `get_connection` bootstraps a
// missing file and runs migrations under the bootstrap lock before handing back
// a connection, so every Python entry point -- this server included -- gets a
// current schema. US2 opened read-only and skipped it, which meant a pending
// TS-authored migration would surface as a tool error on the first read that
// touched the new shape, where Python would simply have applied it.
const migration = ensureDatabaseReady(databasePath);
if (migration.migrated) {
  // The one thing this server writes to stderr in normal operation. A migration
  // is an operator-visible event and stderr is the client's log for this
  // process; the front door records the same fact, redacted the same way, in
  // the front-door log. Ids and a backup file name only -- never content.
  process.stderr.write(
    `migrate_on_open applied=${migration.appliedIds.join(",")} backup=${
      migration.backupPath ? basename(migration.backupPath) : "none"
    }\n`,
  );
}

const db = openDatabaseReadOnly(databasePath);

// The single sanctioned write (TS2 D1), on its own connection, opened lazily so
// a session that never searches never opens it. The handle can prepare nothing
// but the `llm_calls` append, and it never reaches a tool: the registry gets
// the SINK below, not this connection.
// Attributed to this surface (TS1 D2): extraction embeds every memory it creates, so a
// session close writes dozens of embedding rows in a minute. A wallet guard counting all
// of them would refuse the agent because the USER ended a conversation. The marker is what
// makes the count name the actor it guards -- and it never leaves this file, so no tool can
// write a row claiming to be someone else.
let ledgerDb: ReturnType<typeof openDatabaseForLedgerAppend> | null = null;
const embeddingLedger = (info: Parameters<ReturnType<typeof embeddingLedgerHook>>[0]): void => {
  ledgerDb ??= openDatabaseForLedgerAppend(databasePath);
  embeddingLedgerHook(ledgerDb, { sessionId: MCP_LEDGER_SESSION })(info);
};

// The live provider resolves its config lazily, so a missing key degrades the
// search to lexical-only instead of failing the server -- the same posture the
// `memories --search` route takes.
const embeddingProvider = await resolveSearchEmbeddingProvider();

await serve({
  registry: wiredRegistry({
    db,
    runtime: {
      embeddingProvider,
      embeddingLedger,
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
