#!/usr/bin/env bash
# CV22.DS10.US3 -- route 3, the runtimes outside the tree (plateau 3).
#
# One command per step. Each prints what it proved (✓ / ✗) and the evidence
# to look at:
#
#   bash route3.sh 1      the install from nothing; `init` prints the wiring (3b)
#   bash route3.sh 2      the Claude plugin's hooks and MCP server from a copy outside
#                         any tree; the Operating Instructions delivered (D13); then
#                         mirror-hook removed -> hooks.log -> diagnose (3a)
#   bash route3.sh 3      Claude Code, Gemini CLI, and Codex find what the package
#                         ships, from scratch config directories (3d; no session)
#   bash route3.sh 4      optional: a real Claude Code session on the scratch install (3c)
#   bash route3.sh 5      after you quit that session: what it left, and that your
#                         real mirror holds none of it
#   bash route3.sh clean  remove the scratch directory
#
# Everything lives under ROUTE3_DIR (default /tmp/us3-route3). Steps 1-3 and 5
# never read or write your real Mirror home, ~/.config/mirror, ~/.claude,
# ~/.gemini, or ~/.codex (step 5 only READS your real databases, to prove the
# session did not reach them). Step 4 uses your real Claude Code login, loads
# the plugin for that one session only (--plugin-dir), and pins the Mirror home
# AND the Pi sessions directory to scratch ones: with your real HOME, the
# SessionStart hook's maintenance would otherwise backfill your whole Pi
# history into the scratch home (CR106's class, found by this route).
#
# A script, not a block to paste: an interactive shell's aliases and `set -e`
# do not reach it (collaboration strategy, "Make validation portable").

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)"
SELF="${BASH_SOURCE[0]}"
D_RAW="${ROUTE3_DIR:-/tmp/us3-route3}"
NODE_DIR="$(dirname "$(command -v node)")"
REAL_PATH="$PATH"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0

# The scratch directory, by its real path: on macOS /tmp is /private/tmp, and
# the program prints real paths.
resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PKG="$D/prefix/lib/node_modules/mirror-mind"
  SHOME="$D/home"                      # the scratch person's HOME
  MHOME="$SHOME/.mirror-minds/route3"  # their Mirror home
  CACHE="$D/claude-cache/plugins/mirror-mind"
}
resolve

need_install() {
  [ -x "$D/prefix/bin/mirror" ] || { echo "No scratch install yet. Run step 1 first: bash $SELF 1"; exit 2; }
}

# Run a command as a person who has only the scratch install: scratch HOME, no
# Mirror variable from your shell, no checkout on the PATH.
as_scratch() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY \
    HOME="$SHOME" PATH="$D/prefix/bin:$NODE_DIR:/usr/bin:/bin" "$@"
}

result() {
  say "Result"
  printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

# ---------------------------------------------------------------------------
step1() {
  say "Step 1 — install from nothing, then init and seed (route 3b)"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.route3" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW"
  mkdir -p "$D_RAW/prefix" "$D_RAW/home" "$D_RAW/project" && touch "$D_RAW/.route3"
  chmod 700 "$D_RAW/home"
  resolve

  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed this checkout: $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  if npm install -g --prefix "$D/prefix" "$D/$TARBALL" >"$D/install.log" 2>&1; then
    ok "installed into the scratch prefix: $D/prefix"
  else
    bad "npm install failed (see $D/install.log)"; result; return
  fi
  [ "$(as_scratch sh -c 'command -v mirror')" = "$D/prefix/bin/mirror" ] \
    && ok "mirror resolves to the scratch install" || bad "mirror does not resolve to the scratch install"
  [ "$(as_scratch sh -c 'command -v mirror-hook')" = "$D/prefix/bin/mirror-hook" ] \
    && ok "mirror-hook resolves to the scratch install" || bad "mirror-hook does not resolve to the scratch install"

  # init sees your real PATH after the scratch bin, so it detects the runtimes you have.
  INIT="$(env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u NODE_OPTIONS -u OPENROUTER_API_KEY \
    HOME="$SHOME" PATH="$D/prefix/bin:$REAL_PATH" mirror init route3 2>&1)"
  echo
  look "this is what a new user sees after \`mirror init route3\`:"
  printf '%s\n' "$INIT" | show
  echo
  case "$INIT" in *"Wire your runtime to this install"*) ok "init ends with the wiring section" ;; *) bad "no wiring section" ;; esac
  for pair in "pi:Pi:" "claude:Claude Code:" "gemini:Gemini CLI:" "codex:Codex:"; do
    command_name="${pair%%:*}"
    title="${pair#*:}"
    if command -v "$command_name" >/dev/null 2>&1; then
      case "$INIT" in *"$title"*) ok "$command_name is on your PATH, and its block is printed" ;; *) bad "$command_name is on your PATH, but no '$title' block" ;; esac
    else
      case "$INIT" in *"$title"*) bad "$command_name is NOT on your PATH, yet '$title' is printed" ;; *) ok "$command_name is not on your PATH, and no block is printed for it" ;; esac
    fi
  done
  paths="$(printf '%s\n' "$INIT" | sed -n '/Wire your runtime/,$p' | grep -o '"/[^"]*"' | tr -d '"' | sort -u)"
  outside="$(printf '%s\n' "$paths" | grep -v "^$PKG" || true)"
  [ -n "$paths" ] && [ -z "$outside" ] && ok "every path in the wiring is inside the install, none in the checkout" \
    || { bad "a wiring path is outside the install:"; printf '%s\n' "$outside" | show; }
  look "do NOT run those steps now: they edit your real runtime configs. Step 3 runs them in scratch dirs."

  SEED="$(as_scratch mirror seed 2>&1)"
  case "$SEED" in *"Result: 19 created"*) ok "seed created the 19 template entries (it exits 1 for F1, the known empty ego/constraints template)" ;; *) bad "seed did not create the templates"; printf '%s\n' "$SEED" | show ;; esac
  n="$(as_scratch mirror list personas 2>/dev/null | grep -c '^  [a-z]' || true)"
  [ "$n" -ge 12 ] && ok "$n personas seeded" || bad "only $n personas"
  result
}

# ---------------------------------------------------------------------------
step2() {
  need_install
  say "Step 2 — the Claude plugin from a copy outside any tree (route 3a)"
  rm -rf "$CACHE" && mkdir -p "$(dirname "$CACHE")" && cp -R "$PKG/plugins/mirror-mind" "$CACHE"
  rm -f "$MHOME/hooks.log"
  look "the plugin copied where Claude Code would put it: $CACHE"
  look "its hooks find: $(as_scratch sh -c 'command -v mirror-hook')"

  echo
  look "SessionStart — the hook Claude Code runs when a session opens in some project:"
  OUT="$(cd "$D/project" && as_scratch env CLAUDE_PROJECT_DIR="$D/project" bash "$CACHE/hooks/session-start.sh" </dev/null)"
  FIRST="$(printf '%s' "$OUT" | node -e '
    const agents = require("fs").readFileSync(process.argv[1], "utf8");
    let s = ""; process.stdin.on("data", (c) => (s += c)).on("end", () => {
      try { const h = JSON.parse(s).hookSpecificOutput;
            const same = h.additionalContext === agents ? "identical to the package AGENTS.md" : "DIFFERS from the package AGENTS.md";
            console.log(h.hookEventName + " | " + h.additionalContext.split("\n")[0] + " | " + same); }
      catch { console.log("(no JSON)"); } });' "$PKG/AGENTS.md")"
  printf '%s\n' "$FIRST" | show
  [ "$FIRST" = "SessionStart | # Mirror Mind — Operating Instructions | identical to the package AGENTS.md" ] \
    && ok "the Operating Instructions are handed to Claude Code as session context (D13)" \
    || bad "SessionStart did not deliver the package's AGENTS.md"

  printf '{"session_id":"route3-step2","prompt":"ROUTE3 step 2: hello from the plugin copy"}' \
    | (cd "$D/project" && as_scratch bash "$CACHE/hooks/log-user-prompt.sh") >/dev/null 2>&1 \
    && ok "UserPromptSubmit hook exited 0" || bad "UserPromptSubmit hook failed"
  printf '{"session_id":"route3-step2","transcript_path":"%s"}' "$D/none.jsonl" \
    | (cd "$D/project" && as_scratch bash "$CACHE/hooks/log-session-end.sh") >/dev/null 2>&1 \
    && ok "SessionEnd hook exited 0" || bad "SessionEnd hook failed"
  ROW="$(sqlite3 "$MHOME/memory.db" "SELECT c.interface || ' | ' || m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content LIKE 'ROUTE3 step 2%'" 2>/dev/null)"
  printf '%s\n' "$ROW" | show
  [ "$ROW" = "claude_code | ROUTE3 step 2: hello from the plugin copy" ] \
    && ok "the prompt reached the scratch mirror, labelled claude_code" || bad "the prompt did not reach the scratch mirror"
  [ ! -f "$MHOME/hooks.log" ] && ok "no hook recorded a failure" || { bad "hooks.log:"; show <"$MHOME/hooks.log"; }

  echo
  look "the MCP server, through the plugin's launcher:"
  REPLY="$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"route3","version":"0"}}}' \
    | (cd "$D/project" && as_scratch bash "$CACHE/mcp/launch.sh" 2>"$D/mcp.err") | head -1)"
  INFO="$(printf '%s' "$REPLY" | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{try{const i=JSON.parse(s).result.serverInfo;console.log(i.name+" "+i.version)}catch{console.log("(no answer)")}})')"
  printf '%s\n' "$INFO" | show
  case "$INFO" in "mirror-mind "*) ok "the launcher started the server through the installed mirror" ;; *) bad "no MCP answer: $(cat "$D/mcp.err")" ;; esac
  [ ! -s "$D/mcp.err" ] && ok "and wrote nothing to stderr (the client's log)" || bad "the server wrote to stderr"

  echo
  look "Gemini CLI's SessionStart, run from under the install (what ~/.gemini/settings.json would call):"
  GOUT="$(cd "$D/project" && as_scratch env GEMINI_PROJECT_DIR="$D/project" GEMINI_SESSION_ID= bash "$PKG/.gemini/hooks/session-start.sh" </dev/null 2>/dev/null)"
  case "$GOUT" in *'"hookEventName":"SessionStart","additionalContext":"# Mirror Mind — Operating Instructions'*) ok "Gemini receives the Operating Instructions the same way (D13)" ;; *) bad "Gemini's SessionStart did not deliver them" ;; esac

  echo
  look "the silent stop, made visible: mirror-hook removed from the PATH"
  found=""
  for dir in /opt/homebrew/bin /usr/local/bin; do [ -x "$dir/mirror-hook" ] && found="$dir/mirror-hook"; done
  if [ -n "$found" ]; then
    note "skipped: this machine has a global $found (npm link), which the wrapper rightly finds;"
    note "CI proves this case (smoke_claude_plugin.sh). Run this step before \`npm link\` to see it."
  else
    printf '{"session_id":"route3-step2b","prompt":"ROUTE3 step 2: this turn has no mirror-hook"}' \
      | (cd "$D/project" && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u OPENROUTER_API_KEY \
        HOME="$SHOME" PATH="/usr/bin:/bin" bash "$CACHE/hooks/log-user-prompt.sh") >/dev/null 2>&1
    code=$?
    [ "$code" -eq 0 ] && ok "the hook exited 0: the user's turn is not failed" || bad "the hook exited $code"
    if [ -f "$MHOME/hooks.log" ]; then
      show <"$MHOME/hooks.log"
      ok "one line landed in hooks.log"
    else
      bad "nothing in hooks.log"
    fi
    DIAG="$(as_scratch mirror runtime diagnose 2>&1)"
    HOOKS_LINE="$(printf '%s\n' "$DIAG" | grep -i 'hook' || true)"
    printf '%s\n' "$HOOKS_LINE" | show
    case "$HOOKS_LINE" in *"hook failure(s)"*) ok "\`mirror runtime diagnose\` reports it — where a person looks" ;; *) bad "diagnose does not report it" ;; esac
    case "$DIAG" in *"has no mirror-hook"*) bad "diagnose printed the prompt" ;; *) ok "and never prints the prompt" ;; esac
    mv "$MHOME/hooks.log" "$MHOME/hooks.step2.log"   # so step 5 judges the session alone
  fi
  result
}

# ---------------------------------------------------------------------------
step3() {
  need_install
  say "Step 3 — each runtime finds what the package ships (route 3d; no session, no tokens)"

  if command -v claude >/dev/null 2>&1; then
    CC="$D/claude-config"
    rm -rf "$CC" && mkdir -p "$CC/skills" && ln -s "$PKG/plugins/mirror-mind" "$CC/skills/mirror-mind"
    echo
    look "Claude Code — the step init printed, run against a scratch config dir:"
    LIST="$(cd "$D/project" && CLAUDE_CONFIG_DIR="$CC" claude plugin list 2>&1)"
    printf '%s\n' "$LIST" | grep -A4 "mirror-mind" | show
    case "$LIST" in *"mirror-mind@skills-dir"*"loaded"*) ok "Claude Code loads it as mirror-mind@skills-dir" ;; *) bad "Claude Code does not list it as loaded" ;; esac
    DETAILS="$(cd "$D/project" && CLAUDE_CONFIG_DIR="$CC" claude plugin details mirror-mind 2>&1)"
    printf '%s\n' "$DETAILS" | grep -E "Skills \(|Hooks \(|MCP servers \(" | cut -c1-110 | show
    for want in "Skills (25)" "Hooks (3)" "MCP servers (1)"; do
      case "$DETAILS" in *"$want"*) ok "$want" ;; *) bad "expected $want" ;; esac
    done
  else
    note "Claude Code not installed; skipped"
  fi

  if command -v gemini >/dev/null 2>&1; then
    GH="$D/gemini-home"
    rm -rf "$GH" && mkdir -p "$GH"
    echo
    look "Gemini CLI — \`gemini skills link\`, as init printed it, into a scratch HOME:"
    (cd "$D/project" && HOME="$GH" gemini skills link --consent "$PKG/.pi/skills" </dev/null >"$D/gemini-link.log" 2>&1)
    tail -1 "$D/gemini-link.log" | show
    n="$(cd "$D/project" && HOME="$GH" gemini skills list 2>/dev/null | grep -c '^mm-' || true)"
    [ "$n" -eq 25 ] && ok "Gemini CLI discovers all 25 Mirror skills" || bad "Gemini CLI discovers $n skills (expected 25)"
  else
    note "Gemini CLI not installed; skipped"
  fi

  if command -v codex >/dev/null 2>&1; then
    CX="$D/codex-home"
    rm -rf "$CX" && mkdir -p "$CX/skills"
    ln -s "$PKG/.pi/skills" "$CX/skills/mirror-mind" && ln -s "$PKG/AGENTS.md" "$CX/AGENTS.md"
    echo
    look "Codex — the two links init printed, in a scratch CODEX_HOME; the prompt rendered without a model call:"
    (cd "$D/project" && CODEX_HOME="$CX" codex debug prompt-input hello >"$D/codex-prompt.json" 2>"$D/codex.err")
    n="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$D/codex-prompt.json" | sort -u | wc -l | tr -d ' ')"
    [ "$n" -eq 25 ] && ok "Codex discovers all 25 Mirror skills" || bad "Codex discovers $n skills (expected 25)"
    grep -q "Mirror Operating Instructions" "$D/codex-prompt.json" \
      && ok "Codex puts the Operating Instructions in the model's prompt (D13)" || bad "the Operating Instructions are not in Codex's prompt"
  else
    note "Codex not installed; skipped"
  fi
  result
}

# ---------------------------------------------------------------------------
step4() {
  need_install
  say "Step 4 — a real Claude Code session on the scratch install (route 3c, optional)"
  command -v claude >/dev/null 2>&1 || { note "Claude Code is not installed; step 2 is the evidence."; exit 0; }
  [ -d "$CACHE" ] || { rm -rf "$CACHE" && mkdir -p "$(dirname "$CACHE")" && cp -R "$PKG/plugins/mirror-mind" "$CACHE"; }
  MARKER="ROUTE3-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
  printf '%s\n' "$MARKER" >"$D/.marker"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$D/.session-start"
  rm -f "$MHOME/hooks.log"

  # Pre-flight: the same environment the session gets answers from the scratch home.
  mkdir -p "$D/pi-sessions"
  SESSION_ENV=(env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS
    MIRROR_USER=route3 MIRROR_HOME="$MHOME" PI_SESSIONS_DIR="$D/pi-sessions"
    PATH="$D/prefix/bin:$REAL_PATH")
  J="$(cd "$D/project" && "${SESSION_ENV[@]}" mirror journeys 2>&1)"
  case "$J" in *personal-growth*) ok "pre-flight: in this session \`mirror journeys\` answers from the scratch home" ;; *) bad "pre-flight failed:"; printf '%s\n' "$J" | show; result; return ;; esac

  cat <<EOF

  In the session (approve the folder trust, the mirror-mind MCP server, and the
  \`mirror …\` commands when Claude Code asks):

    1. Type:   $MARKER list my journeys
       Expect: the agent runs \`mirror journeys\` and shows ONE journey,
               personal-growth — the scratch install's, not your real ones.

    2. Type:   I'm torn about raising my course price from \$297 to \$497. What do you think?
       Expect: Mirror Mode without being asked — the agent runs \`mirror mirror load\`
               and answers in first person under a "◇ financial" line (the router
               picks financial for this question; another persona line is fine).
               Neither the automatic routing nor the ◇ signature is in any skill or
               in mirror load's output: they reach this session only through the
               plugin's SessionStart hook (D13).

    3. Optional: type /  and note how Claude Code lists the Mirror skills (for
       example the journeys one). Tell the Builder; the docs will record it.

    4. Type /exit, then run:   bash $SELF 5

  Starting Claude Code in $D/project with the plugin from $CACHE …
EOF
  cd "$D/project" && exec "${SESSION_ENV[@]}" claude --plugin-dir "$CACHE"
}

# ---------------------------------------------------------------------------
step5() {
  need_install
  say "Step 5 — what the Claude Code session left (route 3c)"
  [ -f "$D/.marker" ] || { echo "No session recorded; run step 4 first."; exit 2; }
  MARKER="$(cat "$D/.marker")"
  START="$(cat "$D/.session-start")"
  DB="$MHOME/memory.db"

  ROWS="$(sqlite3 "$DB" "SELECT count(DISTINCT c.id) || ' conversation(s), ' || count(m.id) || ' message(s)' FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.interface = 'claude_code' AND substr(c.started_at, 1, 19) >= substr('$START', 1, 19)" 2>/dev/null)"
  printf '%s\n' "$ROWS" | show
  case "$ROWS" in "0 conversation"*|"") bad "the session left no claude_code conversation in the scratch mirror" ;; *) ok "the session's turns are in the scratch mirror, labelled claude_code" ;; esac
  n="$(sqlite3 "$DB" "SELECT count(*) FROM messages WHERE content LIKE '%$MARKER%'" 2>/dev/null)"
  [ "${n:-0}" -ge 1 ] && ok "including your $MARKER prompt" || bad "your $MARKER prompt is not in the scratch mirror"

  if [ -f "$MHOME/front-door.log" ]; then
    FAMILIES="$(awk -F'\t' -v s="$START" 'substr($1, 1, 19) >= substr(s, 1, 19) {print $3}' "$MHOME/front-door.log" | sort | uniq -c | sed 's/^ *//')"
    look "what the session ran through the installed \`mirror\` (count, family):"
    printf '%s\n' "$FAMILIES" | show
    case "$FAMILIES" in *journeys*) ok "the journeys command ran from the install" ;; *) note "no journeys command logged" ;; esac
    case "$FAMILIES" in *" mirror"*) ok "Mirror Mode loaded in the session (\`mirror load\` ran); the ◇ line you saw is the D13 evidence" ;; *) note "no mirror load logged: did prompt 2 enter Mirror Mode?" ;; esac
  fi
  [ ! -f "$MHOME/hooks.log" ] && ok "no hook recorded a failure during the session" || { bad "hooks.log:"; show <"$MHOME/hooks.log"; }

  T="$(grep -rl --include='*.jsonl' -F "$MARKER" "$HOME/.claude/projects" 2>/dev/null | head -1)"
  if [ -n "$T" ] && grep -q "Mirror Operating Instructions" "$T"; then
    ok "the session's own transcript carries the Operating Instructions from the SessionStart hook"
  else
    note "the transcript does not show the hook context (Claude Code may not record it); prompt 2's behaviour is the evidence"
  fi

  leaked=0
  for db in "$HOME"/.mirror-minds/*/memory.db "$HOME"/.mirror/*/memory.db; do
    [ -f "$db" ] || continue
    c="$(sqlite3 "$db" "SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.interface = 'claude_code' AND m.content LIKE '%$MARKER%'" 2>/dev/null || echo ERR)"
    [ "$c" = "0" ] || { bad "$MARKER found in your real mirror: $db ($c)"; leaked=1; }
  done
  [ "$leaked" -eq 0 ] && ok "your real mirror databases hold nothing from this session"
  result
}

# ---------------------------------------------------------------------------
clean() {
  if [ -d "$D_RAW" ] && [ ! -f "$D_RAW/.route3" ]; then
    echo "$D_RAW is not this route's directory; leaving it."; exit 2
  fi
  rm -rf "$D_RAW" && echo "removed $D_RAW"
}

case "${1:-}" in
  1) step1 ;;
  2) step2 ;;
  3) step3 ;;
  4) step4 ;;
  5) step5 ;;
  clean) clean ;;
  *) sed -n '2,25p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
