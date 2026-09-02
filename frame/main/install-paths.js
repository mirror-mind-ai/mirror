"use strict";
// Resolução dos artefatos INSTALADOS que o Frame consome (clarificações
// vinculantes do PR #32): o Frame empacotado lê SEMPRE a cópia instalada em
// {app}\bin (shipada pelo installer), nunca o clone — que avança por updates
// do core sem que o Frame instalado acompanhe. Em desenvolvimento, o fallback
// explícito é o arquivo do checkout. Ausência produz erro claro, jamais
// fallback silencioso para o clone.
const path = require("node:path");
const fs = require("node:fs");

/** {app}\frame\MirrorFrame.exe → {app}\bin\<name> */
function installedCopyPath(exeDir, name) {
  return path.join(exeDir, "..", "bin", name);
}

/** frame/main → <checkout>/installer/<name> */
function checkoutCopyPath(moduleDir, name) {
  return path.join(moduleDir, "..", "..", "installer", name);
}

function resolveInstallerFile({ isPackaged, exeDir, moduleDir, name, exists = fs.existsSync }) {
  const candidate = isPackaged
    ? installedCopyPath(exeDir, name)
    : checkoutCopyPath(moduleDir, name);
  if (exists(candidate)) return { path: candidate, err: null };
  const where = isPackaged ? "instalado" : "do checkout";
  const hint = isPackaged ? " — reinstale o Mirror Mind" : "";
  return { path: null, err: `${name} ${where} não encontrado em ${candidate}${hint}` };
}

function readPinnedPiVersion({ isPackaged, exeDir, moduleDir, exists = fs.existsSync, read = (f) => fs.readFileSync(f, "utf8") }) {
  const resolved = resolveInstallerFile({ isPackaged, exeDir, moduleDir, name: "pi-version.txt", exists });
  if (!resolved.path) return { version: null, source: null, err: resolved.err };
  try {
    const v = read(resolved.path).trim();
    if (/^\d+\.\d+\.\d+$/.test(v)) return { version: v, source: resolved.path, err: null };
    return { version: null, source: resolved.path, err: `pi-version.txt inválido ('${v}')` };
  } catch (e) {
    return { version: null, source: resolved.path, err: String(e.message) };
  }
}

module.exports = { resolveInstallerFile, readPinnedPiVersion };
