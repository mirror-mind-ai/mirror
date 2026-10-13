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
  untouched) untouched ;;
  clean) clean ;;
  verify) verify ;;
  *) sed -n '2,20p' "$SELF"; exit 2 ;;
esac
