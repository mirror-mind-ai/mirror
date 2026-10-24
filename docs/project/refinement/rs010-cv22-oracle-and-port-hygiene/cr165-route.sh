#!/usr/bin/env bash
# CR165 — what the model does on a Pi follow-up turn after a Mirror turn.
#
# CR160's isolation (amendment A11): the installed Pi, headless, run from this checkout
# so Pi loads the tree's `.pi/` extension; a scratch Mirror home named by MIRROR_HOME and
# MIRROR_USER, which win over every env file; `--session-dir` keeps Pi's session files
# out of ~/.pi/agent/sessions. Each session is one `pi -p` per turn, continued with
# `--continue` in its own session dir. The evidence is the scratch home's
# `front-door.log` (every `mirror` invocation, with its arguments) and Pi's session
# file (every tool call), never the model's word for it.
#
#   bash cr165-route.sh setup          the scratch dir; a seeded home
#   bash cr165-route.sh run <A|B> [n]  session A: an explicit Mirror turn, then two
#                                      ordinary follow-ups (same topic, then another
#                                      domain); session B: one personal question with
#                                      no form, the Operating Instructions' own routing.
#                                      n names a repeat (A1, A2, ...)
#   bash cr165-route.sh read <A1|B1|…> per turn: the `mirror` commands the model ran,
#                                      whether the reply is first person, its signature
#   bash cr165-route.sh clean          remove the scratch dir
#
# Costs one cheap-model turn per prompt (CR165_MODEL, default claude-haiku-4-5 with
# thinking off): about five turns a full run.
set -u
export LC_ALL=C

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "$SELF")/../../../.." && pwd -P)"
D="${CR165_ROUTE_DIR:-/tmp/cr165-route}"
MODEL="${CR165_MODEL:-anthropic/claude-haiku-4-5:off}"
USER1=cr165user
HOME1="$D/home"
MHOME="$HOME1/.mirror-minds/$USER1"

A_TURNS=(
  "/mm-mirror How should I think about pricing a mentorship?"
  "But what if nobody pays that much?"
  "And should I write an article announcing it, or keep it quiet at first?"
)
B_TURNS=(
  "I'm not sure whether to take a job offer that pays more but takes me away from my own projects. How should I think about it?"
)

pi_env() {
  [ "$#" -gt 0 ] || { echo "pi_env: no command" >&2; exit 2; }
  env -u PI_SESSION_FILE -u PI_SESSION_ID -u PI_CODING_AGENT -u PI_MODEL -u PI_PROVIDER \
    -u PI_REASONING_LEVEL MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" "$@"
}

setup() {
  mkdir -p "$D" && touch "$D/.route"
  if [ ! -f "$MHOME/memory.db" ]; then
    mkdir -p "$HOME1"
    env -u MIRROR_HOME -u MIRROR_USER HOME="$HOME1" node "$ROOT/bin/mirror.js" init "$USER1" >/dev/null
    env HOME="$HOME1" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" node "$ROOT/bin/mirror.js" seed >/dev/null
  fi
  echo "pi $(pi --version 2>/dev/null) at $(readlink -f "$(command -v pi)"); model $MODEL"
  echo "tree: $(git -C "$ROOT" rev-parse --short HEAD); $(date -u +%Y-%m-%dT%H:%MZ)"
}

run() {
  local which="${1:-}" n="${2:-1}" dir turn i code
  case "$which" in A) local -a turns=("${A_TURNS[@]}") ;; B) local -a turns=("${B_TURNS[@]}") ;; *) echo "run A|B [n]"; exit 2 ;; esac
  [ -f "$D/.route" ] || { echo "Run: bash $SELF setup"; exit 2; }
  dir="$D/session-$which$n"; mkdir -p "$dir"
  # The front-door log is appended across sessions; a marker line keeps each turn's
  # window readable afterwards.
  i=0
  for turn in "${turns[@]}"; do
    i=$((i + 1))
    printf '%s\tROUTE\t%s%s turn %s begins\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$which" "$n" "$i" >>"$MHOME/front-door.log"
    if [ "$i" = 1 ]; then
      (cd "$ROOT" && pi_env pi -p --approve --session-dir "$dir" --model "$MODEL" "$turn" >"$dir/turn-$i.txt" 2>&1)
    else
      (cd "$ROOT" && pi_env pi -p --approve --continue --session-dir "$dir" --model "$MODEL" "$turn" >"$dir/turn-$i.txt" 2>&1)
    fi
    code=$?
    printf '%s\tROUTE\t%s%s turn %s ends\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$which" "$n" "$i" >>"$MHOME/front-door.log"
    echo "$which$n turn $i: exit $code, ${turn:0:50}"
  done
}

read_session() {
  local label="${1:-}" dir="$D/session-${1:-}" i t
  [ -d "$dir" ] || { echo "no session $label"; exit 2; }
  echo "== $label — model $MODEL"
  for t in "$dir"/turn-*.txt; do
    i="${t##*turn-}"; i="${i%.txt}"
    echo
    echo "-- turn $i"
    echo "   mirror commands the model ran (front-door.log, this turn's window):"
    awk -v s="$label turn $i begins" -v e="$label turn $i ends" -F'\t' '
      index($0, s) {w=1; next} index($0, e) {w=0} w && $2!="ROUTE" {print "     " $0}' "$MHOME/front-door.log" \
      | sed 's/\t/ /g' | grep -v -E "conversation-logger (user-prompt|stop)|welcome|session-start" | cut -c1-140
    echo "   reply: $(wc -w <"$t" | tr -d ' ') words; first person: $(grep -c -E "\b(I|I'm|I'd|my|me)\b" "$t" | tr -d ' ') lines; signature lines: $(grep -c -E '^(◇|✦) ' "$t" | tr -d ' ')"
    grep -E '^(◇|✦) ' "$t" | head -3 | sed 's/^/     /'
    echo "   opens: $(head -c 160 "$t" | tr '\n' ' ')…"
  done
  echo
  echo "-- Pi's session file: bash tool calls naming mirror"
  local f; f="$(ls -t "$dir"/*.jsonl 2>/dev/null | head -1)"
  [ -n "$f" ] && node -e '
    const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n");
    let turn = 0;
    for (const line of lines) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const m = e.message;
      if (!m) continue;
      if (m.role === "user" && typeof m.content === "string") { turn++; continue; }
      if (m.role === "user" && Array.isArray(m.content) && m.content.some((c) => c.type === "text")) { turn++; continue; }
      if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
      for (const c of m.content) {
        if (c.type !== "toolCall" && c.type !== "tool_use") continue;
        const cmd = c.arguments?.command ?? c.input?.command ?? JSON.stringify(c.arguments ?? c.input ?? {});
        if (/mirror/.test(cmd)) console.log(`   turn ${turn}: ${String(cmd).slice(0, 120)}`);
      }
    }
  ' "$f"
  echo
  echo "-- what Mirror recorded (conversations in the scratch home)"
  sqlite3 "file:$MHOME/memory.db?mode=ro&immutable=1" "SELECT substr(c.started_at,12,8), coalesce(c.persona,'-'), coalesce(c.journey,'-'), (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.role='user'), (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.role='assistant') FROM conversations c ORDER BY c.started_at" 2>/dev/null | sed 's/^/   /'
}

clean() { [ -f "$D/.route" ] && rm -rf "$D" && echo "removed $D" || echo "nothing to remove"; }

case "${1:-}" in
  setup) setup ;;
  run) run "${2:-}" "${3:-1}" ;;
  read) read_session "${2:-}" ;;
  clean) clean ;;
  *) sed -n '2,24p' "$SELF"; exit 2 ;;
esac
