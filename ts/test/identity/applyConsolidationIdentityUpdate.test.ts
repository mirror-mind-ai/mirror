import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { openDatabaseCopyForWrite, type WritableDatabase } from "../../src/db/database.ts";
import {
  applyConsolidationIdentityUpdate,
  VALID_IDENTITY_UPDATE_LAYERS,
} from "../../src/identity/applyConsolidationIdentityUpdate.ts";
import { getIdentityContent, listAllIdentity } from "../../src/identity/identityRead.ts";
import { upsertIdentity } from "../../src/identity/identityStore.ts";
import { createIdentityTable } from "../helpers/identitySchema.ts";

const NOW = "2026-06-23T12:00:00.123000Z";

function tempDb(): { db: WritableDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "mirror-core-consolid-identity-"));
  const tmp = join(dir, "tmp");
  mkdirSync(tmp);
  const db = openDatabaseCopyForWrite(join(tmp, "copy.db"));
  createIdentityTable(db);
  return { db, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("VALID_IDENTITY_UPDATE_LAYERS is exactly {self, ego}, matching models.py", () => {
  assert.deepEqual([...VALID_IDENTITY_UPDATE_LAYERS].sort(), ["ego", "self"]);
});

test("allowed target (self) creates a fresh identity row when none exists", () => {
  const { db, cleanup } = tempDb();
  try {
    applyConsolidationIdentityUpdate(db, {
      targetLayer: "self",
      targetKey: "soul",
      content: "A new pattern about non-attachment.",
      id: "new-id",
      nowIso: NOW,
    });
    assert.equal(getIdentityContent(db, "self", "soul"), "A new pattern about non-attachment.");
  } finally {
    db.close();
    cleanup();
  }
});

test("allowed target (ego) appends after a blank line when a row already exists", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "seed",
        layer: "ego",
        key: "behavior",
        content: "Existing behavior text.",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    applyConsolidationIdentityUpdate(db, {
      targetLayer: "ego",
      targetKey: "behavior",
      content: "A newly surfaced pattern.",
      id: "unused-because-update",
      nowIso: NOW,
    });
    assert.equal(
      getIdentityContent(db, "ego", "behavior"),
      "Existing behavior text.\n\nA newly surfaced pattern.",
    );
  } finally {
    db.close();
    cleanup();
  }
});

for (const targetLayer of ["shadow", "user", "persona", "organization", "not-a-real-layer"]) {
  test(`refuses a non-allowlisted target layer ('${targetLayer}') loudly, with no write`, () => {
    const { db, cleanup } = tempDb();
    try {
      const before = listAllIdentity(db);
      assert.throws(
        () =>
          applyConsolidationIdentityUpdate(db, {
            targetLayer,
            targetKey: "profile",
            content: "an injected or hallucinated proposal",
            id: "would-be-id",
            nowIso: NOW,
          }),
        (error: unknown) =>
          error instanceof Error &&
          error.message ===
            `Refusing identity_update to layer '${targetLayer}': not in ` +
              "the consolidation allowlist ['ego', 'self'].",
      );
      // No bypass: the identity table is byte-unchanged -- no row, no partial write.
      assert.deepEqual(listAllIdentity(db), before);
      assert.equal(getIdentityContent(db, targetLayer, "profile"), null);
    } finally {
      db.close();
      cleanup();
    }
  });
}

test("a refused write does not clobber a pre-existing row at the same (layer, key)", () => {
  const { db, cleanup } = tempDb();
  try {
    upsertIdentity(
      db,
      {
        id: "seed",
        layer: "shadow",
        key: "profile",
        content: "Confirmed shadow pattern.",
        version: "1.0.0",
        metadata: null,
      },
      NOW,
    );
    assert.throws(() =>
      applyConsolidationIdentityUpdate(db, {
        targetLayer: "shadow",
        targetKey: "profile",
        content: "an attempted overwrite",
        id: "irrelevant",
        nowIso: NOW,
      }),
    );
    assert.equal(getIdentityContent(db, "shadow", "profile"), "Confirmed shadow pattern.");
  } finally {
    db.close();
    cleanup();
  }
});
