import { DatabaseSync } from "node:sqlite";

const message = process.argv.slice(2).join(" ") || "hello";
const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH);
try {
  db.prepare("INSERT INTO ext_hello_pings (message, created_at) VALUES (?, ?)").run(
    message,
    new Date().toISOString(),
  );
  process.stdout.write(`ping: ${message}\n`);
} finally {
  db.close();
}
