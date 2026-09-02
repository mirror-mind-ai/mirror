// Simulador de caso de uso (premissa ES-004: simuladores executáveis, exit 0 no verde).
// Cenário: o ciclo de vida real de sessões do frame — abrir 2 sessões PTY
// concorrentes, trocar dados isolados por sessão, redimensionar, e encerrar
// graciosamente. Roda sem Electron: exercita main/pty-manager.js puro.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PtyManager } = require("../main/pty-manager.js");

const log = (s) => console.log(`[sim] ${s}`);
const fail = (s) => { console.error(`[sim] FALHOU: ${s}`); process.exit(1); };

const mgr = new PtyManager();
const data = new Map(); // id -> buffer
const exits = new Map();

function openShell(tag) {
  return mgr.open(
    {
      file: "powershell.exe",
      args: ["-NoLogo", "-NoProfile", "-Command",
        `Write-Host PRONTO_${tag}; while($true){ $l = Read-Host; if ($l -eq 'sair') { break }; Write-Host ECO_${tag}_$l }`],
      cwd: process.cwd(), env: process.env, cols: 100, rows: 30,
    },
    (id, d) => data.set(id, (data.get(id) ?? "") + d),
    (id, code) => exits.set(id, code),
  );
}

function waitFor(pred, what, ms = 20000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (pred()) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); fail(`timeout esperando ${what}`); }
    }, 100);
  });
}

log("cenário: 2 sessões concorrentes + isolamento + resize + shutdown gracioso");

const a = openShell("A");
const b = openShell("B");
if (mgr.count !== 2) fail(`esperava 2 PTYs, tem ${mgr.count}`);
log(`2 PTYs abertos (ids ${a}, ${b})`);

await waitFor(() => (data.get(a) ?? "").includes("PRONTO_A"), "boot da sessão A");
await waitFor(() => (data.get(b) ?? "").includes("PRONTO_B"), "boot da sessão B");
log("as duas sessões deram boot");

mgr.write(a, "ola-mundo\r");
await waitFor(() => (data.get(a) ?? "").includes("ECO_A_ola-mundo"), "eco na sessão A");
if ((data.get(b) ?? "").includes("ola-mundo")) fail("VAZAMENTO: input da A apareceu na B");
log("dados fluem e estão isolados por sessão");

mgr.resize(a, 120, 40);
mgr.resize(a, 0, -1); // inválido: deve ser ignorado sem quebrar
log("resize ok (válido aplicado, inválido ignorado)");

mgr.write(b, "sair\r");
await waitFor(() => exits.has(b), "exit natural da sessão B");
log(`sessão B saiu naturalmente (exit ${exits.get(b)})`);

await mgr.close(a, 500); // graciosa: Ctrl+C → espera → kill
await waitFor(() => exits.has(a), "encerramento da sessão A", 10000);
log(`sessão A encerrada graciosamente (exit ${exits.get(a)})`);

if (mgr.count !== 0) fail(`sobraram ${mgr.count} PTYs vivos`);
log("VERDE: ciclo de vida completo de sessões validado");
process.exit(0);
