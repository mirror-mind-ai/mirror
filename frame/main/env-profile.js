"use strict";
// Ambiente de sessão espelhando installer/launcher/mirror.cmd:
// UTF-8 forçado (acentos PT-BR) e nada de variáveis internas do Electron
// vazando para o Pi/Python.
const FRAME_ONLY = new Set([
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ORIGINAL_XDG_CURRENT_DESKTOP",
]);

function sessionEnv(baseEnv, mirrorRoot) {
  const e = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (!FRAME_ONLY.has(k)) e[k] = v;
  }
  e.PYTHONUTF8 = "1";
  e.PYTHONIOENCODING = "utf-8";
  e.MIRROR_FRAME = "1";
  if (mirrorRoot) e.MIRROR_FRAME_ROOT = mirrorRoot;
  return e;
}

module.exports = { sessionEnv };
