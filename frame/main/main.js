"use strict";
// Mirror Frame — processo principal.
// Papel: orquestrar. Toda mutação passa pelo command-registry (argv fixo);
// sessões Pi respeitam o SessionGate; segurança Electron: contextIsolation,
// sem nodeIntegration, sem conteúdo remoto.
const { app, BrowserWindow, ipcMain } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { resolveMirrorRoot } = require("./root-resolve.js");
const { sessionEnv } = require("./env-profile.js");
const { buildCommand } = require("./command-registry.js");
const { SessionGate } = require("./session-gate.js");
const { loadEnvFile, saveEnvValues, removeEnvKeys, isFirstRun } = require("./config-store.js");
const { PtyManager, sanitizeResize } = require("./pty-manager.js");
const { resolveInstallerFile, readPinnedPiVersion } = require("./install-paths.js");
const { parseSeedReport, classifySeed } = require("./seed-report.js");

// Empacotado: resolve o clone relativo ao exe instalado, para funcionar em
// qualquer pasta de destino (inclusive com espaços). Dev: walk-up do checkout.
const MIRROR_ROOT = resolveMirrorRoot({
  exeDir: app.isPackaged ? path.dirname(app.getPath("exe")) : null,
});
const gate = new SessionGate();
const ptys = new PtyManager();
let win = null;

// Só a janela principal é interlocutor confiável: IPC vindo de qualquer outro
// webContents (frame embutido, janela inesperada) é rejeitado na entrada.
function trusted(event) {
  return win !== null && event.sender === win.webContents;
}

/* ---------- helpers ---------- */
const { execFileSync } = require("node:child_process");

// PATH fresco lido do registro: logo após a instalação, o PATH herdado pelo
// processo é obsoleto (git/node/uv/pi acabaram de entrar). Sem isso, o frame
// não enxerga as ferramentas até o usuário reiniciar a sessão do Windows.
function _regPath(hive, key) {
  try {
    const out = execFileSync("reg.exe", ["query", `${hive}\\${key}`, "/v", "Path"],
      { encoding: "utf8", windowsHide: true });
    const m = /Path\s+REG(?:_EXPAND)?_SZ\s+(.+)/i.exec(out);
    if (!m) return "";
    return m[1].trim().replace(/%([^%]+)%/g, (_s, v) => process.env[v] ?? `%${v}%`);
  } catch { return ""; }
}

function freshPath() {
  const sys = _regPath("HKLM", "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
  const usr = _regPath("HKCU", "Environment");
  const parts = [process.env.PATH ?? "", sys, usr].join(";")
    .split(";").map((p) => p.trim()).filter(Boolean);
  return [...new Set(parts)].join(";");
}

function frameEnv() {
  const e = sessionEnv(process.env, MIRROR_ROOT);
  e.PATH = freshPath();
  return e;
}

function whichSync(cmd) {
  try {
    const out = execFileSync("where.exe", [cmd],
      { encoding: "utf8", windowsHide: true, env: { ...process.env, PATH: freshPath() } });
    return out.split(/\r?\n/)[0]?.trim() || null;
  } catch { return null; }
}

const TOOLS = () => ({
  pi: whichSync("pi.cmd") || whichSync("pi"),
  uv: whichSync("uv.exe") || whichSync("uv"),
  git: whichSync("git.exe") || whichSync("git"),
  node: whichSync("node.exe"),
});

function runCommand(id, opts = {}) {
  return new Promise((resolve) => {
    let c;
    try { c = buildCommand(id, opts); }
    catch (e) { return resolve({ ok: false, code: -1, out: "", err: String(e.message) }); }
    const cwd = c.cwd === "root" ? MIRROR_ROOT : __dirname;
    if (!cwd) return resolve({ ok: false, code: -1, out: "", err: "MIRROR_ROOT não resolvido" });
    const file = c.file === "npm" && process.platform === "win32" ? "npm.cmd" : c.file;
    execFile(file, c.args, {
      cwd, env: frameEnv(), timeout: c.timeoutMs,
      windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, shell: false,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error, code: error?.code ?? 0,
        out: String(stdout ?? ""), err: String(stderr ?? (error ? error.message : "")),
      });
    });
  });
}

// Versão homologada do Pi e bootstrap: resolução centralizada e testada em
// install-paths.js (empacotado = cópia instalada {app}\bin; dev = checkout;
// ausência = erro claro; nunca o clone, nunca @latest).
function resolvePiVersion() {
  return readPinnedPiVersion({
    isPackaged: app.isPackaged,
    exeDir: path.dirname(app.getPath("exe")),
    moduleDir: __dirname,
  });
}

function gateState() {
  return {
    updating: gate.isUpdating, sessions: gate.openSessions,
    canOpenSession: gate.canOpenSession(), canUpdate: gate.canUpdate(),
  };
}
function pushGate() { win?.webContents.send("gate:changed", gateState()); }

/* ---------- IPC: config ---------- */
ipcMain.handle("config:get", (e) => {
  if (!trusted(e)) return null;
  const env = MIRROR_ROOT ? loadEnvFile(MIRROR_ROOT) : {};
  return {
    mirrorRoot: MIRROR_ROOT,
    firstRun: MIRROR_ROOT ? isFirstRun(MIRROR_ROOT) : true,
    mirrorUser: env.MIRROR_USER ?? "",
    hasKey: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.startsWith("sk-or-")),
    tools: TOOLS(),
    gate: gateState(),
    frameVersion: app.getVersion(),
    piPinnedVersion: resolvePiVersion().version,
  };
});

ipcMain.handle("config:save", (e, values) => {
  if (!trusted(e)) return { ok: false, err: "sender não confiável" };
  if (!MIRROR_ROOT) return { ok: false, err: "MIRROR_ROOT não resolvido" };
  const allowed = {};
  if (typeof values?.MIRROR_USER === "string" && values.MIRROR_USER.trim()) {
    allowed.MIRROR_USER = values.MIRROR_USER.trim();
  }
  if (typeof values?.OPENROUTER_API_KEY === "string" && values.OPENROUTER_API_KEY.startsWith("sk-or-")) {
    allowed.OPENROUTER_API_KEY = values.OPENROUTER_API_KEY.trim();
  }
  if (Object.keys(allowed).length === 0) return { ok: false, err: "nada válido para salvar" };
  try {
    // config-store valida chave e formato e rejeita quebras de linha (injeção).
    saveEnvValues(MIRROR_ROOT, allowed);
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
  return { ok: true };
});

// Recuperação do onboarding: se init/seed falharem DEPOIS de o MIRROR_USER ter
// sido gravado, o wizard reverte o marcador para que o próximo boot volte à
// rota de recuperação explícita (o wizard de novo), em vez de considerar o
// onboarding completo. Só o marcador é removido — a chave persistida fica.
ipcMain.handle("config:revertOnboarding", (e) => {
  if (!trusted(e)) return { ok: false, err: "sender não confiável" };
  if (!MIRROR_ROOT) return { ok: false, err: "MIRROR_ROOT não resolvido" };
  try {
    removeEnvKeys(MIRROR_ROOT, ["MIRROR_USER"]);
    return { ok: true };
  } catch (err) {
    return { ok: false, err: String(err.message) };
  }
});

/* ---------- IPC: comandos allowlisted ---------- */
// A autoridade do gate de update é o main process — o estado dos botões do
// renderer é só reflexo. No primeiro release, `updatePi` é o ÚNICO comando de
// update do Frame (o update automático do core foi removido); ele passa pelo
// SessionGate. O conjunto vem do metadado `gated` do registry (hoje: updatePi).
const { COMMANDS } = require("./command-registry.js");
const UPDATE_COMMANDS = new Set(
  Object.entries(COMMANDS).filter(([, spec]) => spec.gated).map(([id]) => id),
);
ipcMain.handle("cmd:run", async (e, id, opts) => {
  if (!trusted(e)) return { ok: false, code: -1, out: "", err: "sender não confiável" };
  const safeOpts = { ...(opts ?? {}) };
  if (id === "updatePi") {
    const pin = resolvePiVersion();
    if (!pin.version) {
      return {
        ok: false, code: -1, out: "",
        err: "update automático do Pi desabilitado: versão homologada indisponível (pi-version.txt ausente ou inválido). Atualize manualmente: npm install -g @earendil-works/pi-coding-agent@<versão homologada>",
      };
    }
    safeOpts.piVersion = pin.version;
  }
  if (UPDATE_COMMANDS.has(id)) {
    if (!gate.canUpdate()) {
      return { ok: false, code: -1, out: "", err: "update bloqueado: feche todas as abas e terminais primeiro (regra R2)" };
    }
    gate.updateStarted(); pushGate();
    try {
      return await runCommand(id, safeOpts);
    } finally {
      // finally: uma exceção no update não pode deixar o Frame preso em
      // "update em andamento" para sempre.
      gate.updateFinished(); pushGate();
    }
  }
  const r = await runCommand(id, safeOpts);
  // seed sai com exit != 0 diante de QUALQUER aviso, mesmo criando tudo — o
  // renderer decide pela CLASSIFICAÇÃO do relatório, não pelo exit code cru.
  if (id === "seed") {
    const report = parseSeedReport(r.out);
    r.seed = { ...classifySeed(report), report };
  }
  return r;
});

/* ---------- IPC: assinaturas do Pi (auth.json é a fonte da verdade) ---------- */
// O Pi grava os tokens OAuth em ~/.pi/agent/auth.json. O frame NUNCA toca o
// arquivo — só observa as chaves para saber quando um /login concluiu.
const AUTH_PATH = path.join(os.homedir(), ".pi", "agent", "auth.json");
function authProviders() {
  try { return Object.keys(JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"))); }
  catch { return []; }
}
ipcMain.handle("login:providers", (e) => (trusted(e) ? authProviders() : []));

// shell.openExternal foi removido por decisão dos mantenedores: o próprio Pi
// abre o navegador no fluxo OAuth homologado, e o terminal ("Ver detalhes")
// permite ver e copiar qualquer URL necessária como fallback.

// Login fluido: Pi roda num PTY oculto com o slash command como mensagem
// inicial; o próprio Pi abre o navegador (OAuth). O frame só observa auth.json.
const LOGIN_PROVIDERS = new Set(["anthropic", "openai-codex"]);
ipcMain.handle("login:start", (e, slug) => {
  try {
    if (!trusted(e)) return { ok: false, err: "sender não confiável" };
    if (!gate.canOpenSession()) return { ok: false, err: "um update está em andamento — aguarde concluir" };
    if (!LOGIN_PROVIDERS.has(slug)) return { ok: false, err: `provedor não suportado: ${slug}` };
    if (!TOOLS().pi) return { ok: false, err: "Pi não encontrado no PATH — rode o bootstrap no Setup" };
    // Pi puro, sem argumentos: mensagem inicial via CLI vira PROMPT pro modelo
    // (não comando). O renderer digita '/login <slug>' quando o Pi anuncia
    // prontidão no output.
    const id = openPty({
      file: "cmd.exe", args: ["/c", "pi"],
      cwd: MIRROR_ROOT ?? process.cwd(), env: frameEnv(),
    }, "system");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, err: `falha ao iniciar login: ${e.message}` };
  }
});

/* ---------- IPC: sessões PTY ---------- */
// ConPTY não lança .cmd diretamente — o Pi (shim npm) precisa do cmd.exe /c.
const SYSTEM_SCRIPTS = {
  shell: () => ({ file: "powershell.exe", args: ["-NoLogo", "-NoExit"], cwd: MIRROR_ROOT ?? process.cwd() }),
  bootstrap: () => {
    const resolved = resolveBootstrapPath();
    if (!resolved.path) return { error: resolved.err };
    return {
      file: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", resolved.path],
      cwd: MIRROR_ROOT ?? process.cwd(),
    };
  },
  login: () => ({ file: "cmd.exe", args: ["/c", "pi"], cwd: MIRROR_ROOT ?? process.cwd() }),
};

function resolveBootstrapPath() {
  return resolveInstallerFile({
    isPackaged: app.isPackaged,
    exeDir: path.dirname(app.getPath("exe")),
    moduleDir: __dirname,
    name: "bootstrap.ps1",
  });
}

// Cada PTY do Frame entra no gate — mirror, login, shell E bootstrap: um
// update nunca pode rodar em concorrência com QUALQUER processo aberto pelo
// Frame (um /login oculto ou bootstrap ativo travam a troca de binários tanto
// quanto uma sessão Mirror).
function openPty(spec, _kind) {
  const id = ptys.open(spec,
    (sid, data) => win?.webContents.send("session:data", sid, data),
    (sid, code) => {
      gate.sessionClosed(sid); pushGate();
      win?.webContents.send("session:exit", sid, code);
    });
  gate.sessionOpened(id); pushGate();
  return id;
}

ipcMain.handle("session:open", (e) => {
  try {
    if (!trusted(e)) return { ok: false, err: "sender não confiável" };
    if (!gate.canOpenSession()) return { ok: false, err: "um update está em andamento — aguarde concluir para abrir sessões" };
    if (!TOOLS().pi) return { ok: false, err: "Pi não encontrado no PATH — rode o bootstrap no Setup e reabra o app" };
    // openPty() já registra todo PTY no gate — sem sessionOpened redundante aqui.
    const id = openPty({
      file: "cmd.exe", args: ["/c", "pi"], cwd: MIRROR_ROOT, env: frameEnv(),
    }, "mirror");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, err: `falha ao abrir sessão: ${e.message}` };
  }
});

ipcMain.handle("session:openSystem", (e, script) => {
  try {
    if (!trusted(e)) return { ok: false, err: "sender não confiável" };
    if (!gate.canOpenSession()) return { ok: false, err: "um update está em andamento — aguarde concluir" };
    const mk = SYSTEM_SCRIPTS[script];
    if (!mk) return { ok: false, err: `script desconhecido: ${script}` };
    const spec = mk();
    if (spec.error) return { ok: false, err: spec.error };
    const id = openPty({ ...spec, env: frameEnv() }, "system");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, err: `falha ao abrir terminal: ${e.message}` };
  }
});

// Operações de sessão exigem sender confiável E SID existente — um SID
// desconhecido é rejeitado em vez de virar no-op silencioso.
ipcMain.on("session:input", (e, id, data) => {
  if (!trusted(e) || !ptys.has(id)) return;
  if (typeof data === "string" && data.length <= 8192) ptys.write(id, data);
});
ipcMain.on("session:resize", (e, id, cols, rows) => {
  if (!trusted(e) || !ptys.has(id)) return;
  const size = sanitizeResize(cols, rows);
  if (size) ptys.resize(id, size.cols, size.rows);
});
ipcMain.handle("session:close", async (e, id) => {
  if (!trusted(e)) return { ok: false, err: "sender não confiável" };
  if (!ptys.has(id)) return { ok: false, err: "sessão desconhecida" };
  await ptys.close(id);
  return { ok: true };
});

/* ---------- janela ---------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 560,
    backgroundColor: "#14151b",
    title: "Mirror Mind",
    icon: path.join(__dirname, "..", "assets", "mirror.ico"),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Renderer sandboxed: o preload usa apenas contextBridge/ipcRenderer,
      // que continuam disponíveis sob sandbox (viabilidade validada).
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

// Nenhum webContents pode navegar para fora nem abrir janelas novas.
app.on("web-contents-created", (_ev, contents) => {
  contents.on("will-navigate", (ev) => ev.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

// Clipboard no terminal (convenção Windows Terminal): o renderer usa as APIs
// web padrão (navigator.clipboard) sob gesto explícito do usuário; aqui só é
// CONCEDIDA a permissão — nenhum canal IPC novo — e somente para a janela
// principal. Qualquer outra permissão continua negada.
const CLIPBOARD_PERMISSIONS = new Set(["clipboard-read", "clipboard-sanitized-write"]);
function allowClipboard(webContents, permission) {
  return CLIPBOARD_PERMISSIONS.has(permission) && win !== null && webContents === win.webContents;
}
app.whenReady().then(() => {
  const ses = require("electron").session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(allowClipboard(wc, permission)));
  ses.setPermissionCheckHandler((wc, permission) => allowClipboard(wc, permission));
});

// Self-test mínimo (smoke Electron/ConPTY do CI): valida o binário nativo do
// node-pty sob o Node DO ELECTRON, no layout empacotado. Ativado somente pela
// variável de ambiente; sem janela, sem IPC novo, sem input externo — abre um
// ConPTY, ecoa um marcador fixo e sai com código verificável.
function runSelfTest() {
  const marker = "MIRROR_FRAME_CONPTY_OK";
  let buf = "";
  let done = false;
  const finish = (code, msg) => {
    if (done) return;
    done = true;
    process.stdout.write(`[selftest] ${msg}\n`);
    app.exit(code);
  };
  try {
    ptys.open(
      {
        file: "cmd.exe", args: ["/c", `echo ${marker}`],
        cwd: os.tmpdir(), env: process.env, cols: 80, rows: 24,
      },
      (_sid, data) => { buf += data; },
      (_sid, exitCode) => {
        const ok = buf.includes(marker) && exitCode === 0;
        finish(ok ? 0 : 1, ok ? "ConPTY ok sob Electron empacotado" : `falhou (exit=${exitCode}, marcador=${buf.includes(marker)})`);
      },
    );
  } catch (e) {
    finish(1, `exceção: ${e.message}`);
  }
  setTimeout(() => finish(2, "timeout"), 20000);
}

app.whenReady().then(() => {
  if (process.env.MIRROR_FRAME_SELFTEST === "1") { runSelfTest(); return; }
  createWindow();
  fs.watchFile(AUTH_PATH, { interval: 1200 }, () => {
    win?.webContents.send("login:changed", authProviders());
  });
});
app.on("window-all-closed", async () => { await ptys.closeAll(); app.quit(); });
