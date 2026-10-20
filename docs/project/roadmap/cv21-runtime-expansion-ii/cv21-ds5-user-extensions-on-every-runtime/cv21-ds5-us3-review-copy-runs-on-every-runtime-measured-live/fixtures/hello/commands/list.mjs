import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH, { readOnly: true });
try {
  const rows = db
    .prepare("SELECT message, created_at FROM ext_hello_pings ORDER BY id DESC LIMIT 10")
    .all();
  for (const row of rows) process.stdout.write(`${row.created_at}  ${row.message}\n`);
} finally {
  db.close();
}
