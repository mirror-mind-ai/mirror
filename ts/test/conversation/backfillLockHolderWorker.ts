// The "live hook" side of the backfill race (`backfill.test.ts`, resolved
// decision 4B). Takes the write lock, announces it on stdout, holds it long
// enough for the backfill in the parent to pass its pre-check and block on
// BEGIN IMMEDIATE, then binds the session as a live hook would and commits.
// A real second process, as in the Python test that reproduced the clobber,
// because the property is cross-connection lock ordering.

import { DatabaseSync } from "node:sqlite";

const [dbPath, sessionId] = process.argv.slice(2);
if (!dbPath || !sessionId) {
  console.error("usage: backfillLockHolderWorker.ts <db-path> <session-id>");
  process.exit(2);
}

const NOW = "2026-09-03T12:00:00.000000Z";
const db = new DatabaseSync(dbPath);
try {
  db.exec("PRAGMA busy_timeout=30000");
  db.exec("BEGIN IMMEDIATE");
  process.stdout.write("locked\n");
  await new Promise((resolve) => setTimeout(resolve, 300));
  db.prepare(
    `INSERT INTO conversations
       (id, title, started_at, ended_at, interface, persona, journey, summary, tags, metadata)
     VALUES ('conv-live', NULL, ?, NULL, 'pi', NULL, NULL, NULL, NULL, NULL)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO runtime_sessions
       (session_id, conversation_id, interface, mirror_active, hook_injected, active,
        started_at, updated_at)
     VALUES (?, 'conv-live', 'pi', 0, 0, 1, ?, ?)`,
  ).run(sessionId, NOW, NOW);
  db.exec("COMMIT");
  process.exit(0);
} catch (error) {
  console.error(String(error instanceof Error ? error.stack : error));
  process.exit(1);
} finally {
  db.close();
}
