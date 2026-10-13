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
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,24p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
