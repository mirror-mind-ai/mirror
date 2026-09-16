// Declared `mirror-cli-v1` command. The Python twin in `extension.py` prints
// the same bytes; the golden is recorded from Python and replayed through this
// file, so any drift between the two fails the corpus.
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
