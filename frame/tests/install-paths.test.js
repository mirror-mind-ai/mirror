"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { resolveInstallerFile, readPinnedPiVersion } = require("../main/install-paths.js");

// Caminho de instalação COM ESPAÇO (regressão do cenário 9): a mesma classe de
// bug de resolução relativa ao exe que quebrou o MIRROR_ROOT.
const EXE_DIR = "C:\\Users\\WDAGUtilityAccount\\Desktop\\Mirror Space Test\\frame";
const MODULE_DIR = "C:\\src\\mirror\\frame\\main";
const INSTALLED = path.join(EXE_DIR, "..", "bin", "bootstrap.ps1");
const CHECKOUT = path.join(MODULE_DIR, "..", "..", "installer", "bootstrap.ps1");

test("packaged layout resolves the INSTALLED copy ({app}\\bin), never the clone", () => {
  const r = resolveInstallerFile({
    isPackaged: true, exeDir: EXE_DIR, moduleDir: MODULE_DIR,
    name: "bootstrap.ps1", exists: (p) => p === INSTALLED,
  });
  assert.strictEqual(r.path, INSTALLED);
});

test("dev layout resolves the explicit checkout fallback", () => {
  const r = resolveInstallerFile({
    isPackaged: false, exeDir: EXE_DIR, moduleDir: MODULE_DIR,
    name: "bootstrap.ps1", exists: (p) => p === CHECKOUT,
  });
  assert.strictEqual(r.path, CHECKOUT);
});

test("missing installed copy is a CLEAR error — no silent clone fallback", () => {
  const cloneCopy = "C:\\Users\\x\\AppData\\Local\\Programs\\MirrorMind\\app\\installer\\bootstrap.ps1";
  const r = resolveInstallerFile({
    isPackaged: true, exeDir: EXE_DIR, moduleDir: MODULE_DIR,
    name: "bootstrap.ps1", exists: (p) => p === cloneCopy,
  });
  assert.strictEqual(r.path, null);
  assert.match(r.err, /reinstale/i);
});

test("pi pin: packaged reads the installed copy and validates the format", () => {
  const pinPath = path.join(EXE_DIR, "..", "bin", "pi-version.txt");
  const ok = readPinnedPiVersion({
    isPackaged: true, exeDir: EXE_DIR, moduleDir: MODULE_DIR,
    exists: (p) => p === pinPath, read: () => "0.83.0\n",
  });
  assert.deepStrictEqual({ version: ok.version, source: ok.source }, { version: "0.83.0", source: pinPath });

  const bad = readPinnedPiVersion({
    isPackaged: true, exeDir: EXE_DIR, moduleDir: MODULE_DIR,
    exists: (p) => p === pinPath, read: () => "latest",
  });
  assert.strictEqual(bad.version, null);
  assert.match(bad.err, /inválido/);
});

test("pi pin: missing installed copy disables the pin explicitly", () => {
  const r = readPinnedPiVersion({
    isPackaged: true, exeDir: EXE_DIR, moduleDir: MODULE_DIR, exists: () => false,
  });
  assert.strictEqual(r.version, null);
  assert.match(r.err, /não encontrado/);
});
