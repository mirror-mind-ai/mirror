#!/usr/bin/env bash
# CV21.DS11 — the live steps of the Contract & Docs Refresh.
#
# Everything runs under a scratch directory (DS11_DIR, default /tmp/cv21-ds11), resolved
# to its physical path: Claude Code keys a login to the config directory's path, and
# /tmp/… and /private/tmp/… are two logins. Mirror runs from this checkout. Every Claude
# Code cell keeps the real HOME with the route's logged-in CLAUDE_CONFIG_DIR (the
# contract's "Claude Code's login in isolated routes") and writes to a scratch Mirror
# home (MIRROR_HOME); agy runs with a scratch HOME. `untouched` READS the real
# configuration to show that nothing reached it.
#
#   bash route.sh setup            the baseline; versions; the scratch Mirror home (init,
#                                  seed); a worktree at v0.36.2
#   bash route.sh agy              TS4, step 4: v0.36.2 staged in a scratch agy HOME;
#                                  diagnose; the printed command; diagnose again; then
#                                  v0.36.2 staged again, for the Navigator's reading
#   bash route.sh login            the Navigator's, once: /login in the route's Claude
#                                  config directory, then /exit
#   bash route.sh wire             the plugin linked into that directory, as `mirror init`
#                                  prints it for ~/.claude
#   bash route.sh statusline <printed|fallback|scoped|scoped-env>
#                                  US2: printed sets the step exactly as Getting Started
#                                  prints it (the Navigator's step 2); the others go
#                                  through a probe that runs all three forms on each
#                                  refresh and records each one's wall time and output
#   bash route.sh session          prints the command that opens one session in the cell
#                                  (the Navigator's, step 2: two of them side by side)
#   bash route.sh drive            US2, the Driver's: two sessions under expect; one runs
#                                  `mirror build load`, the other one plain turn after it
#   bash route.sh read-statusline  the probe's log: runs per session, wall time, the
#                                  session ids against the hooks', the line each showed
#   bash route.sh agents-md [alone|beside-claude-md]
#                                  TS3 (a): a scratch project whose AGENTS.md holds a
#                                  canary, the plugin wired; one headless turn; the
#                                  transcript read. beside-claude-md adds a CLAUDE.md
#                                  that does not import it (the control)
#   bash route.sh checkout         TS3 (b): two scratch worktrees of this checkout, with
#                                  and without CLAUDE.md's import, the plugin unwired;
#                                  one headless turn each; copies counted, tokens compared
#   bash route.sh clean            removes the scratch directory and the worktrees; names
#                                  the scratch login's keychain entry
#   bash route.sh untouched        the real configuration against the baseline
#
# Raw outputs stay under $D/evidence (never committed: they carry home paths); the
# summaries each step prints are what test-guide.md records.
set -u
export LC_NUMERIC=C LC_ALL=C

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../../.." && pwd -P)"
D_RAW="${DS11_DIR:-/tmp/cv21-ds11}"
REAL_HOME="$HOME"
USER1=ds11user
OLD_TAG=v0.36.2
MODEL="${DS11_MODEL:-haiku}"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  CFG="$D/claude-login/.claude"                 # CLAUDE_CONFIG_DIR, the route's login
  PERSON="$D/person"                            # the scratch HOME `mirror init` ran in
  MHOME="$PERSON/.mirror-minds/$USER1"          # the scratch Mirror home every cell names
  AGY_HOME="$D/agy-home"
  OLD="$D/wt-$OLD_TAG"
  PROJ_S="$D/project-statusline"
  PROJ_A="$D/project-agents-md"
  WT_IMPORT="$D/checkout-import"
  WT_NOIMPORT="$D/checkout-no-import"
  EVIDENCE="$D/evidence"
  FORMS="$D/forms"
  PLUGIN="$ROOT/plugins/mirror-mind"
}
resolve

PASS=0; FAIL=0
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
show() { sed "s|$D|\$D|g; s|$REAL_HOME|~|g; s/^/      | /"; }
result() { printf '\n  %d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" = 0 ]; }
need_setup() { [ -f "$D/.ds11" ] || { echo "Run: bash $SELF setup"; exit 2; }; }
need_login() { need_setup; [ -d "$CFG" ] || { echo "Run: bash $SELF login (the Navigator's, once)"; exit 2; }; }
# Read-only, never a write: `-readonly` cannot open a WAL database whose -shm file is
# gone (no connection open), so the immutable URI answers then.
dbq() { sqlite3 -readonly "$1" "$2" 2>/dev/null || sqlite3 "file:$1?mode=ro&immutable=1" "$2" 2>/dev/null; }

# The env every Claude Code cell runs with: the real HOME (the login is keyed to it),
# the route's config directory, the scratch Mirror home, and no provider key, so a
# session close spends nothing and sends no scratch content anywhere.
in_claude() {
  env CLAUDE_CONFIG_DIR="$CFG" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" \
    OPENROUTER_API_KEY= DISABLE_AUTOUPDATER=1 "$@"
}
as_scratch_mirror() { env HOME="$PERSON" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" OPENROUTER_API_KEY= mirror "$@"; }

# What `untouched` compares: the real files a route could reach, hashed, and the
# conversation count of every real Mirror home.
REAL_CONFIG=(.claude/settings.json .claude/skills .gemini/config/plugins .config/mirror/env .grok/rules .agents/skills)
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

# ---------------------------------------------------------------------------
setup() {
  say "Setup — the baseline, the versions, the scratch Mirror home, the $OLD_TAG worktree"
  mkdir -p "$D_RAW"; resolve; touch "$D/.ds11"; mkdir -p "$EVIDENCE" "$PROJ_S" "$PROJ_A"
  if [ -f "$D_RAW.baseline" ]; then note "baseline kept from an earlier setup ($D_RAW.baseline)"
  else config_manifest >"$D_RAW.baseline"; ok "baseline: $(wc -l <"$D_RAW.baseline" | tr -d ' ') entries of the real configuration"; fi
  {
    printf 'runtime\tversion\tbinary\tmeasured\n'
    printf 'claude\t%s\t%s\t%s\n' "$(claude --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v claude)")" "$(date -u +%F)"
    printf 'agy\t%s\t%s\t%s\n' "$(agy --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v agy)")" "$(date -u +%F)"
    printf 'mirror\t%s\t%s\t%s\n' "$(node -p 'require(process.argv[1]).version' "$ROOT/package.json")" "$ROOT" "$(date -u +%F)"
  } >"$EVIDENCE/versions.tsv"
  show <"$EVIDENCE/versions.tsv"
  if [ -f "$MHOME/memory.db" ]; then note "scratch Mirror home already seeded"
  else
    env HOME="$PERSON" MIRROR_USER="$USER1" OPENROUTER_API_KEY= mirror init "$USER1" >"$EVIDENCE/init.out" 2>&1 \
      && ok "mirror init $USER1 (scratch HOME)" || { bad "mirror init failed"; tail -5 "$EVIDENCE/init.out" | show; }
    as_scratch_mirror seed >"$EVIDENCE/seed.out" 2>&1 && ok "mirror seed" || { bad "mirror seed failed"; tail -5 "$EVIDENCE/seed.out" | show; }
  fi
  as_scratch_mirror journeys 2>/dev/null | grep -q personal-growth && ok "the scratch journey personal-growth is seeded" || bad "no personal-growth journey"
  [ -d "$OLD" ] || git -C "$ROOT" worktree add -q --detach "$OLD" "$OLD_TAG"
  [ -f "$OLD/plugins/mirror-mind/.claude-plugin/plugin.json" ] && ok "worktree at $OLD_TAG ($(node -p 'require(process.argv[1]).version' "$OLD/plugins/mirror-mind/.claude-plugin/plugin.json"))" || bad "no $OLD_TAG worktree"
  result
}

# ---------------------------------------------------------------------------
# TS4, step 4. agy stages by plugin name, so any path replaces the copy.
agy_diagnose() { (cd "$D" && env HOME="$AGY_HOME" MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" mirror runtime diagnose) >"$EVIDENCE/$1.out" 2>&1; }
agy_step() {
  need_setup
  say "TS4 — the canonical plugin's agy copy, in a scratch HOME ($(agy --version 2>/dev/null | head -1))"
  mkdir -p "$AGY_HOME/.gemini/config"
  env HOME="$AGY_HOME" agy plugin install "$OLD/plugins/mirror-mind" >"$EVIDENCE/agy-stage-old.out" 2>&1
  local staged="$AGY_HOME/.gemini/config/plugins/mirror-mind/.claude-plugin/plugin.json"
  [ -f "$staged" ] && ok "agy staged mirror-mind at $(node -p 'require(process.argv[1]).version' "$staged") (.gemini/config/plugins/mirror-mind/.claude-plugin/plugin.json)" || bad "agy staged no .claude-plugin/plugin.json"
  agy_diagnose agy-diagnose-behind
  if grep -q 'agy_plugin_copy_behind' "$EVIDENCE/agy-diagnose-behind.out"; then
    ok "diagnose reports agy_plugin_copy_behind"; grep -A3 'agy_plugin_copy_behind' "$EVIDENCE/agy-diagnose-behind.out" | show
  else bad "no agy_plugin_copy_behind while the copy is behind"; show <"$EVIDENCE/agy-diagnose-behind.out"; fi
  local cmd; cmd="$(sed -n 's/^Repair route: \(agy plugin install .*\)$/\1/p' "$EVIDENCE/agy-diagnose-behind.out" | head -1)"
  if [ -n "$cmd" ]; then
    env HOME="$AGY_HOME" sh -c "$cmd" >"$EVIDENCE/agy-reinstall.out" 2>&1
    ok "ran the printed command: $cmd"
    agy_diagnose agy-diagnose-level
    grep -q 'agy_' "$EVIDENCE/agy-diagnose-level.out" && bad "an agy finding after the reinstall" || ok "diagnose again: nothing for agy (copy at $(node -p 'require(process.argv[1]).version' "$staged"))"
  fi
  env HOME="$AGY_HOME" agy plugin install "$OLD/plugins/mirror-mind" >>"$EVIDENCE/agy-stage-old.out" 2>&1
  note "staged $OLD_TAG again. The Navigator's reading:"
  note "  cd $D && HOME=$AGY_HOME MIRROR_HOME=$MHOME MIRROR_USER=$USER1 mirror runtime diagnose"
  result
}

# ---------------------------------------------------------------------------
login() {
  need_setup
  mkdir -p "$CFG" && chmod 700 "$D/claude-login"
  say "Claude Code login in the route's scratch config directory"
  note "run /login, accept the folder trust if asked, then /exit. Nothing of yours loads here;"
  note "clean removes the directory and names the keychain entry the login leaves."
  (cd "$PROJ_S" && env CLAUDE_CONFIG_DIR="$CFG" DISABLE_AUTOUPDATER=1 claude)
}

wire() {
  need_login
  say "Wire — the plugin, as \`mirror init\` prints it, with ~/.claude resolved to the cell's config directory"
  mkdir -p "$CFG/skills" && ln -sfn "$PLUGIN" "$CFG/skills/mirror-mind"
  ok "ln -s <tree>/plugins/mirror-mind \$CLAUDE_CONFIG_DIR/skills/mirror-mind"
  (cd "$PROJ_S" && in_claude claude plugin list) >"$EVIDENCE/wire-plugin-list.out" 2>&1
  show <"$EVIDENCE/wire-plugin-list.out"
  grep -q 'mirror-mind' "$EVIDENCE/wire-plugin-list.out" && ok "claude plugin list names mirror-mind" || bad "claude plugin list does not name mirror-mind"
  result
}

# ---------------------------------------------------------------------------
# US2. The forms are the exact lines a user would paste. On every refresh the probe runs
# each of them on the stdin Claude Code wrote, times each, records whether Claude Code's
# CLAUDE_CODE_SESSION_ID equals that stdin's session_id, and prints the one the setting
# names, so one session measures every form at the same moments.
FORM_NAMES="fallback scoped scoped-env"
write_forms() {
  mkdir -p "$FORMS"
  printf '%s\n' 'mirror welcome --status-line' >"$FORMS/fallback.sh"
  # The session id from the JSON Claude Code writes to the command's stdin, without jq.
  cat >"$FORMS/scoped.sh" <<'EOF2'
mirror welcome --status-line --session-id "$(sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p')"
EOF2
  # The session id from the environment Claude Code gives the command.
  cat >"$FORMS/scoped-env.sh" <<'EOF2'
mirror welcome --status-line --session-id "$CLAUDE_CODE_SESSION_ID"
EOF2
  cat >"$D/statusline-probe.sh" <<EOF2
#!/usr/bin/env bash
# DS11's status line probe: keeps what Claude Code wrote to stdin, runs every form on it,
# logs each run (epoch ms, wall ms, form, stdin session id, env id equal, output), and
# prints the output of the form named by \$1.
show="\$1"; n="\$(date +%s)-\$\$"; in="$EVIDENCE/statusline/stdin-\$n.json"
mkdir -p "$EVIDENCE/statusline"; cat >"\$in"
[ -f "$EVIDENCE/statusline/env-names.txt" ] || env | cut -d= -f1 | LC_ALL=C sort >"$EVIDENCE/statusline/env-names.txt"
sid="\$(sed -n 's/.*"session_id" *: *"\([^"]*\)".*/\1/p' "\$in")"
[ -n "\$sid" ] && [ "\$sid" = "\${CLAUDE_CODE_SESSION_ID:-}" ] && same=yes || same=no
shown=""
for form in $FORM_NAMES; do
  t0=\$(perl -MTime::HiRes=time -e 'printf "%d", time*1000')
  out="\$(sh "$FORMS/\$form.sh" <"\$in" 2>>"$EVIDENCE/statusline/stderr.txt")"
  t1=\$(perl -MTime::HiRes=time -e 'printf "%d", time*1000')
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "\$t0" "\$((t1 - t0))" "\$form" "\$sid" "\$same" "\$out" >>"$EVIDENCE/statusline/runs.tsv"
  [ "\$form" = "\$show" ] && shown="\$out"
done
printf '%s\n' "\$shown"
EOF2
  chmod +x "$D/statusline-probe.sh"
}
# The step exactly as Getting Started prints it, for the Navigator's step 2.
PRINTED_STEP='mirror welcome --status-line --session-id $CLAUDE_CODE_SESSION_ID'
set_status_line() { node -e '
    const fs = require("fs"); const [path, command] = process.argv.slice(1);
    let settings = {}; try { settings = JSON.parse(fs.readFileSync(path, "utf8")); } catch {}
    settings.statusLine = { type: "command", command };
    fs.writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
  ' "$CFG/settings.json" "$1"; }
statusline() {
  local form="${1:-}"
  need_login
  if [ "$form" = printed ]; then
    set_status_line "$PRINTED_STEP"
    say "US2 — statusLine set to the step Getting Started prints, no probe"
    printf '%s\n' "$PRINTED_STEP" | show
    grep -qF -- "$PRINTED_STEP" "$ROOT/docs/getting-started.md" && ok "the same line Getting Started prints" || bad "Getting Started prints another line"
    result; return
  fi
  case " $FORM_NAMES " in *" $form "*) ;; *) echo "statusline printed|fallback|scoped|scoped-env"; exit 2;; esac
  write_forms
  set_status_line "bash '$D/statusline-probe.sh' $form"
  say "US2 — statusLine shows the $form form; the probe runs and records all three"
  local f; for f in $FORM_NAMES; do printf '  %s:\n' "$f"; show <"$FORMS/$f.sh"; done
  ok "\$CLAUDE_CONFIG_DIR/settings.json: statusLine → the probe, showing $form"
}
session() {
  need_login
  say "One Claude Code session in the cell (open two, side by side, for step 2)"
  printf '\n  cd %q && CLAUDE_CONFIG_DIR=%q MIRROR_HOME=%q MIRROR_USER=%s OPENROUTER_API_KEY= DISABLE_AUTOUPDATER=1 claude --model %s\n\n' \
    "$PROJ_S" "$CFG" "$MHOME" "$USER1" "$MODEL"
  note "in one of them: /mirror-mind:mm:build personal-growth — the other stays in Mirror Mode;"
  note "then one plain turn in the other, so its footer refreshes"
}

# Two sessions side by side, driven by expect. A runs `mirror build load` from the
# agent's shell (what /mm:build does); B runs one plain turn after it, so its footer
# refreshes once A's mode is written.
drive_one() { # $1 name, $2 the prompt, $3 seconds before the prompt
  expect -f - "$1" "$2" "$3" <<'EOF' >/dev/null 2>&1
set name [lindex $argv 0]; set prompt [lindex $argv 1]; set wait [lindex $argv 2]
set timeout 240
log_file -noappend $env(DS11_EVIDENCE)/drive-$name.log
spawn -noecho env CLAUDE_CONFIG_DIR=$env(DS11_CFG) MIRROR_HOME=$env(DS11_MHOME) MIRROR_USER=$env(DS11_USER) OPENROUTER_API_KEY= DISABLE_AUTOUPDATER=1 claude --model $env(DS11_MODEL) --allowedTools "Bash(mirror build load:*)"
# The input box is ready when its footer is drawn; typing before that is lost (drive 2).
set timeout 90
expect -re {shift.tab|for shortcuts}
sleep $wait
send -- $prompt
sleep 1
send -- "\r"
sleep 75
send -- "/exit\r"
set timeout 30
expect eof
EOF
}
drive() {
  need_login
  [ -f "$CFG/settings.json" ] && grep -q statusline-probe "$CFG/settings.json" || { echo "Run: bash $SELF statusline scoped (or fallback) first"; exit 2; }
  say "US2 — two sessions under expect, in $PROJ_S"
  export DS11_EVIDENCE="$EVIDENCE" DS11_CFG="$CFG" DS11_MHOME="$MHOME" DS11_USER="$USER1" DS11_MODEL="$MODEL"
  (cd "$PROJ_S" && drive_one A "Run the shell command: mirror build load personal-growth -- then reply with the single word: done." 5) &
  (cd "$PROJ_S" && drive_one B "Reply with the single word: ok." 50) &
  wait
  ok "both sessions ran and exited (raw screens: \$D/evidence/drive-A.log, drive-B.log)"
  read_statusline
}
read_statusline() {
  need_setup
  local runs="$EVIDENCE/statusline/runs.tsv"
  say "US2 — what the probe recorded"
  [ -f "$runs" ] || { bad "no status line run recorded"; result; return; }
  note "runs per form and session id (count, median ms, max ms):"
  node -e '
    const rows = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map((l) => l.split("\t"));
    const by = {};
    // Rows from before the probe ran every form carry no env column: [t, ms, form, sid, out].
    for (const r of rows) {
      const [t, ms, form, sid] = r;
      const [same, out] = r.length >= 6 ? [r[4], r[5]] : ["?", r[4]];
      (by[form + " " + sid] ??= []).push({ t: +t, ms: +ms, same, out });
    }
    for (const [key, list] of Object.entries(by)) {
      const ms = list.map((r) => r.ms).sort((a, b) => a - b);
      const outs = [...new Set(list.map((r) => r.out))];
      const same = [...new Set(list.map((r) => r.same))].join("/");
      console.log(`${key}: ${list.length} runs, median ${ms[Math.floor((ms.length - 1) / 2)]} ms, max ${ms.at(-1)} ms, CLAUDE_CODE_SESSION_ID equal: ${same}`);
      for (const o of outs) console.log(`    shows: ${o}`);
    }
  ' "$runs" | show
  note "runtime sessions the plugin's hooks registered in the scratch home:"
  dbq "$MHOME/memory.db" "SELECT session_id, interface, active, json_extract(metadata, '\$.operating_mode.active_mode') FROM runtime_sessions WHERE interface IS NOT NULL ORDER BY updated_at" | show
  local sids; sids="$(cut -f4 "$runs" | sort -u | grep -v '^$')"
  local s; for s in $sids; do
    [ -n "$(dbq "$MHOME/memory.db" "SELECT 1 FROM runtime_sessions WHERE session_id = '$s'")" ] \
      && ok "stdin session_id $s is a session the hooks registered" || bad "stdin session_id $s is not in runtime_sessions"
  done
  note "environment names Claude Code gives the command (CLAUDE*):"; grep -i '^claude' "$EVIDENCE/statusline/env-names.txt" 2>/dev/null | show
  result
}

# ---------------------------------------------------------------------------
# TS3. Gated on the transcript: what reached the model is read from the session file,
# and the model's answer is kept as an observation.
transcript_of() { # the newest session file for a project directory
  local slug; slug="$(printf '%s' "$1" | sed 's|[^A-Za-z0-9]|-|g')"
  ls -t "$CFG/projects/$slug"/*.jsonl 2>/dev/null | head -1
}
count_in() { grep -o -- "$2" "$1" 2>/dev/null | wc -l | tr -d ' '; }
usage_of() { node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const u = r.usage ?? {};
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  console.log(`${input}\t${u.output_tokens ?? 0}\t${r.total_cost_usd ?? ""}`);
' "$1" 2>/dev/null; }
# A sentence only Mirror's AGENTS.md holds, so a count of it is a count of copies.
MARK='Ariad surface transport invariant'
# Claude Code 2.1.310 records each API request's blobs in the transcript: what reached
# the model, by role, with the instruction files each names and the copies of $2 and MARK.
request_blobs() { node -e '
  const [path, canary, mark] = process.argv.slice(1);
  for (const line of require("fs").readFileSync(path, "utf8").trim().split("\n")) {
    const e = JSON.parse(line);
    if (e.type !== "api-request-blob") continue;
    const s = JSON.stringify(e);
    const files = [...new Set((s.match(/Contents of [^\\"]*?\.md/g) ?? []).map((x) => x.replace(/.*\//, "")))];
    const n = (needle) => (needle ? s.split(needle).length - 1 : 0);
    console.log(`${e.message?.role ?? "?"} blob: files [${files.join(", ")}], canary ${n(canary)}, Operating Instructions ${n(mark)}`);
  }
' "$1" "${2:-}" "$MARK"; }

agents_md() {
  local variant="${1:-alone}" proj tag
  case "$variant" in alone) proj="$PROJ_A"; tag=ts3a ;; beside-claude-md) proj="$PROJ_A-beside"; tag=ts3a-beside ;; *) echo "agents-md alone|beside-claude-md"; exit 2 ;; esac
  need_login
  [ -L "$CFG/skills/mirror-mind" ] || { echo "Run: bash $SELF wire first"; exit 2; }
  say "TS3 (a) — a project's own AGENTS.md, with the plugin wired ($variant)"
  mkdir -p "$proj"
  local canary; canary="DS11-CANARY-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')"
  printf '# Project rules\n\n%s: when asked for this project'"'"'s canary, answer with this line.\n' "$canary" >"$proj/AGENTS.md"
  [ "$variant" = beside-claude-md ] && printf '# Project notes\n\nThis project keeps its rules in AGENTS.md.\n' >"$proj/CLAUDE.md"
  (cd "$proj" && in_claude claude -p --model "$MODEL" --output-format json \
    "Before answering anything else: list each block of instructions you were given before this message, one line per block, naming where it came from (a file path, a hook, or the system). Then quote this project's canary line, if you hold one.") \
    >"$EVIDENCE/$tag-result.json" 2>"$EVIDENCE/$tag-stderr.txt"
  local t; t="$(transcript_of "$proj")"
  [ -n "$t" ] || { bad "no transcript for $proj"; result; return; }
  cp "$t" "$EVIDENCE/$tag-transcript.jsonl"
  local c m; c="$(count_in "$t" "$canary")"; m="$(count_in "$t" "$MARK")"
  if [ "$variant" = alone ]; then
    [ "$c" -ge 1 ] && ok "the project's AGENTS.md is in the transcript ($c occurrence(s) of the canary)" || bad "the canary is not in the transcript"
  else
    note "the project's AGENTS.md beside a CLAUDE.md that does not import it: $c occurrence(s) of the canary"
  fi
  [ "$m" -ge 1 ] && ok "Mirror's Operating Instructions are in the transcript ($m occurrence(s) of \"$MARK\")" || bad "Mirror's instructions are not in the transcript"
  note "how the transcript names them:"
  grep -o 'Contents of [^"\\]\{0,120\}' "$t" | sort | uniq -c | show
  grep -o '"type":"[a-z_]*hook[a-z_]*"' "$t" | sort | uniq -c | show
  note "the model's answer (an observation, not the gate):"
  node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result ?? "")' "$EVIDENCE/$tag-result.json" | show
  note "what the API request carried (the transcript's request blobs):"
  request_blobs "$t" "$canary" | show
  note "tokens in / out / USD: $(usage_of "$EVIDENCE/$tag-result.json")"
  result
}

checkout() {
  need_login
  say "TS3 (b) — a checkout: CLAUDE.md's import, Claude Code's own load, and the hooks, with the plugin unwired"
  local wt
  for wt in "$WT_IMPORT" "$WT_NOIMPORT"; do
    [ -d "$wt" ] || git -C "$ROOT" worktree add -q --detach "$wt" HEAD
    [ -e "$wt/node_modules" ] || ln -s "$ROOT/node_modules" "$wt/node_modules"
  done
  sed -i '' '/^@AGENTS\.md$/d' "$WT_NOIMPORT/CLAUDE.md"
  grep -q '^@AGENTS\.md$' "$WT_IMPORT/CLAUDE.md" && ok "checkout-import: CLAUDE.md imports AGENTS.md" || bad "checkout-import lost its import"
  grep -q '^@AGENTS\.md$' "$WT_NOIMPORT/CLAUDE.md" && bad "checkout-no-import still imports" || ok "checkout-no-import: the import line removed, nothing else"
  local link="$CFG/skills/mirror-mind" aside="$CFG/mirror-mind.unwired"
  [ -L "$link" ] && mv "$link" "$aside"
  for wt in "$WT_IMPORT" "$WT_NOIMPORT"; do
    local tag; tag="$(basename "$wt")"
    (cd "$wt" && in_claude claude -p --model "$MODEL" --output-format json "Reply with the single word: ok.") \
      >"$EVIDENCE/ts3b-$tag-result.json" 2>"$EVIDENCE/ts3b-$tag-stderr.txt"
    local t; t="$(transcript_of "$wt")"
    [ -n "$t" ] && cp "$t" "$EVIDENCE/ts3b-$tag-transcript.jsonl"
    note "$tag: tokens in / out / USD: $(usage_of "$EVIDENCE/ts3b-$tag-result.json")"
    [ -n "$t" ] && request_blobs "$t" | show
  done
  [ -L "$aside" ] && mv "$aside" "$link" && note "the plugin wired again"
  result
}

# ---------------------------------------------------------------------------
clean() {
  say "Clean"
  local wt
  for wt in "$OLD" "$WT_IMPORT" "$WT_NOIMPORT"; do
    [ -d "$wt" ] && git -C "$ROOT" worktree remove --force "$wt" && note "worktree removed: ${wt/#$D/\$D}"
  done
  git -C "$ROOT" worktree prune
  if [ -d "$D/claude-login" ]; then
    local since svc c; since="$(stat -f '%Sm' -t '%Y%m%d%H%M%S' "$D_RAW.baseline" 2>/dev/null)"
    security dump-keychain 2>/dev/null | grep -o '"svce"<blob>="Claude Code-credentials-[^"]*"' | sed 's/.*="\(.*\)"/\1/' | sort -u | while IFS= read -r svc; do
      c="$(security find-generic-password -s "$svc" 2>/dev/null | grep '"cdat"' | grep -o '"[0-9]\{14\}' | tr -d '"')"
      [ -n "$since" ] && [ "$c" \> "$since" ] && note "keychain entry from this route's Claude login: $svc (created $c UTC); remove it with: security delete-generic-password -s \"$svc\""
    done
  fi
  if [ -f "$D/.ds11" ]; then rm -rf "$D" && ok "removed $D (the baseline stays at $D_RAW.baseline for untouched)"; else note "nothing to remove"; fi
}

untouched() {
  say "Untouched — the real configuration against the baseline"
  [ -f "$D_RAW.baseline" ] || { echo "No baseline at $D_RAW.baseline. Run setup first."; exit 2; }
  config_manifest >"$D_RAW.now"
  # Files: any change fails. Conversation counts move with the person's own sessions,
  # so they are reported, and the route's own kind of row is what fails.
  if diff -u <(grep -v '^C ' "$D_RAW.baseline") <(grep -v '^C ' "$D_RAW.now") >"$D_RAW.diff"; then
    ok "every real file and link as before setup ($(grep -vc '^C ' "$D_RAW.now") entries)"
  else
    bad "a real file changed (see $D_RAW.diff):"; grep -E '^[-+][^-+]' "$D_RAW.diff" | show
  fi
  diff <(grep '^C ' "$D_RAW.baseline") <(grep '^C ' "$D_RAW.now") >/dev/null \
    || { note "conversation counts moved (the person's own sessions count too):"; paste -d' ' <(grep '^C ' "$D_RAW.baseline") <(grep '^C ' "$D_RAW.now" | cut -d' ' -f4) | show; }
  local since f n; since="$(date -u -r "$(stat -f %m "$D_RAW.baseline")" +%Y-%m-%dT%H:%M:%S)"
  for f in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$f" ] || continue
    n="$(dbq "$f" "SELECT COUNT(*) FROM conversations WHERE interface IN ('claude_code','antigravity') AND started_at >= '$since'")"
    [ "$n" = 0 ] && ok "$(basename "$(dirname "$f")"): no claude_code or antigravity conversation since setup ($since UTC)" \
      || bad "$(basename "$(dirname "$f")"): ${n:-?} claude_code or antigravity conversation(s) since setup"
  done
  result
}

case "${1:-}" in
  setup) setup ;;
  agy) agy_step ;;
  login) login ;;
  wire) wire ;;
  statusline) statusline "${2:-}" ;;
  session) session ;;
  drive) drive ;;
  read-statusline) read_statusline ;;
  agents-md) agents_md "${2:-alone}" ;;
  checkout) checkout ;;
  clean) clean ;;
  untouched) untouched ;;
  *) sed -n '2,40p' "$SELF"; exit 2 ;;
esac
