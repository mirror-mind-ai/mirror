// The ES-001 metadata-lifecycle WRITE faces at the front door
// (CV22.DS7.TS4 plateau 7).
//
// `conversations --metadata-lifecycle-apply <id> [--title/--summary/--tag]` and
// `--metadata-lifecycle-demo`. Both print `json.dumps(report, ensure_ascii=
// False, indent=2)`, so the rendering is `JSON.stringify(report, null, 2)` plus
// the newline `print` adds, and key ORDER is part of those bytes.
//
// The demo builds its own throwaway world. Python's is `sqlite3.connect(
// ":memory:")` with the schema applied; here it is a bootstrapped temp file
// removed on the way out, because `node:sqlite`'s in-memory handle cannot be
// given the migration ledger the bootstrap writes. Either way the claim it
// prints — `uses_production_data: false` — stays literally true: the caller's
// database is opened, never written, and never read by the demo.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleFaceError } from "#conversation/lifecycleFaces.ts";
import {
  applyMetadataLifecycle,
  type DemoSeed,
  metadataLifecycleDemoReport,
  writeTitle,
} from "#conversation/lifecycleWrites.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";
import { newId, nowIso } from "#util/pyGenerators.ts";

/** Python's `print(json.dumps(report, ensure_ascii=False, indent=2))`. */
function printReport(report: unknown): number {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

function optionValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

/** `--tag` is singular and REPEATABLE (`dest="tags"`, `action="append"`). */
function tagValues(argv: readonly string[]): string[] | undefined {
  const tags: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--tag") continue;
    const value = argv[index + 1];
    if (value !== undefined) tags.push(value);
  }
  return tags.length > 0 ? tags : undefined;
}

export function runLifecycleWriteRoute(db: WritableDatabase, args: readonly string[]): number {
  if (args.includes("--metadata-lifecycle-demo")) return runDemo();

  const conversationId = optionValue(args, "--metadata-lifecycle-apply");
  if (conversationId === undefined) {
    console.error("Mirror TS front door: --metadata-lifecycle-apply requires a conversation id");
    return 2;
  }
  const title = optionValue(args, "--title");
  const summary = optionValue(args, "--summary");
  const tags = tagValues(args);
  try {
    return printReport(
      applyMetadataLifecycle(db, conversationId, {
        ...(title !== undefined ? { title } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(tags !== undefined ? { tags } : {}),
      }),
    );
  } catch (error) {
    if (!(error instanceof LifecycleFaceError)) throw error;
    // Python raises ValueError and the traceback escapes: same exit code, same
    // stream, one line.
    console.error(error.message);
    return 1;
  }
}

function runDemo(): number {
  const root = mkdtempSync(join(tmpdir(), "mirror-lifecycle-demo-"));
  try {
    const db = bootstrapDatabase(join(root, "memory_test.db"));
    try {
      const seed: DemoSeed = {
        startConversation: (interfaceName, title) => {
          const id = newId();
          db.prepare(
            "INSERT INTO conversations (id, interface, title, started_at) VALUES (?, ?, ?, ?)",
          ).run(id, interfaceName, title ?? null, nowIso());
          return id;
        },
        addMessage: (conversationId, role, content) => {
          db.prepare(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) " +
              "VALUES (?, ?, ?, ?, ?)",
          ).run(newId(), conversationId, role, content, nowIso());
        },
        setProvisionalTitle: (conversationId, title) =>
          writeTitle(db, conversationId, title, "provisional"),
        updateTitle: (conversationId, title) => writeTitle(db, conversationId, title, "manual"),
      };
      return printReport(metadataLifecycleDemoReport(db, seed));
    } finally {
      db.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
