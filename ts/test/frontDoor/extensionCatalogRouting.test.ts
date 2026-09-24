// CV22.DS7.TS4 plateaus 7 and 8 — the routes and the denominator.
//
// Flipped 2026-09-16 on accepted Navigator validation: every leaf answers from
// TypeScript. The family's single-variable revert (`MIRROR_TS_EXTENSIONS=0`,
// plus `MIRROR_TS_IDENTITY_EDIT=0` for the editor seam) left with the Python
// engine at CV22.DS10.TS5.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { leafFor } from "#frontDoor/extensionCatalogRoute.ts";
import {
  routeMemoryCommand,
  TS4_EXT_BUILTIN_VERBS,
  TS4_EXT_TOP_LEVEL_VERBS,
  TS4_EXTENSIONS_VERBS,
} from "#frontDoor/routing.ts";

const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
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

test("`ext`'s allowlist is audited against `cli/ext.py`, because it cannot filter", () => {
  // `cmd_ext` reads every head that is not `list` or a help flag as an
  // EXTENSION ID, so the route cannot refuse an unknown verb — it would be
  // refusing an extension. The exposure is that a new top-level verb beside
  // `list` would be answered `extension not installed: .../doctor` instead of
  // running. Nothing in the route can catch that, so this does: the day
  // `cli/ext.py` grows another literal head, this fails and the decision comes
  // back to a human.
  const source = readFileSync(join(REPO_ROOT, "src", "memory", "cli", "ext.py"), "utf8");
  const dispatcher = source.slice(source.indexOf("def cmd_ext("));
  const heads = new Set<string>();
  for (const match of dispatcher.matchAll(/head == "([^"]+)"/g)) heads.add(match[1] as string);
  for (const match of dispatcher.matchAll(/head in \{([^}]+)\}/g)) {
    for (const literal of (match[1] as string).matchAll(/"([^"]+)"/g)) {
      heads.add(literal[1] as string);
    }
  }
  assert.deepEqual(
    [...heads].sort(),
    [...TS4_EXT_TOP_LEVEL_VERBS].sort(),
    "cli/ext.py grew a top-level verb: `ext <verb>` would be read as an extension id",
  );

  // The built-in verbs are a literal tuple in the same file.
  const builtins = dispatcher.match(/_BUILTIN_VERBS = \(([^)]+)\)/);
  assert.ok(builtins, "cli/ext.py no longer declares _BUILTIN_VERBS as a tuple");
  const declared = [...(builtins[1] as string).matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
  assert.deepEqual(declared.sort(), [...TS4_EXT_BUILTIN_VERBS].sort());
});

test("`extensions`' allowlist is audited against `cli/extensions.py`", () => {
  const source = readFileSync(join(REPO_ROOT, "src", "memory", "cli", "extensions.py"), "utf8");
  const block = source.slice(source.indexOf("if command not in {"));
  const declared = new Set<string>();
  for (const literal of block.slice(0, block.indexOf("}")).matchAll(/"([^"]+)"/g)) {
    declared.add(literal[1] as string);
  }
  assert.deepEqual([...declared].sort(), [...TS4_EXTENSIONS_VERBS].sort());
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
