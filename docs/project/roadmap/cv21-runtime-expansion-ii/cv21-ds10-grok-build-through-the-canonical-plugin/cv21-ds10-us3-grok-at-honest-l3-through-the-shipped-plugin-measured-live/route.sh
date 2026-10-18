#!/usr/bin/env bash
# CV21.DS10.US3 — Grok at honest L3 through the shipped plugin, measured live.
#
# Every step is isolated under a scratch directory (DS10_US3_DIR, default
# /tmp/cv21-ds10-us3): one scratch person (HOME) wired by US1's two printed steps,
# with a seeded scratch Mirror home and a probe hook. The real `grok` reads only
# its auth.json, in place, through GROK_AUTH_PATH; the provider key is read from
# the real ~/.config/mirror/env into the session's environment inside one function
# and never put in argv or echoed. `untouched` READS the real configuration and the
# real Mirror databases, to prove nothing reached them.
#
#   bash route.sh setup        pack, install, the person's home: US1's two steps,
#                              the probe hook, a seeded Mirror home, the baseline
#   bash route.sh headless     R0 (no rule), R1 (the rule), R2 — each checked;
#                              finish R0 and R1; R2's tail left for the TUI start
#   bash route.sh session <R>  one headless session, R0|R1|R2
#   bash route.sh check <R>    what a session left: R0|R1|R2|tui
#   bash route.sh finish <R>   the next start's maintenance, explicitly: R0|R1|R2|tui
#   bash route.sh tui          the Navigator's session (two turns, then quit)
#   bash route.sh untouched    real ~/.grok, ~/.claude, ~/.config/mirror, Mirror DBs
#   bash route.sh clean        remove the scratch directory and any leader it spawned
#
# DS10_US3_DRY=1 prepares a step and stops before a session. Raw streams, captures,
# and unified.jsonl stay under $D (never committed); summaries go to test-guide.md.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS10_US3_DIR:-/tmp/cv21-ds10-us3}"
MODEL="${DS10_US3_MODEL:-grok-4.7}"
BOUND_MS="${DS10_US3_BOUND_MS:-1500}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"
NODE_BIN="$(command -v node)"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/prefix"
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  PLUGIN="$PKG/plugins/mirror-mind"
  EVIDENCE="$D/evidence"
  PERSON="$D/person"                       # the scratch person's HOME
  GH="$PERSON/.grok"
  MHOME="$PERSON/.mirror-minds/us3user"    # their Mirror home
  DB="$MHOME/memory.db"
  PROJECT="$D/project"
  LIVE="$D/live"
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
scrub() { sed "s|$D|<scratch>|g; s|$REAL_HOME|~|g"; }

# --- readers (node:sqlite; no sqlite3 binary) ----------------------------------
q() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const row = db.prepare(process.argv[2]).get(...process.argv.slice(3));
  console.log(row ? String(Object.values(row)[0] ?? "") : "");' "$@" 2>/dev/null; }
qrows() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  for (const row of db.prepare(process.argv[2]).all(...process.argv.slice(3))) console.log(Object.values(row).map(v => String(v ?? "")).join("\t"));' "$@" 2>/dev/null; }
ms_of() { node -e 'console.log(Date.parse(process.argv[1]) || 0)' "$1"; }

evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  look "grok: $(grok --version 2>/dev/null || echo 'not on the PATH')"
  look "binary: $(which -a grok 2>/dev/null | awk '!seen[$0]++' | tr '\n' ' ') → $(readlink -f "$(command -v grok)" 2>/dev/null)"
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json") · headless model: $MODEL · bound: ${BOUND_MS} ms"
}

# --- the session environment ----------------------------------------------------
# The provider key is read here, exported in this shell for the one command that
# follows, and never placed in argv (security amendment 8).
real_key() {
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY[[:space:]]*=[[:space:]]*//p' "$REAL_HOME/.config/mirror/env" 2>/dev/null | tail -n 1 | tr -d "\"'\r"
}
# as_person <command...>: the scratch person's environment, Grok's auth in place.
as_person() {
  local key; key="$(real_key)"
  [ -n "$key" ] || { echo "no OPENROUTER_API_KEY in $REAL_HOME/.config/mirror/env (plan decision 1)"; return 2; }
  (cd "$PROJECT" && OPENROUTER_API_KEY="$key" exec env -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$PERSON" GROK_HOME="$GH" GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" MIRROR_USER=us3user \
    DISABLE_AUTOUPDATER=1 DS10_LIVE="$LIVE/current" PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
# as_person_nokey: the same without the provider key (setup, inspect, finish R-none).
as_person_nokey() {
  (cd "$PROJECT" && exec env -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$PERSON" GROK_HOME="$GH" GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" MIRROR_USER=us3user \
    DISABLE_AUTOUPDATER=1 DS10_LIVE="$LIVE/current" PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
preflight() {
  local out
  out="$(as_person node --no-warnings --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { loadConfiguration } = await import(pathToFileURL(process.argv[1]).href);
    const { resolveMirrorHome } = await import(pathToFileURL(process.argv[2]).href);
    loadConfiguration({ entryPath: process.argv[3] });
    let home; try { home = resolveMirrorHome(process.env); } catch (error) { home = "ERROR: " + error.message; }
    console.log(home + "\t" + (process.env.OPENROUTER_API_KEY ? "a provider key" : "no provider key"));
  ' "$ROOT/ts/src/runtime/config.ts" "$ROOT/ts/src/frontDoor/dbPath.ts" "$PKG/ts/src/frontDoor/cli.ts" 2>&1)"
  if [ "$out" = "$MHOME"$'\t'"a provider key" ]; then ok "preflight: the session's Mirror resolves the scratch home, with a provider key"
  else bad "preflight: the session's Mirror would see: $out"; echo "  Not starting a session: no turn spent."; return 2; fi
}

# --- the real configuration this route must not touch ---------------------------
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

# --- prompts --------------------------------------------------------------------
# Every prompt carries its marker (amendment 1). Read-only; no tool named.
prompt_for() { # $1 = R0|R1|R2, $2 = marker
  case "$1" in
    R0|R1) printf '%s' "Answer from your context alone, in three lines and nothing else. Line 1: the four operating modes of the Mirror and the glyph that marks a persona's answer, or UNKNOWN. Line 2: what the Ariad surface transport invariant tells you to do with marked blocks, in ten words or fewer, or UNKNOWN. Line 3: any token starting with CANARY- that you can see in your context, or NONE. (ref $2)" ;;
    R2) printf '%s' "Reply with one line: the word logged, and nothing else. (ref $2)" ;;
  esac
}

# --- the probe hook -----------------------------------------------------------------
write_probe_hook() {
  mkdir -p "$GH/hooks" "$LIVE"
  cp "$HERE/probe.mjs" "$D/probe.mjs"
  local cmd="$NODE_BIN $D/probe.mjs"
  cat >"$GH/hooks/ds10-probe.json" <<EOF
{ "hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "$cmd SessionStart" }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "$cmd UserPromptSubmit" }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "$cmd Stop" }] }],
  "SessionEnd": [{ "hooks": [{ "type": "command", "command": "$cmd SessionEnd" }] }]
} }
EOF
}
# A run's capture directory: live/<R> with the canary; live/current points at it.
run_prepare() {
  local run="$1"
  local dir="$LIVE/$run"
  [ -d "$dir" ] && mv "$dir" "$dir.$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$dir"
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$dir/canary"
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$dir/id"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$dir/started"
  rm -f "$LIVE/current" && ln -s "$dir" "$LIVE/current"
}

# ============================================================================
setup() {
  say "Setup — scratch install, the person's home wired by US1's two steps, the probe, the baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds10-us3" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds10-us3" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT" "$PERSON/.config" "$GH" "$LIVE"
  chmod 700 "$PERSON"
  config_manifest >"$D/real-baseline.txt"
  ok "real configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries (Mirror databases included)"
  evidence_header
  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into the scratch prefix" || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; result; return; }

  say "The person's Mirror home"
  # init runs with no MIRROR_USER in its environment, so it writes the person's
  # ~/.config/mirror/env — the file a hook or an MCP server reads when Grok hands
  # it a filtered environment (the GUI-launch case). The sessions set it too.
  as_person_nokey env -u MIRROR_USER mirror init us3user >"$EVIDENCE/mirror-init.out" 2>&1 && as_person_nokey mirror seed >"$EVIDENCE/mirror-seed.out" 2>&1 \
    && ok "mirror init + seed: $MHOME" || { bad "init/seed failed (evidence/mirror-*.out)"; result; return; }
  grep -q "^MIRROR_USER=us3user" "$PERSON/.config/mirror/env" 2>/dev/null && ok "the person's ~/.config/mirror/env names us3user" || bad "init wrote no ~/.config/mirror/env"
  grep -q OPENROUTER_API_KEY "$PERSON/.config/mirror/env" && bad "the scratch config holds a provider key" || ok "the scratch config holds no key (the key rides the session environment only)"
  look "what init printed for Grok Build:"
  awk '/^Grok Build:/{p=1} p&&/^$/{exit} p' "$EVIDENCE/mirror-init.out" | show

  say "US1's two steps, exactly as printed"
  keep step1 as_person_nokey grok plugin install "$PLUGIN" --trust
  grep -q "^exit 0" "$EVIDENCE/step1.out" && ok "1. grok plugin install … --trust" || { bad "step 1 failed"; result; return; }
  mkdir -p "$GH/rules" && ln -sf "$PKG/AGENTS.md" "$GH/rules/mirror-mind.md" && ok "2. ln -s AGENTS.md ~/.grok/rules/mirror-mind.md"
  write_probe_hook && ok "the probe hook: ~/.grok/hooks/ds10-probe.json (SessionStart, UserPromptSubmit, Stop, SessionEnd)"
  run_prepare setup
  keep inspect as_person_nokey grok inspect --json
  sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/inspect.out" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const j=JSON.parse(s);
    const mm=j.skills.filter(x=>/^mm-/.test(x.name)&&x.source&&x.source.type==="plugin").length;
    const rule=(j.projectInstructions||[]).find(r=>/rules\/mirror-mind\.md$/.test(r.path));
    const hooks=j.hooks.map(h=>(h.source&&h.source.type)+":"+(h.source&&(h.source.plugin_name||h.source.path||"")).replace(/.*\//,"")).join(", ");
    console.log(`skills from the plugin: ${mm} · rule: ${rule?rule.scope+" ~"+rule.approxTokens+" tokens":"NOT LOADED"} · mcp: ${j.mcpServers.map(m=>m.name).join(",")||"none"} · hooks: ${hooks}`);
    process.exit(mm>=25&&rule&&j.mcpServers.length>=1?0:1)})' | tee "$EVIDENCE/inspect-summary.txt" | show
  [ "${PIPESTATUS[1]}" = "0" ] && ok "inspect: 25 plugin skills, the rule loaded global, the server listed, the probe and plugin hooks registered" || bad "inspect does not show the wired home (evidence/inspect-summary.txt)"
  local GUIDE="$REAL_HOME/.grok/docs/user-guide/10-hooks.md" BOUND_DOC
  BOUND_DOC="$(tr '\n' ' ' <"$GUIDE" 2>/dev/null | grep -oE 'SessionEnd. hook is then bounded by its own[^.]*default [0-9.]+s' | grep -oE 'default [0-9.]+s' | head -1)"
  look "the installed guide's SessionEnd bound: ${BOUND_DOC:-(line not found)}; a plugin's SessionEnd hook runs for at most that default whatever its timeout; exit waits at most 10 s (10-hooks.md dated $(stat -f '%Sm' -t '%Y-%m-%d' "$GUIDE"))"
  preflight
  look "leaders: $(grok leader list 2>/dev/null | tr '\n' ' ')"
  result
}

# ============================================================================
# One headless session. R0 removes the rule link for its duration.
session() {
  local run="${1:-}"; case "$run" in R0|R1|R2) ;; *) echo "usage: bash $SELF session R0|R1|R2"; exit 2 ;; esac
  say "Session $run — headless, one prompt, read by field"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  evidence_header
  preflight || { result; return; }
  run_prepare "$run"
  local DIR="$LIVE/$run" ID; ID="$(cat "$DIR/id")"
  local MARK="US3-$ID-$run"
  local P; P="$(prompt_for "$run" "$MARK")"
  if [ "$run" = R0 ]; then rm -f "$GH/rules/mirror-mind.md"; note "R0: the rule link removed for this session"; fi
  look "marker $MARK · canary CANARY-DS10-$(cat "$DIR/canary")-… · prompt: ${P:0:90}…"
  look "command: grok -p <prompt> -m $MODEL --output-format streaming-messages-json --yolo --tools \"\" --disallowed-tools search_tool,use_tool --max-turns 2 --reasoning-effort low --no-auto-update"
  if [ "${DS10_US3_DRY:-0}" = 1 ]; then note "DS10_US3_DRY=1: prepared, session not started"; [ "$run" = R0 ] && ln -sf "$PKG/AGENTS.md" "$GH/rules/mirror-mind.md"; return 0; fi
  # No built-in tool and the MCP meta-tools denied: the first R0 run (18:31 UTC,
  # evidence live/R0.*) read the plugin's SKILL.md files with read_file and learned
  # the modes from the skills, so the answer must come from context alone.
  as_person grok -p "$P" -m "$MODEL" --output-format streaming-messages-json --yolo --tools "" --disallowed-tools search_tool,use_tool --max-turns 2 --reasoning-effort low --no-auto-update \
    >"$DIR/stream.ndjson" 2>"$DIR/stderr.txt"
  local CODE=$?
  date -u +%Y-%m-%dT%H:%M:%SZ >"$DIR/ended"
  [ "$run" = R0 ] && { ln -sf "$PKG/AGENTS.md" "$GH/rules/mirror-mind.md"; note "the rule link restored"; }
  look "exit $CODE · $(wc -l <"$DIR/stream.ndjson" | tr -d ' ') stream lines · stderr $(wc -c <"$DIR/stderr.txt" | tr -d ' ') bytes"
  [ -s "$DIR/stderr.txt" ] && { note "stderr:"; head -3 "$DIR/stderr.txt" | scrub | cut -c1-200 | show; }
  # The answer, by field.
  node -e '
    const fs=require("fs"); const msgs=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(l=>l.trim().startsWith("{")).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const init=msgs.find(m=>m.type==="system"&&m.subtype==="init"); const res=msgs.find(m=>m.type==="result");
    const text=res?String(res.result??""):""; const lines=text.split("\n").filter(Boolean);
    console.log(`model: ${init?init.model:"?"} · init.mcp_servers: ${init?(init.mcp_servers||[]).map(s=>s.name+"="+s.status).join(", ")||"[]":"(no init)"} · skills advertised: ${init&&init.skills?init.skills.filter(s=>/^mm-/.test(s)).length:"?"} mm-*`);
    console.log(`line 1: ${JSON.stringify(lines[0]??"")}`); console.log(`line 2: ${JSON.stringify(lines[1]??"")}`); console.log(`line 3: ${JSON.stringify(lines[2]??"")}`);
    console.log(`spend: total_cost_usd=${res?res.total_cost_usd:"?"} turns=${res?res.num_turns:"?"} stop=${res?res.stop_reason:"?"} usage=${res?JSON.stringify(res.usage):"?"}`);
    fs.writeFileSync(process.argv[2], JSON.stringify({model:init?init.model:null,line1:lines[0]??"",line2:lines[1]??"",line3:lines[2]??"",cost:res?res.total_cost_usd:null,skills:init&&init.skills?init.skills.filter(s=>/^mm-/.test(s)).length:null}));
  ' "$DIR/stream.ndjson" "$DIR/answer.json" | tee "$DIR/answer.txt" | show
  printf '%s %s %s\n' "$run" "$(cat "$DIR/started")" "$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).cost??0)' "$DIR/answer.json")" >>"$EVIDENCE/spend-grok.tsv"
  look "Grok spend so far: $(LC_ALL=C awk '{s+=$3} END {printf "%.4f USD over %d session(s)", s, NR}' "$EVIDENCE/spend-grok.tsv")"
  LC_ALL=C awk '{s+=$3} END {exit !(s > 1.0)}' "$EVIDENCE/spend-grok.tsv" && bad "Grok's US$ 1.00 ceiling exceeded: stop (decision 4)" || true
  [ "$(wc -l <"$EVIDENCE/spend-grok.tsv" | tr -d ' ')" -gt 6 ] && bad "more than six headless sessions: stop (decision 4)" || true
  look "leaders: $(grok leader list 2>/dev/null | tr '\n' ' ')"
  result
}

# ============================================================================
# What a session left. Selects its conversation by the marker in the prompt, time
# as the fallback (amendment 1); reads the probe capture, the database, hooks.log,
# the backups, the ledger, and unified.jsonl.
find_conversation() { # $1 = marker, $2 = started
  local conv
  conv="$(q "$DB" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE ? ORDER BY c.started_at LIMIT 1" "%$1%")"
  if [ -z "$conv" ]; then
    conv="$(q "$DB" "SELECT id FROM conversations WHERE substr(started_at,1,19) >= substr(?,1,19) ORDER BY started_at DESC LIMIT 1" "$2")"
    [ -n "$conv" ] && note "no message carries $1; the latest conversation started since $2 is checked instead" >&2
  fi
  printf '%s' "$conv"
}
check() {
  local run="${1:-}"; case "$run" in R0|R1|R2|tui) ;; *) echo "usage: bash $SELF check R0|R1|R2|tui"; exit 2 ;; esac
  local DIR="$LIVE/$run"
  [ -f "$DIR/started" ] || { echo "No $run session recorded; run: bash $SELF session $run (or tui)"; exit 2; }
  local ID MARK START CANARY; ID="$(cat "$DIR/id")"; MARK="US3-$ID-$run"; START="$(cat "$DIR/started")"; CANARY="CANARY-DS10-$(cat "$DIR/canary")"
  say "Check $run — what the session left ($MARK, since $START)"

  # 1. the answer (headless) — keyword pass conditions with the raw lines (amendment 2)
  if [ -f "$DIR/answer.json" ]; then
    local L1 L2 L3; L1="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).line1)' "$DIR/answer.json")"; L2="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).line2)' "$DIR/answer.json")"; L3="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).line3||"")' "$DIR/answer.json")"
    case "$run" in
      R0)
        printf '%s' "$L2" | grep -qiE "verbatim|ARIAD|<<<" && bad "[rule] R0 knows the transport invariant with no rule in place (${L2:0:100}): the instructions reached the model another way" || ok "[rule] R0 baseline, no rule: the invariant unknown (${L2:0:60})"
        note "[rule] R0 line 1 (the modes; the plugin's skills name them too, so this line is information, not the test): ${L1:0:100}" ;;
      R1)
        printf '%s' "$L2" | grep -qiE "verbatim|preserve" && printf '%s' "$L2" | grep -qiE "ARIAD|marked|block" && ok "[rule] R1: the invariant answered from context — the home rule reaches the model (${L2:0:80})" || bad "[rule] R1 line 2 does not answer the invariant: $L2"
        printf '%s' "$L1" | grep -q "Explorer" && printf '%s' "$L1" | grep -q "Soul" && printf '%s' "$L1" | grep -q "◇" && ok "[rule] R1 line 1: Explorer, Soul, and the ◇ character (${L1:0:80})" || note "[rule] R1 line 1: $L1" ;;
      R2) printf '%s' "$L1" | grep -qi "logged" && ok "[answer] R2: $L1" || bad "[answer] R2: $L1" ;;
    esac
    if [ "$run" != R2 ]; then
      printf '%s%s' "$L2" "$L3" | grep -q "$CANARY" && bad "[canary] the model quoted a canary: $L3 — an injection reached it" || ok "[canary] the model saw no canary (line 3: ${L3:0:40})"
    fi
  fi
  # 2. the probe: what Grok ran and what the probe emitted (amendment 6)
  local nStart nPrompt nStop nEnd
  nStart="$(cat "$DIR/count-SessionStart" 2>/dev/null || echo 0)"; nPrompt="$(cat "$DIR/count-UserPromptSubmit" 2>/dev/null || echo 0)"; nStop="$(cat "$DIR/count-Stop" 2>/dev/null || echo 0)"; nEnd="$(cat "$DIR/count-SessionEnd" 2>/dev/null || echo 0)"
  look "[hooks] probe counts: SessionStart $nStart · UserPromptSubmit $nPrompt · Stop $nStop · SessionEnd $nEnd"
  local TURNS=1
  if [ "$run" = tui ]; then TURNS="${nPrompt:-2}"; [ "$TURNS" -ge 1 ] 2>/dev/null || TURNS=2; note "[tui] $TURNS turn(s) sent (the probe's UserPromptSubmit count: a pasted multi-line prompt is sent line by line)"; fi
  if [ "$nStart" = 0 ] && [ "$nPrompt" = 0 ]; then
    note "[hooks] the probe captured nothing: Grok ran no user hooks in this session (headless silent — the logging and close checks move to the TUI)"
  else
    [ "$nStart" = 1 ] && ok "[hooks] SessionStart fired once; emitted: $(node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(JSON.parse).find(x=>x.event==="SessionStart");console.log(l?Object.keys(l.emitted).join("+")+" with "+l.emitted.systemMessage:"?")' "$DIR/hooks.jsonl")" || bad "[hooks] SessionStart fired $nStart times"
    [ "$nPrompt" = "$TURNS" ] && ok "[hooks] UserPromptSubmit fired $nPrompt (one per turn); emitted additionalContext $CANARY-turn-1" || bad "[hooks] UserPromptSubmit fired $nPrompt for $TURNS turn(s)"
    [ "$nEnd" = 1 ] && ok "[hooks] SessionEnd fired once" || bad "[hooks] SessionEnd fired $nEnd times"
    note "[hooks] Stop fired $nStop for $TURNS turn(s): $([ "$nStop" -gt "$TURNS" ] && echo "Grok fires a Stop at session end beyond the turns' own" || echo "one per turn, none at session end")"
  fi
  # 3. the database
  local CONV; CONV="$(find_conversation "$MARK" "$START")"
  if [ -z "$CONV" ]; then
    bad "[db] no conversation holds $MARK and none started since $START"; result; return
  fi
  local LABELS; LABELS="$(q "$DB" "SELECT c.interface || ' / ' || ifnull((SELECT group_concat(DISTINCT s.interface) FROM runtime_sessions s WHERE s.conversation_id = c.id), '-') FROM conversations c WHERE c.id = ?" "$CONV")"
  [ "$LABELS" = "grok_build / grok_build" ] && ok "[db] conversation / runtime session: $LABELS" || bad "[db] conversation / runtime session: $LABELS (expected grok_build / grok_build)"
  look "[db] messages (role · turn id · text):"
  qrows "$DB" "SELECT role, ifnull(json_extract(metadata,'\$.turn_id'),'-'), substr(replace(content, char(10), ' '), 1, 80) FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid" "$CONV" | show
  local nUser nAsst UNPAIRED
  nUser="$(q "$DB" "SELECT count(*) FROM messages WHERE conversation_id = ? AND role = 'user'" "$CONV")"; nAsst="$(q "$DB" "SELECT count(*) FROM messages WHERE conversation_id = ? AND role = 'assistant'" "$CONV")"
  [ "$nUser" = "$TURNS" ] && [ "$nAsst" = "$TURNS" ] && ok "[db] $TURNS prompt(s), $TURNS reply(ies): the session-end Stop added nothing (Stop fired $nStop)" || bad "[db] $nUser prompt(s), $nAsst reply(ies) for $TURNS turn(s) (Stop fired $nStop)"
  UNPAIRED="$(q "$DB" "SELECT count(*) FROM messages a WHERE a.conversation_id = ? AND a.role = 'assistant' AND (json_extract(a.metadata,'\$.turn_id') IS NULL OR NOT EXISTS (SELECT 1 FROM messages u WHERE u.conversation_id = a.conversation_id AND u.role = 'user' AND json_extract(u.metadata,'\$.turn_id') = json_extract(a.metadata,'\$.turn_id')))" "$CONV")"
  [ "$UNPAIRED" = 0 ] && ok "[db] every reply carries its prompt's promptId (written by the Stop hook)" || bad "[db] $UNPAIRED reply(ies) without a matching promptId"
  if [ "$run" = tui ]; then
    q "$DB" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at LIMIT 1" "$CONV" | grep -qE '^[/$]' && bad "[db] the Mirror question was logged with its form" || ok "[db] the Mirror question logged without its /mm-mirror form"
    q "$DB" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at LIMIT 1" "$CONV" | grep -q "◇" && ok "[db] the ◇ answer logged as the reply" || note "[db] the first reply carries no ◇ (read it above)"
  fi
  local SKIPS FAILS
  SKIPS="$(awk -v s="$START" 'substr($1,1,19) >= substr(s,1,19)' "$MHOME/hooks.log" 2>/dev/null | grep -c 'reply skipped' || true)"
  FAILS="$(awk -v s="$START" 'substr($1,1,19) >= substr(s,1,19)' "$MHOME/hooks.log" 2>/dev/null | grep -v 'reply skipped' | grep -c . || true)"
  [ "$SKIPS" = 0 ] && ok "[hooks.log] no reply skipped" || note "[hooks.log] $SKIPS reply-skipped line(s)"
  [ "$FAILS" = 0 ] && ok "[hooks.log] no hook recorded a failure" || { bad "[hooks.log] $FAILS line(s):"; awk -v s="$START" 'substr($1,1,19) >= substr(s,1,19)' "$MHOME/hooks.log" | head -3 | scrub | show; }
  # 4. the close: two witnesses against the probe's SessionEnd time (amendment 4)
  local ENDED ENDMS SEND SENDMS
  ENDED="$(q "$DB" "SELECT ifnull(ended_at,'') FROM conversations WHERE id = ?" "$CONV")"
  SEND="$(node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(JSON.parse).find(x=>x.event==="SessionEnd");console.log(l?l.at:"")' "$DIR/hooks.jsonl" 2>/dev/null)"
  if [ -z "$ENDED" ]; then
    bad "[close] the conversation is still OPEN (no ended_at): SessionEnd did not close it — if the TUI is still running, quit it and check again"
  else
    ENDMS="$(ms_of "${ENDED%Z}Z")"; SENDMS="$(ms_of "$SEND")"
    local ACTIVE; ACTIVE="$(q "$DB" "SELECT ifnull((SELECT count(*) FROM runtime_sessions WHERE conversation_id = ? AND active = 1), 0)" "$CONV")"
    [ "$ACTIVE" = 0 ] && ok "[close] ended_at $ENDED; the runtime session inactive" || bad "[close] ended_at set but $ACTIVE runtime session(s) still active"
    if [ -n "$SEND" ] && [ "$SENDMS" -gt 0 ]; then
      local DELTA=$((ENDMS - SENDMS))
      [ "$DELTA" -ge -2000 ] && [ "$DELTA" -le "$BOUND_MS" ] && ok "[close] witness 1: ended_at is ${DELTA} ms after the probe's SessionEnd (bound ${BOUND_MS} ms)" || note "[close] witness 1: ended_at is ${DELTA} ms from the probe's SessionEnd (bound ${BOUND_MS} ms; the two hooks run side by side)"
    else note "[close] witness 1: no probe SessionEnd timestamp to compare"; fi
    local NB; NB="$(node -e 'const fs=require("fs"),p=require("path");const d=process.argv[1];const e=Date.parse(process.argv[2]);try{const f=fs.readdirSync(d).filter(n=>/\.zip$/.test(n)).map(n=>({n,t:fs.statSync(p.join(d,n)).mtimeMs})).filter(x=>x.t>=e-2000).sort((a,b)=>b.t-a.t)[0];console.log(f?f.n+" "+Math.round(f.t-e)+"ms":"");}catch{console.log("")}' "$MHOME/backups" "${ENDED%Z}Z")"
    [ -n "$NB" ] && ok "[close] witness 2: a backup written at the close ($NB after ended_at)" || bad "[close] witness 2: no backup newer than ended_at — the close was cut before its last write"
    local FLAG; FLAG="$(q "$DB" "SELECT ifnull(json_extract(metadata,'\$.close_tail_pending'),'') FROM conversations WHERE id = ?" "$CONV")"
    local SUMMARY; SUMMARY="$(q "$DB" "SELECT CASE WHEN ifnull(summary,'') <> '' THEN 'present' ELSE 'absent' END FROM conversations WHERE id = ?" "$CONV")"
    if [ "$FLAG" = 1 ]; then ok "[close] close_tail_pending = 1: the LLM tail deferred (DS4.TS2 on Grok)"
    elif [ "$SUMMARY" = present ]; then ok "[close] the tail already finished (no flag, summary present)"
    else bad "[close] no close_tail_pending and no summary: the close ran no deferral"; fi
    local CALLS; CALLS="$(q "$DB" "SELECT count(*) FROM llm_calls WHERE conversation_id = ? AND called_at >= ? AND called_at < datetime(?, '+3 seconds')" "$CONV" "$ENDED" "$ENDED")"
    [ "${CALLS:-0}" = 0 ] && ok "[ledger] no LLM call at the close itself" || bad "[ledger] $CALLS LLM call(s) within 3 s of ended_at"
  fi
  # Grok's own log: hook executions, timeouts, kills, and the session's model
  node -e '
    const fs=require("fs"); let ls=[]; try{ls=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)}catch{}
    const since=Date.parse(process.argv[2]); ls=ls.filter(j=>Date.parse(j.ts)>=since-1000);
    const hook=ls.filter(j=>/hook/i.test(j.msg)||/hook/i.test(JSON.stringify(j.ctx||{})));
    const kills=hook.filter(j=>j.msg!=="slash.advertise"&&j.msg!=="slash.registry.update"&&/timeout|timed out|killed|exceed/i.test(j.msg+JSON.stringify(j.ctx||{})));
    const phases=ls.filter(j=>j.msg==="turn.phase_transition"&&j.ctx&&j.ctx.from==="waiting_hooks").map(j=>j.ctx.phase_elapsed_ms+"ms");
    const model=ls.map(j=>j.ctx&&(j.ctx.model||j.ctx.model_id)).find(Boolean);
    console.log(`[grok-log] ${ls.length} lines since ${since}; hook lines ${hook.length}; timeout/kill lines ${kills.length}${model?"; model "+model:""}`);
    for (const j of kills.slice(0,3)) console.log("  "+j.msg+" "+JSON.stringify(j.ctx||{}).replace(/\/private\/tmp\/[^"]*/g,"<scratch>").slice(0,160));
    if (phases.length) console.log("  time the turn waited on its pre-model hooks (waiting_hooks): "+phases.join(" "));
  ' "$GH/logs/unified.jsonl" "$START" | show
  look "[mcp] server stderr log: $([ -f "$GH/logs/mcp/mirror-mind.stderr.log" ] && { [ -s "$GH/logs/mcp/mirror-mind.stderr.log" ] && echo "NOT EMPTY: $(head -1 "$GH/logs/mcp/mirror-mind.stderr.log" | cut -c1-100)" || echo "empty"; } || echo "absent")"
  if [ "$run" = tui ]; then
    local ADV; ADV="$(node -e 'const fs=require("fs");let ls=[];try{ls=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean)}catch{};const since=Date.parse(process.argv[2]);const a=ls.filter(j=>Date.parse(j.ts)>=since-1000&&j.msg==="slash.advertise").map(j=>(j.ctx.names||[]).filter(n=>/^mm-/.test(n)).length);console.log(a.length?Math.max(...a):0)' "$GH/logs/unified.jsonl" "$START")"
    [ "$ADV" -ge 25 ] && ok "[skills] $ADV mm-* skills advertised as slash commands in this session" || bad "[skills] $ADV mm-* advertised (expected 25)"
    # R2's tail, finished by this session's start — read from state (amendment 5)
    if [ -f "$LIVE/R2/id" ]; then
      local C2; C2="$(find_conversation "US3-$(cat "$LIVE/R2/id")-R2" "$(cat "$LIVE/R2/started")")"
      local F2 S2; F2="$(q "$DB" "SELECT ifnull(json_extract(metadata,'\$.close_tail_pending'),'') FROM conversations WHERE id = ?" "$C2")"; S2="$(q "$DB" "SELECT CASE WHEN ifnull(summary,'') <> '' THEN 'present' ELSE 'absent' END FROM conversations WHERE id = ?" "$C2")"
      local T2; T2="$(q "$DB" "SELECT ifnull(title,'') FROM conversations WHERE id = ?" "$C2")"
      [ "$F2" != 1 ] && [ -n "$T2" ] && ok "[tail] R2's tail finished by this session's start: flag gone, title \"${T2:0:50}\" (summary $S2: deferred by policy for a short conversation)" || note "[tail] R2: flag=${F2:-none}, title '${T2:0:40}' — run: bash $SELF finish R2"
    fi
  fi
  echo "$CONV" >"$DIR/conversation"
  look "spend (Mirror ledger, this conversation): $(qrows "$DB" "SELECT role, model, printf('%.5f', ifnull(cost_usd,0)) FROM llm_calls WHERE conversation_id = ? ORDER BY called_at" "$CONV" | awk -F'\t' '{printf "%s(%s %s) ", $1, $2, $3} END {if (NR==0) printf "none yet"}')"
  result
}

# ============================================================================
# The next start's maintenance, explicitly, with the session environment.
finish() {
  local run="${1:-}"; case "$run" in R0|R1|R2|tui) ;; *) echo "usage: bash $SELF finish R0|R1|R2|tui"; exit 2 ;; esac
  local DIR="$LIVE/$run"
  [ -f "$DIR/conversation" ] || { echo "No checked conversation for $run; run: bash $SELF check $run"; exit 2; }
  local CONV; CONV="$(cat "$DIR/conversation")"
  say "Finish $run — what the next session start runs (session-maintenance, with the key)"
  local BEFORE; BEFORE="$(q "$DB" "SELECT count(*) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  as_person mirror conversation-logger session-maintenance >"$DIR/finish.out" 2>&1
  grep -E "Finished deferred close tails|Extracted|extract|Closed stale" "$DIR/finish.out" | head -5 | show
  grep -q "Finished deferred close tails: 1" "$DIR/finish.out" && ok "[tail] Finished deferred close tails: 1" || note "[tail] $(grep -o 'Finished deferred close tails: [0-9]*' "$DIR/finish.out" || echo 'no deferred-tail line (already finished, or nothing pending)')"
  local FLAG TITLE SUMMARY
  FLAG="$(q "$DB" "SELECT ifnull(json_extract(metadata,'\$.close_tail_pending'),'') FROM conversations WHERE id = ?" "$CONV")"
  TITLE="$(q "$DB" "SELECT ifnull(title,'') FROM conversations WHERE id = ?" "$CONV")"
  SUMMARY="$(q "$DB" "SELECT CASE WHEN ifnull(summary,'') <> '' THEN 'present' ELSE 'absent' END FROM conversations WHERE id = ?" "$CONV")"
  [ -z "$FLAG" ] && ok "[db] the flag is gone" || bad "[db] close_tail_pending still $FLAG"
  # The tail generates a title; summary and tags are deferred by policy until the
  # conversation has substance (metadataLifecycle: four substantive messages).
  local SUBST; SUBST="$(q "$DB" "SELECT count(*) FROM messages WHERE conversation_id = ? AND length(trim(content)) > 0" "$CONV")"
  [ -n "$TITLE" ] && ok "[db] title generated: \"${TITLE:0:60}\"" || bad "[db] no title after the tail"
  if [ "$SUMMARY" = present ]; then ok "[db] summary present"
  elif [ "${SUBST:-0}" -lt 4 ]; then note "[db] summary deferred by policy: $SUBST message(s), fewer than the four the lifecycle needs (tags likewise)"
  else bad "[db] no summary for a conversation of $SUBST messages"; fi
  look "[ledger] calls for this conversation (role · model · cost):"
  qrows "$DB" "SELECT role, model, printf('%.5f', ifnull(cost_usd,0)), called_at FROM llm_calls WHERE conversation_id = ? ORDER BY called_at" "$CONV" | show
  local AFTER; AFTER="$(q "$DB" "SELECT count(*) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  look "[ledger] $((AFTER - BEFORE)) call(s) by this finish; Mirror spend so far: $(q "$DB" "SELECT printf('%.4f', ifnull(sum(cost_usd),0)) FROM llm_calls") USD"
  q "$DB" "SELECT ifnull(sum(cost_usd),0) > 1.0 FROM llm_calls" | grep -q 1 && bad "Mirror's US$ 1.00 ceiling exceeded: stop (decision 4)" || true
  result
}

# ============================================================================
headless() {
  local r
  for r in R0 R1 R2; do
    session "$r" || return 1
    [ "${DS10_US3_DRY:-0}" = 1 ] && continue
    check "$r" || true
    case "$r" in R0|R1) finish "$r" || true ;; esac
  done
  say "R2's tail is left for the TUI session's own start (check tui reads it from state; bash $SELF finish R2 is the fallback)"
}

# ============================================================================
tui() {
  say "TUI — the Navigator's session"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  evidence_header
  preflight || exit 2
  [ -L "$GH/rules/mirror-mind.md" ] || ln -sf "$PKG/AGENTS.md" "$GH/rules/mirror-mind.md"
  run_prepare tui
  local DIR="$LIVE/tui" ID; ID="$(cat "$DIR/id")"
  rm -f "$GH/logs/mcp/mirror-mind.stderr.log"
  cat <<EOF

  Two turns, then quit. Send exactly:

  1.  /mm-mirror should I raise my price? (ref US3-$ID-tui)
      Grok asks permission to run \`mirror mirror load\`: approve it. Expect a ◇ persona
      answer from the scratch identity (slow: DS12.TS4 L5 saw 5 m 30 s).

  2.  Answer from your context alone, in three lines and nothing else. Line 1: the four operating modes of the Mirror and the glyph that marks a persona's answer, or UNKNOWN. Line 2: what the Ariad surface transport invariant tells you to do with marked blocks, in ten words or fewer, or UNKNOWN. Line 3: any token starting with CANARY- that you can see in your context, or NONE. (ref US3-$ID-tui)
      Expect the four modes and ◇; "preserve … verbatim"; NONE.

  Then quit Grok (/quit or Ctrl+D).

  While it runs, note two things on screen for the record:
    (a) at session start, a line reading CANARY-DS10-$(cat "$DIR/canary")-start (the probe's
        systemMessage, shown on screen only: DS12.TS4 L2);
    (b) the ◇ answer to turn 1.

  Afterwards, from this package directory:
      bash route.sh check tui && bash route.sh finish tui && bash route.sh untouched

  The command line carries no --yolo and no --permission-mode: Grok asks, you approve.
EOF
  look "Starting grok in $PROJECT with HOME=$PERSON …"
  [ "${DS10_US3_DRY:-0}" = 1 ] && { note "DS10_US3_DRY=1: prepared, session not started"; return 0; }
  as_person grok
  date -u +%Y-%m-%dT%H:%M:%SZ >"$DIR/ended"
}

# ============================================================================
untouched() {
  say "Untouched — the real ~/.grok, ~/.claude, ~/.config/mirror, and the real Mirror databases vs the baseline"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run setup first."; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "every entry as it was before setup ($(wc -l <"$D/real-now.txt" | tr -d ' ') entries; auth.json outside the set by design)"
  else
    bad "something real changed (see $D/real-diff.txt):"; grep -E '^[-+][^-+]' "$D/real-diff.txt" | head -10 | show
  fi
  # The real Mirror databases keep changing while the Navigator's own Pi session
  # logs this very conversation (which quotes the markers), so neither a hash nor
  # a marker grep can stand. What must not be there: a grok_build conversation, or
  # a runtime session, started since setup — the only kind this route creates.
  local SETUP hit=0 db n
  SETUP="$(date -u -r "$(stat -f '%m' "$D/.ds10-us3")" +%Y-%m-%dT%H:%M:%SZ)"
  for db in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$db" ] || continue
    n="$(q "$db" "SELECT (SELECT count(*) FROM conversations WHERE interface = 'grok_build' AND started_at >= ?) + (SELECT count(*) FROM runtime_sessions WHERE interface = 'grok_build' AND started_at >= ?)" "$SETUP" "$SETUP")"
    [ "${n:-0}" = 0 ] || { hit=1; bad "a real Mirror database gained $n grok_build conversation/session(s) since setup: ${db#"$REAL_HOME"/}"; }
  done
  [ "$hit" = 0 ] && ok "no grok_build conversation or runtime session in any real Mirror database since setup ($SETUP)"
  look "leaders: $(grok leader list 2>/dev/null | tr '\n' ' ')"
  result
}

clean() {
  say "Clean"
  [ -S "$GH/leader.sock" ] && note "leader socket under the scratch home: stopping" && env HOME="$PERSON" GROK_HOME="$GH" grok leader kill >/dev/null 2>&1
  [ -f "$D_RAW/.ds10-us3" ] && rm -rf "$D_RAW" && ok "removed $D_RAW" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup ;;
  headless) headless ;;
  session) session "${2:-}" ;;
  check) check "${2:-}" ;;
  finish) finish "${2:-}" ;;
  tui) tui ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,25p' "$SELF"; exit 2 ;;
esac
