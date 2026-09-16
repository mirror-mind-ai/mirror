// CV22.DS7.TS4 plateau 7 — the routes, the gates, and the denominator.
//
// Ported is not flipped. Everything this story owns is wired here and OFF: the
// family answers from Python until plateau 8 moves three constants, so an
// operator who pulls this version gets exactly today's behavior and an explicit
// `=1` to try the new one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { leafFor } from "#frontDoor/extensionCatalogRoute.ts";
import {
  gateWithDefault,
  routeMemoryCommand,
  TS4_EXT_BUILTIN_VERBS,
  TS4_EXT_TOP_LEVEL_VERBS,
  TS4_EXTENSIONS_VERBS,
} from "#frontDoor/routing.ts";

const REPO_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const ON = { MIRROR_TS_EXTENSIONS: "1" };

test("the whole extension family is wired and off until the flip", () => {
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
  ]) {
    const decision = routeMemoryCommand(argv);
    assert.equal(decision.engine, "python", `${argv.join(" ")} must stay on Python`);
    assert.match(decision.reason, /MIRROR_TS_EXTENSIONS/, argv.join(" "));
    assert.equal(routeMemoryCommand(argv, ON).engine, "ts", `${argv.join(" ")} with the gate on`);
  }
});

test("`identity edit` and the ES-001 write faces carry their own gates", () => {
  assert.equal(routeMemoryCommand(["identity", "edit", "ego", "behavior"]).engine, "python");
  assert.equal(
    routeMemoryCommand(["identity", "edit", "ego", "behavior"], { MIRROR_TS_IDENTITY_EDIT: "1" })
      .engine,
    "ts",
  );
  // The editor seam does NOT ride the catalog gate: losing a person's identity
  // content and misreporting an extension list are different failures, and each
  // deserves a revert that does not take the other with it.
  assert.equal(
    routeMemoryCommand(["identity", "edit", "ego", "behavior"], ON).engine,
    "python",
    "identity edit must not inherit the catalog gate",
  );

  for (const flag of ["--metadata-lifecycle-apply", "--metadata-lifecycle-demo"]) {
    assert.equal(routeMemoryCommand(["conversations", flag, "abc"]).engine, "python");
    assert.equal(
      routeMemoryCommand(["conversations", flag, "abc"], {
        MIRROR_TS_CONVERSATIONS_LIFECYCLE: "1",
      }).engine,
      "ts",
    );
  }
  // The READ faces flipped in US11 and stay on with the same variable unset:
  // one variable, two defaults, until plateau 8 makes them one again.
  assert.equal(
    routeMemoryCommand(["conversations", "--metadata-lifecycle-dry-run", "abc"]).engine,
    "ts",
  );
  assert.equal(
    routeMemoryCommand(["conversations", "--metadata-lifecycle-dry-run", "abc"], {
      MIRROR_TS_CONVERSATIONS_LIFECYCLE: "0",
    }).engine,
    "python",
  );
});

test("the gate contract holds for the default plateau 8 will set, not only today's", () => {
  // With a default of OFF, `=0` and "unset" reach Python either way, so the
  // route-level assertions below cannot see a deleted `=0` branch — a mutant
  // proved exactly that. The revert is the reason the flip is safe to take, so
  // it is pinned at the function that will carry it.
  assert.equal(gateWithDefault(undefined, false), false);
  assert.equal(gateWithDefault(undefined, true), true, "an unset gate follows the default");
  assert.equal(gateWithDefault("0", true), false, "`=0` must revert a FLIPPED default");
  assert.equal(gateWithDefault("1", false), true, "`=1` must opt in before the flip");
  // Anything else is not a decision: an operator who typed `MIRROR_TS_X=yes`
  // gets the default rather than a silent flip.
  assert.equal(gateWithDefault("yes", false), false);
  assert.equal(gateWithDefault("", true), true);
});

test("every gate reverts with `=0`, which is what makes the flip safe to take", () => {
  assert.equal(
    routeMemoryCommand(["extensions", "list"], { MIRROR_TS_EXTENSIONS: "0" }).engine,
    "python",
  );
  assert.equal(routeMemoryCommand(["ext", "list"], { MIRROR_TS_EXTENSIONS: "0" }).engine, "python");
  assert.equal(
    routeMemoryCommand(["identity", "edit", "ego", "x"], { MIRROR_TS_IDENTITY_EDIT: "0" }).engine,
    "python",
  );
  assert.equal(
    routeMemoryCommand(["conversations", "--metadata-lifecycle-apply", "a"], {
      MIRROR_TS_CONVERSATIONS_LIFECYCLE: "0",
    }).engine,
    "python",
  );
});

test("a claimed command does not inherit a subcommand it never ported", () => {
  // `conversations` grew `append` after DS7.US1 claimed the command, and the
  // new subcommand silently rendered a listing and discarded the caller's
  // messages. Every family this story touches allowlists by NAME instead.
  assert.equal(routeMemoryCommand(["extensions", "doctor"], ON).engine, "python");
  assert.equal(routeMemoryCommand(["inspect", "something-new"], ON).engine, "python");
  assert.equal(routeMemoryCommand(["list", "something-new"], ON).engine, "python");
  assert.equal(routeMemoryCommand(["identity", "something-new"], ON).engine, "python");
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
