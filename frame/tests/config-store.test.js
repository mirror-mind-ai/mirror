"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnvFile, saveEnvValues, removeEnvKeys, isFirstRun } = require("../main/config-store.js");

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mirror-frame-test-"));
}

test("first run when .env is missing or has no MIRROR_USER", () => {
  const root = tmpRoot();
  assert.strictEqual(isFirstRun(root), true);
  fs.writeFileSync(path.join(root, ".env"), "OPENROUTER_API_KEY=sk-or-x\n");
  assert.strictEqual(isFirstRun(root), true);
  fs.writeFileSync(path.join(root, ".env"), "MIRROR_USER=Rodrigo\n");
  assert.strictEqual(isFirstRun(root), false);
});

test("roundtrip preserves comments and unknown keys", () => {
  const root = tmpRoot();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, "# comentário importante\nCUSTOM=1\nMIRROR_USER=Old\n");
  saveEnvValues(root, { MIRROR_USER: "Novo", OPENROUTER_API_KEY: "sk-or-abc" });
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes("# comentário importante"));
  assert.ok(text.includes("CUSTOM=1"));
  assert.ok(text.includes("MIRROR_USER=Novo"));
  assert.ok(text.includes("OPENROUTER_API_KEY=sk-or-abc"));
  assert.strictEqual(loadEnvFile(root).MIRROR_USER, "Novo");
});

test("writes UTF-8 WITHOUT BOM and with LF endings", () => {
  const root = tmpRoot();
  saveEnvValues(root, { MIRROR_USER: "Acentuação-çãé" });
  const bytes = fs.readFileSync(path.join(root, ".env"));
  assert.ok(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), "BOM proibido");
  assert.ok(!bytes.includes(0x0d), "CRLF proibido");
  assert.strictEqual(loadEnvFile(root).MIRROR_USER, "Acentuação-çãé");
});

test("rejects values with embedded newlines — injection cannot create new keys", () => {
  const root = tmpRoot();
  assert.throws(() => saveEnvValues(root, { MIRROR_USER: "Rodrigo\nEVIL=1" }), /inválido/);
  assert.throws(() => saveEnvValues(root, { MIRROR_USER: "Rodrigo\r\nEVIL=1" }), /inválido/);
  assert.strictEqual(loadEnvFile(root).EVIL, undefined);
});

test("rejects keys outside the allowlist and malformed api keys", () => {
  const root = tmpRoot();
  assert.throws(() => saveEnvValues(root, { PATH: "C:\\evil" }), /não permitida/);
  assert.throws(() => saveEnvValues(root, { OPENROUTER_API_KEY: "not-a-key" }), /inválido/);
});

test("removeEnvKeys reverts the onboarding marker but preserves everything else", () => {
  const root = tmpRoot();
  const file = path.join(root, ".env");
  fs.writeFileSync(file, "# comentário\nCUSTOM=1\nMIRROR_USER=Rodrigo\nOPENROUTER_API_KEY=sk-or-abc\n");
  removeEnvKeys(root, ["MIRROR_USER"]);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes("# comentário"));
  assert.ok(text.includes("CUSTOM=1"));
  assert.ok(text.includes("OPENROUTER_API_KEY=sk-or-abc"));
  assert.strictEqual(loadEnvFile(root).MIRROR_USER, undefined);
  assert.strictEqual(isFirstRun(root), true, "reverter o marcador devolve o wizard no próximo boot");
});

test("removeEnvKeys on a missing file is a no-op", () => {
  const root = tmpRoot();
  removeEnvKeys(root, ["MIRROR_USER"]);
  assert.strictEqual(isFirstRun(root), true);
});

test("tolerates a BOM left by other editors when reading", () => {
  const root = tmpRoot();
  fs.writeFileSync(path.join(root, ".env"), "﻿MIRROR_USER=Bom\n");
  assert.strictEqual(loadEnvFile(root).MIRROR_USER, "Bom");
});
