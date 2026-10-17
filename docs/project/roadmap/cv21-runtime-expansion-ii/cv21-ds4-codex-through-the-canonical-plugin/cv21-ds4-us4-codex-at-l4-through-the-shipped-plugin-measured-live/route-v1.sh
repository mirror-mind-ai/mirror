#!/usr/bin/env bash
# CV21.DS4.US4 — Codex at L4 through the shipped plugin, measured live.
#
#   bash route.sh setup       pack this tree, install into a scratch prefix, seed a
#                             scratch Mirror home, install the plugin on Codex through
#                             the SHIPPED marketplace (US1's path), baseline your configs
#   bash route.sh live        the live session: your login copied, your provider key in
#                             the session's environment, preflight, the turns, codex
#   bash route.sh check       what the session left, grouped by the story it proves
#   bash route.sh finish      the next start's maintenance with the key, and its cost
#   bash route.sh probe       a SessionStart/SessionEnd probe hook in the scratch CODEX_HOME,
#                             one empty session, quit: does this Codex fire SessionEnd at all?
#   bash route.sh probe-check what the probe recorded;  probe-off removes the probe hooks
#   bash route.sh untouched   your real ~/.codex, ~/.claude, ~/.config/mirror vs baseline
#   bash route.sh clean       stop Codex's daemon, remove the scratch directory (token
#                             copy included); runs at Done
#
#   DS4_US4_DRY=1 bash route.sh live    prepares and stops before the session (the Driver)
#   DS4_US4_COPY_AUTH=0                 do not copy ~/.codex/auth.json; log in inside
#
# On DS2's live pattern (cv21-ds2-mirror-plugin-mcp-foundation/route.sh), its helpers
# copied, not sourced: a story package's route is standalone. Reads Codex's own
# files through node:sqlite; no sqlite3 binary. Everything scratch lives under
# DS4_US4_DIR (default /tmp/cv21-ds4-us4) and nothing of yours is written.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS4_US4_DIR:-/tmp/cv21-ds4-us4}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
result() { say "Result"; echo "  passed: $PASS   failed: $FAIL"; [ "$FAIL" = "0" ]; }
PASS=0
FAIL=0

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PKG="$D/prefix/lib/node_modules/mirror-mind"
  SHOME="$D/home"                      # the scratch person's HOME for Mirror
  MHOME="$SHOME/.mirror-minds/ds4"     # their Mirror home
  DB="$MHOME/memory.db"
  CX="$D/codex-home"                   # scratch CODEX_HOME
  PERSON="$D/codex-person"             # the HOME Codex runs with
  PROJECT="$D/project"
  EVIDENCE="$D/evidence"
  LIVE="$D/live"
}
resolve

need_install() { [ -x "$D/prefix/bin/mirror" ] || { echo "No scratch install yet. Run: bash $SELF setup"; exit 2; }; }

# A command as a person who has only the scratch install: scratch HOME, no Mirror
# variable or provider key from your shell, no checkout on the PATH.
as_scratch() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$SHOME" PI_SESSIONS_DIR="$D/pi-sessions" DISABLE_AUTOUPDATER=1 \
    PATH="$D/prefix/bin:$NODE_DIR:/usr/bin:/bin" "$@"
}
# Codex as the scratch person, with the scratch install first on the PATH.
with_codex() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR \
    HOME="$PERSON" CODEX_HOME="$CX" PATH="$D/prefix/bin:$REAL_PATH" "$@"
}

stamp() {
  local cmd="$1" first resolved version when
  first="$(command -v "$cmd" 2>/dev/null || true)"
  if [ -z "$first" ]; then note "$cmd: not installed"; return 1; fi
  resolved="$(readlink -f "$first" 2>/dev/null || echo "$first")"
  version="$("$first" --version 2>&1 | head -1)"
  when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  look "$cmd $version · $first → $resolved · $when"
  mkdir -p "$EVIDENCE"
  printf '%s\t%s\t%s\t%s\t%s\n' "$when" "$cmd" "$version" "$first" "$resolved" >>"$EVIDENCE/versions.tsv"
}

keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  "$@" >"$EVIDENCE/$name.out" 2>&1
  local code=$?
  printf '%s\n' "exit $code" >>"$EVIDENCE/$name.out"
  return $code
}

# One value from a SQLite database, through node:sqlite (read-only).
q() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const row = db.prepare(process.argv[2]).get(...process.argv.slice(3));
  console.log(row ? String(Object.values(row)[0] ?? "") : "");' "$@" 2>/dev/null; }
# Rows, tab-separated.
qrows() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  for (const row of db.prepare(process.argv[2]).all(...process.argv.slice(3))) console.log(Object.values(row).map(v => String(v ?? "")).join("\t"));' "$@" 2>/dev/null; }

# The real runtime configuration this route promises not to touch.
REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/hooks .claude/skills
  .claude/plugins/installed_plugins.json .claude/plugins/known_marketplaces.json
  .codex/config.toml .codex/hooks.json .codex/AGENTS.md .codex/skills .codex/auth.json
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
  say "Setup — scratch install, seeded scratch home, the shipped marketplace on Codex"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds4-us4" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW"
  mkdir -p "$D_RAW/prefix" "$D_RAW/home" "$D_RAW/pi-sessions" "$D_RAW/evidence" "$D_RAW/live" \
    "$D_RAW/codex-home" "$D_RAW/codex-person/.config/mirror" "$D_RAW/project" && touch "$D_RAW/.ds4-us4"
  chmod 700 "$D_RAW" "$D_RAW/home" "$D_RAW/codex-home" "$D_RAW/codex-person" "$D_RAW/live"
  resolve

  config_manifest >"$D/real-baseline.txt"
  # The small files' content too, so a changed hash can be read as a diff (the first
  # run could only say that ~/.codex/config.toml changed, not what changed).
  mkdir -p "$D/real-baseline"
  for rel in .codex/config.toml .codex/hooks.json .config/mirror/env .claude/settings.json; do
    [ -f "$REAL_HOME/$rel" ] && { mkdir -p "$D/real-baseline/$(dirname "$rel")"; cp "$REAL_HOME/$rel" "$D/real-baseline/$rel"; }
  done
  chmod -R go-rwx "$D/real-baseline"
  ok "real runtime configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries, and the small files' content (untouched compares against both)"
  stamp codex || { bad "codex is not installed"; result; return; }

  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed this checkout: $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  if npm install -g --prefix "$D/prefix" "$D/$TARBALL" >"$D/install.log" 2>&1; then
    ok "installed into the scratch prefix: $D/prefix"
  else
    bad "npm install failed (see $D/install.log)"; result; return
  fi
  [ "$(as_scratch sh -c 'command -v mirror')" = "$D/prefix/bin/mirror" ] \
    && ok "mirror resolves to the scratch install" || bad "mirror does not resolve to the scratch install"

  as_scratch mirror init ds4 >"$EVIDENCE/init.out" 2>&1
  as_scratch mirror seed >"$EVIDENCE/seed.out" 2>&1
  [ -f "$DB" ] && ok "scratch Mirror home created and seeded: $MHOME" || { bad "no scratch Mirror home (see evidence/init.out)"; result; return; }
  local n; n="$(as_scratch mirror list personas 2>/dev/null | grep -c '^  [a-z]' || true)"
  [ "$n" -ge 12 ] && ok "identity seeded ($n personas)" || bad "seed failed (see evidence/seed.out)"
  as_scratch mirror list journeys >"$EVIDENCE/journeys.out" 2>&1
  grep -q "personal-growth" "$EVIDENCE/journeys.out" && ok "the template journey personal-growth is there for list_journeys to find" || bad "no seeded journey (see evidence/journeys.out)"
  # The HOME Codex runs with names the scratch Mirror home; the environment outranks it.
  printf 'MIRROR_HOME=%s\n' "$MHOME" >"$PERSON/.config/mirror/env"

  say "Setup — Codex installs Mirror through the shipped marketplace (US1's two commands)"
  local VERSION; VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  keep mp-add with_codex codex plugin marketplace add "$PKG"
  grep -q "^exit 0" "$EVIDENCE/mp-add.out" && ok "codex plugin marketplace add \"<pkg>\"" || { bad "marketplace add failed: $(tail -2 "$EVIDENCE/mp-add.out" | head -1)"; result; return; }
  keep plugin-add with_codex codex plugin add mirror-mind@mirror-mind
  grep -q "^exit 0" "$EVIDENCE/plugin-add.out" && ok "codex plugin add mirror-mind@mirror-mind" || { bad "plugin add failed"; result; return; }
  [ -d "$CX/plugins/cache/mirror-mind/mirror-mind/$VERSION" ] && ok "cached at plugins/cache/mirror-mind/mirror-mind/$VERSION (US1)" || bad "no cache at the package version"
  grep -q 'plugins."mirror-mind@mirror-mind"' "$CX/config.toml" && ok "config.toml holds the plugin entry (US1)" || bad "no plugin entry in config.toml"
  (cd "$PROJECT" && with_codex codex debug prompt-input hello >"$EVIDENCE/prompt-input.json" 2>/dev/null)
  local IN_PROMPT EXPECTED
  IN_PROMPT="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/prompt-input.json" | sort -u | wc -l | tr -d ' ')"
  EXPECTED="$(find "$PKG/plugins/mirror-mind/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [ "$IN_PROMPT" = "$EXPECTED" ] && ok "the rendered prompt carries $IN_PROMPT mm-* skills, the plugin's $EXPECTED, with no skills link (US1)" || bad "the prompt carries $IN_PROMPT skills; the plugin has $EXPECTED"
  [ ! -e "$CX/skills/mirror-mind" ] && [ ! -e "$CX/AGENTS.md" ] && ok "no skills/mirror-mind link and no AGENTS.md in CODEX_HOME (Codex's own skills/.system is its): the plugin alone" || bad "the old wiring is present"
  result
}

# ---------------------------------------------------------------------------
# The provider key: yours, read from your config file into the session's
# environment only. Never written anywhere under $D, never printed.
real_key() {
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY[[:space:]]*=[[:space:]]*//p' "$REAL_HOME/.config/mirror/env" 2>/dev/null \
    | tail -n 1 | tr -d "\"'\r"
}

session_env() {
  local key; key="$(real_key)"
  [ -n "$key" ] || { bad "no OPENROUTER_API_KEY in $REAL_HOME/.config/mirror/env; the session needs your key (TS2's claim is 'with a key set')"; exit 2; }
  SESSION_ENV=(env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS
    MIRROR_USER=ds4 MIRROR_HOME="$MHOME" OPENROUTER_API_KEY="$key"
    PI_SESSIONS_DIR="$D/pi-sessions" PATH="$D/prefix/bin:$REAL_PATH")
}

# Resolve the Mirror home and the provider key exactly as the session's Mirror
# processes will -- the same loader, the same entry, the session's environment
# -- and stop before the runtime starts if either is wrong. (DS2's, with the
# expectation inverted: this session must see a key.)
preflight() {
  local out
  out="$("${SESSION_ENV[@]}" HOME="$PERSON" node --no-warnings --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { loadConfiguration } = await import(pathToFileURL(process.argv[1]).href);
    const { resolveMirrorHome } = await import(pathToFileURL(process.argv[2]).href);
    loadConfiguration({ entryPath: process.argv[3] });
    let home;
    try { home = resolveMirrorHome(process.env); } catch (error) { home = "ERROR: " + error.message; }
    console.log(home + "\t" + (process.env.OPENROUTER_API_KEY ? "a provider key" : "no provider key"));
  ' "$ROOT/ts/src/runtime/config.ts" "$ROOT/ts/src/frontDoor/dbPath.ts" "$PKG/ts/src/frontDoor/cli.ts" 2>&1)"
  if [ "$out" = "$MHOME"$'\t'"a provider key" ]; then
    ok "preflight: the session's Mirror resolves the scratch home, with a provider key"
  else
    bad "preflight: the session's Mirror would see: $out"
    echo "  Not starting the session: no turn spent."; exit 2
  fi
}

turns_text() {
  cat <<EOF

  Four turns, typed exactly, with the id as printed. Approve the one-time hook trust
  Codex shows ("5 hooks are new or changed": the plugin's). No file of yours is written.

    Turn 1:  \$mirror-mind:mm:mirror DS4-$ID: should I raise my course price from 297 to 497 reais?
             Expect: Mirror Mode, a first-person answer (a "◇ <persona>" line is fine).

    Turn 2:  DS4-$ID probe: without using any tool, answer (a) yes or no: does your context
             hold a document titled "Mirror Mind — Operating Instructions"? (b) yes or no:
             did this turn arrive with a block headed MIRROR MODE ACTIVE?
             Expect: yes, yes. (The first ordinary turn after Mirror Mode activates is the
             one owed the injection; the rollout is the evidence, this answer the observation.)

    Turn 3:  \$mirror-mind:mm:journeys
             Expect: the journeys list rendered. This turn must NOT be logged (TS3).

    Turn 4:  DS4-$ID: use tool_search to find the mirror-mind MCP server's list_journeys tool,
             call it, and tell me the journey slugs it returns.
             Expect: personal-growth named. A model that does not reach the tool is a finding
             about Codex's plugin-tool exposure, recorded as such.

  Then two readings, written down:   /hooks   (the five hooks trusted; SessionEnd's budget)
                                     /mcp     (mirror-mind with its 7 tools)
  Quit Codex (the SessionEnd hook runs), and run:   bash $SELF check
EOF
}

live() {
  need_install
  say "Live — Codex, the shipped plugin only, your key in the session"
  # Archive the previous capture rather than deleting it (DS12 lost three sessions'
  # raw evidence to an rm).
  [ -f "$LIVE/started" ] && mv "$LIVE" "$LIVE.$(date -u +%Y%m%dT%H%M%SZ)" && mkdir -p "$LIVE" && chmod 700 "$LIVE"
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$LIVE/id"
  ID="$(cat "$LIVE/id")"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$LIVE/started"
  stamp codex
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  if [ "${DS4_US4_COPY_AUTH:-1}" = 1 ] && [ -f "$REAL_HOME/.codex/auth.json" ]; then
    if [ ! -f "$CX/auth.json" ]; then
      cp "$REAL_HOME/.codex/auth.json" "$CX/auth.json" && chmod 600 "$CX/auth.json"
      note "your ~/.codex/auth.json copied into the scratch CODEX_HOME (mode 600, 700 dir; clean removes it)"
    else
      note "the scratch CODEX_HOME already holds a login"
    fi
  else
    [ -f "$CX/auth.json" ] || note "Codex will ask you to log in: that login is stored in $CX only."
  fi
  # hooks.log before the session, so check can tell a line the session added.
  if [ -f "$MHOME/hooks.log" ]; then wc -l <"$MHOME/hooks.log" | tr -d ' '; else echo 0; fi >"$LIVE/hooks-lines"
  session_env
  preflight
  turns_text
  rm -rf "$PROJECT" && mkdir -p "$PROJECT"
  [ "${DS4_US4_DRY:-0}" = 1 ] && { note "DS4_US4_DRY=1: prepared, session not started"; return 0; }
  cd "$PROJECT" && exec "${SESSION_ENV[@]}" HOME="$PERSON" CODEX_HOME="$CX" codex
}

# The session's conversation: by the printed id first, else the one conversation
# started since the session began (the Navigator may have typed an earlier
# printout's id), else the latest one holding any DS4-<id> turn.
find_conversation() {
  local id="$1" start="$2" conv found count
  conv="$(q "$DB" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE ? ORDER BY c.started_at LIMIT 1" "%DS4-$id%")"
  [ -n "$conv" ] && { echo "$conv"; return; }
  found="$(qrows "$DB" "SELECT id FROM conversations WHERE substr(started_at,1,19) >= substr(?,1,19) ORDER BY started_at" "$start")"
  count="$(printf '%s' "$found" | grep -c . || true)"
  [ "$count" = "1" ] && { echo "$found"; return; }
  q "$DB" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE 'DS4-%' ORDER BY c.started_at DESC LIMIT 1"
}

# Codex logs every hook it runs (hook/started, hook/completed). After the last
# turn, a SessionEnd that Codex ran shows as one more pair; none means Codex never
# invoked it -- a different fact from a hook that ran and was cut.
hooks_after_last_turn() {
  local conv="$1" last epoch n
  last="$(q "$DB" "SELECT MAX(created_at) FROM messages WHERE conversation_id = ?" "$conv")"
  [ -n "$last" ] || return 0
  epoch="$(node -e 'console.log(Math.floor(Date.parse(process.argv[1]) / 1000) + 2)' "$last")"
  n="$(q "$CX/logs_2.sqlite" "SELECT COUNT(*) FROM logs WHERE feedback_log_body LIKE '%hook/started%' AND ts > ?" "$epoch")"
  if [ "${n:-0}" = "0" ]; then
    note "Codex's own log: no hook started after the last turn ($last): Codex did NOT invoke SessionEnd at quit"
    SESSION_END_INVOKED=0
  else
    note "Codex's own log: $n hook(s) started after the last turn: SessionEnd was invoked, and Mirror did not record the close (run probe to tell a cut from a payload Mirror could not use)"
    SESSION_END_INVOKED=1
  fi
}
SESSION_END_INVOKED=1

# ---------------------------------------------------------------------------
# Does this Codex fire SessionEnd at quit, and on which quit path? A probe hook
# pair in the scratch CODEX_HOME (DS12's pattern), one empty session, no model turn.
probe() {
  need_install
  say "Probe — SessionStart and SessionEnd on this Codex, no model turn"
  stamp codex
  mkdir -p "$LIVE"
  cat >"$LIVE/probe.sh" <<'EOF'
#!/bin/sh
# Append the event, the time, and the payload Codex handed the hook.
printf '%s %s ' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >>"$2"
cat >>"$2"
printf '\n' >>"$2"
exit 0
EOF
  chmod +x "$LIVE/probe.sh"
  : >"$LIVE/probe.log"
  node -e 'const [out, sh, log] = process.argv.slice(1);
    const cmd = (ev) => "sh \"" + sh + "\" " + ev + " \"" + log + "\"";
    require("fs").writeFileSync(out, JSON.stringify({ hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: cmd("SessionStart") }] }],
      SessionEnd:   [{ hooks: [{ type: "command", command: cmd("SessionEnd") }] }],
    }}, null, 2) + "\n");' "$CX/hooks.json" "$LIVE/probe.sh" "$LIVE/probe.log"
  ok "probe hooks written to CODEX_HOME/hooks.json (Codex will ask once to trust them; probe-off removes them)"
  session_env
  cat <<EOF

  In Codex: trust the probe hooks, type NO prompt, and quit with the path you used
  before:   /quit
  Then run:   bash $SELF probe-check
  If SessionEnd did not fire, repeat with a second path (Ctrl-D; then Ctrl-C twice),
  running probe-check after each: it says which events each quit produced.
EOF
  [ "${DS4_US4_DRY:-0}" = 1 ] && { note "DS4_US4_DRY=1: prepared, session not started"; return 0; }
  cd "$PROJECT" && exec "${SESSION_ENV[@]}" HOME="$PERSON" CODEX_HOME="$CX" codex
}

probe_check() {
  say "Probe check — what the probe hooks recorded"
  [ -f "$LIVE/probe.log" ] || { echo "No probe yet; run: bash $SELF probe"; exit 2; }
  stamp codex
  local starts ends
  starts="$(grep -c ' SessionStart ' "$LIVE/probe.log" || true)"
  ends="$(grep -c ' SessionEnd ' "$LIVE/probe.log" || true)"
  look "SessionStart fired $starts time(s); SessionEnd fired $ends time(s)"
  grep -o '^[^ ]* [A-Za-z]*' "$LIVE/probe.log" | show
  if [ "${ends:-0}" -gt 0 ]; then
    ok "this Codex fires SessionEnd at quit"
    note "the SessionEnd payload Codex hands a hook (session_id is what Mirror's close needs):"
    grep ' SessionEnd ' "$LIVE/probe.log" | tail -1 | sed 's/^[^{]*//' | cut -c1-400 | show
  else
    bad "this Codex did not fire SessionEnd on that quit path (SessionStart fired $starts time(s))"
  fi
  result
}

probe_off() {
  rm -f "$CX/hooks.json" && ok "probe hooks removed from CODEX_HOME"
}

# ---------------------------------------------------------------------------
check() {
  need_install
  [ -f "$LIVE/started" ] || { echo "No session recorded; run: bash $SELF live"; exit 2; }
  local START ID CONV
  START="$(cat "$LIVE/started")"; ID="$(cat "$LIVE/id")"
  say "Check — what the session left (DS4-$ID, since $START)"
  stamp codex
  CONV="$(find_conversation "$ID" "$START")"
  [ -n "$CONV" ] && ok "the session's conversation: $CONV" || { bad "no conversation since $START holds a DS4-<id> turn"; result; return; }
  # The id the turns actually carry: live printed a new one each time it ran, and
  # the Navigator may have typed an earlier printout's.
  local TID; TID="$(q "$DB" "SELECT substr(content, 1, 10) FROM messages WHERE conversation_id = ? AND content LIKE 'DS4-%' ORDER BY created_at LIMIT 1" "$CONV")"
  [ -n "$TID" ] && [ "$TID" != "DS4-$ID" ] && note "the turns carry $TID, not DS4-$ID (an earlier printout); the conversation was selected by time"
  local SID; SID="$(q "$DB" "SELECT session_id FROM runtime_sessions WHERE conversation_id = ?" "$CONV")"

  say "US1 — the install held"
  local VERSION; VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  [ -d "$CX/plugins/cache/mirror-mind/mirror-mind/$VERSION" ] && ok "the plugin is still cached at $VERSION, from the shipped marketplace" || bad "the plugin cache is gone"
  [ ! -e "$CX/skills/mirror-mind" ] && [ ! -e "$CX/AGENTS.md" ] && ok "no skills/mirror-mind link, no AGENTS.md: everything came through the plugin" || bad "old wiring present"

  say "US8 / TS3 — logged as codex, the Mirror question without its form, the skill turn absent"
  [ "$(q "$DB" "SELECT interface FROM conversations WHERE id = ?" "$CONV")" = "codex" ] && ok "the conversation is labelled codex" || bad "conversation label is not codex"
  [ "$(q "$DB" "SELECT interface FROM runtime_sessions WHERE session_id = ?" "$SID")" = "codex" ] && ok "the runtime session is labelled codex" || bad "session label is not codex"
  local N; N="$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ?" "$CONV")"
  [ "$N" = "6" ] && ok "six messages: three prompts, three replies" || bad "$N messages (expected 6: the skill turn and its rendering must be absent)"
  qrows "$DB" "SELECT role, substr(replace(content, char(10), ' '), 1, 90) FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid" "$CONV" | show
  local U1; U1="$(q "$DB" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at, rowid LIMIT 1" "$CONV")"
  case "$U1" in "DS4-"*": should I raise"*) ok "the Mirror question logged without its \$mirror-mind:mm:mirror form (US7, US8)" ;; *) bad "the first prompt is '$U1'" ;; esac
  [ "$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND (content LIKE '%mm:journeys%' OR content LIKE '%mm-journeys%')" "$CONV")" = "0" ] && ok "no message holds the \$mirror-mind:mm:journeys turn or its rendering (TS3)" || bad "the skill turn was logged"
  [ "$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND json_extract(metadata, '\$.turn_id') IS NULL" "$CONV")" = "0" ] && ok "every message carries its turn id" || bad "a message has no turn id"
  [ "$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND role = 'assistant'" "$CONV")" = "3" ] && ok "three replies, logged from Stop (US8)" || bad "replies missing"

  say "TS2 — the close"
  local ENDED CLOSED; ENDED="$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"; CLOSED="$(q "$DB" "SELECT closed_at FROM runtime_sessions WHERE session_id = ?" "$SID")"
  if [ -z "$ENDED" ]; then
    hooks_after_last_turn "$CONV"
    if [ "$SESSION_END_INVOKED" = "0" ]; then
      # Codex 0.163.0: the TUI detaches from a thread that persists in the daemon,
      # and SessionEnd does not fire at exit (the probe). The close is maintenance's,
      # by idle time (the US4 scope change): finish proves it.
      note "the conversation is open, as this Codex leaves it: the close is deferred to maintenance by idle time (runtimePolicy: a codex session outlives the TUI). Run finish."
      [ "$(q "$DB" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "1" ] && ok "the runtime session is active, meaning resumable on this Codex; maintenance will deactivate it with the close" || bad "the runtime session is inactive with the conversation open"
      ok "no LLM call at exit, nothing spent: $(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ?" "$CONV") call(s) in the ledger, all from the turns"
      local LINES_NOW; if [ -f "$MHOME/hooks.log" ]; then LINES_NOW="$(wc -l <"$MHOME/hooks.log" | tr -d ' ')"; else LINES_NOW=0; fi
      [ "$LINES_NOW" = "$(cat "$LIVE/hooks-lines")" ] && ok "hooks.log gained no line during the session" || { bad "hooks.log gained a line:"; tail -3 "$MHOME/hooks.log" | show; }
      TS2_DEFERRED=1
    else
      bad "the conversation is still open: SessionEnd was invoked and did not reach Mirror"
    fi
  else
    ok "ended_at $ENDED"
  fi
  if [ "${TS2_DEFERRED:-0}" = "0" ]; then
  local NEWEST_BACKUP; NEWEST_BACKUP="$(node -e '
    const fs=require("fs"),p=require("path");const d=process.argv[1];const ended=Date.parse(process.argv[2]||"");
    try{const f=fs.readdirSync(d).map(n=>({n,t:fs.statSync(p.join(d,n)).mtimeMs})).filter(x=>x.t>=ended).sort((a,b)=>b.t-a.t)[0];console.log(f?f.n:"");}catch{console.log("")}' "$MHOME/backups" "$ENDED")"
  [ -n "$NEWEST_BACKUP" ] && ok "a dated backup newer than ended_at ($NEWEST_BACKUP): the hook FINISHED inside the bound (a killed hook leaves none)" || bad "no backup newer than ended_at: the hook was cut"
  [ "$(q "$DB" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "0" ] && [ -n "$CLOSED" ] && ok "the runtime session is inactive, closed_at $CLOSED" || bad "the runtime session is still active"
  [ "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" = "1" ] && ok "close_tail_pending set: the LLM tail deferred to the next start" || bad "no close_tail_pending flag"
  [ "$(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ? AND called_at >= ?" "$CONV" "$ENDED")" = "0" ] && ok "no LLM call at or after ended_at: nothing spent at exit" || bad "an LLM call ran at exit"
  local LINES_NOW; if [ -f "$MHOME/hooks.log" ]; then LINES_NOW="$(wc -l <"$MHOME/hooks.log" | tr -d ' ')"; else LINES_NOW=0; fi
  [ "$LINES_NOW" = "$(cat "$LIVE/hooks-lines")" ] && ok "hooks.log gained no line during the session" || { bad "hooks.log gained $((LINES_NOW - $(cat "$LIVE/hooks-lines"))) line(s):"; tail -3 "$MHOME/hooks.log" | show; }
  fi

  say "D13 / injection / MCP — the hard evidence, from Codex's own files"
  [ "$(q "$DB" "SELECT hook_injected FROM runtime_sessions WHERE session_id = ?" "$SID")" = "1" ] && ok "hook_injected = 1: the inject hook delivered Mirror context" || bad "hook_injected is not set"
  local ROLLOUT; ROLLOUT="$(find "$CX/sessions" -name 'rollout-*.jsonl' -newer "$LIVE/started" 2>/dev/null | head -1)"
  if [ -n "$ROLLOUT" ]; then
    look "rollout: ${ROLLOUT#"$CX"/}"
    grep -q '"role":"developer"' "$ROLLOUT" && grep -q "Operating Instructions" "$ROLLOUT" && ok "the rollout holds a developer message with the Operating Instructions (D13, DS12.TS2 L4)" || bad "no developer message with the Operating Instructions in the rollout"
    local INJ; INJ="$(grep -o "MIRROR MODE ACTIVE" "$ROLLOUT" | wc -l | tr -d ' ')"
    [ "$INJ" -ge 2 ] && ok "Mirror context reached the model $INJ times: the explicit turn and the owed ordinary turn (DS12.TS2 L3)" || bad "MIRROR MODE ACTIVE appears $INJ time(s) in the rollout (expected 2)"
  else
    bad "no rollout newer than $START under $CX/sessions"
  fi
  local HANDSHAKE; HANDSHAKE="$(q "$CX/logs_2.sqlite" "SELECT COUNT(*) FROM logs WHERE feedback_log_body LIKE '%server_name=mirror-mind%' AND feedback_log_body LIKE '%Service initialized as client%'")"
  [ "${HANDSHAKE:-0}" -gt 0 ] && ok "Codex's own log: the mirror-mind MCP client initialized (${HANDSHAKE} record(s))" || bad "Codex's log shows no mirror-mind handshake"

  say "The model's word — recorded observations, not pass conditions"
  local A2 A3
  A2="$(q "$DB" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at, rowid LIMIT 1 OFFSET 1" "$CONV")"
  A3="$(q "$DB" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at, rowid LIMIT 1 OFFSET 2" "$CONV")"
  look "probe reply: $(printf '%s' "$A2" | tr '\n' ' ' | cut -c1-160)"
  look "MCP reply:   $(printf '%s' "$A3" | tr '\n' ' ' | cut -c1-160)"
  printf '%s' "$A3" | grep -qi "personal-growth" && note "the MCP reply names the seeded journey: list_journeys was reached through tool_search" || note "the MCP reply does not name personal-growth: record how the model answered (a finding about Codex's exposure, if the tool was not reached)"
  printf '%s\n%s\n' "$A2" "$A3" >"$LIVE/model-replies.txt"
  note "write your two readings into test-guide.md: /hooks (the five hooks trusted; SessionEnd's budget) and /mcp (mirror-mind, 7 tools)"
  result
}

# ---------------------------------------------------------------------------
finish() {
  need_install
  [ -f "$LIVE/started" ] || { echo "No session recorded; run: bash $SELF live"; exit 2; }
  local ID; ID="$(cat "$LIVE/id")"
  say "Finish — the next start's maintenance, with your key (the composite the SessionStart hook runs)"
  session_env
  local CONV; CONV="$(find_conversation "$ID" "$(cat "$LIVE/started")")"
  [ -n "$CONV" ] || { bad "no conversation holds a DS4-<id> turn since $(cat "$LIVE/started")"; result; return; }
  local BEFORE; BEFORE="$(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  local SID; SID="$(q "$DB" "SELECT session_id FROM runtime_sessions WHERE conversation_id = ?" "$CONV")"
  local OPEN=0; [ -z "$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")" ] && OPEN=1
  local FLAGGED=0; [ "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" = "1" ] && FLAGGED=1
  if [ "$OPEN" = "1" ]; then
    # This Codex did not fire SessionEnd (0.163.0): the close is maintenance's, by
    # idle time. The threshold is set to zero here so the route need not wait
    # thirty minutes; an operator may shorten it the same way.
    note "the conversation is open: this Codex fired no SessionEnd, so maintenance closes it as an idle orphan (MIRROR_STALE_ORPHAN_MINUTES=0 here; 30 by default)"
    "${SESSION_ENV[@]}" HOME="$PERSON" MIRROR_STALE_ORPHAN_MINUTES=0 mirror conversation-logger session-maintenance >"$EVIDENCE/finish.out" 2>&1
    grep -E "Closed|Extracted|Finished" "$EVIDENCE/finish.out" | show
    grep -q "Closed stale conversations: 1 " "$EVIDENCE/finish.out" && ok "Closed stale conversations: 1: the idle Codex conversation closed through the full tail" || bad "the open conversation was not closed (see evidence/finish.out)"
    [ -n "$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")" ] && ok "ended_at $(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")" || bad "ended_at still null"
    [ "$(q "$DB" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "0" ] && ok "the runtime session is inactive, closed_at $(q "$DB" "SELECT closed_at FROM runtime_sessions WHERE session_id = ?" "$SID"): no longer a guess target" || bad "the runtime session is still active"
    local NEWEST_BACKUP; NEWEST_BACKUP="$(ls -t "$MHOME/backups" 2>/dev/null | head -1)"
    [ -n "$NEWEST_BACKUP" ] && note "newest backup: $NEWEST_BACKUP (the exit backup belongs to SessionEnd; the next session start's maintenance does not take one)"
  else
    "${SESSION_ENV[@]}" HOME="$PERSON" mirror conversation-logger session-maintenance >"$EVIDENCE/finish.out" 2>&1
    grep -E "Extracted|Finished" "$EVIDENCE/finish.out" | show
    if [ "$FLAGGED" = "1" ]; then
      grep -q "Finished deferred close tails: 1 " "$EVIDENCE/finish.out" && ok "Finished deferred close tails: 1" || bad "the deferred tail was not finished"
    else
      note "the deferred tail was already finished on an earlier run (no flag at start); this run reports 0"
    fi
  fi
  # Mirror extracts memories for journey-bound conversations only (the orchestration's
  # gate: a journey and four messages). A session that loaded a persona but bound no
  # journey, as this one did, is finalized (title, summary, tags) and not extracted.
  local JOURNEY; JOURNEY="$(q "$DB" "SELECT journey FROM conversations WHERE id = ?" "$CONV")"
  if [ -n "$JOURNEY" ]; then
    grep -q "Extracted pending conversations: 1 " "$EVIDENCE/finish.out" && ok "extracted at the next start, as Pi's are (journey $JOURNEY)" || bad "extraction did not run (see evidence/finish.out)"
  else
    note "not extracted: the conversation bound no journey, and Mirror extracts memories for journey-bound conversations only (persona: $(q "$DB" "SELECT persona FROM conversations WHERE id = ?" "$CONV"))"
  fi
  local MEM; MEM="$(q "$DB" "SELECT COUNT(*) FROM memories WHERE conversation_id = ?" "$CONV")"
  if [ -n "$JOURNEY" ]; then
    [ "${MEM:-0}" -ge 1 ] && ok "the conversation has $MEM memor$([ "$MEM" = 1 ] && echo y || echo ies)" || bad "no memories"
  else
    [ "${MEM:-0}" = "0" ] && ok "no memories, as the gate says for a conversation with no journey" || note "$MEM memories despite no journey"
  fi
  [ -n "$(q "$DB" "SELECT summary FROM conversations WHERE id = ?" "$CONV")" ] && ok "the conversation has its summary and tags from the finished tail" || bad "no summary"
  look "title: $(q "$DB" "SELECT title FROM conversations WHERE id = ?" "$CONV")"
  [ -z "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" ] && ok "no close_tail_pending left" || bad "the flag survives"
  say "The cost of the deferred tail, from the ledger (the first real-world figure)"
  qrows "$DB" "SELECT role, model, prompt_tokens, completion_tokens, latency_ms, printf('%.5f', COALESCE(cost_usd, 0)) FROM llm_calls WHERE conversation_id = ? ORDER BY called_at" "$CONV" | tee "$EVIDENCE/finish-ledger.tsv" | show
  local AFTER TOTAL; AFTER="$(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  TOTAL="$(q "$DB" "SELECT printf('%.5f', COALESCE(SUM(cost_usd), 0)) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  look "$((AFTER - BEFORE)) call(s) by maintenance; the conversation's total: \$$TOTAL"
  result
}

# ---------------------------------------------------------------------------
untouched() {
  say "Untouched — your real runtime configs vs the baseline, and your real Mirror homes"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run: bash $SELF setup"; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "no real runtime configuration file changed (auth.json and the config file were read, never written)"
  else
    bad "real configuration changed since setup:"; show <"$D/real-diff.txt"
    local rel
    for rel in .codex/config.toml .codex/hooks.json .claude/settings.json; do
      [ -f "$D/real-baseline/$rel" ] && [ -f "$REAL_HOME/$rel" ] || continue
      if ! diff -u "$D/real-baseline/$rel" "$REAL_HOME/$rel" >"$D/real-diff-$(basename "$rel").txt"; then
        note "what changed in ~/$rel (the route never writes there; a Codex upgrade's first launch rewrites config.toml):"
        grep -E '^[-+][^-+]' "$D/real-diff-$(basename "$rel").txt" | show
      fi
    done
    [ -f "$D/real-baseline/.config/mirror/env" ] && ! cmp -s "$D/real-baseline/.config/mirror/env" "$REAL_HOME/.config/mirror/env" && note "~/.config/mirror/env differs (content not shown: it holds your key)"
  fi
  local hit=0 db id
  for id in $(cat "$D"/live*/id 2>/dev/null); do
    for db in "$REAL_HOME"/.mirror-minds/*/memory.db "$REAL_HOME"/.mirror/*/memory.db; do
      [ -f "$db" ] || continue
      if [ "$(q "$db" "SELECT COUNT(*) FROM messages WHERE content LIKE ?" "%DS4-$id%")" != "0" ]; then
        bad "a live turn (DS4-$id) reached $db"; hit=1
      fi
    done
  done
  [ "$hit" -eq 0 ] && ok "no live turn in a real Mirror home"
  result
}

scratch_processes() { ps -axo pid=,command= | awk -v d="$D/" 'index($2, d) == 1 {print $1}'; }

clean() {
  say "Clean"
  if [ -d "$CX" ] && command -v codex >/dev/null; then
    env CODEX_HOME="$CX" HOME="$PERSON" codex app-server daemon stop >/dev/null 2>&1 || true
  fi
  local pid stopped=0
  for pid in $(scratch_processes); do kill -TERM "$pid" 2>/dev/null && stopped=$((stopped + 1)); done
  [ "$stopped" -gt 0 ] && { sleep 2; note "stopped $stopped process(es) running from $D (Codex's app-server daemon)"; }
  if [ -f "$D_RAW/.ds4-us4" ]; then
    rm -rf "$D_RAW" && ok "removed $D_RAW: the scratch install, homes, evidence, and the token copy"
  else
    note "nothing to remove at $D_RAW"
  fi
}

case "${1:-}" in
  setup) setup ;;
  live) live ;;
  check) check ;;
  finish) finish ;;
  probe) probe ;;
  probe-check) probe_check ;;
  probe-off) probe_off ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,23p' "$SELF"; exit 2 ;;
esac
