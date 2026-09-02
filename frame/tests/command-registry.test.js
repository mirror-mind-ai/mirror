"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { buildCommand, COMMANDS } = require("../main/command-registry.js");

test("unknown command id throws", () => {
  assert.throws(() => buildCommand("rm-rf", {}), /unknown command/i);
});

test("warmup opens the DB (identity list) so migrations actually run — not just inspect", () => {
  const c = buildCommand("warmup", {});
  assert.strictEqual(c.file, "uv");
  assert.deepStrictEqual(c.args, ["run", "python", "-m", "memory", "identity", "list"]);
});

test("initIdentity validates the user slug strictly", () => {
  const c = buildCommand("initIdentity", { user: "Rodrigo_01" });
  assert.deepStrictEqual(c.args.slice(-2), ["init", "Rodrigo_01"]);
  assert.throws(() => buildCommand("initIdentity", {}), /user/i);
  assert.throws(() => buildCommand("initIdentity", { user: "a b" }), /user/i);
  assert.throws(() => buildCommand("initIdentity", { user: "x;rm" }), /user/i);
});

test("seed is fixed argv (bootstrap-only, idempotent upstream)", () => {
  const c = buildCommand("seed", {});
  assert.deepStrictEqual(c.args, ["run", "python", "-m", "memory", "seed"]);
});

test("detectPersona embeds the query as ONE argv element — never shell", () => {
  const q = 'x" & del C:\\ /q & "';
  const c = buildCommand("detectPersona", { query: q });
  assert.strictEqual(c.args[c.args.length - 1], q);
  assert.strictEqual(c.shell, undefined);
});

test("detectPersona requires a non-empty query and caps its size", () => {
  assert.throws(() => buildCommand("detectPersona", {}), /query/i);
  assert.throws(() => buildCommand("detectPersona", { query: "a".repeat(2001) }), /query/i);
});

test("updateMirror is not a registered command (first-release decision)", () => {
  assert.throws(() => buildCommand("updateMirror", {}), /unknown command/i);
});

test("updatePi installs exactly the pinned version — never @latest", () => {
  const c = buildCommand("updatePi", { piVersion: "0.83.0" });
  assert.strictEqual(c.args[c.args.length - 1], "@earendil-works/pi-coding-agent@0.83.0");
  assert.ok(!c.args.join(" ").includes("latest"));
});

test("updatePi refuses missing or malformed pins", () => {
  assert.throws(() => buildCommand("updatePi", {}), /pinned/i);
  assert.throws(() => buildCommand("updatePi", { piVersion: "latest" }), /pinned/i);
  assert.throws(() => buildCommand("updatePi", { piVersion: "0.83" }), /pinned/i);
});

test("every registered command declares cwd policy", () => {
  for (const id of Object.keys(COMMANDS)) {
    assert.ok(["root", "frame"].includes(COMMANDS[id].cwd), `${id} sem cwd policy`);
  }
});

test("updatePi is the only gated command — updateMirror does not exist (first-release decision)", () => {
  const gated = Object.entries(COMMANDS).filter(([, s]) => s.gated).map(([id]) => id).sort();
  assert.deepStrictEqual(gated, ["updatePi"]);
  assert.strictEqual(COMMANDS.updateMirror, undefined);
});
