#!/usr/bin/env bash
# CV21.DS10.TS2 — the MCP server attaches on Grok, or the reason is recorded.
#
# Every step is isolated under a scratch directory (DS10_TS2_DIR, default
# /tmp/cv21-ds10-ts2). The real `grok` binary runs only with a scratch HOME and
# GROK_HOME; the one thing it reads from the real ~/.grok is auth.json, through
# GROK_AUTH_PATH (plan decision 1), and this route never opens that file.
# `untouched` READS the real configuration, to prove nothing else reached it.
#
#   bash route.sh setup         pack, install into a scratch prefix, a seeded
#                               scratch Mirror home, the real-config baseline
#   bash route.sh static        grok mcp list/doctor/inspect on US1's install: no model
#   bash route.sh session S1    the shipped plugin                 (the question)
#   bash route.sh session S3    a control plugin, trivial server   (always, beside S1)
#   bash route.sh session S2    the locator as a config.toml entry (only if S1 fails)
#   bash route.sh session S4    the plugin with .mcp.json beside   (only if S1 fails)
#   bash route.sh untouched     real ~/.grok and ~/.claude configuration vs the baseline
#   bash route.sh clean         remove the scratch directory and any leader it spawned
#
# A session is `grok -p <the fixed prompt>` in headless mode, read by field from
# its streaming-messages-json output and from the scratch ~/.grok/logs/unified.jsonl.
# Raw streams stay under $D/evidence (never committed: session ids, scratch paths,
# the auth scope URL); the summary each step prints is what test-guide.md records.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS10_TS2_DIR:-/tmp/cv21-ds10-ts2}"
MODEL="${DS10_TS2_MODEL:-grok-4.7}"   # the one model `grok models` lists for this account (2026-10-18)
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/prefix"
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  PLUGIN="$PKG/plugins/mirror-mind"
  EVIDENCE="$D/evidence"
  PROJECT="$D/project"
}
resolve

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0
result() {
  say "Result"
  printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  { printf '$ %s\n' "$*"; "$@"; printf '\nexit %s\n' "$?"; } >"$EVIDENCE/$name.out" 2>&1
}
json_of() { sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/$1.out"; }

evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  look "grok: $(grok --version 2>/dev/null || echo 'not on the PATH')"
  look "binary: $(which -a grok 2>/dev/null | awk '!seen[$0]++' | tr '\n' ' ') → $(readlink -f "$(command -v grok)" 2>/dev/null)"
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json") · model: $MODEL"
}

# A scratch HOME for one shape, with the scratch Mirror home's config copied in so the
# MCP server Grok spawns finds its database the way an installed one does.
fresh_home() {
  local home="$1"
  rm -rf "$home"
  mkdir -p "$home/.grok" "$home/.config/mirror"
  chmod 700 "$home"
  cp "$D/home-mirror/.config/mirror/env" "$home/.config/mirror/env"
}
# The scratch Mirror home every shape shares (seeded once in setup, no provider key).
MIRROR_ENV=(-u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME)
in_home() { # home, then the command; no auth
  local home="$1"; shift
  (cd "$PROJECT" && env "${MIRROR_ENV[@]}" HOME="$home" GROK_HOME="$home/.grok" DISABLE_AUTOUPDATER=1 \
    PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
in_home_auth() { # the same, with the real credential file read in place (decision 1)
  local home="$1"; shift
  (cd "$PROJECT" && env "${MIRROR_ENV[@]}" HOME="$home" GROK_HOME="$home/.grok" DISABLE_AUTOUPDATER=1 \
    GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" \
    PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}

# The real runtime configuration this route promises not to touch. auth.json is
# outside the set on purpose: Grok refreshes tokens in the background.
REAL_CONFIG=(
  .grok/config.toml .grok/settings.json .grok/hooks .grok/skills .grok/plugins .grok/rules
  .grok/installed-plugins .grok/marketplace-cache .grok/trusted-hook-projects
  .claude/settings.json .claude/settings.local.json .claude/skills .claude/plugins
  .config/mirror/env
)
config_manifest() {
  local rel path
  for rel in "${REAL_CONFIG[@]}"; do
    path="$REAL_HOME/$rel"
    if [ -L "$path" ]; then printf 'L %s -> %s\n' "$rel" "$(readlink "$path")"
    elif [ -f "$path" ]; then printf 'F %s %s\n' "$rel" "$(shasum -a 256 "$path" | cut -d' ' -f1)"
    elif [ -d "$path" ]; then
      find "$path" -maxdepth 3 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else printf -- "- %s absent\n" "$rel"; fi
  done
}

# The fixed prompt (plan.md, step 1). Read-only tools only.
PROMPT='Do exactly these steps and nothing else.
1. Call search_tool with the query "mirror".
2. If a tool named mirror-mind__list_journeys is in the results, call it through use_tool with tool_input {}.
3. Reply with two lines only: "FOUND <the qualified tool names from step 1, comma-separated, or NONE>" and "RESULT <the first 80 characters of step 2 result, or NONE>".'
PROMPT_S3='Do exactly these steps and nothing else.
1. Call search_tool with the query "ping".
2. If a tool named ds10-ts2-control__ping is in the results, call it through use_tool with tool_input {}.
3. Reply with two lines only: "FOUND <the qualified tool names from step 1, comma-separated, or NONE>" and "RESULT <the first 80 characters of step 2 result, or NONE>".'

# The summariser: every line of the stream parsed as JSON, fields SELECTED, never
# redacted (amendment 5). Prints the init snapshot, the tool calls in order, the
# result lines, and the spend; exits 0 when the pass condition (amendment 1) holds.
write_summariser() {
  cat >"$D/summarise.mjs" <<'EOF'
import fs from "node:fs";
const [streamPath, logPath, server, tool] = process.argv.slice(2);
const lines = fs.readFileSync(streamPath, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
const msgs = [];
for (const l of lines) { try { msgs.push(JSON.parse(l)); } catch { /* a non-JSON line: the route prints the raw tail */ } }
const init = msgs.find((m) => m.type === "system" && m.subtype === "init");
const servers = init ? (init.mcp_servers || []) : null;
console.log(`model: ${init ? init.model : "?"} · permission: ${init ? init.permissionMode : "?"} · tools offered: ${init && init.tools ? init.tools.length : "?"}`);
console.log(`init.mcp_servers: ${servers === null ? "(no init line)" : servers.length === 0 ? "[]" : servers.map((s) => `${s.name}=${s.status}`).join(", ")}`);
const calls = [];
for (const m of msgs) {
  if (m.type === "assistant") for (const b of m.message?.content || []) if (b.type === "tool_use") calls.push({ id: b.id, name: b.name, input: b.input });
  if (m.type === "user") for (const b of m.message?.content || []) if (b.type === "tool_result") {
    const text = Array.isArray(b.content) ? b.content.map((c) => c.text || "").join("") : String(b.content ?? "");
    const call = calls.find((c) => c.id === b.tool_use_id);
    if (call) call.result = text;
  }
}
for (const c of calls) console.log(`tool_use: ${c.name} ${JSON.stringify(c.input).slice(0, 120)} → ${c.result === undefined ? "(no result)" : JSON.stringify(c.result.slice(0, 160))}`);
const search = calls.find((c) => c.name === "search_tool");
const keys = search && search.result ? [...new Set(search.result.match(new RegExp(`${server}__[A-Za-z0-9_-]+`, "g")) || [])] : [];
const use = calls.find((c) => c.name === "use_tool" && JSON.stringify(c.input).includes(`${server}__${tool}`));
const result = msgs.find((m) => m.type === "result");
const catalog = init && Array.isArray(init.tools) ? init.tools.filter((t) => t.startsWith(`${server}__`)) : [];
console.log(`init.tools from ${server}: ${catalog.length ? catalog.join(", ") : "none"} (${catalog.length} of ${process.env.EXPECTED_KEYS || "?"} expected)`);
console.log(`search_tool result keys for ${server}: ${keys.length ? keys.join(", ") : "none"}${search && search.result ? ` (result_count ${(search.result.match(/"result_count":(\d+)/) || [])[1] ?? "?"}: a scored search, not a listing)` : ""}`);
console.log(`use_tool ${server}__${tool}: ${use ? (use.result !== undefined ? "answered" : "called, no result") : "not called"}`);
console.log(`result.result: ${result ? JSON.stringify(String(result.result ?? "").slice(0, 200)) : "(no result line)"}`);
console.log(`spend: total_cost_usd=${result ? result.total_cost_usd : "?"} usage=${result ? JSON.stringify(result.usage) : "?"} turns=${result ? result.num_turns : "?"} stop=${result ? result.stop_reason : "?"}`);
// unified.jsonl: msg and selected ctx of the lines naming the server or MCP.
let logLines = [];
try { logLines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean); } catch {}
const picked = [];
for (const l of logLines) {
  let j; try { j = JSON.parse(l); } catch { continue; }
  const text = `${j.msg ?? ""} ${JSON.stringify(j.ctx ?? {})}`;
  if (!/mcp|MCP|plugin.*update|auto.?update|marketplace/i.test(text) && !text.includes(server)) continue;
  const ctx = j.ctx && typeof j.ctx === "object" ? Object.fromEntries(Object.entries(j.ctx).filter(([k]) => /status|count|tool|server|name|reason|error|transport|path|command|update|plugin|elapsed|env|PATH|MIRROR/i.test(k)).map(([k, v]) => [k, String(v).replace(/\/private\/tmp\/[^"\s]*|\/tmp\/[^"\s]*/g, "<scratch>").slice(0, 160)])) : {};
  picked.push(`${j.lvl ?? ""} ${j.msg ?? ""} ${JSON.stringify(ctx)}`);
}
console.log(`unified.jsonl, ${picked.length} line(s) on MCP/plugins:`);
for (const p of picked.slice(0, 40)) console.log(`  ${p}`);
const failedStatus = servers && servers.some((s) => s.name === server && /^(failed|disabled|needs-auth)$/.test(s.status));
const expectedKeys = Number(process.env.EXPECTED_KEYS || "0");
// The pass condition (plan, amendment 1): no decisive failure status, the server's
// keys reachable (in the init catalog or through search_tool), and a use_tool call
// answered. The init line is a snapshot taken at the first output line and RACES the
// handshake: measured on 1.0.62, the same shape listed 10 tools in one run and 3 in
// the next, both answering use_tool. search_tool is a scored search (top results).
const reachable = catalog.length >= expectedKeys || keys.length >= 1;
const pass = !failedStatus && reachable && !!use && use.result !== undefined;
console.log(`verdict: ${pass ? "ATTACHED" : "NOT ATTACHED"} (${failedStatus ? "init status decisive; " : ""}init catalog ${catalog.length}/${expectedKeys} (a snapshot that races the handshake); search found ${keys.length}; use_tool ${use ? (use.result !== undefined ? "answered" : "unanswered") : "not called"})`);
process.exit(pass ? 0 : 1);
EOF
}

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install, a seeded scratch Mirror home, the real-config baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds10-ts2" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds10-ts2" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT"
  config_manifest >"$D/real-baseline.txt"
  ok "real runtime configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries"
  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into the scratch prefix" || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; result; return; }
  # The scratch Mirror home: init + seed, no provider key. Its config file is what
  # every shape's HOME receives, so the server Grok spawns finds this database.
  local MH="$D/home-mirror"; rm -rf "$MH"; mkdir -p "$MH/.config"; chmod 700 "$MH"
  (cd "$PROJECT" && env "${MIRROR_ENV[@]}" HOME="$MH" PATH="$PREFIX/bin:$NODE_DIR:/usr/bin:/bin" mirror init ts2user >"$EVIDENCE/mirror-init.out" 2>&1 \
    && env "${MIRROR_ENV[@]}" HOME="$MH" PATH="$PREFIX/bin:$NODE_DIR:/usr/bin:/bin" mirror seed >"$EVIDENCE/mirror-seed.out" 2>&1) \
    && ok "scratch Mirror home seeded: $MH/.mirror-minds/ts2user (no provider key)" || { bad "mirror init/seed failed (evidence/mirror-*.out)"; result; return; }
  grep -q OPENROUTER_API_KEY "$MH/.config/mirror/env" 2>/dev/null && bad "the scratch config holds a provider key" || ok "the scratch Mirror cannot spend"
  node -e 'console.log(require(process.argv[1]).mcpServers ? "ok" : "missing")' "$PLUGIN/plugin.json" | grep -q ok && ok "the root plugin.json marker carries mcpServers (US1)" || bad "the marker carries no mcpServers: US1's fix is not in this tree"
  write_summariser
  result
}

# ---------------------------------------------------------------------------
static() {
  say "Static — Grok's own read of the server on US1's install (no model, no auth)"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  command -v grok >/dev/null 2>&1 || { bad "grok is not on the PATH"; result; return; }
  evidence_header
  local H="$D/home-static"; fresh_home "$H"
  keep static-install in_home "$H" grok plugin install "$PLUGIN" --trust
  grep -q "^exit 0" "$EVIDENCE/static-install.out" && ok "US1's step 1: installed" || { bad "install failed"; result; return; }
  keep static-mcp-list in_home "$H" grok mcp list --json
  json_of static-mcp-list | cut -c1-300 | show
  keep static-doctor in_home "$H" grok mcp doctor --json
  json_of static-doctor | cut -c1-600 | show
  node -e '
    const s=require("fs").readFileSync(process.argv[1],"utf8").split("\n").slice(1).filter(l=>!/^exit \d+$/.test(l)).join("\n");
    let j; try { j=JSON.parse(s); } catch { console.log("doctor: not JSON"); process.exit(2); }
    const mm=(j.servers||[]).find(x=>x.name==="mirror-mind");
    if(!mm){ console.log("doctor: mirror-mind ABSENT"); process.exit(1); }
    const checks=(mm.checks||[]).map(c=>`${c.label}${c.detail?" ("+c.detail+")":""}: ${c.passed?"pass":"FAIL"}`);
    const tools=Number(((mm.checks||[]).map(c=>c.label).join(" ").match(/(\d+) tools discovered/)||[])[1]||0);
    console.log(`doctor: mirror-mind source "${mm.source}", healthy=${mm.healthy}; ${checks.join("; ")}`);
    console.log(`doctor: sources ${JSON.stringify((j.sources||[]).map(x=>x.path+"="+x.status.status+(x.status.server_count!==undefined?"("+x.status.server_count+")":"")))}`);
    process.exit(mm.healthy && tools>=7 ? 0 : 1);
  ' "$EVIDENCE/static-doctor.out" | tee "$EVIDENCE/static-doctor-summary.txt" | show
  [ "${PIPESTATUS[0]}" = "0" ] && ok "grok mcp doctor: mirror-mind connected with seven tools" || bad "grok mcp doctor did not read seven tools (evidence/static-doctor.out) — a stop condition"
  keep static-inspect in_home "$H" grok inspect --json
  json_of static-inspect | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const j=JSON.parse(s);console.log("inspect.mcpServers: "+JSON.stringify(j.mcpServers.map(m=>({name:m.name,transport:m.transport,source:m.source&&m.source.type}))))})' | show
  look "server stderr log: $(ls "$H/.grok/logs/mcp/" 2>/dev/null | tr '\n' ' ' || echo none)"
  [ -s "$H/.grok/logs/mcp/mirror-mind.stderr.log" ] && { note "stderr log is not empty:"; head -5 "$H/.grok/logs/mcp/mirror-mind.stderr.log" | show; } || note "stderr log empty or absent after doctor"
  result
}

# ---------------------------------------------------------------------------
# A shape's HOME, prepared. Each returns the server name and the tool the prompt uses.
prepare_shape() {
  local shape="$1" H="$2"
  fresh_home "$H"
  case "$shape" in
    S1) keep "$shape-install" in_home "$H" grok plugin install "$PLUGIN" --trust; SERVER=mirror-mind; TOOL=list_journeys; KEYS=7; P="$PROMPT" ;;
    S2)
      node -e '
        const m=require(process.argv[1]); const e=m.mcpServers["mirror-mind"];
        const q=(s)=>JSON.stringify(s);
        console.log(`[mcp_servers.mirror-mind]\ncommand = ${q(e.command)}\nargs = [${e.args.map(q).join(", ")}]\n`);
      ' "$PLUGIN/.claude-plugin/plugin.json" >"$H/.grok/config.toml"
      SERVER=mirror-mind; TOOL=list_journeys; KEYS=7; P="$PROMPT" ;;
    S3)
      local C="$D/plugin-control"; rm -rf "$C"; mkdir -p "$C/.claude-plugin" "$C/skills"
      cp "$HERE/control-mcp.mjs" "$C/control-mcp.mjs"
      node -e '
        const fs=require("fs"),d=process.argv[1],n=process.argv[2];
        const m={name:"ds10-ts2-control",version:"0.0.1",description:"CV21.DS10.TS2 control plugin: one inert MCP server.",mcpServers:{"ds10-ts2-control":{command:n,args:[d+"/control-mcp.mjs"]}}};
        fs.writeFileSync(d+"/.claude-plugin/plugin.json",JSON.stringify(m,null,2)+"\n");
        fs.writeFileSync(d+"/plugin.json",JSON.stringify({name:m.name,description:m.description,version:m.version,mcpServers:m.mcpServers},null,2)+"\n");
      ' "$C" "$(command -v node)"
      keep "$shape-install" in_home "$H" grok plugin install "$C" --trust
      SERVER=ds10-ts2-control; TOOL=ping; KEYS=1; P="$PROMPT_S3" ;;
    S4)
      local V="$D/plugin-mcpjson"; rm -rf "$V"; cp -R "$PLUGIN" "$V"
      node -e 'const fs=require("fs"),d=process.argv[1];const m=JSON.parse(fs.readFileSync(d+"/.claude-plugin/plugin.json","utf8"));fs.writeFileSync(d+"/.mcp.json",JSON.stringify({mcpServers:m.mcpServers},null,2)+"\n")' "$V"
      keep "$shape-install" in_home "$H" grok plugin install "$V" --trust
      SERVER=mirror-mind; TOOL=list_journeys; KEYS=7; P="$PROMPT" ;;
    *) echo "unknown shape $shape (S1..S4)"; exit 2 ;;
  esac
}

shape_name() {
  case "$1" in
    S1) echo "the shipped plugin (manifest/marker mcpServers)" ;;
    S2) echo "no plugin; the locator as [mcp_servers.mirror-mind] in config.toml" ;;
    S3) echo "a control plugin carrying control-mcp.mjs" ;;
    S4) echo "the shipped plugin with .mcp.json beside its manifest" ;;
  esac
}

session() {
  local shape="${1:-}"; [ -n "$shape" ] || { echo "usage: bash $SELF session S1|S2|S3|S4"; exit 2; }
  say "Session $shape — one headless prompt, read by field"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  command -v grok >/dev/null 2>&1 || { bad "grok is not on the PATH"; result; return; }
  [ -f "$REAL_HOME/.grok/auth.json" ] || { bad "no ~/.grok/auth.json to read in place (decision 1)"; result; return; }
  evidence_header
  write_summariser
  local H="$D/home-$shape" SERVER TOOL KEYS P
  prepare_shape "$shape" "$H"
  look "shape: $(shape_name "$shape")"
  [ -f "$EVIDENCE/$shape-install.out" ] && { grep -q "^exit 0" "$EVIDENCE/$shape-install.out" && ok "plugin installed" || { bad "plugin install failed (evidence/$shape-install.out)"; result; return; }; }
  look "command: grok -p <prompt> -m $MODEL --output-format streaming-messages-json --yolo --tools read_file --max-turns 4 --reasoning-effort low --no-auto-update"
  local START; START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  in_home_auth "$H" grok -p "$P" -m "$MODEL" --output-format streaming-messages-json --yolo --tools read_file --max-turns 4 --reasoning-effort low --no-auto-update \
    >"$EVIDENCE/$shape-stream.ndjson" 2>"$EVIDENCE/$shape-stderr.txt"
  local CODE=$?
  look "exit $CODE · $(wc -l <"$EVIDENCE/$shape-stream.ndjson" | tr -d ' ') stream lines · stderr $(wc -c <"$EVIDENCE/$shape-stderr.txt" | tr -d ' ') bytes · started $START"
  [ -s "$EVIDENCE/$shape-stderr.txt" ] && { note "stderr (first lines):"; head -4 "$EVIDENCE/$shape-stderr.txt" | sed "s|$D|<scratch>|g" | cut -c1-200 | show; }
  grep -v '^{' "$EVIDENCE/$shape-stream.ndjson" | head -3 | sed "s|$D|<scratch>|g" | cut -c1-200 | show
  EXPECTED_KEYS="$KEYS" node "$D/summarise.mjs" "$EVIDENCE/$shape-stream.ndjson" "$H/.grok/logs/unified.jsonl" "$SERVER" "$TOOL" | tee "$EVIDENCE/$shape-summary.txt" | show
  local VERDICT="${PIPESTATUS[0]}"
  say "Session $shape — the three seams"
  grep -q "^init.mcp_servers: .*$SERVER=" "$EVIDENCE/$shape-summary.txt" && ok "seam 1, Grok to server: the init snapshot names $SERVER ($(grep -o "$SERVER=[a-z-]*" "$EVIDENCE/$shape-summary.txt" | head -1))" || bad "seam 1: init.mcp_servers does not name $SERVER"
  local SLOG="$H/.grok/logs/mcp/$SERVER.stderr.log"
  if [ -f "$SLOG" ]; then
    [ -s "$SLOG" ] && { note "seam 2, server to Mirror home: the server's stderr log says:"; head -3 "$SLOG" | sed "s|$D|<scratch>|g" | cut -c1-200 | show; } || ok "seam 2, server to Mirror home: the server's stderr log is empty"
  else note "seam 2: no stderr log at logs/mcp/$SERVER.stderr.log ($(ls "$H/.grok/logs/mcp" 2>/dev/null | tr '\n' ' '))"; fi
  grep -q "^use_tool ${SERVER}__${TOOL}: answered" "$EVIDENCE/$shape-summary.txt" && ok "seam 3, tool to data: use_tool ${SERVER}__${TOOL} answered" || bad "seam 3: use_tool ${SERVER}__${TOOL} $(grep -o "^use_tool [^:]*: .*" "$EVIDENCE/$shape-summary.txt" | sed 's/^use_tool [^:]*: //')"
  [ "$VERDICT" = "0" ] && ok "verdict: ATTACHED" || bad "verdict: NOT ATTACHED"
  look "spend: $(grep '^spend:' "$EVIDENCE/$shape-summary.txt" | cut -c8-200)"
  # The spend ledger, summed across sessions (decision 2: a ceiling of US$ 1.00).
  grep -o 'total_cost_usd=[0-9.e-]*' "$EVIDENCE/$shape-summary.txt" | sed "s/^/$shape $START /" >>"$EVIDENCE/spend.tsv"
  local TOTAL; TOTAL="$(LC_ALL=C awk -F= '{s+=$2} END {printf "%.4f", s}' "$EVIDENCE/spend.tsv")"
  look "sessions so far: $(wc -l <"$EVIDENCE/spend.tsv" | tr -d ' ') · summed total_cost_usd: $TOTAL"
  LC_ALL=C awk -v t="$TOTAL" 'BEGIN{exit !(t+0 > 1.0)}' && bad "the US$ 1.00 ceiling is exceeded: stop (decision 2)" || true
  [ "$(wc -l <"$EVIDENCE/spend.tsv" | tr -d ' ')" -gt 4 ] && bad "more than four sessions: stop (decision 2)" || true
  look "leaders: $(grok leader list 2>/dev/null | tr '\n' ' ')"
  result
}

# ---------------------------------------------------------------------------
untouched() {
  say "Untouched — the real ~/.grok and ~/.claude configuration vs the baseline"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run setup first."; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "every entry hashes as it did before setup ($(wc -l <"$D/real-now.txt" | tr -d ' ') entries; auth.json outside the set by design)"
  else
    bad "the real configuration changed (see $D/real-diff.txt)"; head -20 "$D/real-diff.txt" | show
  fi
  result
}

clean() {
  say "Clean"
  for h in "$D"/home-*; do
    [ -S "$h/.grok/leader.sock" ] && note "leader socket under ${h/#$D/\$D}: stopping" && env HOME="$h" GROK_HOME="$h/.grok" grok leader kill >/dev/null 2>&1
  done
  [ -f "$D_RAW/.ds10-ts2" ] && rm -rf "$D_RAW" && ok "removed $D_RAW" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup ;;
  static) static ;;
  session) session "${2:-}" ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,23p' "$SELF"; exit 2 ;;
esac
