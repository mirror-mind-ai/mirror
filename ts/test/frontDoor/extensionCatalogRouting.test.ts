// CV22.DS7.TS4 plateaus 7 and 8 — the routes and the denominator.
//
// Flipped 2026-09-16 on accepted Navigator validation: every leaf answers from
// TypeScript. The family's single-variable revert (`MIRROR_TS_EXTENSIONS=0`,
// plus `MIRROR_TS_IDENTITY_EDIT=0` for the editor seam) left with the Python
// engine at CV22.DS10.TS5.

import assert from "node:assert/strict";
import { test } from "node:test";
import { leafFor } from "#frontDoor/extensionCatalogRoute.ts";
import {
  routeMemoryCommand,
  TS4_EXT_BUILTIN_VERBS,
  TS4_EXT_TOP_LEVEL_VERBS,
  TS4_EXTENSIONS_VERBS,
} from "#frontDoor/routing.ts";

test("the whole extension family answers from TypeScript", () => {
  for (const argv of [
    ["extensions", "list"],
    ["extensions", "install", "ext-hello", "--extensions-root", "/tmp/src"],
    ["ext", "list"],
    ["ext", "google-ads", "campaigns"],
    ["list", "extensions"],
    ["list", "all"],
    ["list"],
    ["inspect", "extension", "google-ads"],
    ["inspect", "llm-calls", "--summary"],
    ["identity", "edit", "ego", "behavior"],
    ["conversations", "--metadata-lifecycle-apply", "abc"],
    ["conversations", "--metadata-lifecycle-demo", "abc"],
    ["conversations", "--metadata-lifecycle-dry-run", "abc"],
  ]) {
    assert.equal(routeMemoryCommand(argv).engine, "ts", argv.join(" "));
  }
});

test("a claimed command does not inherit a subcommand it never ported", () => {
  // What TypeScript answers is what it ported. `conversations` grew `append`
  // after DS7.US1 claimed the command, and the new subcommand silently
  // rendered a listing and discarded the caller's messages. Every family this
  // story touches allowlists by NAME instead -- and since CV22.DS10.TS5 (D2) a
  // name outside the allowlist gets the family's usage answer, not Python.
  for (const argv of [
    ["extensions", "doctor"],
    ["inspect", "something-new"],
    ["list", "something-new"],
    ["identity", "something-new"],
  ]) {
    assert.equal(routeMemoryCommand(argv).engine, "usage", argv.join(" "));
  }
});

// The two allowlists below were AUDITED against the Python dispatchers
// (`cli/ext.py`, `cli/extensions.py`) by reading their source, for as long as
// that source existed: the day Python grew a verb, the audit failed and the
// decision came back to a human. CV22.DS10.TS5 deleted the source, so the last
// audited result is frozen here -- confirmed equal to the Python literals at
// `cv22-last-python-bearing` (`b0d34254`), the last commit that had them.
//
// What the freeze keeps is the reason the audit existed. `ext` reads every head
// that is not a top-level verb as an EXTENSION ID, so its route cannot refuse
// an unknown verb -- it would be refusing an extension. A new top-level verb is
// therefore a decision about which extension ids stop being reachable, and it
// must be taken on purpose: change the set, and this test, together.
test("`ext`'s top-level and built-in verbs are the audited sets, frozen", () => {
  assert.deepEqual([...TS4_EXT_TOP_LEVEL_VERBS].sort(), ["--help", "-h", "help", "list"]);
  assert.deepEqual(
    [...TS4_EXT_BUILTIN_VERBS].sort(),
    ["bind", "bindings", "migrate", "unbind"],
    "a built-in verb shadows an extension subcommand of the same name",
  );
});

test("`extensions`' verbs are the audited set, frozen", () => {
  assert.deepEqual([...TS4_EXTENSIONS_VERBS].sort(), [
    "clean-claude",
    "expose-claude",
    "install",
    "list",
    "sync",
    "uninstall",
    "validate",
  ]);
});

test("the front-door log learns the leaf and never the argument", () => {
  // The security-engineer's plan-stage requirement: an extension subcommand's
  // argv carries account ids, campaign names, and folder paths.
  assert.equal(leafFor(["extensions", "install", "ext-google-ads"]), "install");
  assert.equal(leafFor(["extensions"]), "list");
  assert.equal(leafFor(["inspect", "llm-calls", "--summary"]), "llm-calls");
  assert.equal(leafFor(["list"]), "all");
  assert.equal(leafFor(["ext"]), "(none)");
  assert.equal(leafFor(["ext", "list"]), "list");
  assert.equal(leafFor(["ext", "google-ads"]), "google-ads");
  assert.equal(
    leafFor(["ext", "google-ads", "bind", "context", "--persona", "engineer"]),
    "google-ads/bind",
  );

  const dispatch = leafFor([
    "ext",
    "google-ads",
    "campaigns",
    "--account",
    "acct-99887766",
    "--campaign",
    "midnight-launch",
  ]);
  assert.equal(dispatch, "google-ads", "the subcommand's arguments must not reach the log");
  for (const sentinel of ["acct-99887766", "midnight-launch", "campaigns"]) {
    assert.ok(!dispatch.includes(sentinel), `${sentinel} reached the leaf`);
  }
  // `--mirror-home` is consumed by the dispatcher, so it never becomes a leaf.
  assert.equal(
    leafFor(["ext", "--mirror-home", "/tmp/home", "google-ads", "campaigns"]),
    "google-ads",
  );
});
