import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  consolidationIdentityContext,
  cultivationUserName,
  IDENTITY_CONTEXT_CODE_POINTS,
} from "#cultivation/promptContext.ts";
import { openDatabaseCopyForWrite, type WritableDatabase } from "#db/database.ts";
import { createIdentityTable } from "#helpers/identitySchema.ts";
import { promptAssemblyGolden } from "#helpers/promptAssemblyGolden.ts";

/**
 * CV22.DS8.TS2 — the two inputs `cmd_scan` resolves before calling the LLM,
 * characterized against Python outputs recorded in the prompt-assembly golden
 * (`resolvers`), not hand-derived.
 *
 * Two Unicode traps live here, both of the class US10 caught: Python's `\w`
 * is Unicode and JS's is ASCII (the seed identity says "speaking with
 * Vinícius" — a plain `\w+` yields `Vin`), and Python's `[:600]` counts code
 * points where `String.prototype.slice` counts UTF-16 units.
 */

const golden = promptAssemblyGolden();

function freshDb(): WritableDatabase {
  const dir = mkdtempSync("/tmp/mirror-prompt-context-");
  const db = openDatabaseCopyForWrite(join(dir, "copy.db"));
  createIdentityTable(db);
  return db;
}

function insertIdentity(db: WritableDatabase, layer: string, key: string, content: string): void {
  db.prepare(
    "INSERT INTO identity (id, layer, key, content, created_at, updated_at) VALUES (?, ?, ?, ?, 't', 't')",
  ).run(`${layer}-${key}`, layer, key, content);
}

// --- cultivationUserName ------------------------------------------------------------

for (const c of golden.resolvers.cultivation_user_name) {
  test(`cultivationUserName — ${c.label} → ${JSON.stringify(c.shadow_cmd)}`, () => {
    const db = freshDb();
    if (c.user_identity !== null) insertIdentity(db, "user", "identity", c.user_identity);
    assert.equal(cultivationUserName(db), c.shadow_cmd);
  });
}

test("D1: TS follows shadow_cmd; the only Python-to-Python disagreement is the hardcoded owner name", () => {
  // The golden records BOTH Python resolvers. Exactly one case may differ —
  // `consolidate_cmd`'s `"Vinícius" in content` short-circuit (CR014) — and TS
  // deliberately does not port it. If a future regeneration widens the
  // disagreement, this names it instead of letting the deviation grow.
  const disagreements = golden.resolvers.cultivation_user_name.filter(
    (c) => c.shadow_cmd !== c.consolidate_cmd,
  );
  assert.deepEqual(
    disagreements.map((c) => c.label),
    ["name present without marker"],
  );
  const [only] = disagreements;
  assert.ok(only);
  assert.equal(only.shadow_cmd, "the user");
  const db = freshDb();
  insertIdentity(db, "user", "identity", only.user_identity as string);
  assert.equal(cultivationUserName(db), "the user");
});

test("cultivationUserName matches Python's Unicode \\w: letters, digits, underscore; stops at a combining mark", () => {
  const db = freshDb();
  insertIdentity(db, "user", "identity", "You are speaking with Zoë_9 now.");
  assert.equal(cultivationUserName(db), "Zoë_9");
});

// --- consolidationIdentityContext -------------------------------------------------

test("the identity-context cap is Python's 600 code points", () => {
  assert.equal(IDENTITY_CONTEXT_CODE_POINTS, 600);
});

for (const c of golden.resolvers.consolidation_identity_context) {
  test(`consolidationIdentityContext — ${c.label}`, () => {
    const db = freshDb();
    for (const row of c.identity_rows) insertIdentity(db, row.layer, row.key, row.content);
    assert.equal(consolidationIdentityContext(db), c.identity_context);
  });
}

test("consolidationIdentityContext slices code points, not UTF-16 units", () => {
  const db = freshDb();
  // 🌍 is one code point and two UTF-16 units. Python keeps the emoji, the
  // space, and 598 x's; a `.slice(0, 600)` port would keep 597.
  insertIdentity(db, "self", "soul", `🌍 ${"x".repeat(700)}`);
  const context = consolidationIdentityContext(db);
  const body = context.slice("## self/soul\n".length);
  assert.equal([...body].length, 600);
  assert.equal(body, `🌍 ${"x".repeat(598)}`);
});

test("consolidationIdentityContext keeps Python's section order regardless of insertion order", () => {
  const db = freshDb();
  insertIdentity(db, "self", "soul", "S");
  insertIdentity(db, "ego", "identity", "I");
  insertIdentity(db, "ego", "behavior", "B");
  assert.equal(
    consolidationIdentityContext(db),
    "## ego/behavior\nB\n\n## ego/identity\nI\n\n## self/soul\nS",
  );
});
