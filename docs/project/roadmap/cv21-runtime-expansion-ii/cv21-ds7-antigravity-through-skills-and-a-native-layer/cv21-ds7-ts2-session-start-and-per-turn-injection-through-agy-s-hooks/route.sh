#!/usr/bin/env bash
# CV21.DS7.TS2 — the live injection route, re-runnable.
#
#   bash route.sh live     # the three observations on the installed agy
#   bash route.sh verify   # compare installed agy with the recorded one
#
# Everything runs in a scratch HOME; the workspace holds NO AGENTS.md, the
# rules marker is added to the STAGED copy (the shipped bytes exist in both
# carriers, so a shipped marker proves nothing), and a route-only capture
# hook records the payloads so conversationId is read from evidence, not
# guessed. Two model turns on the operator's agy login.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
RECORDED_AGY="1.4.2"

say() { printf '\n== %s ==\n' "$1"; }

verify() {
  local now; now="$(agy --version 2>/dev/null | head -1)"
  echo "recorded: agy $RECORDED_AGY"; echo "installed: $now"
  case "$now" in *"$RECORDED_AGY"*) echo "match" ;; *) echo "DIFFERS — re-run before trusting" ;; esac
}

live() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
  local work; work="$(mktemp -d)"
  local home="$work/home" ws="$work/workspace" bin="$work/bin"
  mkdir -p "$home" "$ws" "$bin"
  local RULEMARK="RULEMARK-$$-$RANDOM" INJMARK="INJMARK-$$-$RANDOM"

  say "agy version"; agy --version | head -1

  # agy 1.4.2 will not accept a copied credential file; the scratch HOME
  # logs in interactively, once, in step 0 below — the auth prompt stays on
  # the terminal (no redirection) so the operator can open the URL and paste
  # the code agy asks for. Whatever credential the flow writes into the
  # scratch is removed on exit; the real ~/.gemini is never touched.
  mkdir -p "$home/.gemini"
  trap "rm -f '$home/.gemini/oauth_creds.json' '$home/.gemini/google_accounts.json'" EXIT

  say "1. stage the plugin into the scratch HOME"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
  local staged="$home/.gemini/config/plugins/mirror-mind"
  [ -f "$staged/hooks.json" ] || { echo "no staged hooks.json"; exit 1; }
  grep -q "pre-invocation" "$staged/hooks.json" && echo "staged hooks.json carries the handlers"

  say "2. post-staging edits: the rules marker, and the route-only capture hook"
  printf '\nRoute marker (TS2 observation 2): %s\n' "$RULEMARK" >> "$staged/rules/AGENTS.md"
  python3 - "$staged/hooks.json" "$home" <<'PYEOF'
import json, sys
hooks = json.load(open(sys.argv[1]))
cap = f"payload=$(cat); printf '%s\\n' \"$payload\" >> \"{sys.argv[2]}/capture.jsonl\"; printf '{{}}'"
hooks["route-probe"] = {"enabled": True, "PreInvocation": [{"type": "command", "command": cap, "timeout": 10}]}
json.dump(hooks, open(sys.argv[1], "w"), indent=2)
PYEOF
  echo "marker: $RULEMARK; capture hook added (route-only, staged copy)"

  say "3. a scratch Mirror home and the checkout's mirror-hook behind MIRROR_BIN"
  HOME="$home" MIRROR_HOME="" MIRROR_USER="" XDG_CONFIG_HOME="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" init agy-live >/dev/null
  local mhome="$home/.mirror-minds/agy-live"
  # The wrapper runs `"$NODE" "$ENTRY"`: ENTRY must be a JS file, the way
  # npm installs mirror-hook. A shell shim here makes Node execute shell as
  # JavaScript and every hook exits 1 (first live run's hooks.log).
  ln -s "$REPO_ROOT/bin/mirror-hook.js" "$bin/mirror-hook"

  local AGY_ENV=(HOME="$home" MIRROR_BIN="$bin" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="")

  say "0. authenticate the scratch HOME (interactive, once)"
  echo "agy will print an auth URL: open it, approve, then paste the code at"
  echo "its 'paste the authorization code here' prompt. One warm-up turn runs."
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print "Reply with the single word: ready.") || {
    echo "authentication did not complete; re-run route.sh live"; exit 1; }

  say "4. turn 1 — the rules marker (observation 2) and the quiet session"
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print \
    "List every marker code visible in your rules or instructions, verbatim. Answer with the codes only." \
    2>"$work/turn1.err") | tee "$work/turn1.out" | tail -3 || true

  echo
  if grep -q "$RULEMARK" "$work/turn1.out"; then
    echo "OBSERVATION 2 PASS: the staged rules marker reached the model"
  else
    echo "OBSERVATION 2 PENDING: marker not quoted (see $work/turn1.out)"
  fi

  say "5. the capture (observation 1): PreInvocation payloads"
  if [ -f "$home/capture.jsonl" ]; then
    wc -l < "$home/capture.jsonl" | xargs echo "invocations captured:"
    # tail: the warm-up turn captures too; turn 1's conversation is the LAST
    # one, and agy --continue resumes the most recent.
    tail -1 "$home/capture.jsonl" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); print("conversationId:", d.get("conversationId","?")); print("last invocationNum:", d.get("invocationNum", 0))'
  else
    echo "no capture — the hooks did not fire (see $work/turn1.err)"
  fi

  say "6. activate Mirror Mode for the conversation, then turn 2 (observation 3)"
  local cid
  cid="$(tail -1 "$home/capture.jsonl" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("conversationId",""))')"
  [ -n "$cid" ] || { echo "no conversationId; stopping"; echo "workdir kept: $work"; exit 1; }
  env HOME="$home" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" \
    mirror load --session-id "$cid" --query "route activation $INJMARK" >/dev/null 2>&1 || true
  (cd "$ws" && env "${AGY_ENV[@]}" agy --continue --print \
    "Beyond my message and your rules files, were you handed any EPHEMERAL or injected context this turn? If so, quote its first ten words verbatim." \
    2>"$work/turn2.err") | tee "$work/turn2.out" | tail -6 || true

  echo
  # The injected context is mirror load's output: the Mirror Mode card and
  # the identity sections. The rules file holds NONE of these strings, so a
  # match is attributable (the first run's grep matched the rules heading
  # and called a false PASS).
  if grep -qE "MIRROR MODE ACTIVE|self/soul|HARD CONSTRAINTS" "$work/turn2.out"; then
    echo "OBSERVATION 3 PASS: injected Mirror context visible at the model"
  else
    echo "OBSERVATION 3 PENDING: context not quoted (see $work/turn2.out)"
  fi
  # Mechanical check, independent of what the model chooses to quote: agy
  # records injected steps in its conversation store (DS12.TS3 L2's probe
  # read them back). Look for the injected card text in the scratch state.
  if grep -rql "MIRROR MODE ACTIVE" "$home/.gemini/antigravity-cli" 2>/dev/null; then
    echo "OBSERVATION 3 (mechanical): the injected step is in agy's conversation store"
  else
    echo "OBSERVATION 3 (mechanical): injected step not found in the store"
  fi

  say "evidence"
  echo "workdir kept for the evidence copy: $work"
  echo "capture: $home/capture.jsonl"
}

case "${1:-live}" in
  live) live ;;
  verify) verify ;;
  *) echo "usage: route.sh [live|verify]"; exit 2 ;;
esac
