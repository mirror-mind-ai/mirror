import assert from "node:assert/strict";
import { test } from "node:test";
import type { Database } from "../../src/db/database.ts";
import {
  IdentityEntryNotFoundError,
  renderIdentityGet,
  renderIdentityList,
} from "../../src/frontDoor/render/identity.ts";

test("renderIdentityList reports no entries", () => {
  assert.equal(renderIdentityList([]), "No identity entries found.\n");
});

test("renderIdentityList groups by layer with a blank line before each new group", () => {
  const rendered = renderIdentityList([
    { layer: "ego", key: "behavior", content: "# Behavior\n\nDirect and unhedged." },
    { layer: "journey", key: "demo", content: "# Demo\n**Status:** active" },
  ]);
  assert.equal(
    rendered,
    "\n[ego]\n" +
      "  behavior                # Behavior  Direct and unhedged.\n" +
      "\n[journey]\n" +
      "  demo                    # Demo **Status:** active\n",
  );
});

test("renderIdentityList truncates content over 70 chars with an ellipsis", () => {
  const long = "x".repeat(80);
  const rendered = renderIdentityList([{ layer: "persona", key: "writer", content: long }]);
  assert.equal(rendered, `\n[persona]\n  writer                  ${"x".repeat(70)}...\n`);
});

function fakeDb(content: string | undefined): Database {
  return {
    prepare: () => ({
      get: () => (content === undefined ? undefined : { content }),
      all: () => [],
      run: () => {
        throw new Error("not used");
      },
    }),
  } as unknown as Database;
}

test("renderIdentityGet returns content plus a trailing newline", () => {
  assert.equal(renderIdentityGet(fakeDb("# Soul"), "self", "soul"), "# Soul\n");
});

test("renderIdentityGet throws IdentityEntryNotFoundError when the row is absent", () => {
  assert.throws(
    () => renderIdentityGet(fakeDb(undefined), "self", "missing"),
    (error: unknown) =>
      error instanceof IdentityEntryNotFoundError &&
      error.message === "No identity entry found for self/missing",
  );
});
