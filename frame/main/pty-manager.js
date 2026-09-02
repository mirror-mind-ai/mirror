"use strict";
// Gerência fina de PTYs (ConPTY via @lydell/node-pty). Sem dependência de
// Electron — o simulador (sim/) exercita este módulo diretamente.
const pty = require("@lydell/node-pty");

class PtyManager {
  constructor() {
    this._procs = new Map();
    this._next = 1;
  }

  /** Abre um PTY. spec: {file, args, cwd, env, cols, rows} */
  open(spec, onData, onExit) {
    const id = String(this._next++);
    const p = pty.spawn(spec.file, spec.args ?? [], {
      name: "xterm-256color",
      cols: spec.cols ?? 100,
      rows: spec.rows ?? 30,
      cwd: spec.cwd,
      env: spec.env,
      useConpty: true,
    });
    this._procs.set(id, p);
    p.onData((d) => onData(id, d));
    p.onExit(({ exitCode }) => {
      this._procs.delete(id);
      onExit(id, exitCode);
    });
    return id;
  }

  has(id) { return this._procs.has(id); }
  write(id, data) { this._procs.get(id)?.write(data); }
  resize(id, cols, rows) {
    if (cols > 0 && rows > 0) this._procs.get(id)?.resize(cols, rows);
  }

  /** Encerramento gracioso: Ctrl+C, espera, depois kill (regra da ES-004). */
  async close(id, graceMs = 1500) {
    const p = this._procs.get(id);
    if (!p) return;
    try { p.write("\x03"); } catch { /* já morto */ }
    await new Promise((r) => setTimeout(r, graceMs));
    if (this._procs.has(id)) {
      try { p.kill(); } catch { /* já morto */ }
    }
  }

  async closeAll() {
    await Promise.all([...this._procs.keys()].map((id) => this.close(id, 800)));
  }

  get count() { return this._procs.size; }
}

// Limites defensivos ANTES do módulo nativo: valores fora de uma faixa
// razoável (ou não inteiros) são rejeitados em vez de chegarem ao ConPTY.
function sanitizeResize(cols, rows) {
  const c = Number(cols);
  const r = Number(rows);
  if (!Number.isInteger(c) || !Number.isInteger(r)) return null;
  if (c < 2 || c > 500 || r < 2 || r > 300) return null;
  return { cols: c, rows: r };
}

module.exports = { PtyManager, sanitizeResize };
