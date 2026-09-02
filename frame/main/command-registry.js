"use strict";
// Registro de comandos allowlisted — o único caminho de mutação do frame.
// Espelha o padrão de src/memory/web/command_executor.py: argv fixo definido
// AQUI, nunca shell string, nunca input do renderer virando comando.
const MAX_QUERY = 2000;

const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;

const COMMANDS = {
  // warm-up serializado: identity list ABRE o banco (get_connection → migrations),
  // diferente de runtime status, que só inspeciona em read-only.
  warmup: {
    file: "uv", args: ["run", "python", "-m", "memory", "identity", "list"],
    cwd: "root", timeoutMs: 120000,
  },
  runtimeStatus: {
    file: "uv", args: ["run", "python", "-m", "memory", "runtime", "status"],
    cwd: "root", timeoutMs: 120000,
  },
  initIdentity: {
    file: "uv", args: ["run", "python", "-m", "memory", "init"],
    cwd: "root", timeoutMs: 180000, acceptsUser: true,
  },
  seed: {
    file: "uv", args: ["run", "python", "-m", "memory", "seed"],
    cwd: "root", timeoutMs: 180000,
  },
  runtimeVersion: {
    file: "uv", args: ["run", "python", "-m", "memory", "runtime", "version"],
    cwd: "root", timeoutMs: 60000,
  },
  identityList: {
    file: "uv", args: ["run", "python", "-m", "memory", "identity", "list"],
    cwd: "root", timeoutMs: 60000,
  },
  journeys: {
    file: "uv", args: ["run", "python", "-m", "memory", "journeys"],
    cwd: "root", timeoutMs: 60000,
  },
  detectPersona: {
    file: "uv", args: ["run", "python", "-m", "memory", "detect-persona"],
    cwd: "root", timeoutMs: 60000, acceptsQuery: true,
  },
  // `gated: true` = só roda com o SessionGate liberado (zero PTYs abertos,
  // nenhum update em andamento). A autoridade é o main process.
  //
  // Não existe updateMirror: por decisão dos mantenedores, o primeiro release
  // do Frame NÃO atualiza o core Mirror automaticamente — o Frame acompanha a
  // versão do Mirror, e `memory runtime update` atualizaria só o clone,
  // deixando o executável instalado operando contra uma minor futura sem
  // contrato de compatibilidade. Updates completos chegam por um novo
  // installer; manutenção manual consciente continua possível pelo Terminal.
  // updatePi instala SEMPRE a versão homologada (pin), nunca @latest — a
  // automação do /login depende de superfícies observadas de uma versão
  // específica do Pi. A versão vem da cópia instalada de pi-version.txt e é
  // validada aqui como MAJOR.MINOR.PATCH.
  updatePi: {
    file: "npm",
    args: ["install", "-g"],
    cwd: "frame", timeoutMs: 600000, gated: true, acceptsPiVersion: true,
  },
};

function buildCommand(id, opts = {}) {
  const spec = COMMANDS[id];
  if (!spec) throw new Error(`unknown command: ${id}`);
  const args = [...spec.args];
  if (spec.acceptsQuery) {
    const q = opts.query;
    if (typeof q !== "string" || !q.trim() || q.length > MAX_QUERY) {
      throw new Error(`command ${id} requires a query of 1..${MAX_QUERY} chars`);
    }
    args.push(q);
  }
  if (spec.acceptsUser) {
    const u = opts.user;
    if (typeof u !== "string" || !USER_RE.test(u)) {
      throw new Error(`command ${id} requires a user matching ${USER_RE}`);
    }
    args.push(u);
  }
  if (spec.acceptsPiVersion) {
    const v = opts.piVersion;
    if (typeof v !== "string" || !/^\d+\.\d+\.\d+$/.test(v)) {
      throw new Error(`command ${id} requires a pinned MAJOR.MINOR.PATCH Pi version — '@latest' is never used`);
    }
    args.push(`@earendil-works/pi-coding-agent@${v}`);
  }
  return { id, file: spec.file, args, cwd: spec.cwd, timeoutMs: spec.timeoutMs };
}

module.exports = { buildCommand, COMMANDS };
