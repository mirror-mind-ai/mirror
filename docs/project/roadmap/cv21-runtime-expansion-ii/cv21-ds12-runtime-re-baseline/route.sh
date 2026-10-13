#!/usr/bin/env bash
# CV21.DS12 -- the Runtime Re-Baseline route.
#
# One command per step. Each prints what it measured (✓ / ✗ / •) and the
# evidence to read, and every runtime step starts with the runtime's version,
# binary, and date (the evidence rule).
#
#   bash route.sh setup         scratch install, scratch homes, real-config baseline
#   bash route.sh versions      version, binary, and date of each runtime
#   bash route.sh claude        TS1 static: plugin, hooks, MCP (no login, no model call)
#   bash route.sh codex         TS2 static: discovery, hooks, Claude-format plugin
#   bash route.sh antigravity   TS3 static: validate, `agy plugin import claude`
#   bash route.sh grok          TS4 static: validate, install, inspect, docs
#   bash route.sh extensions    TS5: how a user extension reaches each runtime
#   bash route.sh live-claude   the Navigator's session, then: bash route.sh check-claude
#   bash route.sh live-codex    (likewise live-antigravity, live-grok; at most two turns each)
#   bash route.sh verify        recorded versions vs installed; the static claims re-run
#   bash route.sh untouched     real runtime configs vs the baseline; canary search
#   bash route.sh clean         remove the scratch directory (and any login in it)
#
# Everything lives under DS12_DIR (default /tmp/cv21-ds12). The static steps never
# read or write your real Mirror home, ~/.config/mirror, ~/.claude, ~/.codex,
# ~/.gemini, or ~/.grok: each runtime runs with a scratch HOME and, where the
# runtime has one, a scratch config variable (CLAUDE_CONFIG_DIR, CODEX_HOME).
# `untouched` READS your real configs and databases, to prove nothing reached them.
#
# A script, not a block to paste: an interactive shell's aliases and `set -e`
# do not reach it (CV22 collaboration strategy, "Make validation portable").

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)"
SELF="${BASH_SOURCE[0]}"
D_RAW="${DS12_DIR:-/tmp/cv21-ds12}"
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
  MHOME="$SHOME/.mirror-minds/ds12"   # their Mirror home (no provider key)
  CACHE="$D/claude-cache/plugins/mirror-mind"
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

# The evidence rule: version, binary (every `which -a` entry and what it resolves
# to), and the date, printed at the head of a runtime's step and appended to
# evidence/versions.tsv.
stamp() {
  local cmd="$1" first resolved version when
  first="$(command -v "$cmd" 2>/dev/null || true)"
  if [ -z "$first" ]; then note "$cmd: not installed"; return 1; fi
  resolved="$(readlink -f "$first" 2>/dev/null || echo "$first")"
  version="$("$first" --version 2>&1 | head -1)"
  when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  look "$cmd $version · $first → $resolved · $when"
  local others
  others="$(which -a "$cmd" 2>/dev/null | awk '!seen[$0]++' | tail -n +2 | tr '\n' ' ')"
  [ -n "$others" ] && note "also on the PATH: $others"
  mkdir -p "$EVIDENCE"
  printf '%s\t%s\t%s\t%s\t%s\n' "$when" "$cmd" "$version" "$first" "$resolved" >>"$EVIDENCE/versions.tsv"
}

# Keep a command's full output as evidence, and print its first lines.
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  "$@" >"$EVIDENCE/$name.out" 2>&1
  local code=$?
  printf '%s\n' "exit $code" >>"$EVIDENCE/$name.out"
  return $code
}

# The real runtime configuration this route promises not to touch. Session logs,
# caches, and histories are not configuration and are left out: a runtime you
# use while the route runs changes them, and they would read as false alarms.
REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/hooks .claude/skills
  .claude/plugins/installed_plugins.json .claude/plugins/known_marketplaces.json
  .claude/statusline-command.sh
  .codex/config.toml .codex/hooks.json .codex/AGENTS.md .codex/skills
  .gemini/settings.json .gemini/antigravity-cli/settings.json .antigravity/extensions
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

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install, scratch homes, and the real-config baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds12" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW"
  mkdir -p "$D_RAW/prefix" "$D_RAW/home" "$D_RAW/project" "$D_RAW/pi-sessions" "$D_RAW/evidence" \
    && touch "$D_RAW/.ds12"
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

  as_scratch mirror init ds12 >"$EVIDENCE/init.out" 2>&1
  as_scratch mirror seed >"$EVIDENCE/seed.out" 2>&1
  [ -f "$MHOME/memory.db" ] && ok "scratch Mirror home created: $MHOME" || bad "no scratch Mirror home (see evidence/init.out)"
  n="$(as_scratch mirror list personas 2>/dev/null | grep -c '^  [a-z]' || true)"
  [ "$n" -ge 12 ] && ok "identity seeded ($n personas)" || bad "seed failed (see evidence/seed.out)"
  grep -q "OPENROUTER_API_KEY" "$SHOME/.config/mirror/env" 2>/dev/null \
    && bad "the scratch config holds a provider key" || ok "the scratch Mirror has no provider key: it cannot spend"
  result
}

versions() {
  say "Versions — the evidence rule's header"
  for cmd in claude codex agy grok gemini; do stamp "$cmd"; done
  look "appended to $EVIDENCE/versions.tsv"
}

# ---------------------------------------------------------------------------
claude_step() {
  need_install
  say "TS1 — Claude Code, static (no login, no model call)"
  stamp claude || { result; return; }
  local CH="$D/claude-home" CC="$D/claude-home/.claude"
  rm -rf "$CH" && mkdir -p "$CC/skills" && chmod 700 "$CH"
  ln -s "$PKG/plugins/mirror-mind" "$CC/skills/mirror-mind"

  echo; look "1. the shipped plugin against Claude Code's validator:"
  keep claude-validate with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin validate "$PKG/plugins/mirror-mind"
  tail -4 "$EVIDENCE/claude-validate.out" | show
  grep -qiE "passed|valid" "$EVIDENCE/claude-validate.out" && ! grep -qi "error" "$EVIDENCE/claude-validate.out" \
    && ok "claude plugin validate accepts plugins/mirror-mind" || bad "the validator did not accept it (evidence/claude-validate.out)"

  echo; look "2. the one-step wiring (a skills-dir plugin), in a scratch config:"
  keep claude-list with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin list
  grep -A3 "mirror-mind" "$EVIDENCE/claude-list.out" | show
  grep -q "mirror-mind@skills-dir" "$EVIDENCE/claude-list.out" \
    && ok "listed as mirror-mind@skills-dir" || bad "not listed as mirror-mind@skills-dir"
  keep claude-details with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin details mirror-mind
  grep -E "Skills \(|Hooks \(|MCP servers \(" "$EVIDENCE/claude-details.out" | cut -c1-100 | show
  for want in "Skills (25)" "Hooks (3)" "MCP servers (1)"; do
    grep -qF "$want" "$EVIDENCE/claude-details.out" && ok "$want" || bad "expected $want"
  done

  echo; look "3. can a plugin carry a status line? (a scratch copy, with the key added)"
  local SL="$D/statusline-plugin"
  rm -rf "$SL" && cp -R "$PKG/plugins/mirror-mind" "$SL"
  node -e 'const f=process.argv[1],fs=require("fs");const m=JSON.parse(fs.readFileSync(f,"utf8"));
    m.statusLine={type:"command",command:"${CLAUDE_PLUGIN_ROOT}/statusline.sh"};
    fs.writeFileSync(f,JSON.stringify(m,null,2));' "$SL/.claude-plugin/plugin.json"
  keep claude-validate-statusline with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin validate "$SL"
  tail -4 "$EVIDENCE/claude-validate-statusline.out" | show
  if grep -q "Unknown field 'statusLine'" "$EVIDENCE/claude-validate-statusline.out"; then
    note "manifest key: \"Unknown field 'statusLine'. Claude Code ignores it at load time.\""
  else
    note "the validator did not reject a manifest statusLine (read evidence/claude-validate-statusline.out)"
  fi
  rm -rf "$SL" && cp -R "$PKG/plugins/mirror-mind" "$SL"
  printf '%s\n' '{ "statusLine": { "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/statusline.sh" } }' >"$SL/settings.json"
  keep claude-validate-settings with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin validate "$SL"
  grep -iE "settings|statusLine|unknown" "$EVIDENCE/claude-validate-settings.out" | head -4 | show
  rm -f "$CC/skills/mirror-mind" && ln -s "$SL" "$CC/skills/mirror-mind"
  keep claude-details-settings with_home "$CH" env CLAUDE_CONFIG_DIR="$CC" claude plugin details mirror-mind
  grep -iE "settings|status" "$EVIDENCE/claude-details-settings.out" | head -4 | show
  note "plugin-root settings.json: read the two outputs above (validator, then the loaded inventory)"
  rm -f "$CC/skills/mirror-mind" && ln -s "$PKG/plugins/mirror-mind" "$CC/skills/mirror-mind"

  echo; look "4. the plugin's hooks, from a copy outside any tree, against the scratch Mirror:"
  rm -rf "$CACHE" && mkdir -p "$(dirname "$CACHE")" && cp -R "$PKG/plugins/mirror-mind" "$CACHE"
  rm -f "$MHOME/hooks.log"
  local OUT FIRST
  OUT="$(cd "$D/project" && as_scratch env CLAUDE_PROJECT_DIR="$D/project" bash "$CACHE/hooks/session-start.sh" </dev/null)"
  FIRST="$(printf '%s' "$OUT" | node -e '
    const agents = require("fs").readFileSync(process.argv[1], "utf8");
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      try { const h = JSON.parse(s).hookSpecificOutput;
            console.log(h.hookEventName + " | " + (h.additionalContext === agents ? "AGENTS.md, byte-identical" : "something else")); }
      catch { console.log("(no JSON)"); } });' "$PKG/AGENTS.md")"
  printf '%s\n' "$FIRST" | show
  [ "$FIRST" = "SessionStart | AGENTS.md, byte-identical" ] \
    && ok "SessionStart hands the Operating Instructions to the session (D13)" || bad "SessionStart did not deliver AGENTS.md"
  local ROW RUN
  RUN="$(date -u +%H%M%S)"
  printf '{"session_id":"ds12-ts1-%s","prompt":"DS12 TS1 %s: hello from the plugin copy"}' "$RUN" "$RUN" \
    | (cd "$D/project" && as_scratch bash "$CACHE/hooks/log-user-prompt.sh") >/dev/null 2>&1
  ROW="$(sqlite3 "$MHOME/memory.db" "SELECT c.interface FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content = 'DS12 TS1 $RUN: hello from the plugin copy'" 2>/dev/null)"
  [ "$ROW" = "claude_code" ] && ok "UserPromptSubmit logged the prompt, labelled claude_code" || bad "the prompt did not reach the scratch Mirror ($ROW)"

  echo; look "5. the inject hook's explicit form, as the shell matches it, and as a plugin names it:"
  local form out sid=0
  for form in "/mirror-mind:mm:mirror should I raise my price?" "/mm:mirror should I raise my price?"; do
    sid=$((sid + 1))   # one fresh session per form: a second call in the same session is owed context
    out="$(printf '{"session_id":"ds12-ts1-inject-%s","prompt":"%s"}' "$sid" "$form" \
      | (cd "$D/project" && as_scratch bash "$CACHE/hooks/mirror-inject.sh") 2>/dev/null | wc -c | tr -d ' ')"
    if [ "$out" -gt 0 ]; then ok "\"${form%% *}\" in a fresh session injects context ($out bytes)"
    else note "\"${form%% *}\" in a fresh session injects nothing"; fi
  done
  note "which of the two Claude Code actually sends for a plugin skill is a live question (live-claude)"

  echo; look "6. the MCP server, through the plugin's launcher:"
  local REPLY
  REPLY="$(printf '%s\n%s\n%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ds12","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    | (cd "$D/project" && as_scratch bash "$CACHE/mcp/launch.sh" 2>"$EVIDENCE/mcp.err"))"
  printf '%s\n' "$REPLY" >"$EVIDENCE/claude-mcp.out"
  local INFO
  INFO="$(printf '%s\n' "$REPLY" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
    const lines=s.trim().split("\n").map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const init=lines.find(l=>l.id===1), list=lines.find(l=>l.id===2);
    console.log((init?.result?.serverInfo?.name??"?")+" "+(init?.result?.serverInfo?.version??"?")+" · "+(list?.result?.tools?.length??0)+" tools");})')"
  printf '%s\n' "$INFO" | show
  case "$INFO" in "mirror-mind "*" · 7 tools") ok "the launcher starts the server and it lists 7 tools" ;; *) bad "unexpected MCP answer (evidence/claude-mcp.out)" ;; esac
  [ -f "$MHOME/hooks.log" ] && { bad "hooks.log recorded a failure:"; show <"$MHOME/hooks.log"; } || ok "no hook recorded a failure"
  result
}

# ---------------------------------------------------------------------------
codex_step() {
  need_install
  say "TS2 — Codex, static (no login, no model call)"
  stamp codex || { result; return; }
  local CX="$D/codex-home"
  rm -rf "$CX" && mkdir -p "$CX/skills" && chmod 700 "$CX"
  ln -s "$PKG/.pi/skills" "$CX/skills/mirror-mind"
  ln -s "$PKG/AGENTS.md" "$CX/AGENTS.md"

  echo; look "1. the two steps v0.32.1 prints, in a scratch CODEX_HOME; the prompt rendered, no model call:"
  (cd "$D/project" && with_home "$D/codex-person" env CODEX_HOME="$CX" codex debug prompt-input hello \
    >"$EVIDENCE/codex-prompt.json" 2>"$EVIDENCE/codex-prompt.err")
  local n
  n="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/codex-prompt.json" | sort -u | wc -l | tr -d ' ')"
  [ "$n" -eq 25 ] && ok "Codex discovers all 25 Mirror skills" || bad "Codex discovers $n skills (expected 25)"
  grep -q "Mirror Operating Instructions" "$EVIDENCE/codex-prompt.json" \
    && ok "the Operating Instructions are in the model's prompt" || bad "the Operating Instructions are not in the prompt"

  echo; look "2. the hook events this binary declares (its embedded schema):"
  local BIN events STR="$EVIDENCE/codex-strings.txt"
  BIN="$(readlink -f "$(command -v codex)")"
  strings -n 6 "$BIN" >"$STR"
  events="$(grep -oE 'PreToolUsePermissionRequestPostToolUsePreCompactPostCompactSessionStartSessionEndUserPromptSubmitSubagentStartSubagentStopStopInterrupt' "$STR" | head -1)"
  if [ -n "$events" ]; then
    printf '%s\n' "PreToolUse PermissionRequest PostToolUse PreCompact PostCompact SessionStart SessionEnd UserPromptSubmit SubagentStart SubagentStop Stop Interrupt" | show
    ok "the hook-event table includes SessionEnd (DS3 recorded none on 0.139.0)"
  else
    note "the hook-event table was not found in the binary strings"
  fi
  grep -q '\.claude-plugin/plugin\.json' "$STR" \
    && ok "the binary names .claude-plugin/plugin.json beside .codex-plugin/plugin.json" || note "no .claude-plugin manifest path in the binary"
  grep -q 'CLAUDE_PLUGIN_ROOT' "$STR" && ok "and CLAUDE_PLUGIN_ROOT" || note "no CLAUDE_PLUGIN_ROOT"
  grep -q 'this event cannot emit additionalContext' "$STR" \
    && note "it also says some event \"cannot emit additionalContext\" (which ones: live-codex)"

  echo; look "3. do hooks run before the model, without a model call? (canary hooks, scratch CODEX_HOME)"
  local CANARY
  CANARY="CANARY-DS12-CODEX-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
  cat >"$CX/hooks.json" <<EOF
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"$CANARY-start\"}}'" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"UserPromptSubmit\",\"additionalContext\":\"$CANARY-turn\"}}'" }] }]
  }
}
EOF
  (cd "$D/project" && with_home "$D/codex-person" env CODEX_HOME="$CX" codex debug prompt-input hello \
    >"$EVIDENCE/codex-prompt-hooks.json" 2>"$EVIDENCE/codex-prompt-hooks.err")
  for kind in start turn; do
    if grep -q "$CANARY-$kind" "$EVIDENCE/codex-prompt-hooks.json"; then ok "$kind canary reached the rendered prompt"
    else note "$kind canary not in the rendered prompt (prompt-input may not run hooks, or untrusted hooks are skipped)"; fi
  done
  grep -iE "hook|trust" "$EVIDENCE/codex-prompt-hooks.err" | head -5 | show
  rm -f "$CX/hooks.json"

  echo; look "4. the Claude-format plugin through a local Codex marketplace (scratch CODEX_HOME):"
  local MP="$D/codex-marketplace"
  rm -rf "$MP" && mkdir -p "$MP/.agents/plugins" && cp -R "$PKG/plugins/mirror-mind" "$MP/mirror-mind"
  cat >"$MP/.agents/plugins/marketplace.json" <<'EOF'
{
  "name": "ds12-local",
  "owner": { "name": "CV21.DS12 route" },
  "plugins": [
    { "name": "mirror-mind", "source": { "source": "local", "path": "./mirror-mind" },
      "description": "Mirror Mind, as plugins/mirror-mind ships it" }
  ]
}
EOF
  keep codex-mp-add with_home "$D/codex-person" env CODEX_HOME="$CX" codex plugin marketplace add "$MP"
  tail -3 "$EVIDENCE/codex-mp-add.out" | show
  keep codex-plugin-list with_home "$D/codex-person" env CODEX_HOME="$CX" codex plugin list
  grep -i "mirror" "$EVIDENCE/codex-plugin-list.out" | head -5 | show
  keep codex-plugin-add with_home "$D/codex-person" env CODEX_HOME="$CX" codex plugin add mirror-mind@ds12-local
  tail -5 "$EVIDENCE/codex-plugin-add.out" | show
  if grep -q "^exit 0" "$EVIDENCE/codex-plugin-add.out"; then
    ok "Codex installed the Claude-format plugin from a local marketplace"
    (cd "$D/project" && with_home "$D/codex-person" env CODEX_HOME="$CX" codex debug prompt-input hello \
      >"$EVIDENCE/codex-prompt-plugin.json" 2>/dev/null)
    rm -f "$CX/skills/mirror-mind"
    (cd "$D/project" && with_home "$D/codex-person" env CODEX_HOME="$CX" codex debug prompt-input hello \
      >"$EVIDENCE/codex-prompt-plugin-only.json" 2>/dev/null)
    n="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/codex-prompt-plugin-only.json" | sort -u | wc -l | tr -d ' ')"
    look "with the skills link removed, the plugin alone exposes $n mm-* skills to the prompt"
    find "$CX" -path "*mirror-mind*" -name hooks.json 2>/dev/null | head -3 | show
    keep codex-mcp-list with_home "$D/codex-person" env CODEX_HOME="$CX" codex mcp list
    look "MCP servers Codex now knows (scratch CODEX_HOME):"
    head -6 "$EVIDENCE/codex-mcp-list.out" | show
    look "what plugin add wrote to the scratch config.toml:"
    sed -n '1,30p' "$CX/config.toml" 2>/dev/null | show
  else
    note "Codex did not install it (read evidence/codex-plugin-add.out)"
  fi
  result
}

# ---------------------------------------------------------------------------
antigravity_step() {
  need_install
  say "TS3 — Antigravity, static (scratch HOME; no model call)"
  stamp agy || { result; return; }
  local AH="$D/agy-home"
  rm -rf "$AH" && mkdir -p "$AH/.claude/skills" && chmod 700 "$AH"

  echo; look "1. the shipped Claude-format plugin against agy's validator:"
  keep agy-validate with_home "$AH" agy plugin validate "$PKG/plugins/mirror-mind"
  tail -6 "$EVIDENCE/agy-validate.out" | show

  echo; look "2. \`agy plugin import claude\` with Mirror wired the way v0.32.1 wires Claude Code (skills-dir):"
  ln -s "$PKG/plugins/mirror-mind" "$AH/.claude/skills/mirror-mind"
  keep agy-import-skillsdir with_home "$AH" agy plugin import claude
  tail -6 "$EVIDENCE/agy-import-skillsdir.out" | show

  echo; look "3. ... and with Mirror installed from a local Claude marketplace (scratch Claude config):"
  local CMP="$D/claude-marketplace"
  rm -rf "$CMP" && mkdir -p "$CMP/.claude-plugin" && cp -R "$PKG/plugins/mirror-mind" "$CMP/mirror-mind"
  cat >"$CMP/.claude-plugin/marketplace.json" <<'EOF'
{
  "name": "ds12-local",
  "owner": { "name": "CV21.DS12 route" },
  "plugins": [ { "name": "mirror-mind", "source": "./mirror-mind", "description": "Mirror Mind, as plugins/mirror-mind ships it" } ]
}
EOF
  rm -f "$AH/.claude/skills/mirror-mind"
  keep agy-claude-mp-add with_home "$AH" env CLAUDE_CONFIG_DIR="$AH/.claude" claude plugin marketplace add "$CMP"
  keep agy-claude-install with_home "$AH" env CLAUDE_CONFIG_DIR="$AH/.claude" claude plugin install mirror-mind@ds12-local
  tail -2 "$EVIDENCE/agy-claude-install.out" | show
  keep agy-import-marketplace with_home "$AH" agy plugin import claude
  tail -8 "$EVIDENCE/agy-import-marketplace.out" | show
  keep agy-plugin-list-import with_home "$AH" agy plugin list --json
  head -3 "$EVIDENCE/agy-plugin-list-import.out" | show

  echo; look "3b. \`agy plugin install\` of the shipped plugin's path (agy's docs: install stages a Claude Code plugin):"
  keep agy-install with_home "$AH" agy plugin install "$PKG/plugins/mirror-mind"
  tail -8 "$EVIDENCE/agy-install.out" | show
  keep agy-plugin-list with_home "$AH" agy plugin list --json
  head -30 "$EVIDENCE/agy-plugin-list.out" | show
  look "what agy staged under the scratch HOME (outside .claude), files only:"
  (cd "$AH" && find . -path ./.claude -prune -o -newer "$EVIDENCE/agy-plugin-list-import.out" -type f -print 2>/dev/null \
    | grep -v -E '/(log|cache|crashes)/' | head -40) | show
  local STAGED
  STAGED="$(cd "$AH" && find . -path ./.claude -prune -o -name hooks.json -newer "$EVIDENCE/agy-plugin-list-import.out" -print 2>/dev/null | head -1)"
  if [ -n "$STAGED" ]; then
    look "the staged root hooks.json ($STAGED), first lines:"
    head -12 "$AH/$STAGED" | show
  fi

  echo; look "4. the hook surface this binary declares:"
  local BIN STR="$EVIDENCE/agy-strings.txt"
  BIN="$(readlink -f "$(command -v agy)")"
  strings -n 6 "$BIN" >"$STR"
  grep -oE '\b(PreToolHook|PostToolHook|PreInvocationHook|PostInvocationHook|StopHook|HookSystemMessage|LifecycleHook|SessionStart|UserPromptSubmit|additionalContext|PreToolUse|PostToolUse)\b' "$STR" \
    | sort | uniq -c | sort -rn | show
  grep -qE '\bUserPromptSubmit\b' "$STR" && note "UserPromptSubmit appears in the binary" || note "no UserPromptSubmit in the binary"
  grep -qE '\badditionalContext\b' "$STR" && note "additionalContext appears in the binary" || note "no additionalContext in the binary"
  grep -q '\.agents/hooks\.json' "$STR" && note "it reads a workspace .agents/hooks.json" || true
  echo; look "5. the binary's own documentation of the hook contract (embedded user guide):"
  grep -n -E 'Use to inject (welcome messages|context or instructions)|transient message|persists in the conversation trajectory|stages .hooks/hooks.json. into|must place .hooks.json. directly' "$STR" \
    | awk 'length($0) < 200' | show
  result
}

# ---------------------------------------------------------------------------
grok_step() {
  need_install
  say "TS4 — Grok Build, static (scratch HOME; no model call)"
  stamp grok || { result; return; }
  local GH="$D/grok-home"
  rm -rf "$GH" && mkdir -p "$GH/.claude/skills" && chmod 700 "$GH"

  echo; look "1. the shipped Claude-format plugin against Grok's validator:"
  keep grok-validate with_home "$GH" grok plugin validate "$PKG/plugins/mirror-mind"
  tail -6 "$EVIDENCE/grok-validate.out" | show

  echo; look "2. what Grok discovers with Mirror wired the way v0.32.1 wires Claude Code (skills-dir):"
  ln -s "$PKG/plugins/mirror-mind" "$GH/.claude/skills/mirror-mind"
  (cd "$D/project" && keep grok-inspect-skillsdir with_home "$GH" grok inspect --json)
  node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8").replace(/\nexit \d+\n?$/,"");
    try{const j=JSON.parse(s);const t=JSON.stringify(j);
      const mm=[...new Set((t.match(/mm[-:][a-z-]+/g)||[]))];
      console.log("mm skills seen: "+mm.length+(mm.length?" ("+mm.slice(0,4).join(", ")+", ...)":""));
      console.log("top-level keys: "+Object.keys(j).join(", "));}
    catch(e){console.log("(not JSON: "+s.slice(0,120).replace(/\n/g," ")+")");}' "$EVIDENCE/grok-inspect-skillsdir.out" | show
  rm -f "$GH/.claude/skills/mirror-mind"

  echo; look "3. \`grok plugin install\` of the shipped plugin, from its local path:"
  keep grok-install with_home "$GH" grok plugin install "$PKG/plugins/mirror-mind" --trust
  tail -6 "$EVIDENCE/grok-install.out" | show
  keep grok-plugin-list with_home "$GH" grok plugin list
  tail -6 "$EVIDENCE/grok-plugin-list.out" | show
  keep grok-plugin-details with_home "$GH" grok plugin details mirror-mind
  head -30 "$EVIDENCE/grok-plugin-details.out" | show
  (cd "$D/project" && keep grok-inspect-plugin with_home "$GH" grok inspect --json)
  node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8").replace(/\nexit \d+\n?$/,"");
    try{const t=JSON.stringify(JSON.parse(s));const mm=[...new Set((t.match(/mm[-:][a-z-]+/g)||[]))];
      console.log("with the plugin installed, mm skills seen: "+mm.length);
      console.log("hooks mentioned: "+((t.match(/SessionStart|UserPromptSubmit|SessionEnd/g)||[]).length));
      console.log("mirror-mind MCP mentioned: "+(/mirror-mind/.test(t)));}
    catch(e){console.log("(not JSON)");}' "$EVIDENCE/grok-inspect-plugin.out" | show

  echo; look "4. what the installed version's own docs say about injection (bundled user guide):"
  local DOC="$REAL_HOME/.grok/docs/user-guide/10-hooks.md"
  if [ -f "$DOC" ]; then
    grep -n -E "Observe-only events|UserPromptSubmit\` \| You submit|Tell the model something|For events like \`SessionStart\`" "$DOC" | cut -c1-200 | show
  else
    note "no bundled hooks guide at $DOC"
  fi
  result
}

# ---------------------------------------------------------------------------
extensions_step() {
  need_install
  say "TS5 — how a user-owned extension reaches each runtime (review-copy, scratch home)"
  stamp codex >/dev/null; stamp grok >/dev/null
  echo; look "1. install the reference extension into the scratch Mirror home:"
  as_scratch mirror extensions install review-copy --extensions-root "$ROOT/examples/extensions" \
    >"$EVIDENCE/ext-install.out" 2>&1
  sed -n '1,12p' "$EVIDENCE/ext-install.out" | show
  local rt
  for rt in claude pi codex antigravity grok; do
    if [ -f "$MHOME/runtime/skills/$rt/extensions.json" ]; then ok "a $rt catalog exists (its skill.yaml declares $rt)"
    else note "no $rt catalog: review-copy's skill.yaml declares no $rt block"; fi
  done

  echo; look "2. expose-claude into the scratch HOME: a personal Claude Code skill"
  as_scratch mirror extensions expose-claude --target-root "$SHOME" >"$EVIDENCE/ext-expose.out" 2>&1
  tail -2 "$EVIDENCE/ext-expose.out" | show
  [ -f "$SHOME/.claude/skills/ext-review-copy/SKILL.md" ] && ok "written to ~/.claude/skills/ext-review-copy" || bad "not written"

  echo; look "3. who else reads that Claude path, and who reads ~/.agents/skills (no model call):"
  local seen
  seen="$(cd "$D/project" && with_home "$SHOME" grok inspect --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{console.log(/review-copy/.test(JSON.stringify(JSON.parse(s).skills)))}catch{console.log("?")}})')"
  [ "$seen" = "true" ] && ok "Grok finds it in ~/.claude/skills (Claude compatibility)" || note "Grok does not find it there ($seen)"
  local AP="$D/agents-home"
  rm -rf "$AP" && mkdir -p "$AP/.agents/skills" "$D/agents-codex" && chmod 700 "$AP"
  cp -R "$SHOME/.claude/skills/ext-review-copy" "$AP/.agents/skills/"
  local n
  n="$(cd "$D/project" && with_home "$AP" env CODEX_HOME="$D/agents-codex" codex debug prompt-input hello 2>/dev/null | grep -c review-copy)"
  [ "${n:-0}" -ge 1 ] && ok "Codex finds a skill in ~/.agents/skills" || note "Codex does not read ~/.agents/skills"
  seen="$(cd "$D/project" && with_home "$AP" grok inspect --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{console.log(/review-copy/.test(JSON.stringify(JSON.parse(s).skills)))}catch{console.log("?")}})')"
  [ "$seen" = "true" ] && ok "Grok finds a skill in ~/.agents/skills" || note "Grok does not read ~/.agents/skills"
  grep -n -E 'Global +\| `<name>` +\| `~/.gemini/config/(global_)?workflows' "$EVIDENCE/agy-strings.txt" 2>/dev/null | head -2 | cut -c1-160 | show
  note "agy's guide puts global skills in ~/.gemini/config/skills/ and workspace skills in .agents/skills/ (run the antigravity step first for agy-strings.txt)"
  result
}

# ---------------------------------------------------------------------------
# Live probes (the Navigator's). One session per runtime, at most two turns.
#
# A probe hook captures every hook payload into live/<runtime>/hooks.jsonl and
# answers in the runtime's own injection format with a canary line:
# CANARY-DS12-<RT>-<id>-start at session start, ...-turn-<n> on each turn. The
# model is asked to quote any canary it can see: what it quotes is what reached
# it. Mirror's own plugin hooks run beside the probe, against the scratch home.

PROBE_JS='
const fs = require("fs"), path = require("path");
const [rt, ev] = process.argv.slice(2);
const dir = path.join(process.env.DS12_LIVE, rt);
let input = ""; try { input = fs.readFileSync(0, "utf8"); } catch {}
const id = fs.readFileSync(path.join(dir, "canary"), "utf8").trim();
const countFile = path.join(dir, "count-" + ev);
const n = (fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, "utf8")) : 0) + 1;
fs.writeFileSync(countFile, String(n));
fs.appendFileSync(path.join(dir, "hooks.jsonl"),
  JSON.stringify({ at: new Date().toISOString(), event: ev, n, payload: input }) + "\n");
const tag = (k) => "CANARY-DS12-" + rt.toUpperCase() + "-" + id + "-" + k;
let out = {};
if (rt === "antigravity") {
  if (ev === "SessionStart") out = { injectSteps: [{ systemMessage: { systemMessage: tag("start") } }] };
  if (ev === "PreInvocation") out = { injectSteps: [{ ephemeralMessage: tag("turn-" + n) }] };
} else if (rt === "grok" && ev === "SessionStart") {
  out = { systemMessage: tag("start") };
} else if (ev === "SessionStart" || ev === "UserPromptSubmit") {
  out = { hookSpecificOutput: { hookEventName: ev, additionalContext: tag(ev === "SessionStart" ? "start" : "turn-" + n) } };
}
process.stdout.write(JSON.stringify(out));
'

live_prepare() {
  local rt="$1"
  # A dry run prepares in its own folder; a real run archives the previous capture
  # instead of deleting it. (The first version deleted it, and a dry check run after
  # three live sessions wiped their raw captures: the evidence survived only in the
  # runtimes' own transcripts.)
  if [ "${DS12_DRY:-0}" = 1 ]; then
    LIVE="$D/live-dry/$rt"; rm -rf "$LIVE"
  else
    LIVE="$D/live/$rt"
    [ -d "$LIVE" ] && mv "$LIVE" "$LIVE.$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  mkdir -p "$LIVE" "$D/pi-sessions"
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$LIVE/canary"
  printf '%s\n' "$PROBE_JS" >"$D/live/probe.js"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$LIVE/started"
  NODE_BIN="$(command -v node)"
  stamp "$2"
}

# DS12_DRY=1 prepares a live step and stops before the session starts (the Driver's check).
dry_stop() { [ "${DS12_DRY:-0}" = 1 ] && { note "DS12_DRY=1: prepared, session not started"; return 0; }; return 1; }

probe_cmd() { printf '%s %s %s %s' "$NODE_BIN" "$D/live/probe.js" "$1" "$2"; }

# The session environment: the scratch install first on the PATH, the scratch
# Mirror home pinned, an empty Pi sessions dir, and no provider key.
session_env() {
  SESSION_ENV=(env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u OPENROUTER_API_KEY
    MIRROR_USER=ds12 MIRROR_HOME="$MHOME" PI_SESSIONS_DIR="$D/pi-sessions" DS12_LIVE="$(dirname "$LIVE")"
    PATH="$D/prefix/bin:$REAL_PATH")
}

turns_text() {
  local rt="$1"
  if [ "$rt" = "claude" ]; then
    cat <<EOF

  Two turns in all (the Plan's budget), typed exactly. Approve any trust or permission
  prompt the runtime shows. No config file of yours is written.

    Turn 1:  /mirror-mind:mm:mirror DS12: should I raise my course price from \$297 to \$497?
             Expect: Mirror Mode, a first-person answer (a "◇ <persona>" line is fine).
             This is DS2.TS4's reference turn, and the probe records the prompt text a
             plugin skill hands to the inject hook.

    Turn 2:  DS12 probe. Without using any tool: quote every line in your context that
             starts with CANARY-DS12, exactly, or say NONE. Then answer: can you see a
             document titled "Mirror Mind — Operating Instructions" (yes or no)? How many
             skills whose names start with mm can you invoke? And list the names of any
             tools from an MCP server called mirror-mind, or say NONE.

  Also look at the status line at the bottom: does it read DS12-STATUSLINE-PROBE?
  Write down both answers, quit the session, and run:   bash $SELF check-claude
EOF
    return
  fi
  cat <<EOF

  Two turns, typed exactly. Approve any trust or permission prompt the runtime shows.
  Logins happen inside the scratch directory; no config file of yours is written.

    Turn 1:  DS12 probe 1. Without using any tool: quote every line in your context
             that starts with CANARY-DS12, exactly, or say NONE. Then answer yes or no:
             can you see a document titled "Mirror Mind — Operating Instructions"?
             And how many skills whose names start with mm can you invoke?

    Turn 2:  DS12 probe 2. Without using any tool: quote every line that starts with
             CANARY-DS12 that you can see now, exactly, or say NONE. And list the names
             of any tools from an MCP server called mirror-mind, or say NONE.

  Write down both answers, quit the session, and run:   bash $SELF check-$rt
EOF
}

live_claude() {
  need_install
  say "Live — Claude Code (TS1; also DS2.TS4's reference session)"
  live_prepare claude claude
  [ -d "$CACHE" ] || { mkdir -p "$(dirname "$CACHE")" && cp -R "$PKG/plugins/mirror-mind" "$CACHE"; }
  printf '%s\n' '{ "statusLine": { "type": "command", "command": "echo DS12-STATUSLINE-PROBE" } }' >"$CACHE/settings.json"
  local ev
  {
    printf '{ "hooks": {'
    local first=1
    for ev in SessionStart UserPromptSubmit Stop SessionEnd; do
      [ $first -eq 1 ] || printf ','
      first=0
      printf '"%s": [{ "hooks": [{ "type": "command", "command": "%s" }] }]' "$ev" "$(probe_cmd claude "$ev")"
    done
    printf '} }\n'
  } >"$LIVE/settings.json"
  # A scratch config dir, not yours: your ~/.claude/skills already loads Mirror (a second
  # mirror-mind would load beside this copy) and your statusLine would hide the probe's.
  local CC="$D/claude-live/.claude"
  mkdir -p "$CC" && chmod 700 "$D/claude-live"
  session_env
  SESSION_ENV+=(CLAUDE_CONFIG_DIR="$CC")
  note "Claude Code runs with a scratch config dir ($CC): none of your settings, skills, or"
  note "plugins load. If it asks you to log in, do; say so when you report back."
  turns_text claude
  local P="$D/project-claude"
  rm -rf "$P" && mkdir -p "$P"
  echo; look "Starting Claude Code in $P with the plugin copy $CACHE …"
  dry_stop && return
  cd "$P" && exec "${SESSION_ENV[@]}" claude --plugin-dir "$CACHE" --settings "$LIVE/settings.json"
}

live_codex() {
  need_install
  say "Live — Codex (TS2)"
  live_prepare codex codex
  [ -d "$D/codex-marketplace" ] || { echo "Run the static step first: bash $SELF codex"; exit 2; }
  local CX="$D/codex-live"
  if [ ! -f "$CX/auth.json" ]; then
    rm -rf "$CX" && mkdir -p "$CX" && chmod 700 "$CX"
  fi
  rm -f "$CX/AGENTS.md" "$CX/skills/mirror-mind" "$CX/hooks.json"
  cat >"$CX/hooks.json" <<EOF
{ "hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd codex SessionStart)" }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd codex UserPromptSubmit)" }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd codex Stop)" }] }],
  "SessionEnd": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd codex SessionEnd)" }] }]
} }
EOF
  with_home "$D/codex-live-person" env CODEX_HOME="$CX" codex plugin marketplace add "$D/codex-marketplace" >/dev/null 2>&1 || true
  with_home "$D/codex-live-person" env CODEX_HOME="$CX" codex plugin add mirror-mind@ds12-local >"$LIVE/plugin-add.out" 2>&1 || true
  tail -1 "$LIVE/plugin-add.out" | show
  note "Mirror is installed as the plugin ONLY: no skills link, no AGENTS.md link, so whatever"
  note "skills and instructions reach the session came through the plugin."
  [ -f "$CX/auth.json" ] || note "Codex will ask you to log in: that login is stored in $CX only."
  session_env
  turns_text codex
  local P="$D/project-codex"
  rm -rf "$P" && mkdir -p "$P"
  echo; look "Starting Codex in $P with CODEX_HOME=$CX …"
  dry_stop && return
  cd "$P" && exec "${SESSION_ENV[@]}" HOME="$D/codex-live-person" CODEX_HOME="$CX" codex
}

live_antigravity() {
  need_install
  say "Live — Antigravity (TS3)"
  live_prepare antigravity agy
  local AH="$D/agy-home" WS="$D/project-agy"
  [ -d "$AH/.gemini/config/plugins/mirror-mind" ] || { echo "Run the static step first: bash $SELF antigravity"; exit 2; }
  rm -rf "$WS" && mkdir -p "$WS/.agents"
  cp "$PKG/AGENTS.md" "$WS/AGENTS.md"
  cat >"$WS/.agents/hooks.json" <<EOF
{ "ds12-probe": {
  "SessionStart": [{ "type": "command", "command": "$(probe_cmd antigravity SessionStart)" }],
  "PreInvocation": [{ "type": "command", "command": "$(probe_cmd antigravity PreInvocation)" }],
  "Stop": [{ "type": "command", "command": "$(probe_cmd antigravity Stop)" }]
} }
EOF
  note "the workspace has Mirror's AGENTS.md and agy-native probe hooks; the Mirror plugin"
  note "(installed by the static step) carries the skills and Claude's hooks file, staged verbatim."
  note "agy may keep its login in your macOS keychain rather than in the scratch HOME:"
  note "if it asks you to log in, say so when you report back."
  session_env
  turns_text antigravity
  echo; look "Starting agy in $WS with HOME=$AH …"
  dry_stop && return
  cd "$WS" && exec "${SESSION_ENV[@]}" HOME="$AH" agy
}

live_grok() {
  need_install
  say "Live — Grok Build (TS4)"
  live_prepare grok grok
  local GH="$D/grok-home"
  [ -d "$GH/.grok/installed-plugins" ] || { echo "Run the static step first: bash $SELF grok"; exit 2; }
  mkdir -p "$GH/.grok/hooks"
  cat >"$GH/.grok/hooks/ds12-probe.json" <<EOF
{ "hooks": {
  "SessionStart": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd grok SessionStart)" }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd grok UserPromptSubmit)" }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd grok Stop)" }] }],
  "SessionEnd": [{ "hooks": [{ "type": "command", "command": "$(probe_cmd grok SessionEnd)" }] }]
} }
EOF
  local P="$D/project-grok"
  rm -rf "$P" && mkdir -p "$P" && cp "$PKG/AGENTS.md" "$P/AGENTS.md"
  note "the project has Mirror's AGENTS.md; the Mirror plugin (installed by the static step)"
  note "brings its skills, its hooks, and the MCP server."
  [ -f "$GH/.grok/auth.json" ] || note "Grok will ask you to log in: that login is stored in $GH only."
  session_env
  turns_text grok
  echo; look "Starting Grok in $P with HOME=$GH …"
  dry_stop && return
  cd "$P" && exec "${SESSION_ENV[@]}" HOME="$GH" grok
}

# What a live session left: the probe's capture, the scratch Mirror, hooks.log.
live_check() {
  local rt="$1"
  need_install
  LIVE="$D/live/$rt"
  say "Check — what the $rt session left"
  [ -f "$LIVE/started" ] || { echo "No $rt session recorded; run: bash $SELF live-$rt"; exit 2; }
  local START CANARY
  START="$(cat "$LIVE/started")"; CANARY="$(cat "$LIVE/canary")"
  look "canary id: $CANARY (lines the model quoted should end -start or -turn-<n>)"
  if [ -s "$LIVE/hooks.jsonl" ]; then
    look "probe hook events (event × times):"
    node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
      const c={};for(const e of l)c[e.event]=(c[e.event]||0)+1;
      for(const[k,v]of Object.entries(c))console.log(k+" × "+v);
      const keys=new Set();for(const e of l){try{Object.keys(JSON.parse(e.payload)).forEach(k=>keys.add(k))}catch{}}
      console.log("payload fields: "+[...keys].sort().join(", "));
      for(const e of l.filter(e=>/Prompt/.test(e.event))){try{const p=JSON.parse(e.payload);console.log("prompt seen by "+e.event+": "+String(p.prompt??p.userPrompt??"").slice(0,90))}catch{}}' \
      "$LIVE/hooks.jsonl" | show
    ok "the probe hook ran"
  else
    bad "the probe hook never ran (no live/$rt/hooks.jsonl)"
  fi
  local DB="$MHOME/memory.db" ROWS
  ROWS="$(sqlite3 "$DB" "SELECT c.interface || ' · ' || count(m.id) || ' message(s)' FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE substr(c.started_at,1,19) >= substr('$START',1,19) GROUP BY c.id" 2>/dev/null)"
  if [ -n "$ROWS" ]; then look "Mirror conversations the session left in the scratch home (interface · messages):"; printf '%s\n' "$ROWS" | show
  else note "Mirror logged no conversation from this session"; fi
  if [ -f "$MHOME/front-door.log" ]; then
    look "what the session ran through the installed mirror (count, family):"
    awk -F'\t' -v s="$START" 'substr($1,1,19) >= substr(s,1,19) {print $3}' "$MHOME/front-door.log" | sort | uniq -c | sed 's/^ *//' | show
  fi
  [ -f "$MHOME/hooks.log" ] && { look "hooks.log:"; tail -5 "$MHOME/hooks.log" | show; } || ok "no Mirror hook recorded a failure"
  cat <<EOF

  Now report to the Builder, in your words:
    - turn 1's and turn 2's answers (the canary lines quoted, or NONE; the yes/no; the counts)
    - anything the runtime asked you to approve or log into
EOF
  [ "$rt" = "claude" ] && echo "    - whether turn 1 answered in Mirror Mode, and whether the status line read DS12-STATUSLINE-PROBE"
  result
}

# ---------------------------------------------------------------------------
verify() {
  need_install
  say "Verify — the versions the findings rest on, against what is installed now"
  local rec rt version binary measured now drift=0
  rec="$(dirname "$SELF")/recorded-versions.tsv"
  while IFS=$'\t' read -r rt version binary measured; do
    [ "$rt" = "runtime" ] && continue
    now="$("$rt" --version 2>&1 | head -1)"
    if [ "$now" = "$version" ]; then ok "$rt: $now, as recorded on $measured ($binary)"
    else bad "$rt: recorded $version on $measured, installed now $now (re-run: bash $SELF $rt)"; drift=1; fi
  done <"$rec"
  [ "$drift" -eq 0 ] && note "no drift: the findings' versions are the installed ones"
  say "Verify — the cheap static claims, re-run"
  claude_step >/dev/null 2>&1; codex_step >/dev/null 2>&1
  antigravity_step >/dev/null 2>&1; grok_step >/dev/null 2>&1
  look "static steps re-run: see the per-step output with bash $SELF <runtime>"
  result
}

# ---------------------------------------------------------------------------
untouched() {
  say "Untouched — your real runtime configs and Mirror homes"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline; run setup first."; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "no runtime config file changed since setup ($(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries compared)"
  else
    bad "runtime configuration changed since setup:"; sed -n '3,40p' "$D/real-diff.txt" | show
  fi
  local leaked=0 db c
  for db in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$db" ] || continue
    # Not -readonly: it cannot open a WAL database another process holds. query_only
    # makes this connection refuse every write instead.
    c="$(sqlite3 "$db" "PRAGMA query_only=ON;" "SELECT count(*) FROM messages WHERE content LIKE '%CANARY-DS12%' OR content LIKE 'DS12 TS%';" 2>/dev/null || echo ERR)"
    [ "$c" = "0" ] || { bad "DS12 content found in $db ($c)"; leaked=1; }
  done
  [ "$leaked" -eq 0 ] && ok "no real Mirror database holds a DS12 canary or probe prompt"
  result
}

clean() {
  if [ -d "$D_RAW" ] && [ ! -f "$D_RAW/.ds12" ]; then
    echo "$D_RAW is not this route's directory; leaving it."; exit 2
  fi
  if [ -d "$D/grok-home" ]; then with_home "$D/grok-home" grok leader kill >/dev/null 2>&1 || true; fi
  rm -rf "$D_RAW" && echo "removed $D_RAW (scratch install, homes, evidence, and any login made inside them)"
}

case "${1:-}" in
  setup) setup ;;
  versions) versions ;;
  claude) claude_step ;;
  codex) codex_step ;;
  antigravity) antigravity_step ;;
  grok) grok_step ;;
  extensions) extensions_step ;;
  live-claude) live_claude ;;
  live-codex) live_codex ;;
  live-antigravity) live_antigravity ;;
  live-grok) live_grok ;;
  check-claude) live_check claude ;;
  check-codex) live_check codex ;;
  check-antigravity) live_check antigravity ;;
  check-grok) live_check grok ;;
  verify) verify ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,28p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
