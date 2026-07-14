// Deterministic fixture for front-door render golden tests (CR016).
//
// Builds a small, fixed database — journeys (with a child), personas with
// routing keywords, and memories exercising truncation and absent/malformed
// fields — so the rendered stdout of `journeys`, `memories`, and
// `detect-persona` is byte-stable and can be frozen as a golden. Shared by the
// golden generator and the test so both build the identical fixture.

import { openDatabaseCopyForWrite } from "../../src/db/database.ts";
import { KNOWN_MIGRATION_IDS } from "../../src/db/schemaState.ts";

const LONG_CONTENT =
  "This is a deliberately long memory body used to exercise the 200-character " +
  "truncation in the memory renderer so the golden pins the exact cut point and " +
  "the ellipsis behavior stays stable across refactors of the rendering pipeline.";

/** Create the deterministic render fixture at `dbPath` (must be under tmp/). */
export function buildRenderFixture(dbPath: string): void {
  const db = openDatabaseCopyForWrite(dbPath);
  db.exec(
    "CREATE TABLE identity (id TEXT PRIMARY KEY, layer TEXT NOT NULL, key TEXT NOT NULL, " +
      "content TEXT NOT NULL, version TEXT DEFAULT '1.0.0', created_at TEXT NOT NULL, " +
      "updated_at TEXT NOT NULL, metadata TEXT, UNIQUE(layer, key));" +
      "CREATE TABLE memories (id TEXT PRIMARY KEY, memory_type TEXT NOT NULL, " +
      "layer TEXT NOT NULL DEFAULT 'ego', title TEXT NOT NULL, content TEXT NOT NULL, " +
      "context TEXT, journey TEXT, persona TEXT, tags TEXT, created_at TEXT NOT NULL, " +
      "use_count INTEGER NOT NULL DEFAULT 0);" +
      "CREATE TABLE _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const id of KNOWN_MIGRATION_IDS) {
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, 't')").run(id);
  }

  const identity = db.prepare(
    "INSERT INTO identity (id, layer, key, content, version, created_at, updated_at, metadata) " +
      "VALUES (?, ?, ?, ?, '1.0.0', 't', 't', ?)",
  );
  identity.run(
    "j1",
    "journey",
    "demo",
    "# Demo Journey\n**Status:** active\nA short demo journey description.",
    null,
  );
  identity.run(
    "j2",
    "journey",
    "demo-child",
    "# Child Journey\n**Status:** paused\nChild journey description.",
    '{"parent_journey": "demo"}',
  );
  identity.run("jp1", "journey_path", "demo", "**Current stage:** E2 — Foundation", null);
  identity.run(
    "p1",
    "persona",
    "engineer",
    "# Engineer",
    '{"routing_keywords": ["code", "typescript", "refactor"]}',
  );
  identity.run(
    "p2",
    "persona",
    "therapist",
    "# Therapist",
    '{"routing_keywords": ["feeling", "tension"]}',
  );

  const memory = db.prepare(
    "INSERT INTO memories (id, memory_type, layer, title, content, journey, persona, tags, " +
      "created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // Distinct created_at so ORDER BY created_at DESC is stable. Newest first.
  memory.run(
    "aaaa1111bbbb",
    "insight",
    "ego",
    "Alpha insight",
    LONG_CONTENT,
    "demo",
    "engineer",
    '["typescript", "parity"]',
    "2026-07-01T09:00:00.000000Z",
  );
  memory.run(
    "cccc2222dddd",
    "decision",
    "self",
    "Beta decision",
    "A concise decision body.",
    null,
    null,
    null,
    "2026-06-15T09:00:00.000000Z",
  );
  memory.run(
    "eeee3333ffff",
    "insight",
    "ego",
    "Gamma insight",
    "Third memory body.",
    null,
    null,
    "{not valid json",
    "2026-06-01T09:00:00.000000Z",
  );
  db.close();
}
