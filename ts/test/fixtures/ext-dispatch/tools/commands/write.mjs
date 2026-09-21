// The write must land in the database the DISPATCHER resolved, not in a second
// file the command opened by guessing. `MIRROR_DATABASE_PATH` is how it knows,
// and counting the rows afterwards is how the test proves it.
import { DatabaseSync } from "node:sqlite";

const note = process.argv.slice(2).join(" ") || "(empty)";
const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH);
try {
  db.prepare("INSERT INTO ext_tools_notes (note) VALUES (?)").run(note);
} finally {
  db.close();
}
process.stdout.write(`wrote: ${note}\n`);
