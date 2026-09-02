"use strict";
// Regras de orquestração do frame (ES-004, revisadas no handoff do PR #32):
// - uma falha do Mirror nunca impede o usuário de conversar no Pi — sessões
//   abrem sem nenhum warm-up prévio (a corrida de bootstrap que o warm-up
//   mitigava foi resolvida pelo lock cross-process do PR #31);
// - update NUNCA roda com sessões abertas (arquivos em uso + uv sync);
// - update em andamento bloqueia a abertura de novas sessões.
class SessionGate {
  constructor() {
    this._updating = false;
    this._sessions = new Set();
  }
  sessionOpened(id) { if (this.canOpenSession()) this._sessions.add(id); }
  sessionClosed(id) { this._sessions.delete(id); }
  updateStarted() { this._updating = true; }
  updateFinished() { this._updating = false; }
  canOpenSession() { return !this._updating; }
  canUpdate() { return !this._updating && this._sessions.size === 0; }
  get openSessions() { return this._sessions.size; }
  get isUpdating() { return this._updating; }
}

module.exports = { SessionGate };
