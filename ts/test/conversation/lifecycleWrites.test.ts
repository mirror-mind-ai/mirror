// CV22.DS7.TS4 plateau 6 — the ES-001 metadata-lifecycle WRITE faces.
//
// `--metadata-lifecycle-apply` is graded on TWO faces at once: the report
// Python printed, and the conversation ROW afterwards. A report claiming
// `mutated: true` over a row that kept its old title is precisely the defect a
// report-only corpus cannot see, and this family's whole risk is that the
// decision engine and the write disagree.
//
// The seeded world is carried by the golden — the rows Python's own service
// wrote — so the replay starts from identical bytes rather than from a guess at
// what `set_provisional_title` produces. The US11 corpus recorded that lesson
// after a fixture's invented metadata turned every `repair` into `keep`.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LifecycleFaceError } from "#conversation/lifecycleFaces.ts";
import {
  applyMetadataLifecycle,
  cleanTitle,
  type DemoSeed,
  metadataLifecycleDemoReport,
  writeTitle,
} from "#conversation/lifecycleWrites.ts";
import { bootstrapDatabase } from "#db/bootstrap.ts";
import type { WritableDatabase } from "#db/database.ts";

interface ConversationRow {
  id: string;
  interface: string;
  title: string | null;
  started_at: string;
  summary: string | null;
  tags: string | null;
  metadata: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ApplyCase {
  label: string;
  state: string | null;
  conversation_id: string;
  extra_argv: string[];
  stdout: string;
  stderr: string | null;
  stderr_final_line: string | null;
  exit_code: number;
  rows_after: Record<string, ConversationRow | null>;
  divergence: string | null;
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "lifecycle-write.golden.json"),
    "utf8",
  ),
) as {
  world: { conversations: ConversationRow[]; messages: MessageRow[] };
  ids: Record<string, string>;
  cases: ApplyCase[];
  demo: { stdout: string; exit_code: number; alias_count: number };
};

interface World {
  root: string;
  db: WritableDatabase;
}

function makeWorld(): World {
  const root = mkdtempSync(join(tmpdir(), "lifecycle-write-"));
  const db = bootstrapDatabase(join(root, "memory_test.db"));
  for (const row of golden.world.conversations) {
    db.prepare(
      "INSERT INTO conversations (id, interface, title, started_at, summary, tags, metadata) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(row.id, row.interface, row.title, row.started_at, row.summary, row.tags, row.metadata);
  }
  for (const message of golden.world.messages) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(message.id, message.conversation_id, message.role, message.content, message.created_at);
  }
  return { root, db };
}

function closeWorld(world: World): void {
  world.db.close();
  rmSync(world.root, { recursive: true, force: true });
}

/** The CLI's argv, as `cli/conversations.py` parses it: `--tag` is repeatable. */
function parseExtraArgv(argv: readonly string[]): {
  title?: string;
  summary?: string;
  tags?: string[];
} {
  const parsed: { title?: string; summary?: string; tags?: string[] } = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1] as string;
    if (flag === "--title") parsed.title = value;
    else if (flag === "--summary") parsed.summary = value;
    else if (flag === "--tag") parsed.tags = [...(parsed.tags ?? []), value];
    else throw new Error(`the corpus grew a flag this replay does not parse: ${flag}`);
  }
  return parsed;
}

function rowsOf(world: World): Record<string, ConversationRow | null> {
  const rows: Record<string, ConversationRow | null> = {};
  for (const [state, conversationId] of Object.entries(golden.ids)) {
    rows[state] =
      (world.db
        .prepare("SELECT id, title, summary, tags, metadata FROM conversations WHERE id = ?")
        .get(conversationId) as unknown as ConversationRow | undefined) ?? null;
  }
  return rows;
}

test("every recorded apply matches Python, in the report and on the row", () => {
  const world = makeWorld();
  try {
    for (const recorded of golden.cases) {
      const parsed = parseExtraArgv(recorded.extra_argv);
      if (recorded.divergence !== null) {
        // RECORDED DIVERGENCE: Python lets the ValueError escape as a traceback.
        // TypeScript raises the same message; the front door renders it as one
        // line at the same exit code.
        assert.throws(
          () => applyMetadataLifecycle(world.db, recorded.conversation_id, parsed),
          (error: unknown) =>
            error instanceof LifecycleFaceError &&
            (recorded.stderr_final_line ?? "").endsWith(error.message),
          recorded.label,
        );
        continue;
      }
      const report = applyMetadataLifecycle(world.db, recorded.conversation_id, parsed);
      // The CLI prints `json.dumps(report, ensure_ascii=False, indent=2)`, and
      // key ORDER is part of those bytes.
      assert.equal(
        `${JSON.stringify(report, null, 2)}\n`,
        recorded.stdout,
        `${recorded.label} (report)`,
      );
      assert.deepEqual(rowsOf(world), recorded.rows_after, `${recorded.label} (rows)`);
    }
  } finally {
    closeWorld(world);
  }
});

test("the demo report matches Python, ids aside", () => {
  const world = makeWorld();
  try {
    const demoDb = bootstrapDatabase(join(world.root, "demo.db"));
    try {
      let counter = 0;
      const seed: DemoSeed = {
        startConversation: (interfaceName, title) => {
          counter += 1;
          const id = `demo${String(counter).padStart(4, "0")}`;
          demoDb
            .prepare(
              "INSERT INTO conversations (id, interface, title, started_at) VALUES (?, ?, ?, ?)",
            )
            .run(id, interfaceName, title ?? null, `2026-01-01T00:00:0${counter}Z`);
          return id;
        },
        addMessage: (conversationId, role, content) => {
          counter += 1;
          demoDb
            .prepare(
              "INSERT INTO messages (id, conversation_id, role, content, created_at) " +
                "VALUES (?, ?, ?, ?, ?)",
            )
            .run(`msg${counter}`, conversationId, role, content, `2026-01-01T00:01:${counter}Z`);
        },
        setProvisionalTitle: (conversationId, title) =>
          writeTitle(demoDb, conversationId, title, "provisional"),
        updateTitle: (conversationId, title) => writeTitle(demoDb, conversationId, title, "manual"),
      };

      const report = metadataLifecycleDemoReport(demoDb, seed);
      const rendered = `${JSON.stringify(report, null, 2)}\n`;

      // Ids are generated by both engines, so the comparison aliases them in
      // first-seen order exactly as the generator did.
      const aliases = new Map<string, string>();
      const aliased = rendered.replace(/\bdemo\d{4}\b/g, (value) => {
        if (!aliases.has(value)) aliases.set(value, `<ID${aliases.size + 1}>`);
        return aliases.get(value) as string;
      });
      assert.equal(aliased, golden.demo.stdout);
      assert.equal(aliases.size, golden.demo.alias_count, "the demo scripted a different world");
      assert.equal(report.passed, true, "the demo must pass on both engines");
    } finally {
      demoDb.close();
    }
  } finally {
    closeWorld(world);
  }
});

test("a title is cleaned the way Python cleans it", () => {
  // Interior whitespace collapses, the ends are stripped, and the limit counts
  // characters — the three properties `_clean_title` has and a `trim()` does not.
  assert.equal(cleanTitle("  a   messy \n title  "), "a messy title");
  assert.throws(() => cleanTitle("   "), LifecycleFaceError);
  assert.equal(cleanTitle("x".repeat(160)).length, 160);
  assert.throws(() => cleanTitle("x".repeat(161)), LifecycleFaceError);
});

test("a repeated apply does not overwrite the ORIGINAL previous title", () => {
  const world = makeWorld();
  try {
    const id = golden.ids.repair as string;
    applyMetadataLifecycle(world.db, id, { title: "First replacement" });
    const after = JSON.parse(
      String(
        (
          world.db.prepare("SELECT metadata FROM conversations WHERE id = ?").get(id) as {
            metadata: string;
          }
        ).metadata,
      ),
    ) as Record<string, unknown>;
    // The provisional title, not the one the apply above wrote: `_title_metadata`
    // records `previous_title` only when it DIFFERS from the stored one, so a
    // second apply cannot bury the title a human actually saw.
    assert.equal(after.previous_title, "vamos trabalhar no maestro");
    assert.equal(after.title_status, "generated");
    assert.equal(after.last_metadata_update_source, "metadata_lifecycle_apply");
  } finally {
    closeWorld(world);
  }
});

test("the two decisions that would make the deferred-tags branch reachable move together", () => {
  // `applyMetadataLifecycle` carries a branch for "tags deferred, but a summary
  // landed in the SAME call". A mutant that deletes it survives the corpus, and
  // the reason is not a gap: BOTH decisions flip at four substantive messages,
  // so `tags: defer` and `summary: create` cannot co-occur. The branch is
  // defensive code for a policy coupling, and this test pins the coupling
  // rather than inventing a case that cannot exist. If a future policy moves
  // one threshold and not the other, this fails and the branch becomes live.
  const world = makeWorld();
  try {
    const messages: Array<{ role: string; content: string }> = [];
    for (let count = 0; count <= 5; count += 1) {
      const conversationId = `coupling-${count}`;
      world.db
        .prepare(
          "INSERT INTO conversations (id, interface, started_at) VALUES (?, 'cli', '2026-02-01T00:00:00Z')",
        )
        .run(conversationId);
      for (let index = 0; index < count; index += 1) {
        messages.push({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `Mensagem ${index}`,
        });
        world.db
          .prepare(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            `${conversationId}-m${index}`,
            conversationId,
            index % 2 === 0 ? "user" : "assistant",
            `Mensagem ${index} com substancia suficiente.`,
            `2026-02-01T00:00:0${index}Z`,
          );
      }
      const report = applyMetadataLifecycle(world.db, conversationId, {});
      const summary = String(report.dry_run.fields.summary.decision);
      const tags = String(report.dry_run.fields.tags.decision);
      assert.equal(
        summary === "create",
        tags === "create",
        `at ${count} messages the two decisions diverged: summary=${summary} tags=${tags}`,
      );
    }
  } finally {
    closeWorld(world);
  }
});
