#!/usr/bin/env bash
# CV21.DS4.TS3 — Codex's `$`-skill turns follow the slash-command rule.
#
#   bash route.sh static
#
# The plugin's real wrappers and THIS tree's `mirror-hook` against a scratch
# mirror home. A `codex` `$`-skill turn and its reply log nothing; the Mirror
# form keeps its exception in the `$` sigil; a `$` that is not a skill name is
# conversation on Claude Code. The prompt and Stop hooks make no model call.
# Writes only under DS4_TS3_DIR (default /tmp/cv21-ds4-ts3); touches no real home.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS4_TS3_DIR:-/tmp/cv21-ds4-ts3}"
HOOKS="$ROOT/plugins/mirror-mind/hooks"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
PASS=0
FAIL=0

rm -rf "$D_RAW" && mkdir -p "$D_RAW"
D="$(cd "$D_RAW" && pwd -P)"
HOME_DIR="$D/home"
MIRROR="$D/mirror-home"
BIN="$D/bin"
mkdir -p "$HOME_DIR" "$MIRROR" "$BIN"
DB="$MIRROR/memory_test.db"

# The entry under test is this checkout's, never whatever `mirror-hook` the
# PATH holds (TS2's route learned this from the Navigator's first run).
ln -s "$ROOT/bin/mirror.js" "$BIN/mirror"
ln -s "$ROOT/bin/mirror-hook.js" "$BIN/mirror-hook"

ENV=(env HOME="$HOME_DIR" MIRROR_HOME="$MIRROR" MIRROR_USER= MEMORY_ENV=test
  OPENROUTER_API_KEY= MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off
  NODE_OPTIONS=--no-warnings MIRROR_BIN="$BIN" PATH="$BIN:$PATH")

q() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const row = db.prepare(process.argv[2]).get();
  console.log(row ? String(Object.values(row)[0] ?? "") : "");' "$DB" "$1" 2>/dev/null; }
hook() { local name="$1"; shift; "${ENV[@]}" bash "$HOOKS/$name" "$@"; }
log_lines() { if [ -f "$MIRROR/hooks.log" ]; then wc -l <"$MIRROR/hooks.log" | tr -d ' '; else echo 0; fi; }
messages_of() { q "SELECT COUNT(*) FROM messages m JOIN runtime_sessions s ON s.conversation_id = m.conversation_id WHERE s.session_id = '$1'"; }

say "Evidence"
look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
look "tree: $ROOT ($(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'no git'))"
look "entry: $BIN/mirror-hook -> $(readlink "$BIN/mirror-hook")"
look "on the PATH, not used: $(command -v mirror-hook || echo 'none')"
ENTRY_SEEN="$("${ENV[@]}" bash -c 'command -v mirror-hook')"
[ "$ENTRY_SEEN" = "$BIN/mirror-hook" ] && ok "the wrappers will run this tree's entry" || { bad "the entry resolves to $ENTRY_SEEN"; exit 1; }
"${ENV[@]}" mirror conversation-logger session-start-fast >/dev/null 2>&1 || true

say "1. A codex \$-skill turn and its reply log nothing"
SID="ts3-codex-$$"
BEFORE="$(log_lines)"
printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t1\",\"prompt\":\"\$mirror-mind:mm:journeys\"}" | hook log-user-prompt.sh >/dev/null 2>&1
printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t1\",\"last_assistant_message\":\"| journey | status |\"}" | hook log-assistant-reply.sh >/dev/null 2>&1
[ "$(q "SELECT interface FROM runtime_sessions WHERE session_id = '$SID'")" = "codex" ] && ok "the session is labelled codex (US8, from turn_id)" || bad "label missing"
[ "$(messages_of "$SID")" = "0" ] && ok "no message for the session: neither the invocation nor its rendering" || bad "$(messages_of "$SID") message(s) logged"
[ "$(log_lines)" = "$BEFORE" ] && ok "hooks.log gained no line: the reply was an expected skip (command_turn)" || bad "hooks.log gained a line"

say "2. The Mirror form keeps its exception in the \$ sigil"
printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t2\",\"prompt\":\"\$mm-mirror what matters today\"}" | hook log-user-prompt.sh >/dev/null 2>&1
printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t3\",\"prompt\":\"\$mirror-mind:mm:mirror and tomorrow?\"}" | hook log-user-prompt.sh >/dev/null 2>&1
CONTENT="$(q "SELECT group_concat(m.content, ' | ') FROM (SELECT content FROM messages m JOIN runtime_sessions s ON s.conversation_id = m.conversation_id WHERE s.session_id = '$SID' ORDER BY m.created_at) m")"
look "logged: $CONTENT"
[ "$CONTENT" = "what matters today | and tomorrow?" ] && ok "both \$ Mirror forms logged their question, the form stripped" || bad "expected the two questions"

say "3. A \$ that is not a skill name is conversation on Claude Code"
SID2="ts3-claude-$$"
printf '%s' "{\"session_id\":\"$SID2\",\"prompt_id\":\"p1\",\"prompt\":\"\$5 a month seems fine\"}" | hook log-user-prompt.sh >/dev/null 2>&1
[ "$(q "SELECT interface FROM runtime_sessions WHERE session_id = '$SID2'")" = "claude_code" ] && ok "the session is labelled claude_code" || bad "label missing"
C2="$(q "SELECT m.content FROM messages m JOIN runtime_sessions s ON s.conversation_id = m.conversation_id WHERE s.session_id = '$SID2'")"
[ "$C2" = '$5 a month seems fine' ] && ok "the prompt is logged as typed" || bad "logged '$C2'"
printf '%s' "{\"session_id\":\"$SID2\",\"prompt_id\":\"p2\",\"prompt\":\"\$mm-journeys\"}" | hook log-user-prompt.sh >/dev/null 2>&1
[ "$(messages_of "$SID2")" = "1" ] && ok "\$mm-journeys typed on Claude Code is still a command turn: one rule" || bad "a second message was logged"

say "Result"
echo "  passed: $PASS   failed: $FAIL"
[ "$FAIL" = "0" ]
