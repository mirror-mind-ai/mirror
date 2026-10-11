import { openDatabaseCopyForWrite } from "#db/database.ts";

const [dbPath, journey] = process.argv.slice(2);
if (!dbPath || !journey) throw new Error("expected database path and journey");

const db = openDatabaseCopyForWrite(dbPath);
db.exec("BEGIN IMMEDIATE");
db.prepare(
  "INSERT INTO tasks (id, journey, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
).run("contending-task", journey, "Keep", "2026-06-25T12:00:00Z", "2026-06-25T12:00:00Z");
process.stdout.write("locked\n");
setTimeout(() => {
  db.exec("COMMIT");
  db.close();
}, 250);
