#!/usr/bin/env bash
# CV9.DS8.TS6 — the Navigator's live walk: Antigravity's PreInvocation through the
# one doorman, on the installed agy.
#
#   bash route.sh walk      # scratch HOME, one interactive login, the headless rows,
#                           # then an interactive session for the interactive rows
#   bash route.sh verify    # compare the installed agy with the recorded one
#
# The world: a scratch HOME (agy logs in once inside it: open the URL it prints,
# paste the code), the checkout's plugin staged by `agy plugin install` (the path a
# user takes), the checkout's `mirror-hook` and `mirror` behind MIRROR_BIN, and a
# scratch Mirror home holding the synthetic demo database (fictional personas routed
# by keyword, fictional memories). agy may run `mirror …` without asking and nothing
# else (`permissions.allow: command(mirror)` in the scratch settings), so the Builder
# switch runs headless.
#
# Optional: TS6_OPENROUTER_API_KEY=<key> bash route.sh walk — the doorman's embedding
# and the full load's reception then run for real (a few cents), and the cost and
# timing rows read real numbers; without it they read 0 and the memory search is the
# FTS fallback. Nothing else is read from your environment: the tree's .env and
# ~/.config/mirror/env are shadowed by explicit values.
#
# Evidence is sanitized: step types, delivered lines (they name fictional personas),
# counts, verdicts, timings. The workdir is destroyed on exit, and every credential
# file the scratch login wrote is listed, removed, and verified gone (CR144).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
RECORDED_AGY="1.4.7"
export LC_ALL=C

work=""; home=""; ws=""; bin=""; mhome=""; db=""
say() { printf '\n== %s ==\n' "$1"; }
verdict() { printf '  [%s] %s\n' "$1" "$2"; }

verify() {
  local now; now="$(agy --version 2>/dev/null | head -1)"
  echo "recorded: agy $RECORDED_AGY"; echo "installed: $now"
  case "$now" in *"$RECORDED_AGY"*) echo "match" ;; *) echo "DIFFERS — re-run the probe first" ;; esac
}

cleanup() {
  [ -n "${home:-}" ] || return 0
  say "CLEANUP — the scratch login, then the workdir"
  local found
  found="$(find "$home/.gemini" -type f \( -iname '*oauth*' -o -iname '*token*' -o -iname '*cred*' -o -iname 'google_accounts.json' \) 2>/dev/null)"
  if [ -n "$found" ]; then
    printf '%s\n' "$found" | sed "s#^$home#<scratch HOME>#" | sed 's/^/  credential file: /'
    printf '%s\n' "$found" | while IFS= read -r f; do rm -f "$f"; done
  else
    echo "  no credential file under the scratch HOME's .gemini — on agy 1.4.7 for macOS the login"
    echo "  may live in the system keychain: look in Keychain Access for an Antigravity entry"
    echo "  created at this walk's time, and remove it if it is the scratch login."
  fi
  if [ -n "$(find "$home/.gemini" -type f \( -iname '*oauth*' -o -iname '*token*' -o -iname '*cred*' \) 2>/dev/null)" ]; then
    echo "  WARNING: a credential file is still present under $home/.gemini" >&2
  else
    echo "  scratch credential files verified absent"
  fi
  [ -n "${work:-}" ] && rm -rf "$work" && echo "  workdir destroyed"
}

# One environment for every agy run and every hook it starts: the scratch HOME and
# the scratch Mirror home, nothing inherited that could point Mirror elsewhere.
agy_env() {
  env HOME="$home" MIRROR_BIN="$bin" MIRROR_HOME="$mhome" DB_PATH="$db" MIRROR_USER="" \
    MEMORY_ENV=production OPENROUTER_API_KEY="${TS6_OPENROUTER_API_KEY:-}" \
    MIRROR_SESSION_ID="" CLAUDE_CODE_SESSION_ID="" CODEX_SESSION_ID="" \
    XDG_CONFIG_HOME="$work/xdg" PATH="$bin:$PATH" "$@"
}

q() { sqlite3 "$db" "$1" 2>/dev/null; }
calls() { q "SELECT COUNT(*) FROM llm_calls;"; }

# One headless turn; prints the llm_calls rows it cost.
headless() { # $1 label, $2 prompt, [$3 conversation id]
  local before after
  before="$(calls)"
  if [ -n "${3:-}" ]; then
    (cd "$ws" && agy_env agy --print-timeout 240s --conversation "$3" --print "$2" >"$work/last.out" 2>&1) || true
  else
    (cd "$ws" && agy_env agy --print-timeout 240s --print "$2" >"$work/last.out" 2>&1) || true
  fi
  after="$(calls)"
  printf '  %-34s llm_calls +%s\n' "$1" "$((after - before))"
}

# The conversation's turns, read from agy's transcript: per user turn, the Mirror
# steps injected (type, source, delivered line), any `mirror … load` the model ran,
# and whether the reply opens with a signature.
read_turns() { # $1 conversation id
  local t="$home/.gemini/antigravity-cli/brain/$1/.system_generated/logs/transcript_full.jsonl"
  [ -f "$t" ] || { echo "  (no transcript for $1)"; return; }
  node - "$t" <<'EOF'
const lines = require("fs").readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
const turns = [];
for (const line of lines) {
  let e; try { e = JSON.parse(line); } catch { continue; }
  const c = typeof e.content === "string" ? e.content : "";
  if (e.type === "USER_INPUT") {
    const m = /<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/.exec(c);
    turns.push({ prompt: (m ? m[1] : c).slice(0, 48), mirror: [], ephemeral: 0, loads: 0, reply: "" });
    continue;
  }
  const turn = turns[turns.length - 1];
  if (!turn) continue;
  if (e.type === "SYSTEM_MESSAGE" && e.source === "SYSTEM_SDK") {
    const i = c.indexOf("delivered by the runtime for this turn: ");
    turn.mirror.push(i >= 0 ? c.slice(i + 40, i + 40 + 80).split("\n")[0] : "(a system step without the delivered line)");
  }
  if (e.type === "EPHEMERAL_MESSAGE") turn.ephemeral += 1;
  for (const call of e.tool_calls ?? []) {
    const cmd = String(call?.args?.CommandLine ?? "");
    if (/\bmirror\s+(mirror\s+)?load\b/.test(cmd)) turn.loads += 1;
  }
  if (e.type === "PLANNER_RESPONSE" && c.trim() && !turn.reply) turn.reply = c.trim();
}
turns.forEach((t, n) => {
  // The signature is the reply's first line opening with ◇: on an explicit turn the model
  // renders the Mirror Mode card first and signs below it (TS6's walk).
  const signature = t.reply.split("\n").map((l) => l.trim()).find((l) => l.startsWith("◇"));
  const card = t.reply.includes("MIRROR MODE ACTIVE") ? " (after the Mirror Mode card)" : "";
  const signed = signature ? `signed "${signature.slice(0, 40)}"${card}` : t.reply ? "unsigned" : "no reply";
  console.log(`  turn ${n + 1}: ${JSON.stringify(t.prompt)}`);
  console.log(`    mirror steps: ${t.mirror.length}${t.mirror.map((m) => `\n      ${m}`).join("")}`);
  console.log(`    ephemeral steps: ${t.ephemeral} · model's own mirror loads: ${t.loads} · ${signed}`);
});
EOF
}

# Mirror steps injected on the conversation's last user turn.
last_turn_steps() { # $1 conversation id
  local t="$home/.gemini/antigravity-cli/brain/$1/.system_generated/logs/transcript_full.jsonl"
  node -e '
const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let last = -1; lines.forEach((e, i) => { if (e.type === "USER_INPUT") last = i; });
const steps = lines.slice(last + 1).filter((e) => e.type === "SYSTEM_MESSAGE" && e.source === "SYSTEM_SDK");
const first = steps[0] ? String(steps[0].content) : "";
const i = first.indexOf("this turn: ");
console.log(steps.length + "\t" + (i >= 0 ? first.slice(i + 11, i + 11 + 60).split("\n")[0] : ""));
' "$t" 2>/dev/null || printf '0\t\n'
}

mode_of() { # $1 session id -> its own operating mode
  q "SELECT json_extract(metadata, '\$.operating_mode.active_mode') FROM runtime_sessions WHERE session_id = '$1';"
}

walk() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
  command -v sqlite3 >/dev/null || { echo "sqlite3 not on PATH"; exit 1; }
  work="$(mktemp -d)"; home="$work/home"; ws="$work/workspace"; bin="$work/bin"
  mhome="$work/mirror-home"; db="$mhome/memory.db"
  mkdir -p "$home/.gemini/antigravity-cli" "$ws" "$bin" "$mhome" "$work/xdg"
  trap cleanup EXIT
  (cd "$ws" && git init -q .)

  say "ENVIRONMENT (recorded as data)"
  local ver binp ts
  ver="$(agy --version 2>/dev/null | head -1)"; binp="$(command -v agy)"; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "agy_version=$ver"; echo "agy_binary=$binp"; echo "utc=$ts"
  case "$ver" in *"$RECORDED_AGY"*) echo "version_match=yes" ;; *) echo "version_match=NO — recorded $RECORDED_AGY: re-run the probe" ;; esac
  [ -n "${TS6_OPENROUTER_API_KEY:-}" ] && echo "providers=real (key given)" || echo "providers=none (no key: cost reads 0, memory search is FTS)"

  say "SETUP — the plugin, the hooks' bin, the demo Mirror home, the scoped permission"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
  ln -s "$REPO_ROOT/bin/mirror-hook.js" "$bin/mirror-hook"
  ln -s "$REPO_ROOT/bin/mirror.js" "$bin/mirror"
  (cd "$REPO_ROOT" && node --no-warnings ts/smoke/generate_demo_memory_db.ts --out "$db" >/dev/null) \
    || { echo "demo database not generated"; exit 1; }
  printf '%s\n' '{ "permissions": { "allow": ["command(mirror)"] } }' \
    > "$home/.gemini/antigravity-cli/settings.json"
  echo "demo personas: $(q "SELECT group_concat(key, ', ') FROM identity WHERE layer = 'persona';")"

  say "0. log in inside the scratch HOME (interactive, once)"
  echo "agy prints an auth URL: open it, approve, paste the code at its prompt."
  echo "A fresh HOME also gets agy's Terms & data-use screen, which can surface mid-run; its"
  echo "data-use box shows checked. Choose your own preference if it asks."
  (cd "$ws" && agy_env agy --print "Reply with the single word: ready.") \
    || { echo "login did not complete; re-run"; exit 1; }

  say "HEADLESS ROWS — one new conversation, then resumed turns (each a new agy process)"
  headless "1 explicit form, new conversation" "/mirror-mind:mm:mirror how should I plan my budget for next year? Answer in two sentences."
  local cid
  cid="$(q "SELECT session_id FROM runtime_sessions WHERE interface = 'antigravity' ORDER BY started_at DESC LIMIT 1;")"
  [ -n "$cid" ] || { echo "no antigravity session bound; see $work/last.out"; exit 1; }
  echo "  conversation: $cid"
  local r1; r1="$(last_turn_steps "$cid")"
  headless "2 another domain (resumed)" "What should I plant in my garden this spring, given clay soil? Answer in two sentences." "$cid"
  local r2; r2="$(last_turn_steps "$cid")"; local refresh2; refresh2="$(q "SELECT json_extract(metadata, '\$.doorman_refresh') FROM runtime_sessions WHERE session_id = '$cid';")"
  headless "3 same domain (resumed)" "And when should I start the seedlings indoors? Answer in one sentence." "$cid"
  local r3; r3="$(last_turn_steps "$cid")"
  headless "3b same domain again (resumed)" "Should I add compost before planting? Answer in one sentence." "$cid"
  local r3b; r3b="$(last_turn_steps "$cid")"
  headless "4a Builder switch (skill turn)" "/mirror-mind:mm:build demo-root-active" "$cid"
  local r4s; r4s="$(last_turn_steps "$cid")"; local mode4; mode4="$(mode_of "$cid")"
  headless "4a ordinary turn after the switch" "How should I name a function that parses a hook payload? Answer in one sentence." "$cid"
  local r4o; r4o="$(last_turn_steps "$cid")"

  # 4b, the limit: back to Mirror Mode, then another runtime's session is touched more
  # recently than this one, then the Builder switch from the model's shell guesses.
  headless "4b back to Mirror Mode" "/mirror-mind:mm:mirror is my savings plan on track? Answer in one sentence." "$cid"
  # The product's timestamp shape (`nowIso`: six fractional digits), so the guess's
  # ORDER BY updated_at compares like with like.
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%S.000000Z)"
  q "INSERT INTO runtime_sessions (session_id, interface, mirror_active, active, started_at, updated_at) VALUES ('route-other-runtime', 'pi', 0, 1, '$now', '$now');"
  headless "4b Builder switch, another session newer" "/mirror-mind:mm:build demo-root-active" "$cid"
  local mode4b_other mode4b_cid; mode4b_other="$(mode_of route-other-runtime)"; mode4b_cid="$(mode_of "$cid")"
  headless "4b ordinary turn after it" "What should I plant next to basil in my garden? Answer in one sentence." "$cid"
  local r4b; r4b="$(last_turn_steps "$cid")"

  say "READINGS — the conversation, turn by turn (from agy's transcript)"
  read_turns "$cid"

  say "VERDICTS — step delivered (the story's bar); signatures are observed above"
  [ "$(cut -f1 <<<"$r1")" = 1 ] && [[ "$(cut -f2 <<<"$r1")" == full* ]] \
    && verdict PASS "1: one Mirror step, full: $(cut -f2 <<<"$r1")" || verdict FAIL "1: $r1"
  [ "$(cut -f1 <<<"$r2")" = 1 ] && [[ "$(cut -f2 <<<"$r2")" == delta* ]] && [ -z "$refresh2" ] \
    && verdict PASS "2: resumed, no SessionStart refresh, one delta: $(cut -f2 <<<"$r2")" || verdict FAIL "2: $r2 (refresh=$refresh2)"
  [ "$(cut -f1 <<<"$r3")" = 1 ] && [ "$(cut -f1 <<<"$r3b")" = 1 ] \
    && verdict PASS "3: one step each on later turns" || verdict FAIL "3: $r3 / $r3b"
  [ "$(cut -f1 <<<"$r4s")" = 0 ] && verdict PASS "4a: the skill turn got no Mirror step" || verdict FAIL "4a skill turn: $r4s"
  if [ "$mode4" = "Builder Mode" ]; then
    [ "$(cut -f1 <<<"$r4o")" = 0 ] && verdict PASS "4a: the switch landed on this session; the next ordinary turn got no step" \
      || verdict FAIL "4a: Builder on this session, yet a step: $r4o"
  else
    verdict OBSERVE "4a: this session's mode after the switch is '${mode4:-none}' — did the model run mirror build load? (see readings)"
  fi
  if [ "$mode4b_other" = "Builder Mode" ] && [ "$mode4b_cid" != "Builder Mode" ]; then
    verdict PASS "4b: the limit, observed — the switch stamped the newer session; this one still got: $(cut -f2 <<<"$r4b")"
  else
    verdict OBSERVE "4b: other='${mode4b_other:-none}' this='${mode4b_cid:-none}', last turn: $r4b"
  fi
  local users assistants
  users="$(q "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.interface = 'antigravity' AND m.role = 'user';")"
  assistants="$(q "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.interface = 'antigravity' AND m.role = 'assistant';")"
  local skills_logged
  skills_logged="$(q "SELECT COUNT(*) FROM messages WHERE role = 'user' AND content LIKE '/mirror-mind:%';")"
  [ "$users" = "$assistants" ] && [ "$skills_logged" = 0 ] \
    && verdict PASS "6: logged as antigravity, user=$users assistant=$assistants, skill turns skipped" \
    || verdict FAIL "6: user=$users assistant=$assistants skill_prompts_logged=$skills_logged"
  if [ -s "$mhome/hooks.log" ]; then verdict FAIL "7: hooks.log:"; sed 's/^/      /' "$mhome/hooks.log"
  else verdict PASS "7: hooks.log empty"; fi
  echo "  llm_calls by role: $(q "SELECT group_concat(role || '=' || n, ' ') FROM (SELECT role, COUNT(*) n FROM llm_calls GROUP BY role);")"

  say "TIMING — agy:pre-invocation replayed against a copy of this home (budget: 15 s)"
  local tdb="$work/timing"; mkdir -p "$tdb"; cp "$db" "$tdb/memory.db"
  time_hook() { # $1 label, $2 payload
    local t0 t1
    t0="$(perl -MTime::HiRes=time -e 'printf "%.3f", time')"
    printf '%s' "$2" | env MIRROR_HOME="$tdb" DB_PATH="$tdb/memory.db" MIRROR_USER="" MEMORY_ENV=production \
      OPENROUTER_API_KEY="${TS6_OPENROUTER_API_KEY:-}" MIRROR_SESSION_ID="" XDG_CONFIG_HOME="$work/xdg" \
      node "$bin/mirror-hook" agy:pre-invocation >/dev/null 2>&1
    t1="$(perl -MTime::HiRes=time -e 'printf "%.3f", time')"
    printf '  %-30s %6.3f s\n' "$1" "$(echo "$t1 - $t0" | bc)"
  }
  time_hook "quiet turn" '{"conversationId":"timing-quiet","lastUserInput":"what should I plant?"}'
  time_hook "full (explicit form)" '{"conversationId":"timing","lastUserInput":"/mirror-mind:mm:mirror how should I plan my budget?"}'
  time_hook "delta (new persona)" '{"conversationId":"timing","lastUserInput":"what should I plant in my garden?"}'
  time_hook "delta (same persona)" '{"conversationId":"timing","lastUserInput":"and the seedlings?"}'

  say "INTERACTIVE ROWS — your turn"
  echo "agy opens in the scratch HOME (accept if it asks to trust the workspace or the"
  echo "plugin's hooks). Type these one at a time, then /quit:"
  echo "  1. /mirror-mind:mm:mirror how should I plan my budget for next year?"
  echo "       expect: answered as the mirror, likely signed; no mirror mirror load of its own"
  echo "  2. What should I plant in my garden this spring, given clay soil?"
  echo "       expect: signed ◇ demo-garden-planner"
  echo "  3. Should I add compost before planting?"
  echo "       expect: still signed"
  echo "  4. /mirror-mind:mm:build demo-root-active   (approve if asked)"
  echo "       expect: the Builder card"
  echo "  5. How should I name a function that parses a hook payload?"
  echo "       expect: a plain answer, no mirror voice, no ◇ (a personal question here would send"
  echo "       the model to Mirror on its own, which is its routing, not a delivery)"
  echo
  (cd "$ws" && agy_env agy) || true
  local icid
  icid="$(q "SELECT session_id FROM runtime_sessions WHERE interface = 'antigravity' ORDER BY started_at DESC LIMIT 1;")"
  if [ -n "$icid" ] && [ "$icid" != "$cid" ]; then
    say "READINGS — the interactive conversation ($icid)"
    read_turns "$icid"
  else
    echo "  no new interactive conversation found"
  fi
  if [ -s "$mhome/hooks.log" ]; then echo "  hooks.log after the interactive session:"; sed 's/^/      /' "$mhome/hooks.log"
  else echo "  hooks.log still empty"; fi
}

case "${1:-}" in
  walk) walk ;;
  verify) verify ;;
  *) echo "usage: route.sh [walk|verify]"; exit 2 ;;
esac
