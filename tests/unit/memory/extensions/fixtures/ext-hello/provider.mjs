// Reference mirror-context-v1 provider for the synthetic hello extension.
import { DatabaseSync } from "node:sqlite";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const db = new DatabaseSync(request.database_path, { readOnly: true });
try {
  const row = db.prepare("SELECT message FROM ext_hello_pings ORDER BY id DESC LIMIT 1").get();
  process.stdout.write(
    JSON.stringify({
      protocol: "mirror-context-v1",
      text: row ? `Latest ping: ${row.message}` : null,
    }),
  );
} finally {
  db.close();
}
