#!/usr/bin/env bash
# CV21.DS2 -- the Mirror Plugin & MCP Foundation route.
#
# One command per step. Each prints what it measured (✓ / ✗ / •) and the
# evidence to read, and every runtime step starts with the runtime's version,
# binary, and date (the evidence rule). Adapted from CV21.DS12's route.
#
#   bash route.sh setup         scratch install, scratch homes, real-config baseline
#   bash route.sh entry         US6 spike: the candidate MCP entries through the three runtimes
#   bash route.sh static        TS5 validation, the entry as rendered and as written,
#                               the inject forms, the scripted journey (no model call)
#   bash route.sh live-claude   the Navigator's session (likewise live-codex, live-grok)
#   bash route.sh check         what the three sessions logged, and what started
#   bash route.sh verify        recorded versions vs installed
#   bash route.sh untouched     real runtime configs vs the baseline; scratch-session search
#   bash route.sh clean         remove the scratch directory (and any login in it)
#
# Everything lives under DS2_DIR (default /tmp/cv21-ds2). The static steps never
# read or write your real Mirror home, ~/.config/mirror, ~/.claude, ~/.codex,
# or ~/.grok: each runtime runs with a scratch HOME and, where the runtime has
# one, a scratch config variable (CLAUDE_CONFIG_DIR, CODEX_HOME). `untouched`
# READS your real configs and databases, to prove nothing reached them.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)"
SELF="${BASH_SOURCE[0]}"
D_RAW="${DS2_DIR:-/tmp/cv21-ds2}"
NODE_DIR="$(dirname "$(command -v node)")"
REAL_PATH="$PATH"
REAL_HOME="$HOME"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PKG="$D/prefix/lib/node_modules/mirror-mind"
  SHOME="$D/home"                     # the scratch person's HOME
  MHOME="$SHOME/.mirror-minds/ds2"    # their Mirror home (no provider key)
  EVIDENCE="$D/evidence"
}
resolve

need_install() {
  [ -x "$D/prefix/bin/mirror" ] || { echo "No scratch install yet. Run: bash $SELF setup"; exit 2; }
}

# A command as a person who has only the scratch install: scratch HOME, no Mirror
# variable or provider key from your shell, no checkout on the PATH.
as_scratch() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$SHOME" PI_SESSIONS_DIR="$D/pi-sessions" DISABLE_AUTOUPDATER=1 \
    PATH="$D/prefix/bin:$NODE_DIR:/usr/bin:/bin" "$@"
}

# A runtime binary run with a scratch HOME of its own, the runtime's real binary
# path, and the scratch install first on the PATH (so plugin hooks find it).
with_home() {
  local home="$1"; shift
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$home" PI_SESSIONS_DIR="$D/pi-sessions" DISABLE_AUTOUPDATER=1 \
    PATH="$D/prefix/bin:$REAL_PATH" "$@"
}

result() {
  say "Result"
  printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

# The evidence rule: version, binary, and the date, printed at the head of a
# runtime's step and appended to evidence/versions.tsv.
stamp() {
  local cmd="$1" first resolved version when
  first="$(command -v "$cmd" 2>/dev/null || true)"
  if [ -z "$first" ]; then note "$cmd: not installed"; return 1; fi
  resolved="$(readlink -f "$first" 2>/dev/null || echo "$first")"
  version="$("$first" --version 2>&1 | head -1)"
  when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  look "$cmd $version · $first → $resolved · $when"
  mkdir -p "$EVIDENCE"
  printf '%s\t%s\t%s\t%s\t%s\n' "$when" "$cmd" "$version" "$first" "$resolved" >>"$EVIDENCE/versions.tsv"
}

# Keep a command's full output as evidence, and return its exit code.
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  "$@" >"$EVIDENCE/$name.out" 2>&1
  local code=$?
  printf '%s\n' "exit $code" >>"$EVIDENCE/$name.out"
  return $code
}

# The real runtime configuration this route promises not to touch.
REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/hooks .claude/skills
  .claude/plugins/installed_plugins.json .claude/plugins/known_marketplaces.json
  .codex/config.toml .codex/hooks.json .codex/AGENTS.md .codex/skills
  .grok/config.toml .grok/settings.json .grok/hooks .grok/skills .grok/installed-plugins
  .grok/trusted-hook-projects
  .agents/skills .agents/.skill-lock.json
  .config/mirror/env
)

config_manifest() {
  local rel path
  for rel in "${REAL_CONFIG[@]}"; do
    path="$REAL_HOME/$rel"
    if [ -L "$path" ]; then
      printf 'L %s -> %s\n' "$rel" "$(readlink "$path")"
    elif [ -f "$path" ]; then
      printf 'F %s %s\n' "$rel" "$(shasum -a 256 "$path" | cut -d' ' -f1)"
    elif [ -d "$path" ]; then
      find "$path" -maxdepth 3 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else
      printf -- "- %s absent\n" "$rel"
    fi
  done
}

# The three MCP messages a client sends first. What answers them is the server.
MCP_HANDSHAKE='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ds2","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# "<name> <version> · <n> tools" from a server's answers, or "?" parts.
mcp_summary() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
    const lines=s.trim().split("\n").map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const init=lines.find(l=>l.id===1), list=lines.find(l=>l.id===2);
    console.log((init?.result?.serverInfo?.name??"?")+" "+(init?.result?.serverInfo?.version??"?")+" · "+(list?.result?.tools?.length??0)+" tools");})'
}

# Run an MCP entry exactly as written, in an explicit environment, feed it the
# handshake, and summarize. The entry is spawned from Node with that environment
# and nothing else, so a PATH without node or without the npm bin is the
# server's problem, never the harness's.
#   run_entry <evidence name> <entry JSON> <env JSON>
run_entry() {
  local name="$1" entry="$2" envjson="$3"
  mkdir -p "$EVIDENCE"
  printf '%s\n' "$MCP_HANDSHAKE" \
    | (cd "$D/project" && node -e 'const e=JSON.parse(process.argv[1]),env=JSON.parse(process.argv[2]);
        const {spawnSync}=require("child_process");
        const r=spawnSync(e.command,e.args??[],{input:require("fs").readFileSync(0),encoding:"utf8",env});
        process.stdout.write(r.stdout??"");process.stderr.write(r.error?String(r.error)+"\n":(r.stderr??""));process.exitCode=r.status??127;' "$entry" "$envjson") \
    >"$EVIDENCE/$name.out" 2>"$EVIDENCE/$name.err"
  local code=$?
  printf 'exit %s\n' "$code" >>"$EVIDENCE/$name.err"
  mcp_summary <"$EVIDENCE/$name.out"
  return $code
}

# The environments an entry is measured in, as JSON. The Mirror home is named
# explicitly: a server with no home configured exits before the handshake.
env_scratch() {
  node -e 'console.log(JSON.stringify({HOME:process.argv[1],PATH:process.argv[2],MIRROR_HOME:process.argv[3],MIRROR_USER:"ds2",DISABLE_AUTOUPDATER:"1"}))' \
    "$SHOME" "$D/prefix/bin:$NODE_DIR:/usr/bin:/bin" "$MHOME"
}
env_gui() {   # a GUI launch: no npm bin and no node on the PATH, MIRROR_BIN set
  node -e 'console.log(JSON.stringify({HOME:process.argv[1],PATH:"/usr/bin:/bin",MIRROR_BIN:process.argv[2],MIRROR_HOME:process.argv[3],MIRROR_USER:"ds2",DISABLE_AUTOUPDATER:"1"}))' \
    "$SHOME" "$D/prefix/bin" "$MHOME"
}
env_missing() {   # no mirror anywhere it is searched for
  node -e 'console.log(JSON.stringify({HOME:process.argv[1],PATH:"/usr/bin:/bin"}))' "$D/empty-home"
}

# The MCP entry of a plugin directory, as JSON.
plugin_entry() {
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]+"/.claude-plugin/plugin.json","utf8"));process.stdout.write(JSON.stringify(m.mcpServers["mirror-mind"]))' "$1"
}
entry_last_arg() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).args?.slice(-1)[0]??""))'
}
entry_args() {
  node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write((JSON.parse(s).args??[]).join(" ")))'
}

# A local Codex marketplace holding one plugin directory, added to the scratch
# CODEX_HOME, with the plugin installed from it.
codex_install() {
  local dir="$1" label="$2" CX="$D/codex-home" MP="$D/codex-marketplace-$label"
  rm -rf "$CX" "$MP" && mkdir -p "$CX" "$MP/.agents/plugins" "$D/codex-person" && chmod 700 "$CX" "$D/codex-person"
  cp -R "$dir" "$MP/mirror-mind"
  node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({name:"ds2-local",owner:{name:"CV21.DS2 route"},
    plugins:[{name:"mirror-mind",source:{source:"local",path:"./mirror-mind"},description:"Mirror Mind, as the route measures it"}]},null,2)+"\n")' \
    "$MP/.agents/plugins/marketplace.json"
  keep "codex-mp-add-$label" with_home "$D/codex-person" env CODEX_HOME="$CX" codex plugin marketplace add "$MP"
  keep "codex-plugin-add-$label" with_home "$D/codex-person" env CODEX_HOME="$CX" codex plugin add "mirror-mind@ds2-local"
}

# Measure one plugin directory's MCP entry: as written in three environments,
# then as each installed runtime renders and starts it (no model call).
#   measure_entry <label> <plugin dir>
measure_entry() {
  local label="$1" dir="$2" entry summary code line
  entry="$(plugin_entry "$dir")"
  look "$label: $(printf '%s' "$entry" | cut -c1-120)…"

  summary="$(run_entry "entry-$label-scratch" "$entry" "$(env_scratch)")"
  case "$summary" in "mirror-mind "*" · 7 tools") ok "as written, scratch shell: $summary" ;; *) bad "as written, scratch shell: $summary (evidence/entry-$label-scratch.err)" ;; esac

  summary="$(run_entry "entry-$label-gui" "$entry" "$(env_gui)")"
  case "$summary" in "mirror-mind "*" · 7 tools") ok "as written, GUI launch (no npm bin, no node on PATH; MIRROR_BIN set): $summary" ;;
    *) note "as written, GUI launch: $summary — $(head -1 "$EVIDENCE/entry-$label-gui.err" | cut -c1-100)" ;; esac

  # Only measurable where no global install exists: the locator's fallback
  # directories are absolute, and a developer machine usually holds one.
  if [ -x /opt/homebrew/bin/mirror ] || [ -x /usr/local/bin/mirror ] || [ -x "$REAL_HOME/.nvm/current/bin/mirror" ]; then
    note "no mirror anywhere: not measurable here (a global mirror exists in a fallback directory); the unit test covers it on CI"
  else
    summary="$(run_entry "entry-$label-missing" "$entry" "$(env_missing)")"; code=$?
    line="$(head -1 "$EVIDENCE/entry-$label-missing.err" | cut -c1-100)"
    if [ "$code" -eq 1 ] && [ "$(grep -c . "$EVIDENCE/entry-$label-missing.err")" -eq 2 ]; then ok "no mirror anywhere: one line, exit 1 — $line"
    else note "no mirror anywhere: exit $code — $line"; fi
  fi

  if command -v claude >/dev/null; then
    local CH="$D/claude-home" CC="$D/claude-home/.claude" CB
    mkdir -p "$CC/skills" && chmod 700 "$CH"
    rm -f "$CC/skills/mirror-mind" && ln -s "$dir" "$CC/skills/mirror-mind"
    (cd "$D/project" && keep "claude-mcp-list-$label" with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" MIRROR_HOME="$MHOME" MIRROR_USER=ds2 claude mcp list)
    if grep -q "✔ Connected" "$EVIDENCE/claude-mcp-list-$label.out"; then
      ok "Claude Code: \`claude mcp list\` starts it and connects"
      grep -qF -- "$(printf '%s' "$entry" | entry_last_arg)" "$EVIDENCE/claude-mcp-list-$label.out" \
        && ok "Claude Code renders the entry verbatim" || note "Claude Code rendered the entry differently (evidence/claude-mcp-list-$label.out)"
    else bad "Claude Code did not connect (evidence/claude-mcp-list-$label.out)"; fi
    # The binary itself: ~/.local/bin/claude is a symlink, and the PATH below has neither.
    CB="$(readlink -f "$(command -v claude)")"
    (cd "$D/project" && env -i HOME="$CH" USER="$USER" TERM=dumb DISABLE_AUTOUPDATER=1 PATH="/usr/bin:/bin" MIRROR_BIN="$D/prefix/bin" CLAUDE_CONFIG_DIR="$CC" MIRROR_HOME="$MHOME" MIRROR_USER=ds2 "$CB" mcp list >"$EVIDENCE/claude-mcp-list-$label-gui.out" 2>&1)
    grep -q "✔ Connected" "$EVIDENCE/claude-mcp-list-$label-gui.out" \
      && ok "Claude Code, GUI launch (no npm bin, no node on PATH; MIRROR_BIN set): connects" \
      || note "Claude Code, GUI launch: $(grep -oE '✘.{0,70}' "$EVIDENCE/claude-mcp-list-$label-gui.out" | head -1)"
    rm -f "$CC/skills/mirror-mind"
  fi

  if command -v grok >/dev/null; then
    local GH="$D/grok-home"
    mkdir -p "$GH" && chmod 700 "$GH"
    with_home "$GH" grok plugin uninstall mirror-mind >/dev/null 2>&1
    keep "grok-install-$label" with_home "$GH" grok plugin install "$dir" --trust
    (cd "$D/project" && keep "grok-mcp-doctor-$label" with_home "$GH" env MIRROR_HOME="$MHOME" MIRROR_USER=ds2 grok mcp doctor)
    if grep -q "7 tools discovered" "$EVIDENCE/grok-mcp-doctor-$label.out"; then
      ok "Grok: \`grok mcp doctor\` starts it, handshake OK, 7 tools"
      if printf '%s' "$entry" | entry_last_arg | grep -q '\$HOME' && ! grep -q '"\$HOME' "$EVIDENCE/grok-mcp-doctor-$label.out"; then
        note "Grok substituted set environment variables inside the args at load time (evidence/grok-mcp-doctor-$label.out)"
      fi
    else bad "Grok did not reach the handshake (evidence/grok-mcp-doctor-$label.out)"; fi
    with_home "$GH" grok plugin uninstall mirror-mind >/dev/null 2>&1
  fi

  if command -v codex >/dev/null; then
    codex_install "$dir" "$label"
    keep "codex-mcp-get-$label" with_home "$D/codex-person" env CODEX_HOME="$D/codex-home" codex mcp get mirror-mind
    if grep -qF -- "  args: $(printf '%s' "$entry" | entry_args)" "$EVIDENCE/codex-mcp-get-$label.out"; then
      ok "Codex renders the entry verbatim (\`codex mcp get\`); the start is the live session's"
    else note "Codex rendered the entry differently (evidence/codex-mcp-get-$label.out)"; fi
  fi
}

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install, scratch homes, and the real-config baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds2" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW"
  mkdir -p "$D_RAW/prefix" "$D_RAW/home" "$D_RAW/project" "$D_RAW/pi-sessions" "$D_RAW/evidence" \
    && touch "$D_RAW/.ds2"
  chmod 700 "$D_RAW" "$D_RAW/home"
  resolve

  config_manifest >"$D/real-baseline.txt"
  ok "real runtime configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries (untouched compares against it)"

  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed this checkout: $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  if npm install -g --prefix "$D/prefix" "$D/$TARBALL" >"$D/install.log" 2>&1; then
    ok "installed into the scratch prefix: $D/prefix"
  else
    bad "npm install failed (see $D/install.log)"; result; return
  fi
  [ "$(as_scratch sh -c 'command -v mirror')" = "$D/prefix/bin/mirror" ] \
    && ok "mirror resolves to the scratch install" || bad "mirror does not resolve to the scratch install"

  as_scratch mirror init ds2 >"$EVIDENCE/init.out" 2>&1
  as_scratch mirror seed >"$EVIDENCE/seed.out" 2>&1
  [ -f "$MHOME/memory.db" ] && ok "scratch Mirror home created: $MHOME" || bad "no scratch Mirror home (see evidence/init.out)"
  n="$(as_scratch mirror list personas 2>/dev/null | grep -c '^  [a-z]' || true)"
  [ "$n" -ge 12 ] && ok "identity seeded ($n personas)" || bad "seed failed (see evidence/seed.out)"
  grep -q "OPENROUTER_API_KEY" "$SHOME/.config/mirror/env" 2>/dev/null \
    && bad "the scratch config holds a provider key" || ok "the scratch Mirror has no provider key: it cannot spend"
  result
}

# ---------------------------------------------------------------------------
# US6 spike: two candidate entries, measured the same way the static step
# measures the shipped one.
#
# A: an inline POSIX locator, the search mcp/launch.sh runs today, so a GUI
#    launch without the npm bin on its PATH still finds `mirror` through
#    MIRROR_BIN or the global bin directories. No ${...}, no positional
#    parameters, and script variables named so that no exported variable can
#    be substituted into them (Grok substitutes set variables at load time).
# B: the bare bin, `mirror mcp`, PATH only.
LOCATOR='mmbin=""; [ -n "$MIRROR_BIN" ] && [ -x "$MIRROR_BIN/mirror" ] && mmbin="$MIRROR_BIN/mirror"; [ -n "$mmbin" ] || mmbin="$(command -v mirror 2>/dev/null)"; for mmdir in "$HOME/.nvm/current/bin" /opt/homebrew/bin /usr/local/bin; do [ -n "$mmbin" ] && break; [ -x "$mmdir/mirror" ] && mmbin="$mmdir/mirror"; done; [ -n "$mmbin" ] || { echo "mirror-mind: mirror not found on PATH; the MCP server cannot start. Install mirror-mind (npm install -g mirror-mind) or set MIRROR_BIN to its bin directory." >&2; exit 1; }; mmnode="$MIRROR_NODE"; [ -n "$mmnode" ] && [ -x "$mmnode" ] || mmnode="$(command -v node 2>/dev/null)"; for mmdir in "$(dirname "$mmbin")" "$HOME/.nvm/current/bin" /opt/homebrew/bin /usr/local/bin; do [ -n "$mmnode" ] && break; [ -x "$mmdir/node" ] && mmnode="$mmdir/node"; done; [ -n "$mmnode" ] || { echo "mirror-mind: node not found on PATH; the MCP server cannot start. Set MIRROR_NODE." >&2; exit 1; }; exec "$mmnode" "$mmbin" mcp'

candidate_entry() {
  case "$1" in
    A) node -e 'process.stdout.write(JSON.stringify({command:"/bin/sh",args:["-c",process.argv[1]]}))' "$LOCATOR" ;;
    B) printf '%s' '{"command":"mirror","args":["mcp"]}' ;;
  esac
}

# A plugin copy whose manifest carries the candidate entry.
candidate_plugin() {
  local which="$1" dir="$D/candidates/$1"
  rm -rf "$dir" && mkdir -p "$(dirname "$dir")" && cp -R "$PKG/plugins/mirror-mind" "$dir"
  candidate_entry "$which" | node -e 'const f=process.argv[1],fs=require("fs");let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
    const m=JSON.parse(fs.readFileSync(f,"utf8"));m.mcpServers={"mirror-mind":JSON.parse(s)};
    fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n");})' "$dir/.claude-plugin/plugin.json"
  printf '%s' "$dir"
}

entry_step() {
  need_install
  say "US6 spike — the candidate MCP entries, as written and as each runtime renders and starts them"
  for cmd in claude codex grok; do stamp "$cmd"; done
  local which dir
  for which in A B; do
    dir="$(candidate_plugin "$which")"
    echo; measure_entry "$which" "$dir"
  done
  result
}

# ---------------------------------------------------------------------------
# The static step: what the shipped package does, with no model call.

# The installed package's plugin, copied out of the tree the way a runtime
# copies it into its cache: no relative path from it reaches the package.
plugin_cache() {
  local CACHE="$D/cache/mirror-mind"
  rm -rf "$CACHE" && mkdir -p "$(dirname "$CACHE")" && cp -R "$PKG/plugins/mirror-mind" "$CACHE"
  printf '%s' "$CACHE"
}

# The scripted journey, per runtime shape, through a plugin copy's wrappers into
# the scratch Mirror home. The payload shapes are DS12's (TS1 binary read, TS2 L11,
# TS4 L8) and Grok's guide; the expected table is the test guide's.
write_journey_js() {
  cat >"$D/journey.js" <<'JS'
const { spawnSync } = require("node:child_process");
const [hooks, shape, session] = process.argv.slice(2);
const forms = {
  claude_code: "/mirror-mind:mm-mirror should I raise my price?",
  codex: "$mirror-mind:mm:mirror should I raise my price?",
  grok_build: "/mm-mirror should I raise my price?",
};
const grok = shape === "grok_build";
const turnKey = { claude_code: "prompt_id", codex: "turn_id", grok_build: "promptId" }[shape];
const prompt = (turn, text) =>
  grok
    ? { hookEventName: "user_prompt_submit", hook_event_name: "UserPromptSubmit", sessionId: session, session_id: session, promptId: turn, prompt: text }
    : { session_id: session, [turnKey]: turn, hook_event_name: "UserPromptSubmit", prompt: text };
const stop = (turn, text) =>
  grok
    ? { hookEventName: "stop", hook_event_name: "Stop", sessionId: session, session_id: session, ...(turn ? { promptId: turn } : { reason: "session_end" }), lastAssistantMessage: text }
    : { session_id: session, ...(turn ? { [turnKey]: turn } : {}), hook_event_name: "Stop", last_assistant_message: text };
const env = { ...process.env, ...(grok ? { GROK_HOOK_EVENT: "stop", GROK_SESSION_ID: session } : {}) };
const steps = [
  ["log-user-prompt.sh", prompt("t1", forms[shape])],
  ["log-assistant-reply.sh", stop("t1", "the Mirror answer")],
  ["log-user-prompt.sh", prompt("t2", "which tools can you see?")],
  ["log-assistant-reply.sh", stop("t2", "seven mirror-mind tools")],
  ["log-assistant-reply.sh", stop("t2", "seven mirror-mind tools")],
  ["log-user-prompt.sh", prompt("t3", "/mm-journeys")],
  ["log-assistant-reply.sh", stop("t3", "the journey list")],
  ...(grok ? [["log-assistant-reply.sh", stop(null, "the journey list")]] : []),
];
let printed = "";
for (const [wrapper, payload] of steps) {
  const r = spawnSync("bash", [`${hooks}/${wrapper}`], { input: JSON.stringify(payload), env, encoding: "utf8" });
  printed += r.stdout;
  if (r.status !== 0) { console.log(`exit ${r.status} from ${wrapper}`); process.exit(1); }
}
console.log(printed === "" ? "silent" : `printed: ${printed.slice(0, 80)}`);
JS
}

static_step() {
  need_install
  say "Static — TS5, US6, US7, and US8 on the shipped package (no model call)"
  for cmd in claude codex grok; do stamp "$cmd"; done
  local CACHE; CACHE="$(plugin_cache)"
  # Session ids of this run's own: the step can be repeated on the same scratch
  # home without a second run appending to the first run's conversations.
  local RUN; RUN="$(date -u +%H%M%S)"

  echo; look "TS5. the plugin against each runtime's validator:"
  local S="$D/validate-config"; rm -rf "$S" && mkdir -p "$S" && chmod 700 "$S"
  keep ts5-claude-validate with_home "$S" env CLAUDE_CONFIG_DIR="$S" claude plugin validate "$PKG/plugins/mirror-mind"
  tail -2 "$EVIDENCE/ts5-claude-validate.out" | show
  if grep -q "Validation passed" "$EVIDENCE/ts5-claude-validate.out" && ! grep -qi "warning" "$EVIDENCE/ts5-claude-validate.out"; then
    ok "claude plugin validate: passed, no warnings ($(claude --version 2>&1 | head -1))"
  else bad "claude plugin validate: not a clean pass (evidence/ts5-claude-validate.out)"; fi
  keep ts5-grok-validate with_home "$S" grok plugin validate "$PKG/plugins/mirror-mind"
  grep -q "^exit 0" "$EVIDENCE/ts5-grok-validate.out" \
    && ok "grok plugin validate: passed ($(grok --version 2>&1 | head -1))" || bad "grok plugin validate failed (evidence/ts5-grok-validate.out)"

  echo; look "US6. the shipped MCP entry, as written and as each runtime renders and starts it:"
  measure_entry shipped "$PKG/plugins/mirror-mind"

  echo; look "US7. the plugin's inject wrapper, from a copy outside the tree, fed each form (bytes of context):"
  local form out n=0
  for form in "/mm:mirror" "/mirror-mind:mm-mirror" "/mirror-mind:mm:mirror" "\$mirror-mind:mm:mirror" "/mm-mirror" "\$mm-mirror"; do
    n=$((n + 1))
    out="$(node -e 'process.stdout.write(JSON.stringify({session_id:process.argv[1],prompt:process.argv[2]+" should I raise my price?"}))' "ds2-inject-$RUN-$n" "$form" \
      | (cd "$D/project" && as_scratch bash "$CACHE/hooks/mirror-inject.sh") 2>/dev/null | wc -c | tr -d ' ')"
    [ "$out" -gt 0 ] && ok "$form: $out bytes" || bad "$form: no context"
  done
  for form in "/mm-mirrors" "/mm:journeys"; do
    n=$((n + 1))
    out="$(node -e 'process.stdout.write(JSON.stringify({session_id:process.argv[1],prompt:process.argv[2]+" should I raise my price?"}))' "ds2-inject-$RUN-$n" "$form" \
      | (cd "$D/project" && as_scratch bash "$CACHE/hooks/mirror-inject.sh") 2>/dev/null | wc -c | tr -d ' ')"
    [ "$out" -eq 0 ] && ok "$form (not the Mirror skill): nothing" || bad "$form: $out bytes of context"
  done

  echo; look "US8. the scripted journey, per runtime shape, through the plugin copy's wrappers:"
  write_journey_js
  local shape result rows expected skips before
  before="$( [ -f "$MHOME/hooks.log" ] && wc -l <"$MHOME/hooks.log" | tr -d ' ' || echo 0)"
  for shape in claude_code codex grok_build; do
    result="$(cd "$D/project" && as_scratch node "$D/journey.js" "$CACHE/hooks" "$shape" "ds2-journey-$shape-$RUN")"
    rows="$(sqlite3 "$MHOME/memory.db" "SELECT group_concat(m.role || ':' || ifnull(json_extract(m.metadata,'\$.turn_id'),'-') || ':' || m.content, ' | ') FROM (SELECT m.* FROM messages m JOIN runtime_sessions s ON s.conversation_id = m.conversation_id WHERE s.session_id = 'ds2-journey-$shape-$RUN' ORDER BY m.created_at, m.rowid) m")"
    expected="user:t1:should I raise my price? | assistant:t1:the Mirror answer | user:t2:which tools can you see? | assistant:t2:seven mirror-mind tools"
    local label
    label="$(sqlite3 "$MHOME/memory.db" "SELECT c.interface || '/' || s.interface FROM runtime_sessions s JOIN conversations c ON c.id = s.conversation_id WHERE s.session_id = 'ds2-journey-$shape-$RUN'")"
    if [ "$rows" = "$expected" ] && [ "$label" = "$shape/$shape" ] && [ "$result" = "silent" ]; then
      ok "$shape: the four rows, labelled $shape on the conversation and the session, nothing printed"
    else
      bad "$shape: $result · $label · $rows"
    fi
  done
  skips="$(tail -n +"$((before + 1))" "$MHOME/hooks.log" 2>/dev/null | grep -c 'reply skipped: nothing_waiting' || true)"
  [ "$skips" = "4" ] && ok "hooks.log counted 4 skipped replies (a command turn per shape, and Grok's session-end Stop), without their text" \
    || bad "hooks.log counted $skips skipped replies, expected 4"
  if tail -n +"$((before + 1))" "$MHOME/hooks.log" 2>/dev/null | grep -qE "journey list|raise my price|mirror-mind tools"; then
    bad "hooks.log quotes a prompt or a reply"
  else ok "hooks.log quotes no prompt and no reply"; fi
  result
}

# ---------------------------------------------------------------------------
# The Navigator's live sessions: one per runtime, two turns each, all scratch.

# The person's config file a real install has: it names the Mirror home, so a
# runtime that hands a hook or a server a filtered environment still finds it.
person_home() {
  local home="$1"
  mkdir -p "$home/.config/mirror" && chmod 700 "$home"
  printf 'MIRROR_HOME=%s\n' "$MHOME" >"$home/.config/mirror/env"
}

live_prepare() {
  local rt="$1"
  LIVE="$D/live/$rt"
  [ -d "$LIVE" ] && mv "$LIVE" "$LIVE.$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$LIVE" && chmod 700 "$D/live"
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$LIVE/id"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$LIVE/started"
  stamp "$2"
  ID="$(cat "$LIVE/id")"
}

# The session's environment: the scratch install first on the PATH, the scratch
# Mirror home named as a consistent pair (MIRROR_HOME's last segment is the user,
# and the environment outranks every config file), no provider key, no Pi history.
#
# Unsetting MIRROR_USER is not enough: Mirror's config loader fills an unset
# variable from the person's config file, so a session that keeps a real HOME
# (Claude Code's, for its login) read MIRROR_USER -- and OPENROUTER_API_KEY --
# from the real ~/.config/mirror/env. The first live run met that as a home
# conflict. Each runtime's session therefore also gets a config directory of
# its own (live_claude), or a scratch HOME (Codex, Grok), and `preflight`
# resolves what the session's Mirror processes will see before a turn is spent.
session_env() {
  SESSION_ENV=(env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u OPENROUTER_API_KEY
    MIRROR_USER=ds2 MIRROR_HOME="$MHOME" PI_SESSIONS_DIR="$D/pi-sessions" PATH="$D/prefix/bin:$REAL_PATH")
}

# Resolve the Mirror home and the provider key exactly as the session's Mirror
# processes will -- the same loader, the same entry, the session's environment
# -- and stop before the runtime starts if either is wrong.
#   preflight [HOME the runtime runs with]
preflight() {
  local home="${1:-}" out
  out="$("${SESSION_ENV[@]}" ${home:+HOME="$home"} node --no-warnings --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { loadConfiguration } = await import(pathToFileURL(process.argv[1]).href);
    const { resolveMirrorHome } = await import(pathToFileURL(process.argv[2]).href);
    loadConfiguration({ entryPath: process.argv[3] });
    let home;
    try { home = resolveMirrorHome(process.env); } catch (error) { home = "ERROR: " + error.message; }
    console.log(home + "\t" + (process.env.OPENROUTER_API_KEY ? "a provider key" : "no provider key"));
  ' "$ROOT/ts/src/runtime/config.ts" "$ROOT/ts/src/frontDoor/dbPath.ts" "$PKG/ts/src/frontDoor/cli.ts" 2>&1)"
  if [ "$out" = "$MHOME"$'\t'"no provider key" ]; then
    ok "preflight: the session's Mirror resolves the scratch home, with no provider key"
  else
    bad "preflight: the session's Mirror would see: $out"
    echo "  Not starting the session: no turn spent."; exit 2
  fi
}

turns_text() {
  local form="$1" rt="$2"
  cat <<EOF

  Two turns, typed exactly. Approve any trust or permission prompt the runtime shows.

    Turn 1:  $form DS2-$ID: should I raise my course price from 297 to 497 reais?
             Expect: Mirror Mode answers, in the first person.

    Turn 2:  DS2-$ID probe: without using any tool, list the names of the tools you have
             from an MCP server called mirror-mind, or say NONE.

  Then quit the session, and run:   bash $SELF check $rt
EOF
}

live_claude() {
  need_install
  say "Live — Claude Code"
  live_prepare claude claude
  local CACHE; CACHE="$(plugin_cache)"
  # A scratch config dir: your ~/.claude/skills already loads Mirror, and a second
  # mirror-mind would load beside this copy. Claude Code keeps its login outside it.
  local CC="$D/claude-live/.claude" XDG="$D/claude-live/config"
  mkdir -p "$CC" "$XDG/mirror" && chmod 700 "$D/claude-live"
  # Claude Code keeps your HOME (its login lives outside the config dir), so
  # Mirror's config file comes from a directory of the session's own: the one
  # a real install has, naming only the scratch home.
  printf 'MIRROR_HOME=%s\n' "$MHOME" >"$XDG/mirror/env"
  # Claude Code holds a server that failed back for 15 minutes, in this config
  # dir. An earlier attempt's failure must not decide this one.
  if [ -f "$CC/mcp-needs-auth-cache.json" ]; then
    cp "$CC/mcp-needs-auth-cache.json" "$LIVE/mcp-needs-auth-cache.before.json"
    rm -f "$CC/mcp-needs-auth-cache.json"
    note "cleared Claude Code's remembered MCP failure from an earlier attempt (kept in $LIVE)"
  fi
  session_env
  SESSION_ENV+=(CLAUDE_CONFIG_DIR="$CC" XDG_CONFIG_HOME="$XDG")
  preflight
  note "Claude Code runs with a scratch config dir ($CC), a scratch Mirror config ($XDG/mirror/env), and the plugin copy $CACHE."
  turns_text "/mirror-mind:mm-mirror" claude
  local P="$D/project-claude"
  rm -rf "$P" && mkdir -p "$P"
  [ "${DS2_DRY:-0}" = 1 ] && { note "DS2_DRY=1: prepared, session not started"; return 0; }
  cd "$P" && exec "${SESSION_ENV[@]}" claude --plugin-dir "$CACHE"
}

# A minimal MCP server that records the NAMES of the variables Codex hands it,
# never their values, and offers no tool.
write_env_probe() {
  cat >"$D/live/env-probe.js" <<'JS'
const fs = require("node:fs");
fs.writeFileSync(process.argv[2], Object.keys(process.env).sort().join("\n") + "\n");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === undefined) continue;
    const result = msg.method === "initialize"
      ? { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "ds2-env-probe", version: "0" } }
      : msg.method === "tools/list" ? { tools: [] } : null;
    process.stdout.write(JSON.stringify(result ? { jsonrpc: "2.0", id: msg.id, result }
      : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no such method" } }) + "\n");
  }
});
JS
}

live_codex() {
  need_install
  say "Live — Codex"
  live_prepare codex codex
  local CX="$D/codex-live" PERSON="$D/codex-live-person"
  [ -f "$CX/auth.json" ] || { rm -rf "$CX" && mkdir -p "$CX" && chmod 700 "$CX"; }
  person_home "$PERSON"
  local MP="$D/codex-live-marketplace"
  rm -rf "$MP" && mkdir -p "$MP/.agents/plugins" && cp -R "$PKG/plugins/mirror-mind" "$MP/mirror-mind"
  node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({name:"ds2-live",owner:{name:"CV21.DS2 route"},
    plugins:[{name:"mirror-mind",source:{source:"local",path:"./mirror-mind"},description:"Mirror Mind, this package"}]},null,2)+"\n")' \
    "$MP/.agents/plugins/marketplace.json"
  with_home "$PERSON" env CODEX_HOME="$CX" codex plugin uninstall mirror-mind@ds2-live >/dev/null 2>&1 || true
  with_home "$PERSON" env CODEX_HOME="$CX" codex plugin marketplace add "$MP" >"$LIVE/marketplace.out" 2>&1 || true
  with_home "$PERSON" env CODEX_HOME="$CX" codex plugin add mirror-mind@ds2-live >"$LIVE/plugin-add.out" 2>&1 || true
  tail -1 "$LIVE/plugin-add.out" | show
  write_env_probe
  with_home "$PERSON" env CODEX_HOME="$CX" codex mcp remove ds2-env-probe >/dev/null 2>&1 || true
  with_home "$PERSON" env CODEX_HOME="$CX" codex mcp add ds2-env-probe -- "$NODE_DIR/node" "$D/live/env-probe.js" "$LIVE/mcp-env-names.txt" >/dev/null 2>&1 \
    && note "a probe MCP server (ds2-env-probe, no tools) records which variable NAMES Codex hands a server"
  [ -f "$CX/auth.json" ] || note "Codex will ask you to log in: that login is stored in $CX only."
  note "Codex asks once to trust the plugin's hooks: trust them."
  session_env
  preflight "$PERSON"
  turns_text "\$mirror-mind:mm:mirror" codex
  local P="$D/project-codex"
  rm -rf "$P" && mkdir -p "$P"
  [ "${DS2_DRY:-0}" = 1 ] && { note "DS2_DRY=1: prepared, session not started"; return 0; }
  cd "$P" && exec "${SESSION_ENV[@]}" HOME="$PERSON" CODEX_HOME="$CX" codex
}

live_grok() {
  need_install
  say "Live — Grok Build"
  live_prepare grok grok
  local GH="$D/grok-live"
  [ -d "$GH/.grok" ] || { rm -rf "$GH" && mkdir -p "$GH"; }
  person_home "$GH"
  with_home "$GH" grok plugin uninstall mirror-mind >/dev/null 2>&1 || true
  with_home "$GH" grok plugin install "$PKG/plugins/mirror-mind" --trust >"$LIVE/plugin-install.out" 2>&1 || true
  tail -1 "$LIVE/plugin-install.out" | show
  rm -f "$GH/.grok/logs/mcp/mirror-mind.stderr.log"
  local P="$D/project-grok"
  rm -rf "$P" && mkdir -p "$P" && cp "$PKG/AGENTS.md" "$P/AGENTS.md"
  note "the project has Mirror's AGENTS.md: Grok shows a SessionStart message on screen only (DS12.TS4 L2)."
  [ -f "$GH/.grok/auth.json" ] || note "Grok will ask you to log in: that login is stored in $GH only."
  session_env
  preflight "$GH"
  turns_text "/mm-mirror" grok
  [ "${DS2_DRY:-0}" = 1 ] && { note "DS2_DRY=1: prepared, session not started"; return 0; }
  cd "$P" && exec "${SESSION_ENV[@]}" HOME="$GH" grok
}

# What a live session left in the scratch Mirror home, and what started.
check_step() {
  local rt="${1:-}"
  need_install
  case "$rt" in claude|codex|grok) ;; *) echo "usage: bash $SELF check <claude|codex|grok>"; exit 2 ;; esac
  # A plain case, never one inside $(...): macOS's /bin/bash 3.2 cannot parse
  # a case pattern's `)` inside a command substitution.
  local LIVE="$D/live/$rt" label=""
  case "$rt" in
    claude) label=claude_code ;;
    codex) label=codex ;;
    grok) label=grok_build ;;
  esac
  [ -f "$LIVE/started" ] || { echo "No $rt session recorded; run: bash $SELF live-$rt"; exit 2; }
  local START ID CONV
  START="$(cat "$LIVE/started")"; ID="$(cat "$LIVE/id")"
  say "Check — what the $rt session left (DS2-$ID, since $START)"
  CONV="$(sqlite3 "$MHOME/memory.db" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE '%DS2-$ID%' ORDER BY c.started_at LIMIT 1")"
  if [ -z "$CONV" ]; then
    # Turns typed from an earlier run's output carry that run's marker. The
    # session is still the one that started after this step: find it by time.
    local FOUND COUNT
    FOUND="$(sqlite3 "$MHOME/memory.db" "SELECT id FROM conversations WHERE substr(started_at,1,19) >= substr('$START',1,19) ORDER BY started_at")"
    COUNT="$(printf '%s' "$FOUND" | grep -c . || true)"
    if [ "$COUNT" = "1" ]; then
      CONV="$FOUND"
      note "no message carries DS2-$ID; the one conversation started since $START carries $(sqlite3 "$MHOME/memory.db" "SELECT group_concat(DISTINCT substr(content, instr(content, 'DS2-'), 10)) FROM messages WHERE conversation_id = '$CONV' AND content LIKE '%DS2-%'") (turns typed from an earlier run): checking it"
    else
      bad "no conversation in the scratch home holds DS2-$ID, and $COUNT started since $START"; result; return
    fi
  fi
  local LABELS
  LABELS="$(sqlite3 "$MHOME/memory.db" "SELECT c.interface || ' / ' || ifnull((SELECT group_concat(DISTINCT s.interface) FROM runtime_sessions s WHERE s.conversation_id = c.id), '-') FROM conversations c WHERE c.id = '$CONV'")"
  [ "$LABELS" = "$label / $label" ] && ok "conversation / runtime session: $LABELS" || bad "conversation / runtime session: $LABELS (expected $label / $label)"
  look "its messages (role · turn id · text):"
  sqlite3 -separator ' · ' "$MHOME/memory.db" "SELECT role, ifnull(json_extract(metadata,'\$.turn_id'),'-'), substr(replace(content, char(10), ' '), 1, 90) FROM messages WHERE conversation_id = '$CONV' ORDER BY created_at, rowid" | show
  local PAIRS
  PAIRS="$(sqlite3 "$MHOME/memory.db" "SELECT group_concat(role, ',') FROM (SELECT role FROM messages WHERE conversation_id = '$CONV' ORDER BY created_at, rowid)")"
  case "$PAIRS" in
    user,assistant,user,assistant) ok "two turns, each prompt followed by one reply" ;;
    *) bad "roles in order: $PAIRS (expected user,assistant,user,assistant)" ;;
  esac
  local UNPAIRED
  UNPAIRED="$(sqlite3 "$MHOME/memory.db" "SELECT count(*) FROM messages a WHERE a.conversation_id = '$CONV' AND a.role = 'assistant' AND json_extract(a.metadata,'\$.turn_id') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM messages u WHERE u.conversation_id = a.conversation_id AND u.role = 'user' AND json_extract(u.metadata,'\$.turn_id') = json_extract(a.metadata,'\$.turn_id'))")"
  [ "$UNPAIRED" = "0" ] && ok "every reply carries its prompt's turn id" || bad "$UNPAIRED reply(ies) carry a turn id no prompt carries"
  local UNMARKED
  UNMARKED="$(sqlite3 "$MHOME/memory.db" "SELECT count(*) FROM messages WHERE conversation_id = '$CONV' AND role = 'assistant' AND json_extract(metadata,'\$.turn_id') IS NULL")"
  [ "$UNMARKED" = "0" ] && ok "every reply came from the Stop hook (each carries a turn id)" \
    || bad "$UNMARKED assistant row(s) without a turn id: written by hand (mirror mirror log) or by a backfill, not by the Stop hook"
  if sqlite3 "$MHOME/memory.db" "SELECT content FROM messages WHERE conversation_id = '$CONV' AND role = 'user' ORDER BY created_at LIMIT 1" | grep -qE '^[/$]'; then
    bad "the Mirror question was logged with its form"
  else ok "the Mirror question was logged without its form"; fi
  look "turn 2's reply, to compare with what you saw:"
  sqlite3 "$MHOME/memory.db" "SELECT content FROM messages WHERE conversation_id = '$CONV' AND role = 'assistant' ORDER BY created_at DESC, rowid DESC LIMIT 1" | head -12 | show
  local SKIPS
  SKIPS="$(awk -v s="$START" 'substr($1,1,19) >= substr(s,1,19)' "$MHOME/hooks.log" 2>/dev/null | grep -c 'reply skipped: nothing_waiting' || true)"
  if [ "$rt" = grok ]; then
    note "skipped-reply lines since the session started: $SKIPS (Grok's session-end Stop accounts for one)"
  else
    [ "$SKIPS" = "0" ] && ok "no reply skipped for want of a prompt (the async race did not show)" \
      || note "$SKIPS reply(ies) skipped for want of a prompt: the async race, which decides the prompt logger's async"
  fi
  awk -v s="$START" 'substr($1,1,19) >= substr(s,1,19)' "$MHOME/hooks.log" 2>/dev/null | grep -v 'reply skipped' | grep . \
    && bad "hooks.log recorded a failure (above)" || ok "no hook recorded a failure"
  case "$rt" in
    claude|codex)
      local TOOLS
      TOOLS="$(sqlite3 "$MHOME/memory.db" "SELECT content FROM messages WHERE conversation_id = '$CONV' AND role = 'assistant' ORDER BY created_at DESC, rowid DESC LIMIT 1" | grep -oE 'mirror_context|list_journeys|journey_status|search_memories|list_conversations|recall_conversation|detect_persona' | sort -u | wc -l | tr -d ' ')"
      [ "$TOOLS" = "7" ] && ok "the MCP server: turn 2's reply names all 7 of its tools" \
        || bad "the MCP server: turn 2's reply names $TOOLS of its 7 tools (read the reply above)"
      ;;
    grok)
      local LOG="$D/grok-live/.grok/logs/mcp/mirror-mind.stderr.log"
      if [ -f "$LOG" ] && [ ! -s "$LOG" ]; then ok "Grok started the server: its stderr log exists and is empty (attachment is DS10's)"
      elif [ -f "$LOG" ]; then bad "Grok's server log holds: $(head -1 "$LOG" | cut -c1-120)"
      else note "Grok wrote no mirror-mind.stderr.log"; fi
      ;;
  esac
  if [ "$rt" = codex ]; then
    if [ -f "$LIVE/mcp-env-names.txt" ]; then
      look "variables Codex handed an MCP server (names only): $(grep -E '^(PATH|HOME|MIRROR_BIN|MIRROR_NODE|MIRROR_HOME|MIRROR_USER|CLAUDE_PLUGIN_ROOT)$' "$LIVE/mcp-env-names.txt" | tr '\n' ' ')"
      look "all names: $(tr '\n' ' ' <"$LIVE/mcp-env-names.txt" | cut -c1-200)"
    else note "the env probe recorded nothing (Codex did not start it)"; fi
    local ENDED
    ENDED="$(sqlite3 "$MHOME/memory.db" "SELECT ifnull(ended_at, 'open') FROM conversations WHERE id = '$CONV'")"
    note "Codex's conversation at exit: $ENDED (a finding, DS4's: DS12.TS2 L8)"
  fi
  result
}

# ---------------------------------------------------------------------------
untouched() {
  say "Untouched — real runtime configs vs the baseline, and the real Mirror homes"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run: bash $SELF setup"; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "no real runtime configuration file changed"
  else
    bad "real configuration changed since setup:"; show <"$D/real-diff.txt"
  fi
  local hit=0 db
  for db in "$REAL_HOME"/.mirror-minds/*/memory.db "$REAL_HOME"/.mirror/*/memory.db; do
    [ -f "$db" ] || continue
    if sqlite3 "$db" "SELECT count(*) FROM runtime_sessions WHERE session_id LIKE 'ds2-%'" 2>/dev/null | grep -qv '^0$'; then
      bad "a scratch session reached $db"; hit=1
    fi
  done
  [ "$hit" -eq 0 ] && ok "no scratch session in a real Mirror home"
  # The live sessions' turns carry DS2-<id>; none may reach a real Mirror home.
  local id
  for id in $(cat "$D"/live/*/id 2>/dev/null); do
    for db in "$REAL_HOME"/.mirror-minds/*/memory.db "$REAL_HOME"/.mirror/*/memory.db; do
      [ -f "$db" ] || continue
      if sqlite3 "$db" "SELECT count(*) FROM messages WHERE content LIKE '%DS2-$id%'" 2>/dev/null | grep -qv '^0$'; then
        bad "a live turn (DS2-$id) reached $db"; hit=1
      fi
    done
  done
  [ "$hit" -eq 0 ] && ok "no live turn in a real Mirror home"
  result
}

clean() {
  say "Clean"
  if [ -f "$D_RAW/.ds2" ]; then
    rm -rf "$D_RAW" && ok "removed $D_RAW (scratch install, homes, evidence, and any login made inside)"
  else
    note "nothing to remove at $D_RAW"
  fi
}

verify() {
  say "Verify — recorded versions vs installed"
  [ -f "$EVIDENCE/versions.tsv" ] || { note "no versions recorded yet"; return; }
  local cmd recorded installed
  for cmd in claude codex grok; do
    recorded="$(awk -F'\t' -v c="$cmd" '$2==c{v=$3} END{print v}' "$EVIDENCE/versions.tsv")"
    installed="$("$cmd" --version 2>&1 | head -1)"
    [ "$recorded" = "$installed" ] && ok "$cmd: $installed (as recorded)" || bad "$cmd: installed $installed, recorded $recorded"
  done
  result
}

# ---------------------------------------------------------------------------
case "${1:-}" in
  setup) setup ;;
  entry) entry_step ;;
  static) static_step ;;
  live-claude) live_claude ;;
  live-codex) live_codex ;;
  live-grok) live_grok ;;
  check) check_step "${2:-}" ;;
  untouched) untouched ;;
  clean) clean ;;
  verify) verify ;;
  *) sed -n '2,20p' "$SELF"; exit 2 ;;
esac
