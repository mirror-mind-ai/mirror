"use strict";
/* Mirror Frame — renderer. Conversa com o main só pela API window.mirror. */

const $ = (id) => document.getElementById(id);
const { planKeyPersist, initialKeySaved } = window.MirrorOnboarding;
let CFG = null;                 // config:get
let tabs = [];                  // {sid, title, kind:'mirror'|'system', term, fit, slot, exited}
let activeTab = -1;             // índice em tabs
let activeView = "sessions";    // sessions | setup | personas
let warmupOut = "";

/* ============ terminal ============ */
const TERM_THEME = {
  background: "#0e0f14", foreground: "#eceff7", cursor: "#9dbeff",
  selectionBackground: "#3d4d75",
  black: "#1b1d26", brightBlack: "#9aa1b8",
  blue: "#8fb4ff", brightBlue: "#a9c4ff",
  magenta: "#b79cff", brightMagenta: "#cbb6ff",
  green: "#58c08a", brightGreen: "#79d3a6",
  yellow: "#e0b45c", brightYellow: "#eccb85",
  red: "#d16060", brightRed: "#e08585",
  cyan: "#58bfb0", brightCyan: "#7fd3c7",
  white: "#c9cdd9", brightWhite: "#eceef4",
};

// Clipboard na convenção do Windows Terminal, aplicada a todo terminal do
// Frame: Ctrl+V / Ctrl+Shift+V colam; Ctrl+Shift+C copia a seleção; clique
// direito copia se houver seleção, senão cola. (xterm.js não traz nada disso
// por padrão — sem isto, "colar" simplesmente não existia na sessão.)
function wireClipboard(term, sid, container) {
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== "keydown") return true;
    const ctrl = ev.ctrlKey && !ev.altKey;
    if (ctrl && ev.shiftKey && ev.code === "KeyC" && term.hasSelection()) {
      ev.preventDefault();
      navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      return false;
    }
    // Ctrl+V PURO fica com o caminho NATIVO do navegador (paste event na
    // textarea do xterm) — colar manualmente aqui duplicava a inserção
    // (bug pego na homologação: comando colado 2x concatenado).
    if (ctrl && ev.shiftKey && ev.code === "KeyV") {
      ev.preventDefault();
      navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }).catch(() => {});
      return false;
    }
    return true;
  });
  container.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    if (term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      term.clearSelection();
    } else {
      navigator.clipboard.readText().then((t) => { if (t) term.paste(t); }).catch(() => {});
    }
    term.focus();
  });
}

function makeTab(sid, title, kind) {
  const slot = document.createElement("div");
  slot.className = "term-slot";
  $("term-host").appendChild(slot);
  const term = new Terminal({
    theme: TERM_THEME, fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: 14, cursorBlink: true, allowProposedApi: true, scrollback: 5000,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(slot);
  term.onData((d) => window.mirror.session.input(sid, d));
  term.onResize(({ cols, rows }) => window.mirror.session.resize(sid, cols, rows));
  wireClipboard(term, sid, slot);
  const t = { sid, title, kind, term, fit, slot, exited: false };
  tabs.push(t);
  activeTab = tabs.length - 1;
  activeView = "sessions";
  render();
  requestAnimationFrame(() => { fit.fit(); term.focus(); });
  return t;
}

window.mirror.session.onData((sid, data) => {
  if (wLogin && sid === wLogin.sid) {
    wLogin.term.write(data);
    wLogin.buf = ((wLogin.buf ?? "") + data).slice(-12000);
    const clean = stripAnsi(wLogin.buf);
    // prontidão anunciada — mas no cold start as extensões carregam DEPOIS e o
    // editor descarta input precoce. Então: digita só quando o output assentar.
    if (!wLogin.ready && /Where shall we begin|No models available|ctrl\+o/i.test(clean)) {
      wLogin.ready = true;
      wLoginState("Pi iniciado — aguardando assentar…");
    }
    clearTimeout(wLogin.quiet);
    wLogin.quiet = setTimeout(() => tryTypeLogin(sid), 2000);
    // menu de método → Enter em "Sign in with an account" (default)
    if (!wLogin.menuDone && /Select authentication method/i.test(clean)) {
      wLogin.menuDone = true;
      clearTimeout(wLogin.check);
      wLoginState("menu respondido — abrindo o navegador…");
      $("w-login-lbl").innerHTML = "Confirmando método (conta com assinatura)… o navegador vai abrir.";
      setTimeout(() => {
        if (wLogin && wLogin.sid === sid) window.mirror.session.input(sid, "\r");
      }, 500);
    }
    // 3) Pi abriu o navegador (comprovado: ele não imprime a URL — abre direto
    //    e deixa um prompt de colagem como fallback)
    if (wLogin.menuDone && !wLogin.browserMsg && /Complete login in your browser/i.test(clean)) {
      wLogin.browserMsg = true;
      wLoginState("navegador aberto — aguardando sua autorização");
      $("w-login-lbl").innerHTML = `O navegador abriu com a página de autenticação — <b>autorize por lá</b>.<br>
        <span style="color:var(--muted);font-size:13px">Eu detecto sozinho quando concluir. Se o navegador não
        abriu, clique em "Ver detalhes" para copiar o link ou colar o código.</span>`;
    }
    // Sem shell.openExternal (decisão dos mantenedores): o Pi abre o navegador
    // no fluxo homologado; o terminal em "Ver detalhes" mostra qualquer URL
    // para o usuário ver e copiar como fallback.
    return;
  }
  tabs.find((t) => t.sid === sid)?.term.write(data);
});
window.mirror.session.onExit((sid, code) => {
  if (wLogin && sid === wLogin.sid) { finishWizLogin(false); return; }
  const t = tabs.find((x) => x.sid === sid);
  if (t) {
    t.exited = true;
    t.term.write(`\r\n\x1b[90m[sessão encerrada · exit ${code}]\x1b[0m\r\n`);
    renderStatus();
  }
});
window.mirror.login.onChange((list) => {
  wizConnected = list;
  if (wLogin && list.includes(wLogin.slug)) finishWizLogin(true);
  if (wiz === 3 && !$("view-wizard").classList.contains("hidden")) renderProvCards();
});
window.mirror.gate.onChange((g) => { if (CFG) { CFG.gate = g; renderStatus(); } });
window.addEventListener("resize", () => currentTab()?.fit.fit());

function currentTab() { return activeTab >= 0 ? tabs[activeTab] : null; }

async function openMirrorSession() {
  try {
    const r = await window.mirror.session.open();
    if (!r.ok) { flashEmpty("Não deu para abrir a sessão", r.err, true); return; }
    makeTab(r.id, `◇ sessão ${tabs.filter(t => t.kind === "mirror").length + 1}`, "mirror");
  } catch (e) {
    flashEmpty("Erro inesperado ao abrir a sessão", String(e?.message ?? e), true);
  }
}
async function openSystem(script, title) {
  try {
    const r = await window.mirror.session.openSystem(script);
    if (!r.ok) { flashEmpty("Não deu para abrir o terminal", r.err, true); return; }
    makeTab(r.id, title, "system");
  } catch (e) {
    flashEmpty("Erro inesperado ao abrir o terminal", String(e?.message ?? e), true);
  }
}
async function closeTab(i) {
  const t = tabs[i];
  await window.mirror.session.close(t.sid);
  t.term.dispose(); t.slot.remove();
  tabs.splice(i, 1);
  if (activeTab >= tabs.length) activeTab = tabs.length - 1;
  if (tabs.length === 0 && activeView === "sessions") activeView = "setup";
  render();
}

/* ============ render ============ */
function render() {
  renderTabs();
  const showingSessions = activeView === "sessions" && tabs.length > 0;
  tabs.forEach((t, i) => t.slot.classList.toggle("hidden", !(showingSessions && i === activeTab)));
  $("panel-setup").classList.toggle("hidden", activeView !== "setup");
  $("panel-personas").classList.toggle("hidden", activeView !== "personas");
  $("empty-state").classList.toggle("hidden", !(activeView === "sessions" && tabs.length === 0));
  if (activeView === "setup") renderSetup();
  if (activeView === "personas") renderPersonas();
  if (activeView === "sessions" && tabs.length === 0) renderEmpty();
  if (showingSessions) requestAnimationFrame(() => { currentTab()?.fit.fit(); currentTab()?.term.focus(); });
  renderStatus();
}

function renderTabs() {
  const stz = $("tabstrip");
  stz.innerHTML = tabs.map((t, i) => `
    <button class="tab ${activeView === "sessions" && i === activeTab ? "active" : ""}" data-tab="${i}">
      <span class="dot ${t.kind === "system" ? "sys" : ""}"></span> ${t.title}
      <span class="x" data-close="${i}" title="fechar">✕</span>
    </button>`).join("") + `
    <button class="tab newtab" id="tab-new" title="nova sessão Mirror">＋</button>
    <div class="tabspacer"></div>
    <button class="tab util ${activeView === "personas" ? "active" : ""}" id="tab-personas">◇ Personas</button>
    <button class="tab util ${activeView === "setup" ? "active" : ""}" id="tab-setup">⚙ Setup</button>`;
  stz.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) return;
    activeTab = +b.dataset.tab; activeView = "sessions"; render();
  }));
  stz.querySelectorAll("[data-close]").forEach((x) => x.addEventListener("click", (e) => {
    e.stopPropagation(); closeTab(+x.dataset.close);
  }));
  $("tab-new").addEventListener("click", openMirrorSession);
  $("tab-personas").addEventListener("click", () => { activeView = "personas"; render(); });
  $("tab-setup").addEventListener("click", () => { activeView = "setup"; render(); });
}

function renderEmpty() {
  $("empty-title").textContent = "Pronto para conversar";
  $("empty-msg").textContent = "Abra uma sessão — o Pi assume daqui, com a memória do Mirror ligada.";
  $("btn-open-session").classList.remove("hidden");
  $("btn-goto-setup").classList.add("hidden");
}
function flashEmpty(title, msg, showSetup) {
  activeView = "sessions";
  render();
  $("empty-state").classList.remove("hidden");
  $("empty-title").textContent = title;
  $("empty-msg").textContent = msg;
  $("btn-open-session").classList.remove("hidden");
  $("btn-goto-setup").classList.toggle("hidden", !showSetup);
}

/* ============ setup ============ */
function chk(l, name, detail, btn) {
  return `<div class="check"><span class="light ${l}"></span><span class="name">${name}</span>
    <span class="detail">${detail}</span>${btn ?? ""}</div>`;
}

function renderSetup() {
  const t = CFG.tools, g = CFG.gate;
  // contagem CANÔNICA do main process: inclui PTYs ocultos (login) e
  // terminais de sistema, não só as abas Mirror visíveis.
  const sess = g?.sessions ?? 0;
  const diagState = diagResult === null ? "y" : diagResult ? "g" : "r";
  const diagDetail = diagResult === null ? "não executado — opcional, nunca bloqueia a conversa"
    : diagResult ? "ok (identidade e banco legíveis)" : "falhou — veja a saída abaixo";
  $("panel-setup").innerHTML = `
    <h2>Setup do Mirror</h2>
    <p class="sub">Cada item é um check real. Os botões executam apenas comandos oficiais
    (argv fixo) — nada é editado à mão.</p>
    <div class="checks">
      ${chk(CFG.mirrorRoot ? "g" : "r", "Instalação do Mirror", CFG.mirrorRoot ?? "não encontrada — rode o instalador")}
      ${chk(CFG.mirrorUser ? "g" : "y", "Identidade", CFG.mirrorUser ? `MIRROR_USER = ${CFG.mirrorUser}` : "não configurada")}
      ${chk(CFG.hasKey ? "g" : "y", "Chave OpenRouter (memória)", CFG.hasKey ? "configurada no .env" : "ausente")}
      ${chk(t.uv ? "g" : "r", "uv (runtime Python)", t.uv ?? "ausente", t.uv ? "" : `<button id="su-boot1">Instalar pré-requisitos</button>`)}
      ${chk(t.pi ? "g" : "r", "Pi (harness da conversa)", t.pi ?? "ausente", t.pi ? "" : `<button id="su-boot2">Instalar pré-requisitos</button>`)}
      ${chk(t.git ? "g" : "r", "Git", t.git ?? "ausente")}
      ${chk(diagState, "Diagnóstico do Mirror", diagDetail,
        `<button id="su-warm">Rodar diagnóstico</button>`)}
      ${chk("g", "Update do Mirror",
        "chega junto com um novo installer (Frame + Mirror na mesma versão); manutenção manual consciente segue disponível pelo atalho Terminal")}
      ${chk(CFG.piPinnedVersion ? "g" : "y", "Update do Pi",
        CFG.piPinnedVersion ? `versão homologada: ${CFG.piPinnedVersion}` : "desabilitado — pin homologado indisponível",
        `<button id="su-uppi" ${g.canUpdate && CFG.piPinnedVersion ? "" : "disabled"}>Atualizar Pi</button>`)}
      ${chk("g", "Terminal do sistema", "PowerShell dentro do frame", `<button id="su-shell">Abrir terminal</button>`)}
    </div>
    ${sess > 0 ? `<p class="setup-note">⚠ Updates bloqueados: há ${sess} PTY(s) aberto(s) — abas, terminais, bootstrap ou login em andamento (regra R2 — a troca de binários exige exclusividade).</p>` : ""}
    <div class="mono-out ${warmupOut ? "" : "hidden"}" id="su-out">${escapeHtml(warmupOut)}</div>`;
  const wire = (id, fn) => { const b = $(id); if (b) b.addEventListener("click", fn); };
  wire("su-warm", runWarmup);
  wire("su-boot1", () => openSystem("bootstrap", "⚙ bootstrap"));
  wire("su-boot2", () => openSystem("bootstrap", "⚙ bootstrap"));
  wire("su-shell", () => openSystem("shell", "› powershell"));
  wire("su-uppi", async (e) => {
    e.target.disabled = true; e.target.textContent = "atualizando…";
    const r = await window.mirror.cmd.run("updatePi");
    warmupOut = (r.out + "\n" + r.err).trim(); renderSetup();
  });
}

// Diagnóstico explícito e NÃO bloqueante (decisão dos mantenedores): roda o
// comando de leitura do banco sob demanda e mostra o resultado — nunca é
// pré-condição para conversar.
let diagResult = null; // null = nunca rodou · true/false = último resultado
async function runWarmup() {
  warmupOut = "rodando diagnóstico (memory identity list)…";
  renderSetup();
  const r = await window.mirror.cmd.run("warmup");
  diagResult = r.ok;
  warmupOut = (r.out + (r.err ? "\n" + r.err : "")).trim() || "(sem saída)";
  CFG = await window.mirror.config.get();
  render();
}

/* ============ personas ============ */
let personasOut = "";
function renderPersonas() {
  $("panel-personas").innerHTML = `
    <h2>Personas &amp; Modos</h2>
    <p class="sub">Direto da sua base local (<code>memory identity list</code>). O Mirror ativa a
    persona sozinho — aqui você aprende a reconhecê-las.</p>
    <div class="mono-out" id="p-out">${escapeHtml(personasOut || "carregando…")}</div>
    <div class="tryit">
      <div class="lbl">Experimente — qual persona responderia? (detect-persona real)</div>
      <input id="p-try" placeholder='ex.: "o deploy quebrou depois do merge"'>
      <div class="res" id="p-tryres"></div>
    </div>`;
  if (!personasOut) {
    window.mirror.cmd.run("identityList").then((r) => {
      personasOut = (r.out || r.err || "(sem saída)").trim();
      const el = $("p-out"); if (el) el.textContent = personasOut;
    });
  }
  let timer = null;
  $("p-try").addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (!q) { $("p-tryres").textContent = ""; return; }
    timer = setTimeout(async () => {
      $("p-tryres").textContent = "consultando detect-persona…";
      const r = await window.mirror.cmd.run("detectPersona", { query: q });
      $("p-tryres").textContent = fmtDetect((r.out || r.err || "(sem saída)").trim());
    }, 500);
  });
}

/* ============ statusbar ============ */
function renderStatus() {
  const g = CFG?.gate ?? {};
  const t = currentTab();
  const left = t && activeView === "sessions"
    ? `<span><b>${t.title}</b>${t.exited ? " · encerrada" : ""}</span>`
    : `<span>◇ <b>Mirror Mind</b></span>`;
  $("statusbar").innerHTML = left + `
    <span>sessões <b>${g.sessions ?? 0}</b></span>
    <span class="right">
      <span>${CFG?.mirrorUser ? escapeHtml(CFG.mirrorUser) + " · " : ""}frame v${CFG?.frameVersion ?? "?"}</span>
      <span class="okdot">● local</span>
    </span>`;
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ============ wizard de 1º acesso (6 passos, como no mockup) ============ */
const WSTEPS = ["Boas-vindas", "Identidade", "Chave OpenRouter", "Assinatura de modelos", "Conheça as personas", "Primeira conversa"];
const WPROVS = [
  { slug: "anthropic", name: "Anthropic", sub: "Claude (recomendado) — planos Pro/Max" },
  { slug: "openai-codex", name: "OpenAI", sub: "GPT — assinatura ChatGPT (Codex)" },
];
let wizConnected = [];
let wLogin = null; // sessão de login em andamento no wizard

function renderProvCards() {
  const host = $("w-provs");
  if (!host) return;
  host.innerHTML = WPROVS.map((p) => {
    const on = wizConnected.includes(p.slug);
    const busy = wLogin?.slug === p.slug;
    return `<div class="subcard" data-slug="${p.slug}" style="cursor:${on ? "default" : "pointer"};border-color:${on ? "#2c5c42" : "var(--line)"}">
      <h3>${p.name} ${on ? '<span style="color:var(--ok);font-size:12px">● conectada</span>' : ""}</h3>
      <p>${p.sub}</p>
      ${on ? "" : `<p style="margin-top:8px;color:var(--accent);font-weight:600;font-size:13px">${busy ? "conectando…" : "Conectar →"}</p>`}
    </div>`;
  }).join("");
  host.querySelectorAll("[data-slug]").forEach((c) => c.addEventListener("click", () => {
    const slug = c.dataset.slug;
    if (!wizConnected.includes(slug)) startWizLogin(slug);
  }));
}

async function startWizLogin(slug) {
  if (wLogin) return;
  const r = await window.mirror.login.start(slug);
  if (!r.ok) { $("w-login-lbl").textContent = r.err; $("w-login-wrap").classList.remove("hidden"); return; }
  const p = WPROVS.find((x) => x.slug === slug);
  $("w-login-wrap").classList.remove("hidden");
  $("w-login-lbl").innerHTML = `Conectando <b>${p.name}</b> — o navegador vai abrir para você autenticar.
    <span style="color:var(--dim)">Conclua por lá; eu detecto sozinho quando terminar…</span>`;
  const term = new Terminal({
    theme: TERM_THEME, fontFamily: '"Cascadia Mono", Consolas, monospace',
    fontSize: 12.5, cursorBlink: true, scrollback: 2000,
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($("w-login-term"));
  term.onData((d) => window.mirror.session.input(r.id, d));
  term.onResize(({ cols, rows }) => window.mirror.session.resize(r.id, cols, rows));
  // fallback de colar código OAuth exige clipboard funcionando aqui também
  wireClipboard(term, r.id, $("w-login-term"));
  // rede de segurança: prontidão nunca anunciada em 12s → tenta mesmo assim;
  // aos 30s sem navegador/menu → revela o terminal para conclusão manual.
  const fallback = setTimeout(() => {
    if (wLogin && wLogin.sid === r.id && !wLogin.ready) { wLogin.ready = true; tryTypeLogin(r.id); }
  }, 12000);
  const reveal = setTimeout(() => {
    if (wLogin && wLogin.sid === r.id && !wLogin.browserMsg && !wizConnected.includes(slug)) {
      const t = $("w-login-term");
      if (t && t.style.display === "none") {
        t.style.display = "block";
        $("w-login-toggle").textContent = "Ocultar detalhes ▴";
        $("w-login-lbl").innerHTML = `O fluxo da <b>${p.name}</b> não avançou sozinho — conclua no terminal abaixo.`;
        requestAnimationFrame(() => { fit.fit(); term.focus(); });
      }
    }
  }, 30000);
  wLogin = { sid: r.id, term, fit, slug, fallback, reveal, ready: false, attempts: 0,
    menuDone: false, browserMsg: false, url: null, buf: "", quiet: null, check: null };
  renderProvCards();
  $("w-login-cancel").addEventListener("click", () => finishWizLogin(false));
  $("w-login-toggle").addEventListener("click", () => {
    const t = $("w-login-term");
    const showing = t.style.display !== "none";
    t.style.display = showing ? "none" : "block";
    $("w-login-toggle").textContent = showing ? "Ver detalhes ▾" : "Ocultar detalhes ▴";
    if (!showing) requestAnimationFrame(() => { fit.fit(); term.focus(); });
  });
}

function wLoginState(text) {
  const el = $("w-login-state");
  if (el) el.textContent = "estado: " + text;
}

function tryTypeLogin(sid) {
  if (!wLogin || wLogin.sid !== sid || wLogin.menuDone || !wLogin.ready) return;
  if ((wLogin.attempts ?? 0) >= 3) { wLoginState("3 tentativas sem resposta — veja os detalhes"); return; }
  wLogin.attempts = (wLogin.attempts ?? 0) + 1;
  wLoginState(`enviando /login ${wLogin.slug} (tentativa ${wLogin.attempts})…`);
  window.mirror.session.input(sid, "\x15");
  window.mirror.session.input(sid, `/login ${wLogin.slug}\r`);
  clearTimeout(wLogin.check);
  wLogin.check = setTimeout(() => {
    if (wLogin && wLogin.sid === sid && !wLogin.menuDone) tryTypeLogin(sid);
  }, 4000);
}

function finishWizLogin(ok) {
  const l = wLogin;
  wLogin = null;
  if (l) {
    clearTimeout(l.fallback);
    clearTimeout(l.reveal);
    clearTimeout(l.quiet);
    clearTimeout(l.check);
    window.mirror.session.close(l.sid);
    l.term.dispose();
  }
  const wrap = $("w-login-wrap");
  if (wrap) {
    if (ok) {
      wrap.classList.add("hidden");
    } else {
      $("w-login-lbl").textContent = "Fluxo encerrado sem conectar — clique no provedor para tentar de novo.";
      $("w-login-term").innerHTML = "";
      $("w-login-term").style.display = "none";
    }
  }
  renderProvCards();
}

function fmtDetect(raw) {
  if (/no persona match/i.test(raw)) {
    return "→ nenhuma persona acima do limiar — o ego responde (sem assinatura ◇).\nDica: as keywords de roteamento padrão são em inglês (ex.: bug, code, design).";
  }
  return raw;
}
const MODES = [
  { cls: "m1", name: "Mirror",   desc: "reflexão e decisões pessoais" },
  { cls: "m2", name: "Builder",  desc: "código e construção" },
  { cls: "m3", name: "Explorer", desc: "incerteza antes de construir" },
  { cls: "m4", name: "Soul",     desc: "escuta ritual da vida interior" },
];
const PCARDS = [
  ["engineer", "software, arquitetura, debugging, testes"],
  ["strategist", "negócio, posicionamento, lançamentos"],
  ["therapist", "tensões psicológicas e emoções"],
  ["writer", "textos, narrativa, edição"],
  ["coach", "hábitos, metas, accountability"],
  ["+ 7 personas", "teacher, researcher, doctor, financial…"],
];
let wiz = 0;
const wst = { user: "", key: "", keySaved: false, seedWarnings: null, inited: false };

function wizNav(backOk, label, disabled) {
  return `<div class="wiz-nav">
    ${backOk ? '<button class="btn" id="w-back">← Voltar</button>' : ""}
    <button class="btn primary" id="w-next" ${disabled ? "disabled" : ""}>${label}</button>
  </div><p class="wiz-msg" id="w-msg"></p>`;
}
function wchk(l, name, detail) {
  return `<div class="check"><span class="light ${l}"></span><span class="name">${name}</span><span class="detail">${detail}</span></div>`;
}

function renderWizard() {
  $("wiz-steps").innerHTML = WSTEPS.map((s, i) => {
    const cls = i < wiz ? "done" : i === wiz ? "now" : "";
    return `<div class="step ${cls}"><span class="n">${i < wiz ? "✓" : i + 1}</span> ${s}</div>`;
  }).join("");
  const m = $("wiz-main");

  if (wiz === 0) m.innerHTML = `
    <div class="wiz-glyph">◇</div>
    <h1>Bem-vindo ao seu Mirror</h1>
    <p class="sub">O Mirror é um espelho com memória: uma IA que conversa com você
    <b>lembrando quem você é</b> — sua identidade, suas jornadas, suas decisões.
    Tudo fica <b>na sua máquina</b>, num banco local. Nada vai para um servidor nosso.</p>
    <p class="sub">Nos próximos passos vamos: criar sua identidade local, ligar a memória,
    entender como a conversa se conecta e te apresentar as <b>personas</b> — as lentes que o
    Mirror ativa sozinho conforme o assunto.</p>
    <p class="sub">Leva menos de 5 minutos.</p>
    ${wizNav(false, "Começar →", false)}`;

  if (wiz === 1) {
    m.innerHTML = `
      <h1>Sua identidade local</h1>
      <p class="sub">Esse nome define <b>sua casa no Mirror</b> — a pasta local onde vivem sua
      memória e identidade (<code>~\\.mirror-minds\\&lt;nome&gt;</code>). Sem espaços ou acentos.</p>
      <p class="hint">Já usou o Mirror antes nesta máquina? Informe o <b>mesmo nome</b> — sua
      identidade e memória preservadas são reconectadas (nada é recriado).</p>
      <div class="field"><label for="w-user">Seu nome</label>
        <input id="w-user" value="${escapeHtml(wst.user)}" placeholder="ex.: Rodrigo"></div>
      <p class="hint" id="w-user-hint">${wst.user ? "Casa: ~\\.mirror-minds\\" + escapeHtml(wst.user) : ""}</p>
      ${wizNav(true, "Continuar →", !/^[A-Za-z0-9_-]{1,64}$/.test(wst.user))}`;
    $("w-user").addEventListener("input", (e) => {
      wst.user = e.target.value.trim();
      $("w-user-hint").textContent = wst.user ? `Casa: ~\\.mirror-minds\\${wst.user}` : "";
      $("w-next").disabled = !/^[A-Za-z0-9_-]{1,64}$/.test(wst.user);
    });
  }

  if (wiz === 2) {
    m.innerHTML = `
      <h1>Ligue a memória (OpenRouter)</h1>
      <p class="sub">A chave OpenRouter alimenta <b>só a memória</b> do Mirror — embeddings e
      extração de memórias. <b>Não é</b> o modelo da conversa (esse vem no próximo passo).
      Crie uma conta em <b>openrouter.ai</b>, gere uma chave e adicione ≥ US$5 de crédito.</p>
      <div class="field"><label for="w-key">Chave OpenRouter</label>
        <input id="w-key" type="password" autocomplete="new-password" spellcheck="false"
          placeholder="${wst.keySaved ? "já configurada — deixe em branco para manter" : "sk-or-..."}"></div>
      <p class="hint">Dá para pular e adicionar depois no ⚙ Setup — mas sem chave o Mirror
      conversa sem gravar memórias.</p>
      ${wizNav(true, "Continuar →", false)}`;
    // o valor NUNCA vai para atributo/HTML — só a property do input e wst.key
    // transitório, limpo assim que a persistência conclui.
    $("w-key").value = wst.key;
    $("w-key").addEventListener("input", (e) => { wst.key = e.target.value.trim(); });
  }

  if (wiz === 3) {
    m.innerHTML = `
      <h1>Conecte sua assinatura</h1>
      <p class="sub">A <b>conversa</b> usa a sua assinatura de IA através do login oficial do Pi —
      o Mirror <b>nunca vê sua senha</b>. Clique num provedor para conectar agora: o fluxo roda
      no terminal abaixo e o navegador abre sozinho.</p>
      <div class="subcards" id="w-provs"></div>
      <div id="w-login-wrap" class="hidden" style="margin-top:16px;max-width:660px;background:var(--panelbg);border:1px solid var(--line);border-radius:9px;padding:16px 18px">
        <div style="font-size:14px;color:var(--ink)" id="w-login-lbl"></div>
        <div style="font-size:11.5px;color:var(--dim);margin-top:8px;font-family:'Cascadia Mono',Consolas,monospace" id="w-login-state"></div>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button class="btn" id="w-login-cancel" style="font-size:12.5px;padding:7px 14px">Cancelar</button>
          <button class="btn" id="w-login-toggle" style="font-size:12.5px;padding:7px 14px">Ver detalhes ▾</button>
        </div>
        <div id="w-login-term" style="display:none;margin-top:12px;height:230px;background:var(--termbg);border:1px solid var(--line);border-radius:8px;padding:6px"></div>
      </div>
      ${wizNav(true, "Continuar →", false)}`;
    renderProvCards();
  }

  if (wiz === 4) {
    m.innerHTML = `
      <h1>As lentes do seu Mirror</h1>
      <p class="sub">Você não escolhe persona — <b>o Mirror escolhe sozinho</b>, pelo assunto.
      Quatro <b>modos</b> definem o tipo de trabalho; as <b>personas</b> assinam com <b>◇</b> quando ativam.</p>
      <div class="modegrid">${MODES.map(x => `<div class="mode ${x.cls}"><b>${x.name}</b><span>${x.desc}</span></div>`).join("")}</div>
      <div class="pgrid">${PCARDS.map(p => `<div class="pcard"><b>${p[0]}</b><span>${p[1]}</span></div>`).join("")}</div>
      <div class="tryit"><div class="lbl">Experimente — qual persona responderia? (detect-persona real)</div>
        <input id="w-try" placeholder='digite algo como "o deploy quebrou depois do merge"'>
        <div class="res" id="w-tryres">${wst.inited ? "" : "…preparando sua base para o teste ao vivo"}</div></div>
      ${wizNav(true, "Continuar →", false)}`;
    let timer = null;
    $("w-try").addEventListener("input", (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim();
      if (!q) { $("w-tryres").textContent = ""; return; }
      timer = setTimeout(async () => {
        $("w-tryres").textContent = "consultando detect-persona…";
        const r = await window.mirror.cmd.run("detectPersona", { query: q });
        $("w-tryres").textContent = fmtDetect((r.out || r.err || "(sem saída)").trim());
      }, 500);
    });
  }

  if (wiz === 5) {
    m.innerHTML = `
      <h1>Tudo pronto, ${escapeHtml(wst.user || "…")}</h1>
      <p class="sub">Seu Mirror nasce agora — e a partir da primeira conversa ele começa a
      <b>lembrar</b>. Confira:</p>
      <div class="summary">
        ${wchk("g", "Identidade", "~\\.mirror-minds\\" + escapeHtml(wst.user || "?"))}
        ${wchk(wst.keySaved ? "g" : "y", "Memória (OpenRouter)", wst.keySaved ? "chave configurada" : "sem chave — adicione no ⚙ Setup")}
        ${wst.seedWarnings ? wchk("y", "Seed da identidade", `criada com aviso: ${escapeHtml(wst.seedWarnings)} — detalhes no diagnóstico do ⚙ Setup`) : ""}
        ${wchk(wizConnected.length ? "g" : "y", "Assinatura",
          wizConnected.length ? "conectada: " + wizConnected.join(", ") : "conecte com /login na primeira conversa")}
        ${wchk("g", "Runtime", "Mirror instalado — pronto para conversar")}
      </div>
      ${wizConnected.length
        ? `<p class="sub">Tudo conectado — é só abrir e conversar.</p>`
        : `<p class="sub">Sem assinatura conectada ainda: na primeira sessão, digite <code>/login</code> para conectar (ou volte ao passo 4).</p>`}
      ${wizNav(true, "Abrir meu Mirror ◇", false)}`;
  }

  const back = $("w-back");
  if (back) back.addEventListener("click", () => { if (wLogin) finishWizLogin(false); wiz--; renderWizard(); });
  $("w-next").addEventListener("click", onWizNext);
}

async function onWizNext() {
  if (wLogin) finishWizLogin(false);
  const msg = $("w-msg"), btn = $("w-next");
  if (wiz === 2) {
    // Chave: vazio preserva a existente; nova só após validação (lógica pura).
    const plan = planKeyPersist({ existingHasKey: wst.keySaved, typedKey: wst.key });
    if (plan.action === "invalid") { msg.textContent = plan.error; return; }
    btn.disabled = true;
    // Transação mínima do onboarding: o marcador (MIRROR_USER) só permanece se
    // init E seed concluírem — falha em qualquer etapa reverte o marcador, e o
    // próximo boot volta ao wizard (rota de recuperação explícita; retry é
    // idempotente: init tolera casa existente e seed pula entradas existentes).
    msg.textContent = "Gravando configuração…";
    const vals = { MIRROR_USER: wst.user };
    if (plan.action === "save") vals.OPENROUTER_API_KEY = plan.value; // vazio NÃO sobrescreve
    const r = await window.mirror.config.save(vals);
    if (!r.ok) { msg.textContent = r.err; btn.disabled = false; return; }
    msg.textContent = "Criando sua identidade local (memory init)…";
    const ri = await window.mirror.cmd.run("initIdentity", { user: wst.user });
    if (!ri.ok && !/already|exists|existe/i.test(ri.out + ri.err)) {
      await window.mirror.config.revertOnboarding();
      msg.textContent = "init falhou (nada foi marcado como concluído — tente de novo): " + (ri.err || ri.out).slice(0, 240);
      btn.disabled = false; return;
    }
    msg.textContent = "Semeando identidade e personas (memory seed)…";
    const rs = await window.mirror.cmd.run("seed");
    // Classificação estrita (item 1): só o aviso conhecido é tolerado; qualquer
    // outro erro é falha de onboarding — reverte o marcador e volta ao wizard.
    const seed = rs.seed ?? { status: "fail", reason: rs.err || rs.out };
    if (seed.status === "fail") {
      await window.mirror.config.revertOnboarding();
      msg.textContent = "seed falhou (nada foi marcado como concluído — tente de novo): " + String(seed.reason || rs.err || rs.out).slice(0, 240);
      btn.disabled = false; return;
    }
    wst.seedWarnings = seed.status === "ok-warning" ? seed.warning : null;
    if (wst.seedWarnings) warmupOut = rs.out.trim();
    // segredo transitório: limpo assim que persistido; keySaved reflete o real
    wst.keySaved = plan.keySaved;
    wst.key = "";
    wst.inited = true;
  }
  if (wiz === 5) {
    CFG = await window.mirror.config.get();
    $("view-wizard").classList.add("hidden");
    await enterFrame();
    if (CFG.tools?.pi) openMirrorSession();
    return;
  }
  wiz++;
  renderWizard();
}

/* ============ boot ============ */
async function boot() {
  CFG = await window.mirror.config.get();
  try { wizConnected = await window.mirror.login.providers(); } catch { wizConnected = []; }
  if (CFG.firstRun && CFG.mirrorRoot) {
    // keySaved reflete o .env real já no boot: num retry/restart após falha, a
    // chave preservada mantém o passo marcado como configurado.
    wst.keySaved = initialKeySaved(CFG.hasKey);
    $("view-wizard").classList.remove("hidden");
    wiz = 0;
    renderWizard();
    return;
  }
  enterFrame();
}

async function enterFrame() {
  $("view-frame").classList.remove("hidden");
  $("btn-open-session").addEventListener("click", openMirrorSession);
  $("btn-goto-setup").addEventListener("click", () => { activeView = "setup"; render(); });
  activeView = "sessions";
  render();
  // Sessões abrem sem warm-up: uma falha do Mirror nunca impede conversar no
  // Pi (a corrida de bootstrap foi resolvida pelo lock cross-process do #31).
  // Diagnóstico do Mirror é explícito e opcional, no ⚙ Setup.
  if (!CFG.mirrorRoot || !CFG.tools.uv) {
    flashEmpty("Mirror ainda não instalado por completo",
      CFG.mirrorRoot ? "uv ausente — instale os pré-requisitos no Setup." : "Instalação não encontrada — rode o instalador ou o bootstrap.", true);
  }
}

boot();
