#!/usr/bin/env bash
# CV9.DS8.TS1 — how a load the model ran by itself can name its session, measured on the
# installed Pi, Claude Code, and Codex.
#
# Isolation as CR160's and DS11's routes: everything under a scratch directory
# (DS8_TS1_DIR, default /tmp/cv9-ds8-ts1, resolved to its physical path), one seeded
# scratch Mirror home named by MIRROR_HOME and MIRROR_USER, Pi's sessions under
# --session-dir paths that hold a space, Claude Code in a logged-in scratch
# CLAUDE_CONFIG_DIR with the real HOME, Codex in a scratch CODEX_HOME with the real
# auth.json borrowed under a trap. Every fact is read from a log — the probe's, the
# transcript, the scratch home's database — never from the model's word.
#
#   bash route.sh setup            the baseline; versions and binaries; the scratch
#                                  home seeded; the probe staged
#   bash route.sh pi <p2|p1>       one Pi session per mechanism: p2 sets
#                                  MIRROR_SESSION_ID at session_start; p1 appends
#                                  --session-id to the model's load at tool_call
#   bash route.sh login            the Navigator's: /login in the route's Claude config
#                                  directory, then /exit
#   bash route.sh claude           two headless Claude Code sessions: `env | grep
#                                  CLAUDE_`, then a plain personal question (the
#                                  self-started case); probe hooks keep the hook's
#                                  env names and the Stop payload
#   bash route.sh codex            codex exec: `env` in the model's shell, against the
#                                  prompt hook's session row; prints the TUI command
#   bash route.sh read             every row: expected, observed, source
#   bash route.sh clean            the scratch directory removed; the keychain entry
#                                  named; the credential gone
#   bash route.sh untouched        the real configuration and homes vs the baseline
set -u
export LC_ALL=C

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS8_TS1_DIR:-/tmp/cv9-ds8-ts1}"
REAL_HOME="$HOME"
USER1=ds8user
PI_MODEL="${DS8_PI_MODEL:-anthropic/claude-haiku-4-5:off}"
CLAUDE_MODEL="${DS8_CLAUDE_MODEL:-haiku}"
QUESTION_A="How should I think about pricing a mentorship?"
QUESTION_B="I'm not sure whether to take a job offer that pays more but takes me away from my own projects. How should I think about it?"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PERSON="$D/person"; MHOME="$PERSON/.mirror-minds/$USER1"
  EVID="$D/evidence"; PROBE="$D/probe.ts"; PROBE_LOG="$EVID/pi-probe.log"
  CFG="$D/claude-login/.claude"; PROJ="$D/project"
  CODEX_HOME_S="$D/codex-home"
}
resolve
PASS=0; FAIL=0
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
row() { printf '  %-10s %-44s %-36s %s\n' "$1" "$2" "$3" "$4"; }   # runtime, fact, observed, source
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
show() { sed "s|$D|\$D|g; s|$REAL_HOME|~|g; s/^/      | /"; }
need_setup() { [ -f "$D/.ds8-ts1" ] || { echo "Run: bash $SELF setup"; exit 2; }; }
dbq() { sqlite3 -readonly "$1" "$2" 2>/dev/null || sqlite3 "file:$1?mode=ro&immutable=1" "$2" 2>/dev/null; }
mdb() { dbq "$MHOME/memory.db" "$1"; }

REAL_CONFIG=(.claude/settings.json .claude/skills .codex/auth.json .codex/config.toml .codex/plugins/cache .config/mirror/env .gemini/config/plugins .grok/rules .agents/skills)
config_manifest() {
  local rel path f
  for rel in "${REAL_CONFIG[@]}"; do
    path="$REAL_HOME/$rel"
    if [ -L "$path" ]; then printf 'L %s -> %s\n' "$rel" "$(readlink "$path")"
    elif [ -f "$path" ]; then printf 'F %s %s\n' "$rel" "$(shasum -a 256 "$path" | cut -d' ' -f1)"
    elif [ -d "$path" ]; then
      find "$path" -maxdepth 3 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else printf -- '- %s absent\n' "$rel"; fi
  done
  for f in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$f" ] && printf 'C %s conversations %s\n' "$(basename "$(dirname "$f")")" "$(dbq "$f" 'SELECT COUNT(*) FROM conversations')"
  done
}

pi_env() {
  [ "$#" -gt 0 ] || { echo "pi_env: no command" >&2; exit 2; }
  env -u PI_SESSION_FILE -u PI_SESSION_ID -u PI_CODING_AGENT -u PI_MODEL -u PI_PROVIDER -u PI_REASONING_LEVEL \
    -u MIRROR_SESSION_ID MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" "$@"
}
in_claude() { env -u PI_SESSION_FILE -u PI_SESSION_ID -u MIRROR_SESSION_ID CLAUDE_CONFIG_DIR="$CFG" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" OPENROUTER_API_KEY= DISABLE_AUTOUPDATER=1 "$@"; }

# ---------------------------------------------------------------------------
setup() {
  say "Setup"
  mkdir -p "$D_RAW"; resolve; touch "$D/.ds8-ts1"; mkdir -p "$EVID" "$PROJ"
  [ -f "$D_RAW.baseline" ] && note "baseline kept ($D_RAW.baseline)" || { config_manifest >"$D_RAW.baseline"; note "baseline: $(wc -l <"$D_RAW.baseline" | tr -d ' ') entries"; }
  {
    printf 'runtime\tversion\tbinary\tmeasured\n'
    printf 'pi\t%s\t%s\t%s\n' "$(pi --version 2>/dev/null)" "$(readlink -f "$(command -v pi)")" "$(date -u +%F)"
    printf 'claude\t%s\t%s\t%s\n' "$(claude --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v claude)")" "$(date -u +%F)"
    printf 'codex\t%s\t%s\t%s\n' "$(codex --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v codex)")" "$(date -u +%F)"
    printf 'mirror\t%s\t%s\t%s\n' "$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")" "$ROOT @ $(git -C "$ROOT" rev-parse --short HEAD)" "$(date -u +%F)"
  } >"$EVID/versions.tsv"; show <"$EVID/versions.tsv"
  if [ ! -f "$MHOME/memory.db" ]; then
    env -u MIRROR_HOME -u MIRROR_USER HOME="$PERSON" node "$ROOT/bin/mirror.js" init "$USER1" >/dev/null
    env HOME="$PERSON" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" node "$ROOT/bin/mirror.js" seed >/dev/null
    note "scratch home seeded"
  fi
  cp "$HERE/probe.ts" "$PROBE"; note "probe staged at \$D/probe.ts (loaded only by --extension)"
}

# ---------------------------------------------------------------------------
pi_run() {
  local mode="${1:-}"; case "$mode" in p1|p2) ;; *) echo "pi p2|p1"; exit 2 ;; esac
  need_setup
  local dir="$D/pi sessions $mode"; mkdir -p "$dir"   # a space on purpose
  say "Pi — $mode ($(pi --version 2>/dev/null))"
  printf '%s\tROUTE\tpi %s turn 1\n' "$(date -u +%FT%T.000Z)" "$mode" >>"$MHOME/front-door.log"
  (cd "$ROOT" && pi_env env DS8_PROBE_MODE="$mode" DS8_PROBE_LOG="$PROBE_LOG" pi -p --approve --extension "$PROBE" --session-dir "$dir" --model "$PI_MODEL" "/mm-mirror $QUESTION_A") >"$dir/turn-1.txt" 2>&1
  echo "  turn 1 exit $?: /mm-mirror $QUESTION_A"
  if [ "$mode" = p2 ]; then
    (cd "$ROOT" && pi_env env DS8_PROBE_MODE="$mode" DS8_PROBE_LOG="$PROBE_LOG" pi -p --approve --continue --extension "$PROBE" --session-dir "$dir" --model "$PI_MODEL" "Run the shell command: env | grep MIRROR_ -- and reply with its output verbatim.") >"$dir/turn-2.txt" 2>&1
    echo "  turn 2 exit $?: env | grep MIRROR_"
  fi
  read_pi "$mode"
}
read_pi() {
  local mode="$1" f sid; local dir="$D/pi sessions $mode"
  f="$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1)"; sid="$f"; [ -f "$f" ] || { note "no $mode session"; return; }
  say "Pi $mode — rows (expected · observed · source)"
  local seen; seen="$(grep -c "	$mode	tool_call bash: .*mirror \(mirror \)\?load" "$PROBE_LOG" 2>/dev/null | tr -d ' ')"
  row "pi/$mode" "load seen as a tool_call (expected yes)" "$([ "${seen:-0}" -ge 1 ] && echo "yes ($seen)" || echo no)" "probe log"
  if [ "$mode" = p2 ]; then
    local envline; envline="$(grep -o 'MIRROR_SESSION_ID=[^ "'"'"'`]*' "$dir/turn-2.txt" | head -1)"
    row "pi/p2" "MIRROR_SESSION_ID in the model's shell (expected the session file)" "${envline:-absent}" "turn 2 reply"
    local tr; tr="$(grep -c 'MIRROR_SESSION_ID=' "$f" 2>/dev/null | tr -d ' ')"
    row "pi/p2" "the same in the transcript's tool result" "$([ "${tr:-0}" -ge 1 ] && echo yes || echo no)" "session file"
    row "pi/p2" "conversation bound to the session (expected yes)" "$(mdb "SELECT CASE WHEN conversation_id IS NULL THEN 'no' ELSE 'yes' END FROM runtime_sessions WHERE session_id='$sid'" | head -1)" "runtime_sessions"
    row "pi/p2" "mirror_active written (expected NOT, TS2's gap)" "$(mdb "SELECT CASE mirror_active WHEN 1 THEN 'written' ELSE 'unwritten' END FROM runtime_sessions WHERE session_id='$sid'" | head -1)" "runtime_sessions"
  else
    local rw; rw="$(grep "	p1	rewrote: " "$PROBE_LOG" | head -1 | sed 's/.*rewrote: //')"
    row "pi/p1" "load rewritten with a quoted path (expected yes)" "$([ -n "$rw" ] && echo yes || echo no)" "probe log"
    [ -n "$rw" ] && printf '%s\n' "$rw" | show
    row "pi/p1" "mirror_active = 1 for the session (expected yes)" "$(mdb "SELECT CASE mirror_active WHEN 1 THEN 'written' ELSE 'unwritten' END FROM runtime_sessions WHERE session_id='$sid'" | head -1)" "runtime_sessions"
  fi
  note "session file: ${f/#$D/\$D}"
}

# ---------------------------------------------------------------------------
login() {
  need_setup; mkdir -p "$CFG" && chmod 700 "$D/claude-login"
  say "Claude Code login in the route's scratch config directory"
  note "run /login, accept the folder trust, then /exit. clean names the keychain entry."
  (cd "$PROJ" && env CLAUDE_CONFIG_DIR="$CFG" DISABLE_AUTOUPDATER=1 claude)
}
claude_run() {
  need_setup; [ -d "$CFG" ] || { echo "Run: bash $SELF login"; exit 2; }
  say "Claude Code ($(claude --version 2>/dev/null | head -1))"
  mkdir -p "$CFG/skills" && ln -sfn "$ROOT/plugins/mirror-mind" "$CFG/skills/mirror-mind"
  # Probe hooks beside the plugin's: the hook's own environment names, and the Stop
  # payload, for M3 and M2. Nothing of the payload's text is printed anywhere.
  cat >"$D/hook-env.sh" <<EOF
#!/bin/sh
cat >/dev/null; env | cut -d= -f1 | LC_ALL=C sort >"$EVID/claude-hook-env-names.txt"
EOF
  cat >"$D/hook-stop.sh" <<EOF
#!/bin/sh
cat >"$EVID/claude-stop-payload-\$\$.json"
EOF
  chmod +x "$D/hook-env.sh" "$D/hook-stop.sh"
  node -e '
    const fs = require("fs"); const [p, envHook, stopHook] = process.argv.slice(1);
    let s = {}; try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    s.hooks = { UserPromptSubmit: [{ hooks: [{ type: "command", command: envHook }] }], Stop: [{ hooks: [{ type: "command", command: stopHook }] }] };
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  ' "$CFG/settings.json" "$D/hook-env.sh" "$D/hook-stop.sh"
  (cd "$PROJ" && in_claude claude -p --model "$CLAUDE_MODEL" --allowedTools "Bash" --output-format json \
    "Run the shell command: env | grep CLAUDE_ -- and reply with its output verbatim, nothing else.") >"$EVID/claude-env-result.json" 2>"$EVID/claude-env-stderr.txt"
  echo "  turn 1 exit $?: env | grep CLAUDE_"
  (cd "$PROJ" && in_claude claude -p --model "$CLAUDE_MODEL" --allowedTools "Bash,Read" --output-format json "$QUESTION_B") \
    >"$EVID/claude-b-result.json" 2>"$EVID/claude-b-stderr.txt"
  echo "  turn 2 exit $?: the plain personal question (a new session)"
  read_claude
}
read_claude() {
  say "Claude Code — rows (expected · observed · source)"
  local sid1 sid2 envval
  sid1="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session_id' "$EVID/claude-env-result.json" 2>/dev/null)"
  sid2="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).session_id' "$EVID/claude-b-result.json" 2>/dev/null)"
  envval="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result' "$EVID/claude-env-result.json" 2>/dev/null | grep -o 'CLAUDE_CODE_SESSION_ID=[^ `]*' | head -1 | cut -d= -f2)"
  row "claude" "CLAUDE_CODE_SESSION_ID in the Bash tool (expected yes)" "${envval:-absent}" "turn 1 result"
  row "claude" "equal to the session id (expected yes)" "$([ -n "$envval" ] && [ "$envval" = "$sid1" ] && echo "yes" || echo "no ($sid1)")" "result.session_id"
  row "claude" "the session row the prompt hook wrote (expected yes)" "$([ -n "$(mdb "SELECT 1 FROM runtime_sessions WHERE session_id='$sid1'")" ] && echo yes || echo no)" "runtime_sessions"
  row "claude" "CLAUDE_CODE_SESSION_ID in the hook's own env (M3)" "$(grep -qx CLAUDE_CODE_SESSION_ID "$EVID/claude-hook-env-names.txt" 2>/dev/null && echo yes || echo no)" "hook env names"
  local t; t="$(ls -t "$CFG/projects"/*/"$sid2".jsonl 2>/dev/null | head -1)"
  local loads; loads="$(grep -o 'mirror mirror load[^"\\]\{0,60\}' "$t" 2>/dev/null | head -1)"
  row "claude/B" "the model's own load on the plain question" "${loads:+yes: }${loads:-none}" "transcript"
  row "claude/B" "the session learned it (expected not, today)" "$(mdb "SELECT CASE mirror_active WHEN 1 THEN 'mirror_active written' ELSE 'unwritten' END FROM runtime_sessions WHERE session_id='$sid2'" | head -1)" "runtime_sessions"
  local m2; m2="$(grep -l 'MIRROR MODE ACTIVE\|◇ [a-z-]*' "$EVID"/claude-stop-payload-*.json 2>/dev/null | wc -l | tr -d ' ')"
  row "claude/B" "M2: the marker in a Stop payload (n=1, an observation)" "$m2 of $(ls "$EVID"/claude-stop-payload-*.json 2>/dev/null | wc -l | tr -d ' ') payloads" "Stop payload"
  note "the model's reply to the env turn, as an observation:"; node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).result' "$EVID/claude-env-result.json" 2>/dev/null | head -5 | show
}

# ---------------------------------------------------------------------------
codex_run() {
  need_setup
  say "Codex ($(codex --version 2>/dev/null | head -1)) — codex exec, provisional"
  mkdir -p "$CODEX_HOME_S" && chmod 700 "$CODEX_HOME_S"
  [ -f "$REAL_HOME/.codex/auth.json" ] || { echo "no real ~/.codex/auth.json to borrow"; exit 2; }
  cp "$REAL_HOME/.codex/auth.json" "$CODEX_HOME_S/auth.json"
  trap 'rm -f "$CODEX_HOME_S/auth.json"' EXIT
  # The Driver's own Pi session exports PI_SESSION_*; stripped so the cell's `env`
  # shows the model's environment, not the route's.
  local cx; cx() { (cd "$PROJ" && env -u PI_SESSION_FILE -u PI_SESSION_ID -u MIRROR_SESSION_ID CODEX_HOME="$CODEX_HOME_S" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" OPENROUTER_API_KEY= "$@"); }
  cx codex plugin marketplace add "$ROOT" >"$EVID/codex-mp-add.out" 2>&1
  cx codex plugin add mirror-mind@mirror-mind >"$EVID/codex-plugin-add.out" 2>&1
  echo "  plugin add exit $?"
  cx codex exec --skip-git-repo-check --json --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust \
    "Run the shell command: env | grep -i -E 'codex|session|turn' -- and reply with its output verbatim, nothing else." \
    >"$EVID/codex-exec.jsonl" 2>"$EVID/codex-exec-stderr.txt"
  echo "  exec exit $?"
  rm -f "$CODEX_HOME_S/auth.json"; trap - EXIT
  read_codex
  note "the interactive environment decides Codex. The Navigator's TUI turn (the credential is borrowed again for it):"
  note "  cp ~/.codex/auth.json '$CODEX_HOME_S/auth.json' && cd '$PROJ' && CODEX_HOME='$CODEX_HOME_S' MIRROR_HOME='$MHOME' MIRROR_USER=$USER1 OPENROUTER_API_KEY= codex"
  note "  then: Run the shell command: env | grep -i -E 'codex|session|turn' -- and reply with its output verbatim."
  note "  then /quit, and: rm -f '$CODEX_HOME_S/auth.json'"
}
read_codex() {
  say "Codex — rows (expected · observed · source)"
  local tid vars sid
  tid="$(grep -o '"thread_id":"[^"]*"' "$EVID/codex-exec.jsonl" 2>/dev/null | head -1 | cut -d'"' -f4)"
  vars="$(grep -o 'CODEX_[A-Z_]*=[^ \\"]*' "$EVID/codex-exec.jsonl" 2>/dev/null | grep -v 'CODEX_HOME=\|CODEX_CI=\|CODEX_VERSION=\|CODEX_APPLY' | sort -u | tr '\n' ' ')"
  row "codex/exec" "session-like variables in the shell (provisional)" "${vars:-none}" "exec output"
  sid="$(mdb "SELECT session_id FROM runtime_sessions WHERE interface='codex' ORDER BY updated_at DESC LIMIT 1")"
  row "codex/exec" "the prompt hook's session row" "${sid:-none}" "runtime_sessions"
  row "codex/exec" "exec's thread id" "${tid:-none}" "exec json"
}

# ---------------------------------------------------------------------------
read_all() { need_setup; [ -f "$PROBE_LOG" ] && { read_pi p2; read_pi p1; }; [ -f "$EVID/claude-env-result.json" ] && read_claude; [ -f "$EVID/codex-exec.jsonl" ] && read_codex; }
clean() {
  say "Clean"
  rm -f "$CODEX_HOME_S/auth.json"
  if [ -d "$D/claude-login" ]; then
    local since svc c; since="$(stat -f '%Sm' -t '%Y%m%d%H%M%S' "$D_RAW.baseline" 2>/dev/null)"
    security dump-keychain 2>/dev/null | grep -o '"svce"<blob>="Claude Code-credentials-[^"]*"' | sed 's/.*="\(.*\)"/\1/' | sort -u | while IFS= read -r svc; do
      c="$(security find-generic-password -s "$svc" 2>/dev/null | grep '"cdat"' | grep -o '"[0-9]\{14\}' | tr -d '"')"
      [ -n "$since" ] && [ "$c" \> "$since" ] && note "keychain entry from this route's Claude login: $svc; remove it with: security delete-generic-password -s \"$svc\""
    done
  fi
  [ -e "$ROOT/.pi/extensions/probe.ts" ] && note "a probe is under .pi/extensions — it should never be; remove it" || note "nothing under .pi/ from this route"
  [ -f "$D/.ds8-ts1" ] && rm -rf "$D" && echo "  removed $D (the baseline stays at $D_RAW.baseline)" || note "nothing to remove"
}
untouched() {
  say "Untouched"
  [ -f "$D_RAW.baseline" ] || { echo "No baseline. Run setup first."; exit 2; }
  config_manifest >"$D_RAW.now"
  if diff -u <(grep -v '^C ' "$D_RAW.baseline") <(grep -v '^C ' "$D_RAW.now") >"$D_RAW.diff"; then echo "  ✓ every real file and link as before setup"
  else echo "  ✗ a real file changed:"; grep -E '^[-+][^-+]' "$D_RAW.diff" | show; fi
  local since f n; since="$(date -u -r "$(stat -f %m "$D_RAW.baseline")" +%Y-%m-%dT%H:%M:%S)"
  for f in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$f" ] || continue
    n="$(dbq "$f" "SELECT COUNT(*) FROM conversations WHERE interface IN ('claude_code','codex') AND started_at >= '$since'")"
    [ "$n" = 0 ] && echo "  ✓ $(basename "$(dirname "$f")"): no claude_code or codex conversation since setup" || echo "  ✗ $(basename "$(dirname "$f")"): ${n:-?} since setup"
  done
}

case "${1:-}" in
  setup) setup ;; pi) pi_run "${2:-}" ;; login) login ;; claude) claude_run ;; codex) codex_run ;;
  read) read_all ;; clean) clean ;; untouched) untouched ;;
  *) sed -n '2,30p' "$SELF"; exit 2 ;;
esac
