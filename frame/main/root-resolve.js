"use strict";
// Resolve MIRROR_ROOT (a raiz do checkout git do Mirror). Ordem:
//   1. override explícito (MIRROR_FRAME_ROOT);
//   2. relativo ao EXE instalado — {app}\frame\MirrorFrame.exe → {app}\app —
//      independentemente da pasta de instalação (caminhos custom, com espaços);
//   3. layout padrão do instalador (%LOCALAPPDATA%\Programs\MirrorMind\app);
//   4. modo dev (subir a árvore até achar pyproject.toml).
const path = require("node:path");
const fs = require("node:fs");

function resolveMirrorRoot(opts = {}) {
  const env = opts.env ?? process.env;
  const exists = opts.exists ?? fs.existsSync;
  const startDir = opts.startDir ?? __dirname;
  const localAppData = opts.localAppData ?? env.LOCALAPPDATA ?? "";
  const exeDir = opts.exeDir ?? null;

  const hasPyproject = (dir) => exists(path.join(dir, "pyproject.toml"));

  if (env.MIRROR_FRAME_ROOT && hasPyproject(env.MIRROR_FRAME_ROOT)) {
    return env.MIRROR_FRAME_ROOT;
  }

  // Empacotado: o clone é irmão do exe ({app}\app), qualquer que seja {app}.
  // exeDir = {app}\frame; o clone está em {app}\frame\..\app. É esta a
  // resolução primária de uma instalação — não pode depender de a pasta ser
  // a padrão (o instalador deixa o usuário escolher o destino).
  if (exeDir) {
    const sibling = path.join(exeDir, "..", "app");
    if (hasPyproject(sibling)) return sibling;
  }

  if (localAppData) {
    const installed = path.join(localAppData, "Programs", "MirrorMind", "app");
    if (hasPyproject(installed)) return installed;
  }

  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (hasPyproject(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

module.exports = { resolveMirrorRoot };
