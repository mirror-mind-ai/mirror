// Declared `mirror-cli-v1` command. Its Python twin was deleted with the
// compatibility host in CV22.DS10.TS2 -- there is no second engine left to
// agree with, so this file is graded directly.
//
// Context arrives in the environment (never on stdin — stdin belongs to the
// user) and the user's argv is appended to the declared command verbatim.
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
const db = new DatabaseSync(process.env.MIRROR_DATABASE_PATH, { readOnly: true });
try {
  const row = db.prepare("SELECT COUNT(*) AS n FROM ext_declared_notes").get();
  process.stdout.write(
    `greet[${argv.length}]: ${argv.join(" ")} | ext=${process.env.MIRROR_EXTENSION_ID} rows=${row.n}\n`,
  );
} finally {
  db.close();
}
