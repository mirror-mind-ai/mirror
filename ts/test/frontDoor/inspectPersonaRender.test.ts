import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  PersonaNotFoundError,
  renderInspectPersona,
} from "../../src/frontDoor/render/inspectPersona.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-personainspectrender-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("renderInspectPersona throws PersonaNotFoundError for a missing persona", () => {
  const { db, cleanup } = tempDb();
  try {
    assert.throws(
      () => renderInspectPersona(db, "ghost"),
      (error: unknown) =>
        error instanceof PersonaNotFoundError && error.message === "persona/ghost not found",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("renderInspectPersona renders '(none)' metadata when the object is empty", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "p1",
        layer: "persona",
        key: "bare",
        content: "# Bare",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    assert.equal(
      renderInspectPersona(db, "bare"),
      "=== persona/bare ===\n" +
        `version: 1.0.0\nupdated_at: ${NOW}\nmetadata:\n  (none)\n\ncontent:\n\n# Bare\n`,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("renderInspectPersona prints only present fixed-order metadata keys plus routing_keywords", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "p1",
        layer: "persona",
        key: "engineer",
        content: "# Engineer",
        version: "1.0.0",
        metadata: JSON.stringify({
          persona_id: "engineer",
          name: "Engineer",
          description: "",
          routing_keywords: ["code", "refactor"],
        }),
      },
      NOW,
    );
    assert.equal(
      renderInspectPersona(db, "engineer"),
      "=== persona/engineer ===\n" +
        `version: 1.0.0\nupdated_at: ${NOW}\n` +
        "metadata:\n" +
        "  persona_id: engineer\n" +
        "  name: Engineer\n" +
        "  description: \n" +
        "  routing_keywords: code, refactor\n" +
        "\ncontent:\n\n# Engineer\n",
    );
  } finally {
    db.close();
    cleanup();
  }
});
