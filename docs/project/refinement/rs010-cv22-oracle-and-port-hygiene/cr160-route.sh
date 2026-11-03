#!/usr/bin/env bash
# CR160 — what Mirror records when a Pi skill is invoked, before and after the fix.
#
# CR159's measurement, made re-runnable (CR160, amendment A11). Each tree runs the
# same four prompts on the installed Pi, one turn each, no retry, in a scratch Mirror
# home of its own. Pi loads the tree's `.pi/` extension from the cwd, and the
# extension runs the core it ships with, so a tree is the whole of what is measured.
# MIRROR_HOME and MIRROR_USER name the scratch home and win over every env file;
# `--session-dir` keeps Pi's session files out of ~/.pi/agent/sessions.
#
#   bash cr160-route.sh setup                the scratch dir; the "before" tree (the
#                                            commit before the fix, CR160_BEFORE_REV)
#                                            as an archive using the checkout's
#                                            node_modules; a seeded home per tree
#   bash cr160-route.sh run <before|after>   the four prompts on the installed Pi
#   bash cr160-route.sh read <before|after>  what Mirror recorded, prompt by prompt
#   bash cr160-route.sh menu <before|after>  the command for the Navigator's menu pick,
#                                            read afterwards as prompt "menu"
#   bash cr160-route.sh clean                remove the scratch dir
#
# Costs one cheap-model turn per prompt (CR160_MODEL, default claude-haiku-4-5 with
# thinking off).
set -u
export LC_ALL=C

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../.." && pwd -P)"
D="${CR160_ROUTE_DIR:-/tmp/cr160-route}"
BEFORE_REV="${CR160_BEFORE_REV:-66c8593e}"
MODEL="${CR160_MODEL:-anthropic/claude-haiku-4-5:off}"
USER1=cr160user
QUESTION="What is one thing I could simplify this week?"
PROMPTS=("/mm-journeys" "/skill:mm-journeys" "/mm-mirror $QUESTION" "/skill:mm-mirror $QUESTION")

tree_of() { if [ "$1" = before ]; then echo "$D/tree-before"; else echo "$ROOT"; fi; }
home_of() { echo "$D/home-$1/.mirror-minds/$USER1"; }
label_ok() { case "${1:-}" in before | after) ;; *) echo "say before or after"; exit 2 ;; esac; }
# Runs its command in the scratch home's environment. Without a command `env` would
# print the whole environment, secrets included, so it refuses.
pi_env() {
  local label="$1"
  shift
  [ "$#" -gt 0 ] || { echo "pi_env: no command" >&2; exit 2; }
  env -u PI_SESSION_FILE -u PI_SESSION_ID -u PI_CODING_AGENT -u PI_MODEL -u PI_PROVIDER \
    -u PI_REASONING_LEVEL MIRROR_HOME="$(home_of "$label")" MIRROR_USER="$USER1" "$@"
}

setup() {
  mkdir -p "$D" && touch "$D/.route"
  if [ ! -d "$D/tree-before" ]; then
    mkdir -p "$D/tree-before"
    git -C "$ROOT" archive "$BEFORE_REV" | tar -x -C "$D/tree-before"
    ln -s "$ROOT/node_modules" "$D/tree-before/node_modules"
  fi
  local label home
  for label in before after; do
    home="$D/home-$label"
    [ -d "$(home_of "$label")" ] && continue
    mkdir -p "$home"
    env -u MIRROR_HOME -u MIRROR_USER HOME="$home" node "$(tree_of "$label")/bin/mirror.js" init "$USER1" >/dev/null
    env HOME="$home" MIRROR_HOME="$(home_of "$label")" MIRROR_USER="$USER1" \
      node "$(tree_of "$label")/bin/mirror.js" seed >/dev/null
  done
  echo "pi $(pi --version 2>/dev/null) at $(command -v pi); model $MODEL"
  echo "before: $BEFORE_REV; after: $(git -C "$ROOT" rev-parse --short HEAD); $(date -u +%Y-%m-%dT%H:%MZ)"
}

run() {
  label_ok "${1:-}"
  local label="$1" n=0 prompt dir code
  for prompt in "${PROMPTS[@]}"; do
    n=$((n + 1))
    dir="$D/sessions-$label-$n"
    mkdir -p "$dir"
    # `--approve`: Pi loads a project's `.pi/` only once trusted, and the scratch tree
    # is a new project; the flag trusts it for this run and changes no configuration.
    (cd "$(tree_of "$label")" && pi_env "$label" pi -p --approve --session-dir "$dir" --model "$MODEL" "$prompt" >"$dir/out.txt" 2>&1)
    code=$?
    echo "$label $n: exit $code, ${prompt:0:40}"
  done
}

# A run owns the rows written from its session's start until the next run's start:
# rows carry no session, and the old logger could split a prompt and its reply
# across two conversations, so the session's conversation is not where to look.
started_at() { head -1 "$1"/*.jsonl 2>/dev/null | sed -n 's/.*"timestamp": *"\([^"]*\)".*/\1/p' | cut -c1-23; }

read_rows() {
  label_ok "${1:-}"
  local label="$1" db n start next runs=() line
  db="$(home_of "$label")/memory.db"
  sleep 3 # the reply is written by a detached process; let it land
  for n in 1 2 3 4 menu; do
    [ -d "$D/sessions-$label-$n" ] && start="$(started_at "$D/sessions-$label-$n")" && [ -n "$start" ] && runs+=("$start $n")
  done
  local sorted
  sorted="$(printf '%s\n' "${runs[@]}" | sort)"
  while IFS=' ' read -r start n; do
    next="$(printf '%s\n' "$sorted" | awk -v s="$start" '$1 > s {print $1; exit}')"
    case "$n" in menu) echo "menu pick:" ;; *) echo "${PROMPTS[$((n - 1))]:0:40}:" ;; esac
    line="$(sqlite3 "file:$db?immutable=1" "select '  ' || role || ', ' || length(content) || ' chars: ' || substr(replace(content, char(10), ' '), 1, 50) from messages where substr(created_at, 1, 23) >= '$start' and substr(created_at, 1, 23) < '${next:-9999}' order by created_at, rowid;")"
    if [ -n "$line" ]; then echo "$line"; else echo "  (nothing recorded)"; fi
  done <<<"$sorted"
  echo "new session files in ~/.pi/agent/sessions since setup: $(find "$HOME/.pi/agent/sessions" -name '*.jsonl' -newerBt "@$(stat -f %B "$D/.route")" 2>/dev/null | wc -l | tr -d ' ')"
}

menu() {
  label_ok "${1:-}"
  echo "cd $(tree_of "$1")"
  echo "MIRROR_HOME=$(home_of "$1") MIRROR_USER=$USER1 pi --approve --session-dir $D/sessions-$1-menu --model $MODEL"
}

clean() {
  [ -f "$D/.route" ] || { echo "nothing to remove at $D"; return; }
  rm -rf "$D" && echo "removed $D"
}

case "${1:-}" in
  setup) setup ;;
  run) run "${2:-}" ;;
  read) read_rows "${2:-}" ;;
  menu) menu "${2:-}" ;;
  clean) clean ;;
  *) sed -n '2,24p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
