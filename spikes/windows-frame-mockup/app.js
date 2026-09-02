/* Mirror Mind — mockup funcional (Fusão A+C)
   Experimento 1 da ES-004. Tudo simulado; a arquitetura espelha comandos reais. */
"use strict";

/* ============================== estado ============================== */
const S = {
  load() {
    try { return JSON.parse(localStorage.getItem("mm-mock") || "{}"); } catch { return {}; }
  },
  save(st) { localStorage.setItem("mm-mock", JSON.stringify(st)); },
  clear() { localStorage.removeItem("mm-mock"); },
};
let st = Object.assign({
  setupDone: false, user: "", keyOk: false, anthropic: false, openai: false,
}, S.load());

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

/* ============================== dados ============================== */
const MODES = [
  { cls: "m1", name: "Mirror",   desc: "reflexão, decisões e sensemaking pessoal" },
  { cls: "m2", name: "Builder",  desc: "código, projetos e construção" },
  { cls: "m3", name: "Explorer", desc: "incerteza mantida viva antes de construir" },
  { cls: "m4", name: "Soul",     desc: "escuta ritual da vida interior" },
];

const PERSONAS = [
  { id: "engineer",   name: "engineer",   desc: "software, arquitetura, debugging, testes",
    kw: ["código", "codigo", "bug", "erro", "arquitetura", "teste", "deploy", "api", "banco", "refator", "implementar"] },
  { id: "strategist", name: "strategist", desc: "negócio, posicionamento, lançamentos",
    kw: ["preço", "preco", "precificar", "mercado", "piloto", "lançar", "lancar", "negócio", "negocio", "cliente", "produto", "estratégia", "estrategia", "concorr"] },
  { id: "therapist",  name: "therapist",  desc: "tensões psicológicas e emoções",
    kw: ["inseguro", "insegura", "medo", "ansios", "cansad", "culpa", "sinto", "angústia", "angustia", "sobrecarregad"] },
  { id: "writer",     name: "writer",     desc: "textos, narrativa, edição",
    kw: ["texto", "escrever", "artigo", "post", "capítulo", "capitulo", "narrativa", "revisar"] },
  { id: "coach",      name: "coach",      desc: "hábitos, metas, accountability",
    kw: ["hábito", "habito", "rotina", "meta", "foco", "disciplina", "procrastin", "consistência", "consistencia"] },
  { id: "teacher",    name: "teacher",    desc: "aulas, didática, preparo de conteúdo",
    kw: ["aula", "ensinar", "didática", "didatica", "turma", "curso"] },
  { id: "researcher", name: "researcher", desc: "investigação, fontes, síntese",
    kw: ["pesquisa", "fontes", "paper", "estudo", "evidência", "evidencia"] },
  { id: "doctor",     name: "doctor",     desc: "saúde e hábitos de vida",
    kw: ["saúde", "saude", "exame", "sono", "dieta", "dor"] },
  { id: "financial",  name: "financial",  desc: "finanças pessoais e planejamento",
    kw: ["investimento", "finanças", "financas", "orçamento", "orcamento", "dívida", "divida"] },
  { id: "designer",   name: "designer",   desc: "produto, UX e experiência",
    kw: ["design", "ux", "interface", "usabilidade", "mockup", "protótipo", "prototipo"] },
  { id: "thinker",    name: "thinker",    desc: "filosofia, conceitos, visão de mundo",
    kw: ["sentido", "filosofia", "ética", "etica", "propósito", "proposito"] },
  { id: "prompt-engineer", name: "prompt-engineer", desc: "prompts, agentes e LLMs",
    kw: ["prompt", "llm", "agente", "modelo de linguagem", "contexto"] },
];

const RESP = {
  engineer: [
    "Antes de tocar em código, quero entender a fronteira: qual é o menor comportamento observável que precisa mudar? Se conseguirmos escrever o teste dele primeiro, a implementação vira consequência.\n\nMe descreve o que deveria acontecer — e o que acontece hoje?",
    "Isso cheira a acoplamento: duas responsabilidades dividindo o mesmo módulo. Minha sugestão é isolar a que muda com mais frequência e proteger a outra com um teste de contrato.\n\nQuer que eu proponha essa separação em passos pequenos?",
  ],
  strategist: [
    "Antes de escalar, o piloto precisa provar três coisas: retenção na primeira semana, clareza do onboarding e custo por usuária ativa. Sem esses números, feedback é opinião.\n\nQual das três você consegue medir ainda esta semana?",
    "Preço não é número, é posicionamento. A pergunta anterior é: quem sente a dor com mais urgência — e o que essa pessoa já paga hoje para resolvê-la mal?\n\nMe conta quem é o cliente que você NÃO quer atender.",
  ],
  therapist: [
    "Percebe que você descreveu a situação inteira pelo que pode dar errado. Antes de decidir qualquer coisa, vale nomear: o que exatamente está em risco para você aqui — a coisa em si, ou o que ela diz sobre você?\n\nO que vem primeiro quando você imagina o pior cenário?",
    "Cansaço que não passa com descanso costuma ser conflito, não esforço. Alguma parte de você está sustentando algo que outra parte já decidiu largar?\n\nSe essa tensão tivesse voz, o que ela pediria?",
  ],
  writer: [
    "O texto está tentando servir a dois leitores ao mesmo tempo — e por isso não conversa com nenhum. Escolhe um: quem PRECISA entender isso na primeira leitura?\n\nMe diz quem é, e eu te devolvo a primeira frase.",
  ],
  coach: [
    "Meta sem gatilho vira intenção. Em vez de \"vou fazer mais X\", define: depois de qual evento do seu dia o X acontece, e qual é a versão de 5 minutos dele?\n\nQual é o evento-âncora mais estável da sua manhã?",
  ],
  teacher: [
    "Para essa aula funcionar, inverte: começa pelo erro que todo mundo comete, deixa a turma senti-lo, e só então apresenta o conceito que o resolve. Conceito antes da dor não gruda.\n\nQual é o erro clássico de quem está aprendendo isso?",
  ],
  researcher: [
    "Separa o que sabemos do que estamos assumindo. Eu listaria as 3 afirmações centrais e, para cada uma, a fonte mais forte a favor E a mais forte contra — a segunda coluna é a que muda decisões.\n\nQual afirmação, se caísse, derrubaria o resto?",
  ],
  doctor: [
    "Padrão importa mais que episódio. Há quanto tempo isso se repete, o que melhora e o que piora? E — importante — isso é algo que um profissional já olhou presencialmente?\n\nMe descreve o padrão da última semana.",
  ],
  financial: [
    "Antes de otimizar retorno, protege o fluxo: qual é o custo fixo mensal inegociável, e quantos meses dele você tem em reserva? Essa resposta muda todo o resto.\n\nQuer montar esse número comigo agora?",
  ],
  designer: [
    "O usuário não erra — a interface convida ao erro. Onde exatamente a pessoa hesita? Cada hesitação é uma decisão que empurramos para ela e que o produto deveria ter tomado.\n\nMe descreve o momento de hesitação que você já viu acontecer.",
  ],
  thinker: [
    "Talvez a pergunta não seja \"o que fazer\", mas \"quem você está tentando ser ao fazer\". As opções ficam mais claras quando o critério deixa de ser resultado e passa a ser coerência.\n\nCom qual versão de você essa escolha precisa ser coerente?",
  ],
  "prompt-engineer": [
    "O prompt está pedindo julgamento e formato ao mesmo tempo — separa em duas passadas: primeiro o raciocínio livre, depois a formatação estrita sobre o resultado. Modelos erram menos quando não acumulam papéis.\n\nQuer que eu desenhe as duas etapas?",
  ],
  ego: [
    "Deixa eu te devolver o que ouvi: existe uma decisão em aberto e um desconforto em volta dela que ainda não tem nome. Antes de eu opinar — o que você já sabe que NÃO quer?\n\nComeça por aí que o resto se organiza.",
    "Registrei. Isso conecta com o que você vinha explorando na jornada — e muda uma premissa que tínhamos como estável.\n\nQuer que eu puxe o fio: o que essa novidade invalida do plano atual?",
  ],
};

const JOURNEYS = [
  { id: "luvia",  name: "luvia-companion",  color: "var(--j-luvia)", mode: "Builder",  hint: "MVP em piloto (E4)" },
  { id: "bio",    name: "biovault",         color: "var(--j-bio)",   mode: "Builder",  hint: "pré-RC" },
  { id: "soul",   name: "reflexão pessoal", color: "var(--j-soul)",  mode: "Mirror",   hint: "contínua" },
];

/* ============================== util ============================== */
function detectPersona(text) {
  const t = text.toLowerCase();
  let best = null, second = null;
  for (const p of PERSONAS) {
    let score = 0;
    for (const k of p.kw) if (t.includes(k)) score += 1;
    if (score > 0) {
      const e = { p, score };
      if (!best || score > best.score) { second = best; best = e; }
      else if (!second || score > second.score) second = e;
    }
  }
  if (!best) return null;
  const conf = Math.min(0.55 + best.score * 0.17, 0.95);
  return { persona: best.p, conf, second: second ? second.p : null };
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ============================== vistas ============================== */
function show(view) {
  for (const v of ["view-intro", "view-wizard", "view-frame"]) $(v).classList.add("hidden");
  $(view).classList.remove("hidden");
}

/* ============================== wizard ============================== */
const WSTEPS = ["Boas-vindas", "Identidade", "Chave OpenRouter", "Assinatura de modelos", "Conheça as personas", "Primeira conversa"];
let wiz = 0;

function wizStepsHtml() {
  return WSTEPS.map((s, i) => {
    const cls = i < wiz ? "done" : i === wiz ? "now" : "";
    const n = i < wiz ? "✓" : String(i + 1);
    return `<div class="step ${cls}"><span class="n">${n}</span> ${s}</div>`;
  }).join("");
}

function renderWizard() {
  $("wiz-steps").innerHTML = wizStepsHtml();
  const m = $("wiz-main");
  const nav = (backOk, nextLabel, nextDisabled) => `
    <div class="wiz-nav">
      ${backOk ? '<button class="btn" id="w-back">← Voltar</button>' : ""}
      <button class="btn primary" id="w-next" ${nextDisabled ? "disabled" : ""}>${nextLabel}</button>
    </div>`;

  if (wiz === 0) {
    m.innerHTML = `
      <h2>Bem-vindo ao seu Mirror</h2>
      <p class="sub">O Mirror é um espelho com memória: uma IA que conversa com você
      <b>lembrando quem você é</b> — sua identidade, suas jornadas, suas decisões. Tudo fica
      <b>na sua máquina</b>, num banco local. Nada vai para um servidor nosso.</p>
      <p class="sub">Nos próximos passos vamos: criar sua identidade local, ligar a memória,
      conectar sua assinatura de IA e te apresentar as <b>personas</b> — as lentes que o Mirror
      ativa sozinho conforme o assunto.</p>
      <p class="sub">Leva menos de 5 minutos.</p>
      ${nav(false, "Começar →", false)}`;
  }
  if (wiz === 1) {
    m.innerHTML = `
      <h2>Sua identidade local</h2>
      <p class="sub">Esse nome define <b>sua casa no Mirror</b> — a pasta local onde vivem sua
      memória e identidade (<code>~\\.mirror-minds\\&lt;nome&gt;</code>).</p>
      <div class="field"><label>Seu nome</label>
        <input id="w-user" value="${esc(st.user || "")}" placeholder="ex.: Rodrigo"></div>
      <p class="hint" id="w-user-hint">${st.user ? `Casa: ~\\.mirror-minds\\${esc(st.user)}` : ""}</p>
      ${nav(true, "Criar identidade →", !st.user)}`;
    $("w-user").addEventListener("input", (e) => {
      st.user = e.target.value.trim();
      $("w-user-hint").textContent = st.user ? `Casa: ~\\.mirror-minds\\${st.user}` : "";
      $("w-next").disabled = !st.user;
      S.save(st);
    });
  }
  if (wiz === 2) {
    m.innerHTML = `
      <h2>Ligue a memória (OpenRouter)</h2>
      <p class="sub">A chave OpenRouter alimenta <b>só a memória</b> do Mirror — embeddings e
      extração de memórias. <b>Não é</b> o modelo da conversa (esse vem no próximo passo).
      Crie uma conta em <a href="https://openrouter.ai" target="_blank" rel="noopener">openrouter.ai</a>,
      gere uma chave e adicione ≥ US$5 de crédito.</p>
      <div class="field"><label>Chave OpenRouter</label>
        <input id="w-key" placeholder="sk-or-..." value="${st.keyOk ? "sk-or-••••••••••••7f2" : ""}"></div>
      <button class="btn" id="w-validate" ${st.keyOk ? "disabled" : ""}>Validar chave</button>
      <div class="${st.keyOk ? "valid-ok" : "valid-run"}" id="w-valmsg">${st.keyOk ? "✓ Chave válida — memória ligada" : ""}</div>
      ${nav(true, "Continuar →", !st.keyOk)}`;
    $("w-validate").addEventListener("click", () => {
      const v = $("w-key").value.trim();
      const msg = $("w-valmsg");
      if (!v.startsWith("sk-or-")) { msg.className = "valid-run"; msg.textContent = "A chave OpenRouter começa com sk-or-…"; return; }
      msg.className = "valid-run"; msg.textContent = "Validando com a OpenRouter…";
      setTimeout(() => {
        st.keyOk = true; S.save(st); renderWizard();
      }, REDUCED ? 50 : 900);
    });
  }
  if (wiz === 3) {
    const sub = (ok) => ok ? `<div class="substate ok">● conectada</div>` : `<div class="substate off">○ não conectada</div>`;
    m.innerHTML = `
      <h2>Conecte sua assinatura</h2>
      <p class="sub">A <b>conversa</b> usa a sua assinatura de IA (Anthropic ou OpenAI) através do
      login oficial do Pi — o Mirror <b>nunca vê sua senha</b>. Conecte pelo menos uma.</p>
      <div class="subcards">
        <div class="subcard"><h3>Anthropic</h3><p>Claude (recomendado) — planos Pro/Max</p>
          ${sub(st.anthropic)}<button class="btn" id="w-anth" ${st.anthropic ? "disabled" : ""}>${st.anthropic ? "Conectada" : "Conectar"}</button></div>
        <div class="subcard"><h3>OpenAI</h3><p>GPT — opcional, dá para adicionar depois</p>
          ${sub(st.openai)}<button class="btn" id="w-oai" ${st.openai ? "disabled" : ""}>${st.openai ? "Conectada" : "Conectar"}</button></div>
      </div>
      ${nav(true, "Continuar →", !(st.anthropic || st.openai))}`;
    $("w-anth").addEventListener("click", () => loginSim("Anthropic", () => { st.anthropic = true; S.save(st); renderWizard(); }));
    $("w-oai").addEventListener("click", () => loginSim("OpenAI", () => { st.openai = true; S.save(st); renderWizard(); }));
  }
  if (wiz === 4) {
    m.innerHTML = `
      <h2>As lentes do seu Mirror</h2>
      <p class="sub">Você não escolhe persona — <b>o Mirror escolhe sozinho</b>, pelo assunto.
      Quatro <b>modos</b> definem o tipo de trabalho; as <b>personas</b> são especialistas que
      assinam a resposta com <b>◇</b> quando ativam.</p>
      <div class="modegrid">${MODES.map(x => `<div class="mode ${x.cls}"><b>${x.name}</b><span>${x.desc}</span></div>`).join("")}</div>
      <div class="pgrid">${PERSONAS.slice(0, 6).map(p => `<div class="pcard"><b>${p.name}</b><span>${p.desc}</span></div>`).join("")}</div>
      <p class="hint" style="margin-top:8px">…e mais ${PERSONAS.length - 6} personas. O glossário completo fica na aba <b>◇ Personas</b> do app.</p>
      <div class="tryit"><div class="lbl">Experimente — qual persona responderia?</div>
        <input id="w-try" placeholder='digite algo como "estou inseguro sobre o preço do meu produto"'>
        <div class="res" id="w-tryres"></div></div>
      ${nav(true, "Continuar →", false)}`;
    wireTry("w-try", "w-tryres");
  }
  if (wiz === 5) {
    m.innerHTML = `
      <h2>Tudo pronto, ${esc(st.user || "…")}</h2>
      <p class="sub">Seu Mirror nasce agora — e a partir da primeira conversa ele começa a
      <b>lembrar</b>. Confira:</p>
      <div class="summary">
        ${chk("g", "Identidade", `~\\.mirror-minds\\${esc(st.user || "?")}`)}
        ${chk("g", "Memória (OpenRouter)", "chave validada")}
        ${chk(st.anthropic ? "g" : "y", "Anthropic", st.anthropic ? "conectada" : "não conectada")}
        ${chk(st.openai ? "g" : "y", "OpenAI", st.openai ? "conectada" : "opcional — conecte depois no ⚙ Setup")}
        ${chk("g", "Runtime", "Mirror v0.31.5 · Pi atualizado")}
      </div>
      ${nav(true, "Abrir meu Mirror ◇", false)}`;
  }

  const back = $("w-back"); if (back) back.addEventListener("click", () => { wiz--; renderWizard(); });
  $("w-next").addEventListener("click", () => {
    if (wiz === 5) { st.setupDone = true; S.save(st); enterFrame(true); return; }
    wiz++; renderWizard();
  });
}

function chk(l, name, detail) {
  return `<div class="check"><span class="light ${l}"></span><span class="name">${name}</span><span class="detail">${detail}</span></div>`;
}

function wireTry(inputId, resId) {
  $(inputId).addEventListener("input", (e) => {
    const r = detectPersona(e.target.value);
    const el = $(resId);
    if (!e.target.value.trim()) { el.innerHTML = ""; return; }
    if (!r) { el.innerHTML = "→ o <b>ego</b> responderia (nenhuma persona acima do limiar)"; return; }
    el.innerHTML = `→ ativaria <b>◇ ${r.persona.name}</b> (confiança ${r.conf.toFixed(2)})` +
      (r.second ? ` · segunda: ◇ ${r.second.name}` : "");
  });
}

/* ===================== modal de login simulado ===================== */
function loginSim(provider, done) {
  const modal = $("modal"), term = $("modal-term"), btn = $("modal-close");
  $("modal-title").textContent = "pi /login — terminal";
  modal.classList.remove("hidden");
  btn.disabled = true;
  const lines = [
    `> pi /login ${provider.toLowerCase()}`,
    `Abrindo o navegador para autenticação ${provider}…`,
    `Aguardando confirmação…`,
    `✓ Conectado (plano detectado). Credencial guardada pelo Pi — o Mirror não a vê.`,
  ];
  term.textContent = "";
  let i = 0;
  const step = () => {
    if (i < lines.length) {
      term.textContent += lines[i] + "\n";
      i++;
      setTimeout(step, REDUCED ? 30 : 650);
    } else { btn.disabled = false; }
  };
  step();
  btn.onclick = () => { modal.classList.add("hidden"); done(); };
}

/* ============================== frame ============================== */
let sessions = [];       // {jid, name, color, mode, lines:[{cls,html}]}
let activeSession = 0;   // índice
let activeView = "terminal"; // terminal | personas | setup
let updating = false, updated = false;
let busy = false;

function enterFrame(firstTime) {
  show("view-frame");
  if (sessions.length === 0) {
    openSession(firstTime ? JOURNEYS[2] : JOURNEYS[0], firstTime);
  }
  renderFrame();
}

function bootLines(j, firstTime) {
  const lines = [
    { cls: "dim", html: `mirror v0.31.5 · ${esc(st.user || "convidado")} · jornada: ${esc(j.name)} · modo: ${j.mode}` },
    { cls: "gap", html: "" },
  ];
  if (firstTime) {
    lines.push({ cls: "out", html: "Olá. Eu sou o seu Mirror — e esta é a nossa primeira conversa.\n\nA partir de agora eu lembro: o que você me contar aqui vira memória viva, e as personas certas vão assumir conforme o assunto.\n\nMe conta: no que você está trabalhando — ou o que está pedindo atenção na sua vida agora?" });
  } else {
    lines.push({ cls: "out", html: `Retomando a jornada ${esc(j.name)} (${esc(j.hint)}). Posso te dar o status, ou seguimos de onde paramos?` });
  }
  lines.push({ cls: "gap", html: "" });
  return lines;
}

function openSession(j, firstTime) {
  sessions.push({ jid: j.id, name: j.name, color: j.color, mode: j.mode, persona: null, lines: bootLines(j, firstTime) });
  activeSession = sessions.length - 1;
  activeView = "terminal";
}

function closeSession(i) {
  sessions.splice(i, 1);
  if (activeSession >= sessions.length) activeSession = sessions.length - 1;
  if (sessions.length === 0) { activeView = "setup"; }
  renderFrame();
}

function renderFrame() {
  // abas
  const stz = $("tabstrip");
  const tabs = sessions.map((s, i) => `
    <button class="tab ${activeView === "terminal" && i === activeSession ? "active" : ""}" data-tab="${i}">
      <span class="dot" style="background:${s.color}"></span> ${esc(s.name)}
      ${sessions.length > 0 ? `<span class="x" data-close="${i}" title="fechar sessão">✕</span>` : ""}
    </button>`).join("");
  stz.innerHTML = tabs + `
    <button class="tab newtab" id="tab-new" title="nova sessão">＋</button>
    <div class="tabspacer"></div>
    <button class="tab util ${activeView === "personas" ? "active" : ""}" id="tab-personas">◇ Personas</button>
    <button class="tab util ${activeView === "setup" ? "active" : ""}" id="tab-setup">⚙ Setup</button>`;

  stz.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) return;
    activeSession = +b.dataset.tab; activeView = "terminal"; renderFrame();
  }));
  stz.querySelectorAll("[data-close]").forEach(x => x.addEventListener("click", (e) => {
    e.stopPropagation(); closeSession(+x.dataset.close);
  }));
  $("tab-new").addEventListener("click", journeyMenu);
  $("tab-personas").addEventListener("click", () => { activeView = "personas"; renderFrame(); });
  $("tab-setup").addEventListener("click", () => { activeView = "setup"; renderFrame(); });

  // painéis
  $("panel-terminal").classList.toggle("hidden", activeView !== "terminal" || sessions.length === 0);
  $("panel-personas").classList.toggle("hidden", activeView !== "personas");
  $("panel-setup").classList.toggle("hidden", activeView !== "setup");

  if (activeView === "terminal" && sessions.length > 0) renderTerm();
  if (activeView === "personas") renderPersonas();
  if (activeView === "setup") renderSetup();
  renderStatus();
}

function journeyMenu() {
  const host = $("tab-new");
  const old = host.querySelector(".jmenu"); if (old) { old.remove(); return; }
  const menu = document.createElement("div");
  menu.className = "jmenu";
  menu.innerHTML = `<div class="jm-title">abrir sessão na jornada</div>` +
    JOURNEYS.map(j => `<button data-j="${j.id}"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:${j.color}"></span> ${esc(j.name)} <span style="color:var(--dim);margin-left:auto;font-size:11px">${esc(j.hint)}</span></button>`).join("");
  host.appendChild(menu);
  menu.querySelectorAll("[data-j]").forEach(b => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const j = JOURNEYS.find(x => x.id === b.dataset.j);
    menu.remove(); openSession(j, false); renderFrame();
  }));
  setTimeout(() => document.addEventListener("click", function h(ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", h); }
  }), 0);
}

/* ---------- terminal ---------- */
function renderTerm() {
  const s = sessions[activeSession];
  const out = $("term-out");
  out.innerHTML = s.lines.map(l => l.cls === "gap" ? `<div class="gap"></div>` : `<div class="${l.cls}">${l.html}</div>`).join("");
  out.scrollTop = out.scrollHeight;
  $("term-input").focus();
}

function pushLine(s, cls, html) { s.lines.push({ cls, html }); }

async function stream(s, cls, text) {
  busy = true;
  const out = $("term-out");
  const div = document.createElement("div");
  div.className = cls;
  out.appendChild(div);
  if (REDUCED) { div.innerHTML = esc(text); }
  else {
    for (let i = 0; i <= text.length; i += 3) {
      div.innerHTML = esc(text.slice(0, i));
      out.scrollTop = out.scrollHeight;
      await new Promise(r => setTimeout(r, 12));
    }
    div.innerHTML = esc(text);
  }
  out.scrollTop = out.scrollHeight;
  pushLine(s, cls, esc(text));
  busy = false;
}

const rotation = {};
function pick(personaId) {
  const arr = RESP[personaId] || RESP.ego;
  rotation[personaId] = ((rotation[personaId] ?? -1) + 1) % arr.length;
  return arr[rotation[personaId]];
}

async function handleInput(raw) {
  const s = sessions[activeSession];
  const text = raw.trim();
  if (!text || busy) return;
  pushLine(s, "u", esc(text)); pushLine(s, "gap", "");
  renderTerm();

  // comandos
  if (text.startsWith("/")) { await handleCommand(s, text); return; }

  const det = detectPersona(text);
  await new Promise(r => setTimeout(r, REDUCED ? 30 : 500));
  if (det) {
    s.persona = det.persona.name;
    pushLine(s, "persona", `◇ ${det.persona.name}`); pushLine(s, "gap", "");
    renderTerm();
    await stream(s, "out", pick(det.persona.id));
  } else {
    s.persona = null;
    await stream(s, "out", pick("ego"));
  }
  pushLine(s, "gap", "");
  renderTerm(); renderStatus();
}

async function handleCommand(s, cmd) {
  const c = cmd.toLowerCase().split(/\s+/)[0];
  const put = (t, cls = "out") => { pushLine(s, cls, esc(t)); };
  if (c === "/help" || c === "/mm-help") {
    put("Comandos do mockup:\n  /mm-journeys   lista de jornadas\n  /model         modelos da conversa\n  /mm-mirror     volta ao modo Mirror\n  /help          esta ajuda\n\n(No produto real, todos os comandos mm-* do Mirror estão disponíveis.)");
  } else if (c === "/mm-journeys") {
    put("◇ Jornadas\n" + JOURNEYS.map(j => `  ● ${j.name} — ${j.hint}`).join("\n"));
  } else if (c === "/model") {
    put("Modelos da conversa (Pi):\n  ● claude-sonnet-4.6   ← atual\n  ○ claude-opus-4.6\n" + (st.openai ? "  ○ gpt-5.2\n" : "") + "\nAs personas podem ter default_model próprio (identidade, no banco).");
  } else if (c === "/mm-mirror") {
    s.mode = "Mirror"; s.persona = null;
    put("Modo Mirror ativo. Estou ouvindo.");
  } else {
    put(`Comando ${c} não existe neste mockup — experimente /help.`, "warn");
  }
  pushLine(s, "gap", "");
  renderTerm(); renderStatus();
}

/* ---------- personas ---------- */
function renderPersonas() {
  $("panel-personas").innerHTML = `
    <h2>Personas &amp; Modos</h2>
    <p class="sub">Gerado da sua base local — estas são as lentes que <b>seu</b> Mirror tem.
    Você não escolhe: o Mirror ativa sozinho e assina com ◇.</p>
    <div class="modegrid">${MODES.map(x => `<div class="mode ${x.cls}"><b>${x.name}</b><span>${x.desc}</span></div>`).join("")}</div>
    <div class="pgrid">${PERSONAS.map(p => `<div class="pcard"><b>${p.name}</b><span>${p.desc}</span></div>`).join("")}</div>
    <div class="tryit"><div class="lbl">Experimente — qual persona responderia? (mesma lógica do detect-persona real)</div>
      <input id="p-try" placeholder='ex.: "o deploy quebrou depois do merge"'>
      <div class="res" id="p-tryres"></div></div>`;
  wireTry("p-try", "p-tryres");
}

/* ---------- setup ---------- */
function renderSetup() {
  const open = sessions.length;
  const runtimeDetail = updated ? "v0.31.6 · atualizado agora" : "v0.31.5 · atualização disponível (v0.31.6)";
  $("panel-setup").innerHTML = `
    <h2>Setup do Mirror</h2>
    <p class="sub">Cada item é um check real do health-check. Os botões executam os comandos
    oficiais do Mirror — nada é editado à mão.</p>
    <div class="checks">
      ${chk("g", "Identidade", `MIRROR_USER = ${esc(st.user || "?")} · ~\\.mirror-minds\\${esc(st.user || "?")}`)}
      ${chk("g", "Chave OpenRouter (memória)", "sk-or-••••7f2 · validada")}
      ${chk(st.anthropic ? "g" : "y", "Assinatura Anthropic", st.anthropic ? "conectada via Pi" : "não conectada")}
      ${st.openai ? chk("g", "Assinatura OpenAI", "conectada via Pi")
        : `<div class="check"><span class="light y"></span><span class="name">Assinatura OpenAI</span>
           <span class="detail">não conectada — opcional</span><button class="act" id="su-oai">Conectar (abre /login)</button></div>`}
      ${chk("g", "Modelo padrão", "claude-sonnet-4.6")}
      ${chk("g", "Base local", `memory.db · 42 MB · backup há 2 dias · migrations ok`)}
      <div class="check"><span class="light ${updated ? "g" : "y"}"></span><span class="name">Runtime Mirror</span>
        <span class="detail" id="su-runtime">${runtimeDetail}</span>
        <button class="act" id="su-update" ${open > 0 || updating || updated ? "disabled" : ""}>${updated ? "Atualizado ✓" : "Atualizar Mirror"}</button></div>
      ${chk("g", "Pi (harness)", "@earendil-works/pi-coding-agent · atualizado")}
    </div>
    ${open > 0 && !updated ? `<p class="setup-note">⚠ Para atualizar o Mirror, feche as ${open} sessão(ões) abertas — o update
      nunca roda com conversas ativas (backup + migrations exigem exclusividade).</p>` : ""}
    <p class="setup-note okline" id="su-log"></p>`;
  const oai = $("su-oai");
  if (oai) oai.addEventListener("click", () => loginSim("OpenAI", () => { st.openai = true; S.save(st); renderSetup(); }));
  const up = $("su-update");
  if (up && !up.disabled) up.addEventListener("click", runUpdateSim);
}

async function runUpdateSim() {
  updating = true; renderSetup();
  const log = $("su-log");
  const steps = [
    "① runtime status — pronto (árvore limpa, migrations ok)",
    "② backup do memory.db… ✓ verificado (zip íntegro)",
    "③ git fast-forward stable → v0.31.6… ✓",
    "④ migrations automáticas… ✓ (nenhuma pendente)",
    "⑤ warm-up serializado… ✓ pronto para novas sessões",
  ];
  for (const s2 of steps) {
    log.textContent = s2;
    await new Promise(r => setTimeout(r, REDUCED ? 40 : 750));
  }
  updating = false; updated = true;
  renderSetup();
  $("su-log").textContent = "Update concluído sem reinstalar — o produto é um checkout git por design.";
}

/* ---------- statusbar ---------- */
function renderStatus() {
  const s = sessions[activeSession];
  const left = s && activeView === "terminal"
    ? `<span>◇ <b>${s.persona || "ego"}</b></span><span>modo <b>${s.mode}</b></span><span>modelo <b>claude-sonnet-4.6</b></span>`
    : `<span>◇ <b>Mirror Mind</b></span>`;
  $("statusbar").innerHTML = left +
    `<span class="right"><span>memória <b style="color:var(--ok)">●</b> gravando</span>
     <span>${esc(st.user || "")} · v0.31.${updated ? "6" : "5"}</span></span>`;
}

/* ============================== boot ============================== */
$("btn-first-run").addEventListener("click", () => {
  wiz = 0; show("view-wizard"); renderWizard();
});
$("btn-skip").addEventListener("click", () => {
  st.user = st.user || "Rodrigo"; st.keyOk = true; st.anthropic = true; st.setupDone = true; S.save(st);
  enterFrame(false);
});
$("btn-reset").addEventListener("click", () => {
  S.clear(); location.reload();
});
$("term-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const inp = $("term-input");
  const v = inp.value; inp.value = "";
  handleInput(v);
});

if (st.setupDone) enterFrame(false);
else show("view-intro");
