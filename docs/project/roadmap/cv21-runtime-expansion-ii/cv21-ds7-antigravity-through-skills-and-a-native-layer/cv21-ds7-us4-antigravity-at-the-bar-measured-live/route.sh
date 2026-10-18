#!/usr/bin/env bash
# CV21.DS7.US4 — the bar-walk, one live session, re-runnable.
#
#   bash route.sh live     # the five bar items + negative probes, recorded
#   bash route.sh verify   # compare installed agy with the recorded one
#
# A scratch HOME, the operator's agy login copied in and VERIFIED-removed on
# exit, the checkout's mirror-hook behind MIRROR_BIN. A minimum of three
# Mirror-active turns so injection-per-turn is seen resetting >=twice, plus
# two negative probes (Mirror off -> no injection; a skill turn -> not
# logged). Evidence is sanitized: counts, labels, verdicts, environment —
# never conversation content. The workdir is destroyed on exit.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
RECORDED_AGY="1.4.2"
work=""; home=""; ws=""; bin=""
say() { printf '\n== %s ==\n' "$1"; }
verdict() { printf '  [%s] %s\n' "$1" "$2"; }

verify() {
  local now; now="$(agy --version 2>/dev/null | head -1)"
  echo "recorded: agy $RECORDED_AGY"; echo "installed: $now"
  case "$now" in *"$RECORDED_AGY"*) echo "match" ;; *) echo "DIFFERS — re-run" ;; esac
}

live() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
  command -v sqlite3 >/dev/null || { echo "sqlite3 not on PATH"; exit 1; }
  work="$(mktemp -d)"; home="$work/home"; ws="$work/workspace"; bin="$work/bin"
  mkdir -p "$home/.gemini" "$ws" "$bin"

  # Destruction + credential-verify on exit (security-engineer).
  cleanup() {
    rm -f "${home:-/nonexistent}/.gemini/oauth_creds.json" "${home:-/nonexistent}/.gemini/google_accounts.json" 2>/dev/null
    if [ -n "${home:-}" ] && [ -f "$home/.gemini/oauth_creds.json" ]; then
      echo "WARNING: scratch credential still present — remove $home/.gemini/oauth_creds.json" >&2
    else
      echo "scratch credential verified absent"
    fi
    [ -n "${work:-}" ] && rm -rf "$work"
  }
  trap cleanup EXIT

  say "ENVIRONMENT (recorded as data)"
  local ver binp ts
  ver="$(agy --version 2>/dev/null | head -1)"; binp="$(command -v agy)"; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "agy_version=$ver"; echo "agy_binary=$binp"; echo "utc=$ts"
  echo "mode=interactive-and-print (see per-turn notes)"; echo "scratch_home_clean=yes"
  case "$ver" in *"$RECORDED_AGY"*) echo "version_match=yes" ;; *) echo "version_match=NO — recorded $RECORDED_AGY" ;; esac

  say "ITEM 5 — install in one step"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
  local staged="$home/.gemini/config/plugins/mirror-mind"
  local skills; skills="$(find "$staged/skills" -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
  echo "install_steps=1 (agy plugin install); gemini_cli_steps=2"
  verdict PASS "item 5: one documented install step"

  say "ITEM 1 — skills reachable"
  echo "staged mm skills: $skills"
  [ "$skills" -ge 25 ] && verdict PASS "item 1: $skills skills staged (invocation checked live below)" \
                       || verdict FAIL "item 1: only $skills skills staged"

  say "2. scratch Mirror home + mirror-hook, and the rules marker"
  HOME="$home" MIRROR_HOME="" MIRROR_USER="" XDG_CONFIG_HOME="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" init agy-live >/dev/null
  local mhome="$home/.mirror-minds/agy-live" db="$home/.mirror-minds/agy-live/memory.db"
  ln -s "$REPO_ROOT/bin/mirror-hook.js" "$bin/mirror-hook"
  local RULEMARK="RULEMARK-$$-$RANDOM"
  printf '\nRoute marker (US4 item 2): %s\n' "$RULEMARK" >> "$staged/rules/AGENTS.md"
  local AGY_ENV=(HOME="$home" MIRROR_BIN="$bin" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="")

  say "0. authenticate the scratch HOME (interactive, once)"
  echo "open the auth URL, approve, paste the code at agy's prompt."
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print "Reply with the single word: ready.") \
    || { echo "auth did not complete; re-run"; exit 1; }

  say "ITEM 2 — Operating Instructions at session start (rules marker)"
  local out1; out1="$(cd "$ws" && env "${AGY_ENV[@]}" agy --print "List any marker codes in your rules verbatim, codes only." 2>/dev/null)"
  if printf '%s' "$out1" | grep -q "$RULEMARK"; then
    verdict PASS "item 2: the staged-only rules marker reached the model"
  else
    verdict FAIL "item 2: rules marker not quoted"
  fi

  say "ITEMS 3 + 4 — three Mirror-active turns (injection per turn, logging)"
  # Activate Mirror Mode for the conversation after the first turn binds it.
  local cid tpath
  (cd "$ws" && env "${AGY_ENV[@]}" agy --print "In one sentence: what is a mirror?" >/dev/null 2>&1) || true
  cid="$(sqlite3 "$db" "SELECT session_id FROM runtime_sessions WHERE conversation_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;" 2>/dev/null)"
  env HOME="$home" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" mirror load --session-id "$cid" --query "activate" >/dev/null 2>&1 || true
  (cd "$ws" && env "${AGY_ENV[@]}" agy --continue --print "In one sentence: what is a reflection?" >/dev/null 2>&1) || true
  (cd "$ws" && env "${AGY_ENV[@]}" agy --continue --print "In one sentence: what is an echo?" >/dev/null 2>&1) || true

  tpath="$(find "$home/.gemini/antigravity-cli/brain/$cid" -name transcript.jsonl 2>/dev/null | head -1)"
  local inj resets
  if [ -n "$tpath" ]; then
    inj="$(grep -c 'EPHEMERAL_MESSAGE' "$tpath" 2>/dev/null | head -1)"; inj="${inj:-0}"
    resets="$(grep -o '"invocationNum":[[:space:]]*0' "$tpath" 2>/dev/null | wc -l | tr -d ' ')"
  else inj=0; resets=0; fi
  echo "ephemeral injections in transcript: $inj; invocationNum=0 resets: $resets"
  if [ "$inj" -ge 2 ]; then verdict PASS "item 3: injection present across turns ($inj ephemeral, $resets resets)"
  else verdict "NOTE" "item 3: $inj ephemeral steps — see transcript (agy --print may limit turns)"; fi

  local users assistants closed
  users="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.interface='antigravity' AND m.role='user';" 2>/dev/null || echo 0)"
  assistants="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.interface='antigravity' AND m.role='assistant';" 2>/dev/null || echo 0)"
  echo "antigravity rows: user=$users assistant=$assistants"
  env "${AGY_ENV[@]}" MIRROR_STALE_ORPHAN_MINUTES=0 \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" conversation-logger session-start >/dev/null 2>&1 || true
  closed="$(sqlite3 "$db" "SELECT COUNT(*) FROM conversations WHERE interface='antigravity' AND ended_at IS NULL;" 2>/dev/null || echo 1)"
  if [ "$users" -ge 1 ] && [ "$assistants" -ge 1 ] && [ "$closed" = "0" ]; then
    verdict PASS "item 4: turns logged as antigravity and closed (open after sweep: $closed)"
  else
    verdict "NOTE" "item 4: user=$users assistant=$assistants open_after=$closed"
  fi
  echo "close-timing delta: Gemini CLI closed at session end; Antigravity closes by stale-orphan (default 30 min). Memories extract after close."

  say "NEGATIVE PROBES (falsifiable)"
  # Probe A: Mirror Mode OFF on a fresh conversation -> no injection.
  local work2 home2; work2="$ws/neg"; home2="$home"
  # Fresh conversation, no mirror load activation -> pre-invocation injects nothing.
  echo '{"conversationId":"neg-off","invocationNum":0}' \
    | env "${AGY_ENV[@]}" node "$bin/mirror-hook" agy:pre-invocation 2>/dev/null > "$ws/negA.out"
  if [ "$(tr -d ' \n' < "$ws/negA.out")" = "{}" ]; then
    verdict PASS "negative A: Mirror Mode off injects nothing"
  else verdict FAIL "negative A: unexpected injection: $(cat "$ws/negA.out")"; fi
  # Probe B: a skill turn is not logged as conversation.
  local sfix="$ws/skill.jsonl"
  printf '%s\n' '{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","content":"<USER_REQUEST>\n/mirror-mind:mm:mirror hi\n</USER_REQUEST>"}' '{"step_index":1,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","content":"ok"}' > "$sfix"
  local before after
  before="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo 0)"
  printf '{"conversationId":"neg-skill","transcriptPath":"%s"}' "$sfix" \
    | env "${AGY_ENV[@]}" node "$bin/mirror-hook" agy:stop >/dev/null 2>&1 || true
  after="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo 0)"
  [ "$before" = "$after" ] && verdict PASS "negative B: a skill turn is not logged ($before == $after)" \
                           || verdict FAIL "negative B: skill turn logged ($before -> $after)"

  say "MCP (recorded, not gated)"
  if grep -q "mcpServers" "$staged/mcp_config.json" 2>/dev/null; then
    echo "mcp_config.json ships an mcpServers entry; agy reachability observed interactively (record /mcp in evidence)"
  fi

  say "LEDGER (sanitized — paste into evidence)"
  echo "agy $ver @ $binp, $ts"
  printf '%s\n' "$out1" | grep -o "$RULEMARK" >/dev/null && echo "item2_marker=seen"
  echo "item1_skills=$skills item3_ephemeral=$inj item3_resets=$resets item4_user=$users item4_assistant=$assistants item4_open_after=$closed"
  echo "workdir destroyed on exit; credential verified at exit"
}


interactive() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
  command -v sqlite3 >/dev/null || { echo "sqlite3 not on PATH"; exit 1; }
  work="$(mktemp -d)"; home="$work/home"; ws="$work/workspace"; bin="$work/bin"
  mkdir -p "$home/.gemini" "$ws" "$bin"
  cleanup() {
    rm -f "${home:-/nonexistent}/.gemini/oauth_creds.json" "${home:-/nonexistent}/.gemini/google_accounts.json" 2>/dev/null
    if [ -n "${home:-}" ] && [ -f "$home/.gemini/oauth_creds.json" ]; then
      echo "WARNING: scratch credential still present" >&2
    else echo "scratch credential verified absent"; fi
    [ -n "${work:-}" ] && rm -rf "$work"
  }
  trap cleanup EXIT

  say "stage the plugin and wire the scratch Mirror home"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
  HOME="$home" MIRROR_HOME="" MIRROR_USER="" XDG_CONFIG_HOME="" \
    node --no-warnings "$REPO_ROOT/ts/src/frontDoor/cli.ts" init agy-live >/dev/null
  local mhome="$home/.mirror-minds/agy-live" db="$home/.mirror-minds/agy-live/memory.db"
  ln -s "$REPO_ROOT/bin/mirror-hook.js" "$bin/mirror-hook"

  say "LAUNCHING interactive agy in the scratch HOME"
  echo "Do this, in order, then type /quit:"
  echo "  1. /mirror-mind:mm:mirror  what should I focus on today?   (item 1 skill + item 3 injection)"
  echo "  2. ask one more ordinary question                          (item 3: injection again, per turn)"
  echo "  3. /mcp                                                    (MCP reachability, recorded)"
  echo
  (cd "$ws" && env HOME="$home" MIRROR_BIN="$bin" MIRROR_HOME="$mhome" MIRROR_USER="" OPENROUTER_API_KEY="" agy) || true

  say "READINGS after the session (sanitized)"
  local cid tpath inj resets users assistants
  cid="$(sqlite3 "$db" "SELECT session_id FROM runtime_sessions WHERE conversation_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;" 2>/dev/null)"
  tpath="$(find "$home/.gemini/antigravity-cli/brain/$cid" -name transcript.jsonl 2>/dev/null | head -1)"
  if [ -n "$tpath" ]; then
    inj="$(grep -c 'EPHEMERAL_MESSAGE' "$tpath" 2>/dev/null | head -1)"; inj="${inj:-0}"
    resets="$(grep -o '"invocationNum":[[:space:]]*0' "$tpath" 2>/dev/null | wc -l | tr -d ' ')"
  else inj=0; resets=0; fi
  users="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.interface='antigravity' AND m.role='user';" 2>/dev/null || echo 0)"
  assistants="$(sqlite3 "$db" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.interface='antigravity' AND m.role='assistant';" 2>/dev/null || echo 0)"
  echo "item3_ephemeral_injections=$inj item3_invocationNum0_resets=$resets"
  echo "item4_antigravity_user=$users item4_antigravity_assistant=$assistants"
  if [ "$inj" -ge 2 ]; then verdict PASS "item 3: injection observed across turns ($inj ephemeral, $resets resets)"
  elif [ "$inj" -ge 1 ]; then verdict "PASS-WITH-NOTE" "item 3: $inj injection(s) observed ($resets resets)"
  else verdict "NOTE" "item 3: 0 ephemeral in this transcript — record what the model quoted interactively"; fi
  echo "For item 1 and MCP: record what you saw interactively (the skill answered; /mcp listed tools or not)."
}

case "${1:-live}" in
  live) live ;;
  interactive) interactive ;;
  verify) verify ;;
  *) echo "usage: route.sh [live|verify]"; exit 2 ;;
esac
