#!/usr/bin/env bash
# CV21.DS4.US4 — Codex at L4 through the shipped plugin, measured live.
# Route v2: pre-registered, self-checked, subject-pinned, two sessions, files not words.
#
#   bash route.sh setup            fresh scratch dir; pack THIS tree; install; seed; the plugin
#                                  through the shipped marketplace; pin the subject (Codex
#                                  version + binary); write the id, the turn scripts, and
#                                  evidence/expectations.md BEFORE any session
#   bash route.sh selfcheck        drive the real wrappers with Codex-shaped payloads into a
#                                  COPY of the scratch home and run check's readers on it:
#                                  a reader defect fails here, before a turn is spent
#   bash route.sh live A|B         the session (A: four turns; B: two). Refuses a second run
#                                  of the same letter unless --again
#   bash route.sh wait-for-close A|B   poll Codex's log and Mirror's DB (30 s, up to 40 min)
#                                  for the daemon's reap and the close; prints the timeline
#   bash route.sh check A|B        what the session left, every line tagged with its source
#   bash route.sh finish A|B       the next start's maintenance with your key (B: threshold 0)
#   bash route.sh resume B         how to resume B's thread for its last turn
#   bash route.sh untouched        your real configs vs the content baseline
#   bash route.sh report           one table: every claim, its source, the session that proved it
#   bash route.sh clean            stop the scratch daemon, remove the scratch dir (token copy too)
#
#   DS4_US4_DRY=1 bash route.sh live A        prepares and stops before the session
#   DS4_US4_ACCEPT_VERSION_CHANGE=1           continue past a Codex version change (recorded)
#   DS4_US4_COPY_AUTH=0                       do not copy ~/.codex/auth.json; log in inside
#
# Source tags on every check line:  [fs] a file  [db] the scratch Mirror database
# [rollout] Codex's session JSONL  [codex-log] Codex's logs_2.sqlite  [ledger] llm_calls
# [probe] the probe hook's record  [model] the model's word, an observation only.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS4_US4_DIR:-/tmp/cv21-ds4-us4-v2}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
skip() { printf '  \033[90m○\033[0m %s\n' "$*"; SKIP=$((SKIP + 1)); }
show() { sed 's/^/      | /'; }
result() { say "Result"; echo "  passed: $PASS   failed: $FAIL   live-only, not run here: $SKIP"; [ "$FAIL" = "0" ]; }
PASS=0; FAIL=0; SKIP=0

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PKG="$D/prefix/lib/node_modules/mirror-mind"
  SHOME="$D/home"; MHOME="$SHOME/.mirror-minds/ds4"; DB="$MHOME/memory.db"
  CX="$D/codex-home"; PERSON="$D/codex-person"; PROJECT="$D/project"
  EVIDENCE="$D/evidence"; LIVE="$D/live"
}
resolve
need_install() { [ -x "$D/prefix/bin/mirror" ] || { echo "No scratch install yet. Run: bash $SELF setup"; exit 2; }; }

as_scratch() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$SHOME" PI_SESSIONS_DIR="$D/pi-sessions" DISABLE_AUTOUPDATER=1 \
    PATH="$D/prefix/bin:$NODE_DIR:/usr/bin:/bin" "$@"
}
with_codex() {
  env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR \
    HOME="$PERSON" CODEX_HOME="$CX" PATH="$D/prefix/bin:$REAL_PATH" "$@"
}

# --- the subject --------------------------------------------------------------
subject_now() {
  local first; first="$(command -v codex 2>/dev/null || true)"
  [ -n "$first" ] || { echo "codex: not installed"; return; }
  printf '%s %s\n' "$("$first" --version 2>&1 | head -1)" "$(readlink -f "$first" 2>/dev/null || echo "$first")"
}
stamp() {
  local when; when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  look "codex: $(subject_now) · $when"
  mkdir -p "$EVIDENCE"; printf '%s\t%s\n' "$when" "$(subject_now)" >>"$EVIDENCE/versions.tsv"
}
# Every step after setup re-reads the subject and refuses to proceed if it moved.
subject_check() {
  [ -f "$EVIDENCE/subject.txt" ] || { echo "No subject pinned. Run: bash $SELF setup"; exit 2; }
  local pinned now; pinned="$(cat "$EVIDENCE/subject.txt")"; now="$(subject_now)"
  if [ "$pinned" = "$now" ]; then ok "the subject is the one pinned at setup: $now"; return; fi
  if [ "${DS4_US4_ACCEPT_VERSION_CHANGE:-0}" = 1 ]; then
    note "the subject MOVED since setup and the change was accepted: pinned '$pinned', now '$now'"
    printf '%s\tACCEPTED VERSION CHANGE\t%s -> %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$pinned" "$now" >>"$EVIDENCE/versions.tsv"
  else
    bad "the subject moved since setup: pinned '$pinned', now '$now'"
    echo "  Not continuing: a measurement must name one subject. Re-run setup, or set DS4_US4_ACCEPT_VERSION_CHANGE=1 (recorded)."
    exit 2
  fi
}

# --- small readers ------------------------------------------------------------
q() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  const row = db.prepare(process.argv[2]).get(...process.argv.slice(3));
  console.log(row ? String(Object.values(row)[0] ?? "") : "");' "$@" 2>/dev/null; }
qrows() { node -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1], { readOnly: true });
  for (const row of db.prepare(process.argv[2]).all(...process.argv.slice(3))) console.log(Object.values(row).map(v => String(v ?? "")).join("\t"));' "$@" 2>/dev/null; }
epoch_of() { node -e 'console.log(Math.floor(Date.parse(process.argv[1]) / 1000))' "$1"; }
log_lines() { if [ -f "$1/hooks.log" ]; then wc -l <"$1/hooks.log" | tr -d ' '; else echo 0; fi; }

# The rollout, read structurally, turn by turn. A turn is task_started .. task_complete;
# an aborted turn (turn_aborted) is not a turn the model answered and is counted apart.
# Prints: completed_turns skill_turns aborted_turns operating_instructions mirror_active_dev session_starts
rollout_counts() { node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const text = (c) => Array.isArray(c) ? c.map(x => x.text || "").join(" ") : String(c ?? "");
  // Walk the turns: each task_started opens one; task_complete closes it answered, turn_aborted closes it aborted.
  let turns = [], cur = null;
  for (const l of lines) {
    if (l.type === "event_msg" && l.payload?.type === "task_started") { cur = { typed: null, aborted: false, done: false }; turns.push(cur); continue; }
    if (!cur) continue;
    if (l.type === "response_item" && l.payload?.role === "user") { const tx = text(l.payload.content); if (!tx.startsWith("<environment_context>") && !tx.startsWith("<skill>") && cur.typed === null) cur.typed = tx; }
    if (l.type === "event_msg" && l.payload?.type === "turn_aborted") cur.aborted = true;
    if (l.type === "event_msg" && l.payload?.type === "task_complete") cur.done = true;
  }
  const completed = turns.filter(x => x.done && !x.aborted);
  const skill = completed.filter(x => /^\$mirror-mind:mm:(?!mirror\b)/.test(x.typed || "")).length;
  const aborted = turns.filter(x => x.aborted).length;
  const devs = lines.filter(l => l.type === "response_item" && l.payload?.role === "developer").map(l => text(l.payload.content));
  const oi = devs.filter(t => t.includes("Mirror Mind \u2014 Operating Instructions")).length;
  const ma = devs.filter(t => t.includes("MIRROR MODE ACTIVE")).length;
  console.log([completed.length, skill, aborted, oi, ma, oi].join(" "));' "$1" 2>/dev/null; }

REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/hooks .claude/skills
  .claude/plugins/installed_plugins.json .claude/plugins/known_marketplaces.json
  .codex/config.toml .codex/hooks.json .codex/AGENTS.md .codex/skills .codex/auth.json
  .agents/skills .agents/.skill-lock.json .config/mirror/env
)
config_manifest() {
  local rel path
  for rel in "${REAL_CONFIG[@]}"; do
    path="$REAL_HOME/$rel"
    if [ -L "$path" ]; then printf 'L %s -> %s\n' "$rel" "$(readlink "$path")"
    elif [ -f "$path" ]; then printf 'F %s %s\n' "$rel" "$(shasum -a 256 "$path" | cut -d' ' -f1)"
    elif [ -d "$path" ]; then
      find "$path" -maxdepth 3 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else printf -- "- %s absent\n" "$rel"; fi
  done
}

real_key() {
  sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?OPENROUTER_API_KEY[[:space:]]*=[[:space:]]*//p' "$REAL_HOME/.config/mirror/env" 2>/dev/null | tail -n 1 | tr -d "\"'\r"
}
session_env() {
  local key; key="$(real_key)"
  [ -n "$key" ] || { bad "no OPENROUTER_API_KEY in $REAL_HOME/.config/mirror/env; the sessions need your key"; exit 2; }
  SESSION_ENV=(env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS
    MIRROR_USER=ds4 MIRROR_HOME="$MHOME" OPENROUTER_API_KEY="$key"
    PI_SESSIONS_DIR="$D/pi-sessions" PATH="$D/prefix/bin:$REAL_PATH")
}
preflight() {
  local out
  out="$("${SESSION_ENV[@]}" HOME="$PERSON" node --no-warnings --input-type=module -e '
    const { pathToFileURL } = await import("node:url");
    const { loadConfiguration } = await import(pathToFileURL(process.argv[1]).href);
    const { resolveMirrorHome } = await import(pathToFileURL(process.argv[2]).href);
    loadConfiguration({ entryPath: process.argv[3] });
    let home; try { home = resolveMirrorHome(process.env); } catch (error) { home = "ERROR: " + error.message; }
    console.log(home + "\t" + (process.env.OPENROUTER_API_KEY ? "a provider key" : "no provider key"));
  ' "$ROOT/ts/src/runtime/config.ts" "$ROOT/ts/src/frontDoor/dbPath.ts" "$PKG/ts/src/frontDoor/cli.ts" 2>&1)"
  if [ "$out" = "$MHOME"$'\t'"a provider key" ]; then ok "preflight: the session's Mirror resolves the scratch home, with a provider key"
  else bad "preflight: the session's Mirror would see: $out"; echo "  Not starting the session: no turn spent."; exit 2; fi
}

# ============================================================================
setup() {
  say "Setup — fresh scratch, this tree packed, the shipped marketplace on Codex, the subject pinned"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds4-us4-v2" ]; then echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2; fi
  if [ -d "$D_RAW/codex-home" ] && command -v codex >/dev/null; then env CODEX_HOME="$D_RAW/codex-home" HOME="$D_RAW/codex-person" codex app-server daemon stop >/dev/null 2>&1 || true; fi
  rm -rf "$D_RAW"
  mkdir -p "$D_RAW/prefix" "$D_RAW/home" "$D_RAW/pi-sessions" "$D_RAW/evidence" "$D_RAW/live" "$D_RAW/codex-home" "$D_RAW/codex-person/.config/mirror" "$D_RAW/project" && touch "$D_RAW/.ds4-us4-v2"
  chmod 700 "$D_RAW" "$D_RAW/home" "$D_RAW/codex-home" "$D_RAW/codex-person" "$D_RAW/live"
  resolve
  look "tree: $ROOT ($(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null) $(git -C "$ROOT" status --porcelain 2>/dev/null | grep -c . || true) uncommitted change(s))"

  config_manifest >"$D/real-baseline.txt"
  mkdir -p "$D/real-baseline"
  for rel in .codex/config.toml .codex/hooks.json .config/mirror/env .claude/settings.json; do
    [ -f "$REAL_HOME/$rel" ] && { mkdir -p "$D/real-baseline/$(dirname "$rel")"; cp "$REAL_HOME/$rel" "$D/real-baseline/$rel"; }
  done
  chmod -R go-rwx "$D/real-baseline"
  ok "real runtime configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries and the small files' content"

  subject_now >"$EVIDENCE/subject.txt"; stamp
  grep -q "not installed" "$EVIDENCE/subject.txt" && { bad "codex is not installed"; result; return; }
  ok "subject pinned: $(cat "$EVIDENCE/subject.txt")"

  local TARBALL; TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed this checkout: $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  npm install -g --prefix "$D/prefix" "$D/$TARBALL" >"$D/install.log" 2>&1 && ok "installed into the scratch prefix" || { bad "npm install failed (see $D/install.log)"; result; return; }
  [ "$(as_scratch sh -c 'command -v mirror')" = "$D/prefix/bin/mirror" ] && ok "mirror resolves to the scratch install" || bad "mirror does not resolve to the scratch install"
  as_scratch mirror init ds4 >"$EVIDENCE/init.out" 2>&1; as_scratch mirror seed >"$EVIDENCE/seed.out" 2>&1
  [ -f "$DB" ] && ok "scratch Mirror home seeded: $MHOME" || { bad "no scratch Mirror home"; result; return; }
  as_scratch mirror list journeys >"$EVIDENCE/journeys.out" 2>&1
  grep -q "personal-growth" "$EVIDENCE/journeys.out" && ok "the template journey personal-growth is there" || bad "no seeded journey"
  printf 'MIRROR_HOME=%s\n' "$MHOME" >"$PERSON/.config/mirror/env"

  say "Setup — Codex installs Mirror through the shipped marketplace (US1's two commands)"
  local VERSION; VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  with_codex codex plugin marketplace add "$PKG" >"$EVIDENCE/mp-add.out" 2>&1 && ok "codex plugin marketplace add \"<pkg>\"" || { bad "marketplace add failed: $(tail -1 "$EVIDENCE/mp-add.out")"; result; return; }
  with_codex codex plugin add mirror-mind@mirror-mind >"$EVIDENCE/plugin-add.out" 2>&1 && ok "codex plugin add mirror-mind@mirror-mind" || { bad "plugin add failed"; result; return; }
  [ -d "$CX/plugins/cache/mirror-mind/mirror-mind/$VERSION" ] && ok "[fs] cached at plugins/cache/mirror-mind/mirror-mind/$VERSION" || bad "no cache at the package version"
  grep -q 'plugins."mirror-mind@mirror-mind"' "$CX/config.toml" && ok "[fs] config.toml holds the plugin entry" || bad "no plugin entry in config.toml"
  (cd "$PROJECT" && with_codex codex debug prompt-input hello >"$EVIDENCE/prompt-input.json" 2>/dev/null)
  local IN_PROMPT EXPECTED
  IN_PROMPT="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/prompt-input.json" | sort -u | wc -l | tr -d ' ')"
  EXPECTED="$(find "$PKG/plugins/mirror-mind/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [ "$IN_PROMPT" = "$EXPECTED" ] && ok "[fs] the rendered prompt carries $IN_PROMPT mm-* skills, the plugin's $EXPECTED" || bad "the prompt carries $IN_PROMPT skills; the plugin has $EXPECTED"
  [ ! -e "$CX/skills/mirror-mind" ] && [ ! -e "$CX/AGENTS.md" ] && ok "[fs] no skills/mirror-mind link, no AGENTS.md: the plugin alone" || bad "old wiring present"

  # The probe hook pair beside the plugin's: records WHEN Codex fires SessionStart and
  # SessionEnd and WHAT it hands them, so the reap is a recorded fact, not a surprise.
  cat >"$LIVE/probe.sh" <<'EOF'
#!/bin/sh
printf '%s %s ' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >>"$2"; cat >>"$2"; printf '\n' >>"$2"; exit 0
EOF
  chmod +x "$LIVE/probe.sh"; : >"$LIVE/probe.log"
  node -e 'const [out, sh, log] = process.argv.slice(1); const cmd = (ev) => "sh \"" + sh + "\" " + ev + " \"" + log + "\"";
    require("fs").writeFileSync(out, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: cmd("SessionStart") }] }], SessionEnd: [{ hooks: [{ type: "command", command: cmd("SessionEnd") }] }] } }, null, 2) + "\n");' "$CX/hooks.json" "$LIVE/probe.sh" "$LIVE/probe.log"
  ok "probe hooks beside the plugin's (Codex will ask once to trust 7 hooks: the plugin's 5 and these 2)"

  # One id per setup, in a file; the turn scripts, written before any session.
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6 >"$EVIDENCE/id"
  write_turns; write_expectations
  ok "id $(cat "$EVIDENCE/id"); turn scripts in evidence/turns.txt; expectations in evidence/expectations.md"
  result
}

write_turns() {
  local ID; ID="$(cat "$EVIDENCE/id")"
  cat >"$EVIDENCE/turns.txt" <<EOF
SESSION A — four turns, typed exactly. Approve the hook trust Codex shows (7 hooks).

  Turn 1:  \$mirror-mind:mm:mirror DS4-$ID, in my personal-growth journey: should I raise my course price from 297 to 497 reais?
           Expect: Mirror Mode, a first-person answer.
  Turn 2:  DS4-$ID probe: without using any tool, answer (a) yes or no: does your context hold a document titled "Mirror Mind — Operating Instructions"? (b) yes or no: did this turn arrive with a block headed MIRROR MODE ACTIVE?
           Expect: yes, yes.
  Turn 3:  \$mirror-mind:mm:journeys
           Expect: the journeys list. Not logged (TS3).
  Turn 4:  DS4-$ID: use tool_search to find the mirror-mind MCP server's list_journeys tool, call it, and tell me the journey slugs it returns.
           Expect: personal-growth named.
  Readings: /hooks (7 hooks trusted, the SessionEnd issue line)   /mcp (mirror-mind, 7 tools)
  Then /quit.   Then:  bash route.sh wait-for-close A   (30 s polls, up to 40 min; another terminal is fine)

SESSION B — two turns, typed exactly.

  Turn 1:  DS4-$ID B: in one sentence, what is Mirror Mind?
  Turn 2:  \$mirror-mind:mm:mirror DS4-$ID B: what should I focus on this week?
  Then /quit.   Then, at once:  bash route.sh finish B   (Mirror closes it first, threshold 0)
  Then:  bash route.sh wait-for-close B   (Codex's reap meets an already-closed conversation)
  Then:  bash route.sh resume B   (one more turn on the resumed thread, then /quit, then check B)

RESUME B — one turn on the resumed thread:
  Turn 1:  DS4-$ID B2: after resuming, say hello in one line.
  Then /quit.   Then:  bash route.sh check B
EOF
}

write_expectations() {
  local ID; ID="$(cat "$EVIDENCE/id")"
  cat >"$EVIDENCE/expectations.md" <<EOF
# CV21.DS4.US4 — pre-registered expectations (written at setup, $(date -u +%Y-%m-%dT%H:%M:%SZ))

Subject: $(cat "$EVIDENCE/subject.txt"). Tree: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null). Package: $(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json"). Id: DS4-$ID.
A line is PASS or FAIL by its source; [model] lines are observations and never fail.
If a line proves wrong, the route is fixed and the session is RE-RUN; an expectation is never re-read after the fact.

## Session A (four turns), check A
- [fs]      US1: the plugin cached at the package version; config.toml entry; no skills/mirror-mind link, no AGENTS.md.
- [db]      the conversation and its runtime session are labelled codex.
- [db]      6 messages: 3 prompts, 3 replies, every one with a turn id.
- [db]      the first prompt starts "DS4-$ID" and holds no "\$mirror-mind:mm:mirror" (the form stripped, US7/US8).
- [db]      no message holds "mm:journeys" or "mm-journeys" (the skill turn absent, TS3).
- [rollout] typed user turns = 4; skill turns = 1; task completes = 4.  [rollout×db] typed − skill = DB prompts (3).
- [rollout] exactly 1 developer message holding "Mirror Mind — Operating Instructions" (D13).
- [rollout] exactly 2 developer messages holding "MIRROR MODE ACTIVE": turn 1 (explicit) and turn 2 (the owed injection), none on turns 3–4.
- [db]      hook_injected = 1.
- [codex-log] a "Service initialized as client" record for server_name=mirror-mind since the session began.
- [model]   turn 2 replies yes/yes; turn 4 names personal-growth; whether the skill bound the journey (db: conversations.journey).
- [db]      at check time, before the reap: the conversation OPEN and the session ACTIVE (this Codex detaches on /quit); hooks.log unchanged; no LLM call after the last reply except Mirror's own reception calls during the turns.

## wait-for-close A (Codex closes first)
- [codex-log] "has no subscribers and is idle; shutting down" and thread/closed for the thread, about 30 min after /quit.
- [probe]   a SessionEnd record at the reap with session_id = the thread id.
- [db]      within the same minute: ended_at set; the session inactive with closed_at; close_tail_pending = 1.
- [fs]      a dated backup newer than ended_at (the hook finished inside the bound).
- [ledger]  no LLM call at or after ended_at.  [fs] hooks.log unchanged.

## finish A
- [db]      Finished deferred close tails: 1; summary and tags present; the flag gone.
- [ledger]  exactly ONE conversation_title call for the conversation (the paid debt).
- [db]      if the journey was bound: Extracted pending conversations: 1 and memories ≥ 1; else not extracted, by the journey gate.

## Session B (two turns), finish B at once (Mirror closes first, MIRROR_STALE_ORPHAN_MINUTES=0)
- [db]      Closed stale conversations: 1; ended_at set; the session INACTIVE with closed_at (the US4 fix); summary present; no flag.
- [ledger]  exactly one conversation_title call for the conversation.
- [rollout] 4 messages in db (2 prompts, 2 replies); exactly 1 developer message with MIRROR MODE ACTIVE (turn 2's explicit).

## wait-for-close B (Codex's reap meets a closed conversation)
- [codex-log] the reap; [probe] SessionEnd recorded.
- [db]      ended_at UNCHANGED from finish B's value (not closed twice); the session inactive; no close_tail_pending added.
- [fs]      a backup newer than the reap (the hook still ran its backup).

## resume B, then check B
- [db]      the runtime session now binds a NEW conversation holding "DS4-$ID B2"; the old conversation's message count unchanged (a closed conversation is not reopened).

## untouched
- [fs]      your real ~/.codex, ~/.claude, ~/.config/mirror unchanged since setup (content diff shown otherwise); no live turn in a real Mirror home.
EOF
}

# ============================================================================
# The readers, parametrised so selfcheck can run them on a copy. Live-only readers
# are skipped (not failed) when MODE=selfcheck.
check_session() {
  local S="$1" MODE="${2:-live}" DBX="$3" MH="$4" LIVE_S="$5"
  local ID START CONV SID
  ID="$(cat "$EVIDENCE/id")"; START="$(cat "$LIVE_S/started")"
  CONV="$(q "$DBX" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE ? AND substr(c.started_at,1,19) >= substr(?,1,19) ORDER BY c.started_at LIMIT 1" "DS4-$ID%" "$START")"
  [ -n "$CONV" ] && ok "[db] the session's conversation: $CONV (holds DS4-$ID, started after $START)" || { bad "[db] no conversation started after $START holds DS4-$ID"; return; }
  SID="$(q "$DBX" "SELECT session_id FROM runtime_sessions WHERE conversation_id = ?" "$CONV")"
  [ -n "$SID" ] || SID="$(q "$DBX" "SELECT session_id FROM runtime_sessions WHERE interface = 'codex' AND session_id NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY updated_at DESC LIMIT 1")"
  look "runtime session (Codex thread id): $SID"
  echo "$CONV" >"$LIVE_S/conversation"; echo "$SID" >"$LIVE_S/session"

  local VERSION; VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  say "US1 — the install held [fs]"
  [ -d "$CX/plugins/cache/mirror-mind/mirror-mind/$VERSION" ] && ok "[fs] cached at $VERSION from the shipped marketplace" || bad "[fs] the plugin cache is gone"
  [ ! -e "$CX/skills/mirror-mind" ] && [ ! -e "$CX/AGENTS.md" ] && ok "[fs] no skills/mirror-mind link, no AGENTS.md" || bad "[fs] old wiring present"

  say "US8 / TS3 — logged as codex [db]"
  [ "$(q "$DBX" "SELECT interface FROM conversations WHERE id = ?" "$CONV")" = "codex" ] && ok "[db] the conversation is labelled codex" || bad "[db] conversation label is not codex"
  [ "$(q "$DBX" "SELECT interface FROM runtime_sessions WHERE session_id = ?" "$SID")" = "codex" ] && ok "[db] the runtime session is labelled codex" || bad "[db] session label is not codex"
  local N R U
  N="$(q "$DBX" "SELECT COUNT(*) FROM messages WHERE conversation_id = ?" "$CONV")"; R="$(q "$DBX" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND role = 'assistant'" "$CONV")"; U=$((N - R))
  look "[db] $N messages: $U prompts, $R replies (the expected counts follow Codex's own turn record below)"
  qrows "$DBX" "SELECT role, substr(replace(content, char(10), ' '), 1, 88) FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid" "$CONV" | show
  local U1; U1="$(q "$DBX" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at, rowid LIMIT 1" "$CONV")"
  if [ "$S" = "A" ]; then
    case "$U1" in "DS4-$ID"*) [[ "$U1" != *'$mirror-mind'* ]] && ok "[db] the Mirror question logged without its form" || bad "[db] the form is in the content" ;; *) bad "[db] the first prompt is '$U1'" ;; esac
    [ "$(q "$DBX" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND (content LIKE '%mm:journeys%' OR content LIKE '%mm-journeys%')" "$CONV")" = "0" ] && ok "[db] no message holds the skill turn or its rendering (TS3)" || bad "[db] the skill turn was logged"
  fi
  [ "$(q "$DBX" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND json_extract(metadata, '\$.turn_id') IS NULL" "$CONV")" = "0" ] && ok "[db] every message carries its turn id" || bad "[db] a message has no turn id"

  say "D13 / injection / MCP — Codex's own files"
  local ROLLOUT; ROLLOUT="$(find "$CX/sessions" -name "rollout-*$SID*.jsonl" 2>/dev/null | head -1)"
  # After resume B the same rollout continues: one more completed turn, a second
  # SessionStart (the Operating Instructions again), and the session's conversations
  # are two. The readers below count across them.
  local RESUMED=0; [ -f "$LIVE_S/resumed" ] && RESUMED=1
  if [ "$MODE" = "selfcheck" ]; then
    skip "[rollout] completed turns, skill turns, aborted turns, the Operating Instructions, MIRROR MODE ACTIVE (live-only)"
    skip "[codex-log] the mirror-mind handshake (live-only)"
  elif [ -n "$ROLLOUT" ]; then
    look "rollout: ${ROLLOUT#"$CX"/}"
    local C; C="$(rollout_counts "$ROLLOUT")"; set -- $C; local COMPLETED="$1" SKILL="$2" ABORTED="$3" OI="$4" MA="$5"
    [ "$ABORTED" != "0" ] && note "[rollout] $ABORTED aborted turn(s): submitted and interrupted before an answer (counted apart; a bare Mirror form the autocomplete sends is one)"
    # Every completed, non-skill turn is one DB prompt, across the session's conversations.
    local DBU; DBU="$(q "$DBX" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.role = 'user' AND c.id IN (SELECT conversation_id FROM runtime_sessions WHERE session_id = ?) OR (m.role = 'user' AND m.conversation_id = ?)" "$SID" "$CONV")"
    local DBA; DBA="$(q "$DBX" "SELECT COUNT(*) FROM messages m WHERE m.role = 'assistant' AND (m.conversation_id = ? OR m.conversation_id IN (SELECT conversation_id FROM runtime_sessions WHERE session_id = ?))" "$CONV" "$SID")"
    [ "$((COMPLETED - SKILL))" = "$DBU" ] && ok "[rollout×db] completed turns $COMPLETED − skill turns $SKILL = $DBU = DB prompts across the session's conversations: two sources agree" || bad "[rollout×db] completed − skill = $((COMPLETED - SKILL)) but DB prompts = $DBU"
    [ "$SKILL" = "$(q "$DBX" "SELECT 0")" ] || ok "[rollout] $SKILL skill turn(s) completed and, per TS3, none of them is a DB prompt"
    local EXP_OI=$((1 + RESUMED))
    [ "$OI" = "$EXP_OI" ] && ok "[rollout] $OI developer message(s) hold the Operating Instructions: one per SessionStart (D13)$([ "$RESUMED" = 1 ] && echo ', the resume included')" || bad "[rollout] $OI developer message(s) hold the Operating Instructions (expected $EXP_OI)"
    # Injection by design: every explicit Mirror form (bare or with a question) injects, and
    # the first ordinary turn after Mirror Mode activates injects once more (the owed one).
    local EXPLICIT; EXPLICIT="$(node -e '
      const fs=require("fs");const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
      const text=(c)=>Array.isArray(c)?c.map(x=>x.text||"").join(" "):String(c??"");
      let n=0,cur=false;for(const l of lines){ if(l.type==="event_msg"&&l.payload?.type==="task_started"){cur=true;continue;}
        if(cur&&l.type==="response_item"&&l.payload?.role==="user"){const tx=text(l.payload.content);if(tx.startsWith("<environment_context>")||tx.startsWith("<skill>"))continue;if(/^[\/$](mirror-mind:)?mm[:-]mirror(\s|$)/.test(tx))n++;cur=false;}}
      console.log(n);' "$ROLLOUT")"
    local EXP_MA_MIN=$((EXPLICIT)) EXP_MA_MAX=$((EXPLICIT + 1 + RESUMED))
    [ "$MA" -ge "$EXP_MA_MIN" ] && [ "$MA" -le "$EXP_MA_MAX" ] && ok "[rollout] $MA developer message(s) hold MIRROR MODE ACTIVE: $EXPLICIT explicit Mirror form(s) + the owed injection on the first ordinary turn after activation$([ "$RESUMED" = 1 ] && echo ' (+1 after the resume, which re-owes it)')" || bad "[rollout] $MA MIRROR MODE ACTIVE developer messages (explicit forms $EXPLICIT; expected $EXP_MA_MIN..$EXP_MA_MAX)"
    local HS; HS="$(q "$CX/logs_2.sqlite" "SELECT COUNT(*) FROM logs WHERE ts >= ? AND feedback_log_body LIKE '%server_name=mirror-mind%' AND feedback_log_body LIKE '%Service initialized as client%'" "$(epoch_of "$START")")"
    [ "${HS:-0}" -gt 0 ] && ok "[codex-log] the mirror-mind MCP client initialized ($HS record(s) since the session began)" || bad "[codex-log] no mirror-mind handshake since $START"
  else
    bad "[rollout] no rollout for thread $SID under $CX/sessions"
  fi
  if [ "$S" = "A" ]; then
    [ "$(q "$DBX" "SELECT hook_injected FROM runtime_sessions WHERE session_id = ?" "$SID")" = "1" ] && ok "[db] hook_injected = 1" || bad "[db] hook_injected is not set"
  fi

  say "The model's word [model] — observations"
  if [ "$S" = "A" ]; then
    local A2 A3 J
    A2="$(q "$DBX" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at, rowid LIMIT 1 OFFSET 1" "$CONV")"
    A3="$(q "$DBX" "SELECT content FROM messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at, rowid LIMIT 1 OFFSET 2" "$CONV")"
    J="$(q "$DBX" "SELECT journey FROM conversations WHERE id = ?" "$CONV")"
    look "probe reply: $(printf '%s' "$A2" | tr '\n' ' ' | cut -c1-140)"
    look "MCP reply:   $(printf '%s' "$A3" | tr '\n' ' ' | cut -c1-140)"
    look "journey bound by the skill: ${J:-none} (extraction is claimed only if bound)"
    printf 'probe: %s\nmcp: %s\njourney: %s\n' "$A2" "$A3" "${J:-none}" >"$LIVE_S/model.txt"
  fi

  say "The close — where it stands now"
  local ENDED; ENDED="$(q "$DBX" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"
  if [ -z "$ENDED" ]; then
    note "[db] the conversation is open and the session active: this Codex detaches on /quit and closes the thread when its daemon reaps it (wait-for-close $S)"
  elif [ "$RESUMED" = 1 ]; then
    ok "[db] the first conversation ended at $ENDED; the session was re-activated by the resume and binds the new one (read below)"
  else
    close_lines "$S" "$DBX" "$MH" "$CONV" "$SID" "$ENDED"
  fi
  local LN; LN="$(log_lines "$MH")"
  [ "$LN" = "$(cat "$LIVE_S/hooks-lines")" ] && ok "[fs] hooks.log unchanged since the session began" || { bad "[fs] hooks.log gained $((LN - $(cat "$LIVE_S/hooks-lines"))) line(s):"; tail -3 "$MH/hooks.log" | show; }
}

# The TS2 group, once the conversation has ended (by Codex's reap or by maintenance).
close_lines() {
  local S="$1" DBX="$2" MH="$3" CONV="$4" SID="$5" ENDED="$6"
  ok "[db] ended_at $ENDED"
  local A C; A="$(q "$DBX" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")"; C="$(q "$DBX" "SELECT closed_at FROM runtime_sessions WHERE session_id = ?" "$SID")"
  [ "$A" = "0" ] && [ -n "$C" ] && ok "[db] the runtime session is inactive, closed_at $C" || bad "[db] the runtime session: active=$A closed_at=${C:-null}"
  local NB; NB="$(node -e 'const fs=require("fs"),p=require("path");const d=process.argv[1];const e=Date.parse(process.argv[2]||"");try{const f=fs.readdirSync(d).filter(n=>/^memory_.*\.zip$/.test(n)).map(n=>({n,t:fs.statSync(p.join(d,n)).mtimeMs})).filter(x=>x.t>=e-1000).sort((a,b)=>b.t-a.t)[0];console.log(f?f.n:"");}catch{console.log("")}' "$MH/backups" "$ENDED")"
  [ -n "$NB" ] && ok "[fs] a dated backup at or after ended_at ($NB): the SessionEnd hook finished inside Codex's bound" || note "[fs] no dated backup at or after ended_at (expected when maintenance, not SessionEnd, closed it)"
  [ "$(q "$DBX" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ? AND called_at >= ? AND role NOT IN ('conversation_title','conversation_summary','conversation_tags','extraction','task_extraction','curation','summary')" "$CONV" "$ENDED")" = "0" ] && ok "[ledger] no LLM call at the close itself" || note "[ledger] calls after ended_at (maintenance's tail, if finish already ran)"
}

# ============================================================================
selfcheck() {
  need_install
  say "Self-check — the readers, against a COPY of the scratch home driven by the real wrappers"
  subject_check
  local SC="$D/selfcheck"; rm -rf "$SC"; mkdir -p "$SC/live/A" "$SC/live/B"
  cp -R "$MHOME" "$SC/home"; local MH="$SC/home" DBX="$SC/home/memory.db"
  local ID; ID="$(cat "$EVIDENCE/id")"
  local ENV=(env HOME="$PERSON" MIRROR_HOME="$MH" MIRROR_USER= OPENROUTER_API_KEY= MIRROR_WELCOME_REMOTE_UPDATE_CHECK=off NODE_OPTIONS=--no-warnings PATH="$D/prefix/bin:$REAL_PATH")
  local HOOKS="$PKG/plugins/mirror-mind/hooks"
  hook() { local n="$1"; shift; "${ENV[@]}" bash "$HOOKS/$n" "$@"; }
  local SID="selfcheck-thread-$$"
  date -u +%Y-%m-%dT%H:%M:%SZ >"$SC/live/A/started"; log_lines "$MH" >"$SC/live/A/hooks-lines"
  sleep 1
  # Session A, as Codex would drive the wrappers: inject + prompt per turn, Stop per turn.
  turn() { local tid="$1" prompt="$2" reply="$3"
    printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"$tid\",\"prompt\":$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$prompt")}" | hook mirror-inject.sh >/dev/null 2>&1
    printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"$tid\",\"prompt\":$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$prompt")}" | hook log-user-prompt.sh >/dev/null 2>&1
    printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"$tid\",\"last_assistant_message\":$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$reply")}" | hook log-assistant-reply.sh >/dev/null 2>&1; }
  turn t1 "\$mirror-mind:mm:mirror DS4-$ID, in my personal-growth journey: should I raise my course price from 297 to 497 reais?" "◇ financial — test it."
  turn t2 "DS4-$ID probe: without using any tool, answer (a) yes or no (b) yes or no" "(a) Yes. (b) Yes."
  turn t3 "\$mirror-mind:mm:journeys" "| personal-growth | active |"
  turn t4 "DS4-$ID: use tool_search to find the mirror-mind MCP server's list_journeys tool" "The MCP tool returned: personal-growth."
  ok "four synthetic turns driven through inject, prompt, and Stop wrappers (session $SID)"
  check_session A selfcheck "$DBX" "$MH" "$SC/live/A"
  # Then the close through the plugin's SessionEnd wrapper, as the reap would run it.
  say "Self-check — the close through log-session-end.sh"
  printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t4\"}" | hook log-session-end.sh >/dev/null 2>&1
  local CONV; CONV="$(cat "$SC/live/A/conversation")"
  local ENDED; ENDED="$(q "$DBX" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"
  [ -n "$ENDED" ] && close_lines A "$DBX" "$MH" "$CONV" "$SID" "$ENDED" || bad "[db] the session-end wrapper did not close the conversation"
  [ "$(q "$DBX" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" = "1" ] && ok "[db] close_tail_pending = 1 (the deferred tail)" || bad "[db] no flag"
  # And the two rules the scope change added, on the copy: a prompt after the close binds a new conversation.
  say "Self-check — the scope change's rules on the copy"
  printf '%s' "{\"session_id\":\"$SID\",\"turn_id\":\"t5\",\"prompt\":\"DS4-$ID B2: after resuming, say hello\"}" | hook log-user-prompt.sh >/dev/null 2>&1
  local NEWCONV; NEWCONV="$(q "$DBX" "SELECT conversation_id FROM runtime_sessions WHERE session_id = ?" "$SID")"
  [ -n "$NEWCONV" ] && [ "$NEWCONV" != "$CONV" ] && ok "[db] a prompt after the close bound a NEW conversation ($NEWCONV), the old one untouched ($(q "$DBX" "SELECT COUNT(*) FROM messages WHERE conversation_id = ?" "$CONV") messages)" || bad "[db] the prompt reopened the closed conversation"
  sleep 1  # the prompt above and a threshold of zero must not share a second
  "${ENV[@]}" MIRROR_STALE_ORPHAN_MINUTES=0 mirror conversation-logger session-maintenance >"$SC/maintenance.out" 2>&1
  [ -n "$(q "$DBX" "SELECT ended_at FROM conversations WHERE id = ?" "$NEWCONV")" ] && ok "[db] maintenance with the threshold at 0 closed the open conversation bound to the active codex session (the safety net; $(grep -o 'Closed stale conversations: [0-9]*' "$SC/maintenance.out"), the copy's other open ones included)" || { bad "[db] the safety net did not close it:"; grep -E "Closed|Extracted|Finished" "$SC/maintenance.out" | show; }
  [ "$(q "$DBX" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "0" ] && ok "[db] and deactivated the session" || bad "[db] the session is still active after the safety-net close"
  rm -rf "$SC"
  note "the copy was deleted; the scratch home for the live sessions is untouched"
  result
}

# ============================================================================
live() {
  local S="${1:-}"; case "$S" in A|B) ;; *) echo "usage: bash $SELF live A|B [--again]"; exit 2 ;; esac
  need_install; say "Live — session $S"; subject_check
  local LS="$LIVE/$S"
  if [ -f "$LS/started" ] && [ "${2:-}" != "--again" ]; then
    echo "  Session $S already ran ($(cat "$LS/started")). Re-run only with: bash $SELF live $S --again (the capture is archived)."; exit 2
  fi
  [ -d "$LS" ] && mv "$LS" "$LS.$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$LS"; chmod 700 "$LS"
  if [ "${DS4_US4_COPY_AUTH:-1}" = 1 ] && [ -f "$REAL_HOME/.codex/auth.json" ] && [ ! -f "$CX/auth.json" ]; then
    cp "$REAL_HOME/.codex/auth.json" "$CX/auth.json" && chmod 600 "$CX/auth.json" && note "your ~/.codex/auth.json copied into the scratch CODEX_HOME (600 in a 700 dir; clean removes it)"
  fi
  [ -f "$CX/auth.json" ] || note "Codex will ask you to log in: that login is stored in $CX only."
  session_env; preflight
  date -u +%Y-%m-%dT%H:%M:%SZ >"$LS/started"; log_lines "$MHOME" >"$LS/hooks-lines"
  say "The turns (also in evidence/turns.txt)"
  awk -v s="SESSION $S" 'index($0, s)==1{p=1} p&&/^SESSION/&&index($0,s)!=1{p=0} p&&/^RESUME/{p=0} p' "$EVIDENCE/turns.txt"
  rm -rf "$PROJECT" && mkdir -p "$PROJECT"
  [ "${DS4_US4_DRY:-0}" = 1 ] && { note "DS4_US4_DRY=1: prepared, session not started"; rm -f "$LS/started"; return 0; }
  cd "$PROJECT" && exec "${SESSION_ENV[@]}" HOME="$PERSON" CODEX_HOME="$CX" codex
}

# Codex's reap: poll its log and Mirror's database.
wait_for_close() {
  local S="${1:-}"; case "$S" in A|B) ;; *) echo "usage: bash $SELF wait-for-close A|B"; exit 2 ;; esac
  need_install; local LS="$LIVE/$S"; [ -f "$LS/started" ] || { echo "Session $S has not run."; exit 2; }
  say "Wait for close — session $S: Codex's reap, and what Mirror did with it"
  subject_check
  local ID START SID CONV; ID="$(cat "$EVIDENCE/id")"; START="$(cat "$LS/started")"
  CONV="$(q "$DB" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE ? AND substr(c.started_at,1,19) >= substr(?,1,19) ORDER BY c.started_at LIMIT 1" "DS4-$ID%" "$START")"
  [ -n "$CONV" ] || { bad "[db] no conversation for session $S yet"; result; return; }
  SID="$(q "$DB" "SELECT session_id FROM runtime_sessions WHERE conversation_id = ?" "$CONV")"; [ -n "$SID" ] || SID="$(cat "$LS/session" 2>/dev/null)"
  local ENDED0; ENDED0="$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"
  local LASTMSG; LASTMSG="$(q "$DB" "SELECT MAX(created_at) FROM messages WHERE conversation_id = ?" "$CONV")"
  look "thread $SID · conversation $CONV · last turn $LASTMSG · ended_at now: ${ENDED0:-null}"
  local i REAP="" PROBE="" ENDED=""
  for i in $(seq 1 80); do
    REAP="$(q "$CX/logs_2.sqlite" "SELECT datetime(ts, 'unixepoch') FROM logs WHERE feedback_log_body LIKE ? AND feedback_log_body LIKE '%no subscribers and is idle; shutting down%' ORDER BY ts DESC LIMIT 1" "%$SID%")"
    PROBE="$(grep " SessionEnd " "$LIVE/probe.log" 2>/dev/null | grep "$SID" | tail -1 | cut -d' ' -f1)"
    ENDED="$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"
    if [ -n "$REAP" ] && [ -n "$PROBE" ]; then break; fi
    printf '  \033[90m… %02d:%02d waited · reap: %s · probe SessionEnd: %s · ended_at: %s\033[0m\r' $(( i*30/60 )) $(( i*30%60 )) "${REAP:-no}" "${PROBE:-no}" "${ENDED:-null}"
    sleep 30
  done
  echo
  [ -n "$REAP" ] && ok "[codex-log] the daemon reaped the thread: \"no subscribers and is idle; shutting down\" at ${REAP}Z" || { bad "[codex-log] no reap for thread $SID within 40 minutes"; result; return; }
  [ -n "$PROBE" ] && ok "[probe] SessionEnd recorded at $PROBE for session_id $SID" || bad "[probe] no SessionEnd record for $SID"
  look "timeline: last turn $LASTMSG → reap ${REAP}Z (~$(( ( $(epoch_of "${REAP}Z") - $(epoch_of "$LASTMSG") ) / 60 )) min after the last turn) → Mirror ended_at ${ENDED:-null}"
  if [ "$S" = "A" ]; then
    [ -n "$ENDED" ] && ok "[db] Mirror closed the conversation when SessionEnd fired" || { bad "[db] SessionEnd fired and the conversation is still open"; result; return; }
    close_lines A "$DB" "$MHOME" "$CONV" "$SID" "$ENDED"
    [ "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" = "1" ] && ok "[db] close_tail_pending = 1: the LLM tail deferred to the next start (TS2)" || bad "[db] no close_tail_pending flag"
  else
    [ "$ENDED" = "$ENDED0" ] && [ -n "$ENDED0" ] && ok "[db] ended_at unchanged at $ENDED0: the reap's SessionEnd met a closed conversation and did not close it twice" || bad "[db] ended_at moved: was ${ENDED0:-null}, now ${ENDED:-null}"
    [ "$(q "$DB" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "0" ] && ok "[db] the runtime session is inactive" || bad "[db] the runtime session is active"
    [ -z "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" ] && ok "[db] no close_tail_pending added by the late SessionEnd" || bad "[db] the late SessionEnd flagged a finished conversation"
    local NB; NB="$(node -e 'const fs=require("fs"),p=require("path");const d=process.argv[1];const e=Date.parse(process.argv[2]);try{const f=fs.readdirSync(d).map(n=>({n,t:fs.statSync(p.join(d,n)).mtimeMs})).filter(x=>x.t>=e-1000).sort((a,b)=>b.t-a.t)[0];console.log(f?f.n:"");}catch{console.log("")}' "$MHOME/backups" "${REAP}Z")"
    [ -n "$NB" ] && ok "[fs] a backup at or after the reap ($NB): the hook ran to its end" || bad "[fs] no backup after the reap"
  fi
  [ "$(log_lines "$MHOME")" = "$(cat "$LS/hooks-lines")" ] && ok "[fs] hooks.log unchanged" || { bad "[fs] hooks.log gained a line:"; tail -2 "$MHOME/hooks.log" | show; }
  result
}

check() {
  local S="${1:-}"; case "$S" in A|B) ;; *) echo "usage: bash $SELF check A|B"; exit 2 ;; esac
  need_install; local LS="$LIVE/$S"; [ -f "$LS/started" ] || { echo "Session $S has not run."; exit 2; }
  say "Check — session $S (DS4-$(cat "$EVIDENCE/id"), since $(cat "$LS/started"))"; subject_check
  check_session "$S" live "$DB" "$MHOME" "$LS"
  if [ "$S" = "B" ] && [ -f "$LS/resumed" ]; then
    say "Resume B — a closed conversation is not reopened [db]"
    local SID OLD NEW; SID="$(cat "$LS/session")"; OLD="$(cat "$LS/conversation")"
    NEW="$(q "$DB" "SELECT conversation_id FROM runtime_sessions WHERE session_id = ?" "$SID")"
    [ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && ok "[db] the session now binds a new conversation ($NEW), not the closed one ($OLD)" || bad "[db] the session still binds $NEW"
    [ "$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND content LIKE ?" "$NEW" "DS4-$(cat "$EVIDENCE/id") B2%")" -ge 1 ] && ok "[db] the resumed turn is in the new conversation" || bad "[db] the resumed turn is not in the new conversation"
    [ "$(q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ?" "$OLD")" = "$(cat "$LS/old-count")" ] && ok "[db] the closed conversation's message count is unchanged ($(cat "$LS/old-count"))" || bad "[db] the closed conversation gained messages"
  fi
  result
}

finish() {
  local S="${1:-}"; case "$S" in A|B) ;; *) echo "usage: bash $SELF finish A|B"; exit 2 ;; esac
  need_install; local LS="$LIVE/$S"; [ -f "$LS/started" ] || { echo "Session $S has not run."; exit 2; }
  say "Finish — session $S: the next start's maintenance, with your key"; subject_check; session_env
  local ID START CONV SID; ID="$(cat "$EVIDENCE/id")"; START="$(cat "$LS/started")"
  CONV="$(q "$DB" "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE m.content LIKE ? AND substr(c.started_at,1,19) >= substr(?,1,19) ORDER BY c.started_at LIMIT 1" "DS4-$ID%" "$START")"
  [ -n "$CONV" ] || { bad "[db] no conversation for session $S"; result; return; }
  SID="$(q "$DB" "SELECT session_id FROM runtime_sessions WHERE conversation_id = ?" "$CONV")"
  echo "$CONV" >"$LS/conversation"; [ -n "$SID" ] && echo "$SID" >"$LS/session"
  local J; J="$(q "$DB" "SELECT journey FROM conversations WHERE id = ?" "$CONV")"
  local OPEN=0; [ -z "$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")" ] && OPEN=1
  if [ "$S" = "B" ]; then
    [ "$OPEN" = "1" ] || { bad "[db] session B's conversation is already closed; finish B must run right after /quit, before the reap"; result; return; }
    note "Mirror closes first: maintenance with MIRROR_STALE_ORPHAN_MINUTES=0 (the safety net; 30 min by default)"
    "${SESSION_ENV[@]}" HOME="$PERSON" MIRROR_STALE_ORPHAN_MINUTES=0 mirror conversation-logger session-maintenance >"$LS/finish.out" 2>&1
    grep -E "Closed|Retitled|Extracted|Finished" "$LS/finish.out" | show
    grep -q "Closed stale conversations: 1 " "$LS/finish.out" && ok "[db] Closed stale conversations: 1 — the idle conversation on an active codex session, closed through the full tail" || bad "[db] not closed (see live/B/finish.out)"
    local E; E="$(q "$DB" "SELECT ended_at FROM conversations WHERE id = ?" "$CONV")"; [ -n "$E" ] && ok "[db] ended_at $E" || bad "[db] ended_at null"
    [ "$(q "$DB" "SELECT active FROM runtime_sessions WHERE session_id = ?" "$SID")" = "0" ] && ok "[db] the runtime session is inactive, closed_at $(q "$DB" "SELECT closed_at FROM runtime_sessions WHERE session_id = ?" "$SID") (the US4 fix)" || bad "[db] the runtime session is still active"
  else
    [ "$OPEN" = "0" ] || { bad "[db] session A's conversation is still open; run wait-for-close A first"; result; return; }
    [ "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" = "1" ] || note "the deferred tail was already finished on an earlier run"
    "${SESSION_ENV[@]}" HOME="$PERSON" mirror conversation-logger session-maintenance >"$LS/finish.out" 2>&1
    grep -E "Closed|Retitled|Extracted|Finished" "$LS/finish.out" | show
    grep -q "Finished deferred close tails: 1 " "$LS/finish.out" && ok "[db] Finished deferred close tails: 1" || note "[db] deferred tails finished this run: $(grep -o 'Finished deferred close tails: [0-9]*' "$LS/finish.out")"
  fi
  if [ -n "$J" ]; then
    # Extraction ran if the ledger has its call: through extractPending (A) or inside the
    # orphan close's own tail (B). The model may extract nothing from a short conversation.
    [ "$(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ? AND role = 'extraction'" "$CONV")" -ge 1 ] && ok "[ledger] extraction ran for journey $J ($(grep -o 'Extracted pending conversations: [0-9]*' "$LS/finish.out" | head -1); the orphan close runs it inside its own tail)" || bad "[ledger] journey $J bound but no extraction call"
    local MEMN; MEMN="$(q "$DB" "SELECT COUNT(*) FROM memories WHERE conversation_id = ?" "$CONV")"
    [ "$MEMN" -ge 1 ] && ok "[db] memories: $MEMN" || note "[db] the model extracted no memory from this conversation (allowed: a short exchange may carry none)"
  else
    note "[db] no journey bound: not extracted, by Mirror's gate (memories attach to journeys)"
  fi
  [ -n "$(q "$DB" "SELECT summary FROM conversations WHERE id = ?" "$CONV")" ] && ok "[db] summary present; title: $(q "$DB" "SELECT title FROM conversations WHERE id = ?" "$CONV")" || bad "[db] no summary"
  [ -z "$(q "$DB" "SELECT json_extract(metadata, '\$.close_tail_pending') FROM conversations WHERE id = ?" "$CONV")" ] && ok "[db] no close_tail_pending left" || bad "[db] the flag survives"
  local TITLES; TITLES="$(q "$DB" "SELECT COUNT(*) FROM llm_calls WHERE conversation_id = ? AND role = 'conversation_title'" "$CONV")"
  [ "$TITLES" = "1" ] && ok "[ledger] exactly one conversation_title call (the paid debt: no retitle before the deferred finalization)" || bad "[ledger] $TITLES conversation_title calls"
  say "The ledger [ledger]"
  qrows "$DB" "SELECT role, model, prompt_tokens, completion_tokens, latency_ms, printf('%.5f', COALESCE(cost_usd, 0)), substr(called_at, 12, 8) FROM llm_calls WHERE conversation_id = ? ORDER BY called_at" "$CONV" | tee "$LS/ledger.tsv" | show
  look "the conversation's total: \$$(q "$DB" "SELECT printf('%.5f', COALESCE(SUM(cost_usd), 0)) FROM llm_calls WHERE conversation_id = ?" "$CONV")"
  result
}

resume() {
  need_install; local LS="$LIVE/B"; [ -f "$LS/session" ] || { echo "Run finish B first (it records the thread id)."; exit 2; }
  say "Resume B — one more turn on the thread Codex kept"; subject_check; session_env; preflight
  local SID; SID="$(cat "$LS/session")"
  q "$DB" "SELECT COUNT(*) FROM messages WHERE conversation_id = ?" "$(cat "$LS/conversation")" >"$LS/old-count"
  touch "$LS/resumed"
  awk '/^RESUME B/{p=1} p' "$EVIDENCE/turns.txt"
  [ "${DS4_US4_DRY:-0}" = 1 ] && { note "DS4_US4_DRY=1: prepared, not started"; rm -f "$LS/resumed"; return 0; }
  cd "$PROJECT" && exec "${SESSION_ENV[@]}" HOME="$PERSON" CODEX_HOME="$CX" codex resume "$SID"
}

untouched() {
  say "Untouched — your real runtime configs vs the baseline, and your real Mirror homes"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run: bash $SELF setup"; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then ok "[fs] no real runtime configuration file changed"
  else
    bad "[fs] real configuration changed since setup:"; show <"$D/real-diff.txt"
    local rel; for rel in .codex/config.toml .codex/hooks.json .claude/settings.json; do
      [ -f "$D/real-baseline/$rel" ] && [ -f "$REAL_HOME/$rel" ] || continue
      diff -u "$D/real-baseline/$rel" "$REAL_HOME/$rel" >"$D/real-diff-$(basename "$rel").txt" || { note "what changed in ~/$rel:"; grep -E '^[-+][^-+]' "$D/real-diff-$(basename "$rel").txt" | show; }
    done
  fi
  local hit=0 db; local ID; ID="$(cat "$EVIDENCE/id" 2>/dev/null)"
  for db in "$REAL_HOME"/.mirror-minds/*/memory.db "$REAL_HOME"/.mirror/*/memory.db; do
    [ -f "$db" ] || continue
    # A Codex turn, not this conversation about it: the Navigator pastes the route's output into
    # a Pi session that is logged to a real home, id and all (found on the first run).
    [ "$(q "$db" "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.interface = 'codex' AND m.content LIKE ?" "%DS4-$ID%")" != "0" ] && { bad "a live Codex turn (DS4-$ID) reached $db"; hit=1; }
  done
  [ "$hit" -eq 0 ] && ok "[db] no live Codex turn in a real Mirror home"
  result
}

report() {
  say "Report — every claim, its source, the session that proved it"
  look "subject: $(cat "$EVIDENCE/subject.txt" 2>/dev/null) · id DS4-$(cat "$EVIDENCE/id" 2>/dev/null) · package $(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json" 2>/dev/null)"
  cat "$EVIDENCE/versions.tsv" 2>/dev/null | show
  for S in A B; do [ -f "$LIVE/$S/started" ] && look "session $S: started $(cat "$LIVE/$S/started"), conversation $(cat "$LIVE/$S/conversation" 2>/dev/null), thread $(cat "$LIVE/$S/session" 2>/dev/null)"; done
  [ -f "$LIVE/A/model.txt" ] && { note "the model's word, session A:"; show <"$LIVE/A/model.txt"; }
  note "the pre-registered expectations: $EVIDENCE/expectations.md"
}

scratch_processes() { ps -axo pid=,command= | awk -v d="$D/" 'index($2, d) == 1 {print $1}'; }
clean() {
  say "Clean"
  [ -d "$CX" ] && command -v codex >/dev/null && { env CODEX_HOME="$CX" HOME="$PERSON" codex app-server daemon stop >/dev/null 2>&1 || true; }
  local pid stopped=0; for pid in $(scratch_processes); do kill -TERM "$pid" 2>/dev/null && stopped=$((stopped + 1)); done
  [ "$stopped" -gt 0 ] && { sleep 2; note "stopped $stopped process(es) running from $D"; }
  if [ -f "$D_RAW/.ds4-us4-v2" ]; then rm -rf "$D_RAW" && ok "removed $D_RAW (install, homes, evidence, the token copy)"; else note "nothing to remove at $D_RAW"; fi
}

case "${1:-}" in
  setup) setup ;; selfcheck) selfcheck ;; live) live "${2:-}" "${3:-}" ;;
  wait-for-close) wait_for_close "${2:-}" ;; check) check "${2:-}" ;; finish) finish "${2:-}" ;;
  resume) resume ;; untouched) untouched ;; report) report ;; clean) clean ;;
  *) sed -n '2,30p' "$SELF"; exit 2 ;;
esac
