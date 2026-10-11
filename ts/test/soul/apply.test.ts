// CV22.DS7.US6 plateau 4 — the Soul identity integration, graded against the
// Python oracle.
//
// Two artifacts per scenario: the `identity_integrations` audit row and the
// identity DOCUMENT. The document is the delicate one — index arithmetic over
// Markdown with four branches and three different strip rules, including
// Python's `lstrip("\n")`, which removes newlines and not whitespace.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import golden from "#goldens/soul-apply.golden.json" with { type: "json" };
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { applyIdentityIntegration, IDENTITY_INTEGRATION_SECTION_TITLES } from "#soul/apply.ts";

interface IntegrationRow {
  id: string;
  layer: string;
  key: string;
  content: string;
  source: string;
  origin: string | null;
  conversation_id: string | null;
  journal_id: string | null;
  created_at: string;
  status: string;
  metadata: string;
}

interface Scenario {
  name: string;
  layer: string;
  key: string;
  content: string;
  seed: [string, string, string] | null;
  origin: string | null;
  conversation_id: string | null;
  journal_id: string | null;
  metadata: Record<string, unknown> | null;
  expected_error?: string;
  expected_integration_rows: IntegrationRow[];
  expected_identity: { content: string; created_at: string; updated_at: string } | null;
}

const fixture = golden as {
  frozen_now_iso: string;
  frozen_uuid: string;
  section_titles: Record<string, string>;
  scenarios: Scenario[];
};

function reverseKeyOrder(value: Record<string, unknown>): Record<string, unknown> {
  const reversed: Record<string, unknown> = {};
  for (const key of Object.keys(value).reverse()) reversed[key] = value[key];
  return reversed;
}

function freshDb(scenario: Scenario): WritableDatabase {
  const dir = mkdtempSync(`/tmp/soul-apply-${scenario.name}-`);
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  db.exec(`
    CREATE TABLE conversations (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, interface TEXT NOT NULL);
    CREATE TABLE memories (id TEXT PRIMARY KEY, memory_type TEXT NOT NULL, title TEXT NOT NULL,
                           content TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE identity_integrations (
      id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'soul_mode', origin TEXT,
      conversation_id TEXT REFERENCES conversations(id), journal_id TEXT REFERENCES memories(id),
      created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT NOT NULL DEFAULT '{}'
    );
  `);
  if (scenario.seed) {
    const [layer, key, content] = scenario.seed;
    db.prepare(
      "INSERT INTO identity (id,layer,key,content,version,created_at,updated_at)" +
        " VALUES (?,?,?,?, '1.0.0', 'seed-created', 'seed-updated')",
    ).run("seed-id", layer, key, content);
  }
  if (scenario.conversation_id?.trim()) {
    db.prepare("INSERT INTO conversations (id, started_at, interface) VALUES (?,?,?)").run(
      scenario.conversation_id.trim(),
      fixture.frozen_now_iso,
      "pi",
    );
  }
  if (scenario.journal_id?.trim()) {
    db.prepare(
      "INSERT INTO memories (id, memory_type, title, content, created_at) VALUES (?,?,?,?,?)",
    ).run(scenario.journal_id.trim(), "journal", "Harvest", "body", fixture.frozen_now_iso);
  }
  return db;
}

test("the port's section titles are Python's", () => {
  assert.deepEqual(IDENTITY_INTEGRATION_SECTION_TITLES, fixture.section_titles);
});

for (const scenario of fixture.scenarios) {
  test(`soul apply: ${scenario.name} matches the Python oracle`, () => {
    const db = freshDb(scenario);
    const run = () =>
      applyIdentityIntegration(
        db,
        {
          layer: scenario.layer,
          key: scenario.key,
          content: scenario.content,
          origin: scenario.origin,
          conversationId: scenario.conversation_id,
          journalId: scenario.journal_id,
          // Reversed on purpose. The golden file is written with sort_keys=True,
          // so reading `metadata` back yields ALREADY-SORTED keys and a port
          // that forgets Python's `sort_keys=True` would still produce matching
          // bytes. Handing the port the reverse order is what makes the
          // assertion mean something.
          metadata: scenario.metadata ? reverseKeyOrder(scenario.metadata) : scenario.metadata,
        },
        { newId: () => fixture.frozen_uuid, nowIso: fixture.frozen_now_iso },
      );

    if (scenario.expected_error !== undefined) {
      assert.throws(run, (error: Error) => {
        assert.equal(error.message, scenario.expected_error);
        return true;
      });
    } else {
      run();
    }

    const rows = db
      .prepare(
        "SELECT id, layer, key, content, source, origin, conversation_id, journal_id," +
          " created_at, status, metadata FROM identity_integrations ORDER BY rowid",
      )
      .all() as unknown as IntegrationRow[];
    assert.deepEqual(rows, scenario.expected_integration_rows, "identity_integrations rows");

    const identity = db
      .prepare("SELECT content FROM identity WHERE layer = ? AND key = ?")
      .get(scenario.layer, scenario.key) as { content: string } | undefined;
    assert.equal(
      identity?.content ?? null,
      scenario.expected_identity?.content ?? null,
      "identity document",
    );
    db.close();
  });
}

test("a refused write leaves no audit row and no identity change", () => {
  // Python raises before `add_identity_integration`, so a refusal is total.
  const scenario = fixture.scenarios.find((s) => s.name === "error_unsupported_layer");
  assert.ok(scenario, "golden carries the refusal scenario");
  assert.deepEqual(scenario.expected_integration_rows, []);
  assert.equal(scenario.expected_identity, null);
});
