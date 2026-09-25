// Worker process for `liveWriteConcurrency.test.ts` (CV22.DS10.TS5, finding F21).
//
// One routed live write, exactly as the front door performs it: open the live
// database behind its pre-write snapshot, insert one row, close. Every worker
// spins until the same wall-clock instant before it starts, so their snapshots
// genuinely overlap -- the collision F21 is about only happens when two writers
// are inside `VACUUM INTO` at once, and process start-up jitter alone would
// mostly serialize them.
//
// Standalone rather than in-process because the race is between OS processes:
// Claude Code's two prompt hooks, or a Pi turn's log-user overlapping the last
// turn's detached log-assistant.

import { openLiveWriteDatabase } from "#frontDoor/liveBackup.ts";

const [dbPath, startAt, label] = process.argv.slice(2);
if (!dbPath || !startAt || !label) {
  console.error("usage: liveWriteWorker.ts <db-path> <start-at-epoch-ms> <label>");
  process.exit(2);
}

while (Date.now() < Number(startAt)) {
  // Busy-wait on purpose: a timer would add its own jitter to the barrier.
}

try {
  const db = openLiveWriteDatabase(dbPath);
  try {
    db.prepare("INSERT INTO probe (label) VALUES (?)").run(label);
  } finally {
    db.close();
  }
  process.exit(0);
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
}
