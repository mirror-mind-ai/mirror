#!/usr/bin/env bash
# CV21.DS5.US3 — review-copy runs on every runtime, measured live.
#
# Derived from TS1's route. Every step is isolated under a scratch directory
# (DS5_US3_DIR, default /tmp/cv21-ds5-us3): the shipped package installed from the
# registry into a prefix whose path holds a space, one scratch Mirror home with
# review-copy (its real body) and hello (the authoring guide's command-skill), and one
# cell per runtime wired by nothing but the steps `mirror init` and `mirror extensions
# install` print. The real claude, codex, agy, and grok binaries run with a scratch
# HOME and each runtime's own home variable (CLAUDE_CONFIG_DIR, CODEX_HOME, GROK_HOME),
# from an empty project; the Claude cell keeps the real HOME with the route's
# logged-in config dir (TS1: the login is keyed to both). `untouched` READS the real
# configuration, to prove nothing reached it.
#
#   bash route.sh setup [registry|checkout]
#                                  the tarball (registry: mirror-mind@0.36.0, checked
#                                  against dist.integrity; checkout: npm pack here),
#                                  the prefix, mirror init + seed, the baseline
#   bash route.sh probe            versions, binaries, date; the readers; the stamp
#   bash route.sh install          review-copy and hello into the scratch Mirror home;
#                                  the plugin and the printed steps recorded
#   bash route.sh login <claude|codex|agy>
#                                  the Navigator's, once each, in scratch login dirs
#   bash route.sh trust codex      the Navigator's, once: open codex in the cell after
#                                  wire, accept the plugin's hooks, /exit
#   bash route.sh wire <rt>        negative read; the canonical plugin's printed steps;
#                                  the extensions plugin's printed step; the read
#   bash route.sh live <rt> <review-copy|hello> [tui]
#                                  one headless session (the Navigator's), the literal
#                                  invocation in the runtime's spelling; before-counts
#   bash route.sh verify <rt>      the reads: ledger, report, pings, interface, spend
#   bash route.sh static           the fixture through the checkout's mirror; the
#                                  classifier on two committed transcripts; the records
#   bash route.sh clean            stop what the route spawned, remove the scratch
#                                  directory and any login copied into it
#   bash route.sh untouched        the real configuration vs the baseline; the real
#                                  homes' conversation counts; new files in ~/Downloads
#
# Raw outputs stay under $D/evidence (never committed: they carry home paths); the
# summary each step prints is what test-guide.md records, with evidence/versions.tsv
# and evidence/table.tsv copied into the story package at the end.
set -u
export LC_NUMERIC=C LC_ALL=C

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS5_US3_DIR:-/tmp/cv21-ds5-us3}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"
USER1=us3user
PKG_VERSION="${DS5_US3_VERSION:-0.36.0}"
RUNTIMES="claude codex agy grok"
GROK_CAP_USD="${DS5_US3_GROK_CAP:-1.00}"
OPENROUTER_CAP_USD="${DS5_US3_OPENROUTER_CAP:-0.50}"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/pre fix"                       # a space on purpose (DS4.US1 decision 3)
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  PLUGIN="$PKG/plugins/mirror-mind"
  EVIDENCE="$D/evidence"
  PROJECT="$D/project"
  PERSON="$D/mirror-person"                 # the scratch HOME `mirror init` ran in
  MHOME="$PERSON/.mirror-minds/$USER1"      # the one scratch Mirror home every cell names
  EXT_PLUGIN="$MHOME/runtime/plugin/mirror-ext-$USER1"
  REPORTS="$D/reports"
}
resolve

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0
result() {
  say "Result"
  printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
}

# keep <name> <command...>: run, record the command, stdout+stderr, and the exit code.
# The key's value never reaches an evidence file (A8): it is masked on the way in.
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  { printf '$ %s\n' "$*"; "$@"; printf '\nexit %s\n' "$?"; } 2>&1 | mask_key >"$EVIDENCE/$name.out"
}
mask_key() { if [ -n "${KEY:-}" ]; then sed "s|$KEY|<OPENROUTER_API_KEY>|g"; else cat; fi; }
body_of() { sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/$1.out"; }
exit_of() { sed -n 's/^exit \([0-9]*\)$/\1/p' "$EVIDENCE/$1.out" | tail -1; }
row() { mkdir -p "$EVIDENCE"; printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$EVIDENCE/table.tsv"; look "$2 · $3: $4"; }

# ---------------------------------------------------------------------------
# The key (A8): from the environment or the Navigator's configuration file, held in a
# variable, passed into each cell, written nowhere.
KEY="${OPENROUTER_API_KEY:-}"
[ -n "$KEY" ] || KEY="$(sed -n 's/^OPENROUTER_API_KEY=//p' "$REAL_HOME/.config/mirror/env" 2>/dev/null | head -1 | tr -d '"'"'"' ')"
need_key() { [ -n "$KEY" ] || { echo "no OPENROUTER_API_KEY in the environment or ~/.config/mirror/env; the review-copy sessions need one"; exit 2; }; }

# ---------------------------------------------------------------------------
# Versions: the evidence rule's stamp, taken by probe and re-read by every step.
versions_now() {
  printf 'claude\t%s\t%s\n' "$(claude --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v claude 2>/dev/null)" 2>/dev/null)"
  printf 'codex\t%s\t%s\n' "$(codex --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v codex 2>/dev/null)" 2>/dev/null)"
  printf 'agy\t%s\t%s\n' "$(agy --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v agy 2>/dev/null)" 2>/dev/null)"
  printf 'grok\t%s\t%s\n' "$(grok --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v grok 2>/dev/null)" 2>/dev/null)"
}
installed_version() { node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json" 2>/dev/null; }
need_install() { [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }; }
need_probe() {
  need_install
  [ -f "$EVIDENCE/versions.tsv" ] || { echo "Run probe first: bash $SELF probe"; exit 2; }
  if ! diff -q <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) >/dev/null; then
    echo "a runtime changed version since the probe; re-run probe:"
    diff <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) | sed 's/^/  /'
    exit 2
  fi
  local stamped; stamped="$(sed -n 's/^version\t//p' "$EVIDENCE/setup.tsv" 2>/dev/null)"
  [ "$(installed_version)" = "$stamped" ] || { echo "the installed package ($(installed_version)) is not the one setup stamped ($stamped); re-run setup"; exit 2; }
}
evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  versions_now | while IFS=$'\t' read -r rt ver bin; do look "$rt: ${ver:-not on the PATH} — $bin"; done
  look "package: mirror-mind $(installed_version) ($(sed -n 's/^mode\t//p' "$EVIDENCE/setup.tsv" 2>/dev/null))"
}

# ---------------------------------------------------------------------------
# Cells. One per runtime, each with every root a runtime uses, the scratch install
# first on the PATH, the one scratch Mirror home named, the key passed in.
cell() { echo "$D/cell-$1"; }
fresh_home() {
  local home="$1"
  rm -rf "$home"
  mkdir -p "$home/.claude" "$home/.agents" "$home/.gemini/config" "$home/.grok/rules" "$home/.codex" "$home/.config" "$home/Downloads"
  chmod 700 "$home"
}
CLAUDE_LOGIN_DIR="$D/claude-login/.claude"
CODEX_LOGIN_DIR="$D/codex-login/.codex"
AGY_LOGIN_HOME="$D/agy-login"
# The Mirror-facing environment every cell shares (unlike TS1's cells, which unset it:
# here the hooks and `mirror consult` must reach the scratch home and nothing else).
# (The prefix path holds a space, so the variables are set inline, never through an
# unquoted substitution that would split it.)
in_home() { # a scratch HOME and every runtime home under it
  local home="$1"; shift
  (cd "$PROJECT" && env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS \
    HOME="$home" CLAUDE_CONFIG_DIR="$home/.claude" CODEX_HOME="$home/.codex" GROK_HOME="$home/.grok" \
    MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" OPENROUTER_API_KEY="$KEY" DISABLE_AUTOUPDATER=1 \
    PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
in_home_claude_login() { # the real HOME, the route's logged-in config dir (TS1's finding)
  (cd "$PROJECT" && env -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u CODEX_HOME -u GROK_HOME \
    CLAUDE_CONFIG_DIR="$CLAUDE_LOGIN_DIR" \
    MIRROR_HOME="$MHOME" MIRROR_USER="$USER1" OPENROUTER_API_KEY="$KEY" DISABLE_AUTOUPDATER=1 \
    PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
in_cell() { # $1 rt, then the command
  local rt="$1"; shift
  if [ "$rt" = claude ] && [ -d "$CLAUDE_LOGIN_DIR" ]; then in_home_claude_login "$@"; else in_home "$(cell "$rt")" "$@"; fi
}
claude_skills_dir() { if [ -d "$CLAUDE_LOGIN_DIR" ]; then echo "$CLAUDE_LOGIN_DIR/skills"; else echo "$(cell claude)/.claude/skills"; fi; }
as_scratch_mirror() { in_home "$PERSON" mirror "$@"; }

# ---------------------------------------------------------------------------
# Readers: what each runtime lists, from its own output. Each prints one line per
# skill asked: "<runtime>: <skill> listed (<how>)" or "<runtime>: <skill> not listed".
write_readers() {
  cp "$HERE/turn.cjs" "$D/turn.cjs"
  cat >"$D/readers.cjs" <<'EOF'
const fs = require("fs");
const [kind, file, skill] = process.argv.slice(2);
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const out = (s) => { console.log(s); process.exit(0); };
const re = new RegExp("(^|:)" + skill + "$");
if (kind === "grok-inspect") {
  let j; try { j = JSON.parse(text); } catch { out(`grok: ${skill} inspect not JSON`); }
  const skills = (j.skills || []).filter((s) => re.test(s.name));
  const srcs = skills.map((s) => (s.source ? s.source.type + (s.source.plugin_name ? ":" + s.source.plugin_name : "") : "?"));
  out(`grok: ${skill} ${skills.length ? "listed (" + srcs.join(" | ") + ")" : "not listed"}`);
}
if (kind === "codex-prompt") {
  const n = (text.match(new RegExp(skill, "g")) || []).length;
  const names = (text.match(new RegExp("[$a-z0-9:-]*" + skill, "g")) || []).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2);
  out(`codex: ${skill} ${n ? "listed (" + n + " mentions: " + names.join(" | ") + ")" : "not listed"}`);
}
if (kind === "claude-plugins") {
  const names = (text.match(/mirror-ext-[a-z0-9]+|mirror-mind/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  out(`claude: plugins [${names.join(", ")}]`);
}
EOF
}
read_grok() { # $1 tag, $2 skill
  keep "$1-grok-inspect" in_cell grok grok inspect --json
  body_of "$1-grok-inspect" >"$EVIDENCE/$1-grok-inspect.json"
  node "$D/readers.cjs" grok-inspect "$EVIDENCE/$1-grok-inspect.json" "$2"
}
read_codex() { # $1 tag, $2 skill
  [ -f "$EVIDENCE/$1-codex-prompt.out" ] || keep "$1-codex-prompt" in_cell codex codex debug prompt-input hello
  node "$D/readers.cjs" codex-prompt "$EVIDENCE/$1-codex-prompt.out" "$2"
}
read_agy() { # $1 tag, $2 skill: the staged plugin trees (agy's static reader for a plugin)
  local H; H="$(cell agy)"
  local staged; staged="$(find "$H/.gemini/config/plugins" -path "*/skills/$2/SKILL.md" 2>/dev/null | sed "s|^$H/|~/|" | tr '\n' ' ')"
  [ -f "$EVIDENCE/$1-agy-plugin-list.out" ] || keep "$1-agy-plugin-list" in_cell agy agy plugin list --json
  if [ -n "$staged" ]; then echo "agy: $2 listed (staged: $staged)"; else echo "agy: $2 not listed (no staged $2)"; fi
}
read_claude() { # $1 tag, $2 skill: the skills dir Claude reads (a link, read in place) and plugin list
  local dir; dir="$(claude_skills_dir)"
  local found; found="$(find "$dir" -maxdepth 3 -path "*/$2/SKILL.md" 2>/dev/null | head -1)"
  [ -f "$EVIDENCE/$1-claude-plugin-list.out" ] || keep "$1-claude-plugin-list" in_cell claude claude plugin list
  if [ -n "$found" ]; then echo "claude: $2 listed (under $(echo "$found" | sed "s|^$D/|\$D/|; s|^$REAL_HOME/|~/|"); reader model)"; else echo "claude: $2 not listed (reader model)"; fi
}
read_skill() { # $1 rt, $2 tag, $3 skill
  case "$1" in grok) read_grok "$2" "$3" ;; codex) read_codex "$2" "$3" ;; agy) read_agy "$2" "$3" ;; claude) read_claude "$2" "$3" ;; esac
}

# ---------------------------------------------------------------------------
# The scratch home's database, read directly (sqlite3 when present, node:sqlite else).
dbq() { # $1 db path, $2 sql -> one value or rows
  if command -v sqlite3 >/dev/null 2>&1; then sqlite3 "$1" "$2" 2>/dev/null
  else node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1],{readOnly:true});for(const r of db.prepare(process.argv[2]).all())console.log(Object.values(r).join("|"));db.close()' "$1" "$2" 2>/dev/null; fi
}
MDB() { echo "$MHOME/memory.db"; }
count_calls() { dbq "$(MDB)" "SELECT COUNT(*) FROM llm_calls WHERE role='consult'"; }
count_pings() { dbq "$(MDB)" "SELECT COUNT(*) FROM ext_hello_pings" 2>/dev/null || echo 0; }
count_conv() { dbq "$(MDB)" "SELECT COUNT(*) FROM conversations WHERE interface='$1'"; }
spend_openrouter() { dbq "$(MDB)" "SELECT printf('%.4f', COALESCE(SUM(cost_usd),0)) FROM llm_calls WHERE role='consult'"; }
spend_grok() { cat "$EVIDENCE"/live-grok-*.out 2>/dev/null | grep -o '"total_cost_usd":[0-9.]*' | sed 's/.*://' | awk '{s+=$1} END {printf "%.4f", s}'; }
interface_of() { case "$1" in claude) echo claude_code ;; codex) echo codex ;; agy) echo antigravity ;; grok) echo grok_build ;; esac; }

# ---------------------------------------------------------------------------
# The real configuration this route promises not to touch (TS1's set, plus the two
# real homes' conversation counts, A9).
REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/skills .claude/plugins .claude.json
  .codex/config.toml .codex/plugins .codex/skills
  .agents/skills .agents/plugins
  .gemini/config/plugins .gemini/config/skills .gemini/config/import_manifest.json .gemini/settings.json
  .grok/config.toml .grok/settings.json .grok/hooks .grok/skills .grok/plugins .grok/rules
  .grok/installed-plugins .grok/marketplace-cache
  .mirror-minds/vinicius/extensions .mirror-minds/vinicius/runtime
  .mirror-minds/vinicius-dev/extensions .mirror-minds/vinicius-dev/runtime
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
      find "$path" -maxdepth 4 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else
      printf -- "- %s absent\n" "$rel"
    fi
  done
  local home; for home in vinicius vinicius-dev; do
    printf 'C %s conversations %s\n' "$home" "$(dbq "$REAL_HOME/.mirror-minds/$home/memory.db" 'SELECT COUNT(*) FROM conversations')"
  done
}

# ---------------------------------------------------------------------------
setup() {
  local mode="${1:-registry}"
  say "Setup — the shipped package ($mode), the scratch Mirror home, the baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds5-us3" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds5-us3" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT" "$PERSON" "$REPORTS"
  config_manifest >"$D_RAW.baseline"
  ok "real configuration recorded: $(wc -l <"$D_RAW.baseline" | tr -d ' ') entries (auth.json, logs, memory.db outside the set by design; the two homes' conversation counts in)"
  local TARBALL
  case "$mode" in
    registry)
      TARBALL="$(cd "$D" && npm pack "mirror-mind@$PKG_VERSION" --pack-destination "$D" 2>/dev/null | tail -1)"
      [ -f "$D/$TARBALL" ] && ok "packed from the registry: $TARBALL" || { bad "npm pack mirror-mind@$PKG_VERSION produced nothing"; result; return; }
      local want have; want="$(npm view "mirror-mind@$PKG_VERSION" dist.integrity 2>/dev/null)"
      have="sha512-$(openssl dgst -sha512 -binary "$D/$TARBALL" | base64)"
      [ -n "$want" ] && [ "$want" = "$have" ] && ok "tarball integrity matches the registry's dist.integrity (A8)" || bad "tarball integrity: registry '$want' vs packed '$have'" ;;
    checkout)
      TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
      [ -f "$D/$TARBALL" ] && ok "packed the checkout: $TARBALL (not the shipped package; the record says so)" || { bad "npm pack produced nothing"; result; return; } ;;
    *) echo "setup registry|checkout"; exit 2 ;;
  esac
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into a prefix whose path holds a space: mirror-mind $(installed_version)" \
    || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; result; return; }
  printf 'mode\t%s\nversion\t%s\ntarball\t%s\n' "$mode" "$(installed_version)" "$TARBALL" >"$EVIDENCE/setup.tsv"
  keep mirror-init in_home "$PERSON" mirror init "$USER1"
  [ -d "$MHOME" ] && ok "mirror init $USER1: the scratch Mirror home at \$D/mirror-person/.mirror-minds/$USER1" || { bad "init made no home"; tail -3 "$EVIDENCE/mirror-init.out" | show; result; return; }
  grep -A2 '^Claude Code:\|^Codex:\|^Antigravity:\|^Grok Build:' "$EVIDENCE/mirror-init.out" | grep -v '^--' | sed "s|$PKG|<pkg>|g; s|$PERSON|~|g" >"$EVIDENCE/init-steps.txt"
  ok "the canonical plugin's steps, as init printed them ($(grep -c . "$EVIDENCE/init-steps.txt") lines) — in evidence/init-steps.txt"
  keep mirror-seed in_home "$PERSON" mirror seed
  [ "$(exit_of mirror-seed)" = 0 ] && ok "mirror seed: identity in the scratch home (the hooks load it)" || note "mirror seed exit $(exit_of mirror-seed) (see mirror-seed.out)"
  cp "$HERE/fixtures/copy.txt" "$D/copy.txt"
  write_readers
  ok "fixture copy at \$D/copy.txt; turn.cjs and readers.cjs in place"
  need_key && ok "OPENROUTER_API_KEY found (held in the route's process, written nowhere)"
  result
}

# ---------------------------------------------------------------------------
probe() {
  say "Probe — versions, readers, the stamp (plan.md step 2)"
  need_install
  [ "$(installed_version)" = "$(sed -n 's/^version\t//p' "$EVIDENCE/setup.tsv")" ] && ok "installed package is the stamped one ($(installed_version), $(sed -n 's/^mode\t//p' "$EVIDENCE/setup.tsv"))" || bad "installed package differs from the stamp"
  evidence_header
  versions_now >"$EVIDENCE/versions.tsv"
  local rt; for rt in $RUNTIMES; do command -v "$rt" >/dev/null 2>&1 && ok "$rt on the PATH" || bad "$rt not on the PATH"; done
  write_readers
  for rt in $RUNTIMES; do fresh_home "$(cell "$rt")"; done
  say "The readers, each on an empty cell"
  look "grok: grok inspect --json";            read_grok probe ext-review-copy | show
  look "codex: codex debug prompt-input";      read_codex probe ext-review-copy | show
  look "claude: claude plugin list + the skills dir"; read_claude probe ext-review-copy | show
  look "agy: agy plugin list --json + staged plugins"; read_agy probe ext-review-copy | show
  say "The session-logging reader: conversations.interface the hooks write"
  for rt in $RUNTIMES; do look "$rt: interface=$(interface_of "$rt") (DS7 for antigravity closes at the next start; the others at session end)"; done
  look "scratch ledger: llm_calls role=consult; pings: ext_hello_pings"
  result
}

# ---------------------------------------------------------------------------
install_exts() {
  say "Install — review-copy (its real body) and hello into the scratch Mirror home (plan.md step 3)"
  need_probe
  keep ext-install-review-copy as_scratch_mirror extensions install review-copy --extensions-root "$ROOT/examples/extensions"
  [ "$(exit_of ext-install-review-copy)" = 0 ] && ok "review-copy installed" || { bad "review-copy install failed"; tail -3 "$EVIDENCE/ext-install-review-copy.out" | show; }
  keep ext-install-hello as_scratch_mirror extensions install hello --extensions-root "$HERE/fixtures"
  [ "$(exit_of ext-install-hello)" = 0 ] && ok "hello installed (the authoring guide's listings, through the shipped package)" || { bad "hello install failed"; tail -3 "$EVIDENCE/ext-install-hello.out" | show; }
  grep -E 'plugin:|not wired|then codex' "$EVIDENCE/ext-install-hello.out" | sed "s|$MHOME|<home>|g" | tee "$EVIDENCE/install-steps.txt" | show
  grep -q 'plugin: mirror-ext-us3user 0.1.2, 2 skills' "$EVIDENCE/ext-install-hello.out" && ok "the plugin at generation 2 with two skills" || bad "expected 'plugin: mirror-ext-$USER1 0.1.2, 2 skills'"
  [ -f "$EXT_PLUGIN/skills/ext-review-copy/SKILL.md" ] && [ -f "$EXT_PLUGIN/skills/ext-hello/SKILL.md" ] && ok "both skills in \$D/…/runtime/plugin/mirror-ext-$USER1/skills/" || bad "a skill is missing from the plugin"
  grep -q 'mirror consult' "$EXT_PLUGIN/skills/ext-review-copy/SKILL.md" && ok "review-copy's real body is in the plugin (names mirror consult)" || bad "the plugin's review-copy is not the real body"
  as_scratch_mirror ext hello list >/dev/null 2>&1 && ok "ext hello list answers through the scratch home (migrations applied)" || bad "ext hello list failed"
  result
}

# ---------------------------------------------------------------------------
login() {
  local rt="${1:-}"
  need_install
  case "$rt" in
    claude) mkdir -p "$CLAUDE_LOGIN_DIR" && chmod 700 "$D/claude-login"
            say "Claude Code login in the route's scratch config dir ($CLAUDE_LOGIN_DIR)"
            note "run /login, then /exit. Nothing of yours loads here. clean removes the directory and names the keychain entry."
            (cd "$PROJECT" && env -u CODEX_HOME -u GROK_HOME CLAUDE_CONFIG_DIR="$CLAUDE_LOGIN_DIR" DISABLE_AUTOUPDATER=1 claude) ;;
    codex) mkdir -p "$CODEX_LOGIN_DIR" && chmod 700 "$D/codex-login"
           say "Codex login in the route's scratch CODEX_HOME ($CODEX_LOGIN_DIR)"
           note "the browser login writes auth.json there; each turn borrows it into the cell and removes it. clean removes the directory."
           (cd "$PROJECT" && env -u CLAUDE_CONFIG_DIR -u GROK_HOME CODEX_HOME="$CODEX_LOGIN_DIR" codex login) ;;
    agy) mkdir -p "$AGY_LOGIN_HOME/.gemini" && chmod 700 "$AGY_LOGIN_HOME"
         say "agy login in the route's scratch HOME ($AGY_LOGIN_HOME)"
         note "open the auth URL, approve, paste the code at agy's prompt. Each turn borrows the token (1.4.2: antigravity-cli/antigravity-oauth-token) into the cell and removes it."
         (cd "$PROJECT" && env -u CLAUDE_CONFIG_DIR -u CODEX_HOME -u GROK_HOME HOME="$AGY_LOGIN_HOME" agy --print "Reply with the single word: ready.") ;;
    *) echo "login claude|codex|agy (Grok reads auth.json in place)"; exit 2 ;;
  esac
}
trust() { # Codex asks once, at the next session, to trust the plugin's hooks (init's note)
  [ "${1:-}" = codex ] || { echo "trust codex"; exit 2; }
  need_probe
  local H; H="$(cell codex)"
  [ -f "$CODEX_LOGIN_DIR/auth.json" ] && cp "$CODEX_LOGIN_DIR/auth.json" "$H/.codex/auth.json" || note "no scratch Codex login yet (bash route.sh login codex)"
  say "Codex, interactive, in the wired cell: accept the plugin's hooks when asked, then /exit"
  note "the acceptance is recorded in the cell's CODEX_HOME, so the headless sessions after it run the hooks"
  in_home "$H" codex
  rm -f "$H/.codex/auth.json"
}

# ---------------------------------------------------------------------------
# Wire: the canonical plugin's steps as init printed them, then the extensions
# plugin's step as the install printed it. Nothing else. (plan.md step 4)
wire() {
  local rt="${1:-}"; [ -n "$rt" ] || { echo "wire claude|codex|agy|grok"; exit 2; }
  need_probe
  local H tag="wire-$rt"; H="$(cell "$rt")"
  [ -d "$H" ] || fresh_home "$H"
  say "wire — $rt"
  look "negative read:"; { read_skill "$rt" "$tag-before" ext-review-copy; read_skill "$rt" "$tag-before" ext-hello; } | tee "$EVIDENCE/$tag-before.txt" | show
  if grep -qE ': ext-[a-z-]+ listed' "$EVIDENCE/$tag-before.txt"; then note "already listed: wire ran before; stopping (idempotent)"; result; return; fi
  look "the canonical plugin, as init printed:"; grep -A3 "^$(case "$rt" in claude) echo 'Claude Code';; codex) echo Codex;; agy) echo Antigravity;; grok) echo 'Grok Build';; esac):" "$EVIDENCE/init-steps.txt" | show
  case "$rt" in
    claude) # `~/.claude/skills` is CLAUDE_CONFIG_DIR/skills: this cell keeps the real HOME (the login), so the step lands in the route's config dir, never the real ~/.claude
            local SK; SK="$(claude_skills_dir)"; mkdir -p "$SK"
            ln -sfn "$PLUGIN" "$SK/mirror-mind"; ok "ln -s <pkg>/plugins/mirror-mind \$CLAUDE_CONFIG_DIR/skills/mirror-mind (the step's ~/.claude, resolved to the cell's config dir)"
            keep "$tag-claude-details" in_cell claude claude plugin list ;;
    codex) keep "$tag-codex-mp-add" in_cell codex codex plugin marketplace add "$PKG"
           keep "$tag-codex-add" in_cell codex codex plugin add mirror-mind@mirror-mind
           [ "$(exit_of "$tag-codex-add")" = 0 ] && ok "codex plugin marketplace add <pkg>; codex plugin add mirror-mind@mirror-mind" || { bad "codex plugin add mirror-mind: exit $(exit_of "$tag-codex-add")"; tail -3 "$EVIDENCE/$tag-codex-add.out" | show; } ;;
    agy) keep "$tag-agy-install" in_cell agy agy plugin install "$PLUGIN"
         [ "$(exit_of "$tag-agy-install")" = 0 ] && ok "agy plugin install <pkg>/plugins/mirror-mind" || { bad "agy plugin install: exit $(exit_of "$tag-agy-install")"; tail -3 "$EVIDENCE/$tag-agy-install.out" | show; } ;;
    grok) keep "$tag-grok-install" in_cell grok grok plugin install "$PLUGIN" --trust
          [ "$(exit_of "$tag-grok-install")" = 0 ] && ok "grok plugin install <pkg>/plugins/mirror-mind --trust" || { bad "grok plugin install: exit $(exit_of "$tag-grok-install")"; tail -3 "$EVIDENCE/$tag-grok-install.out" | show; }
          ln -sfn "$PKG/AGENTS.md" "$H/.grok/rules/mirror-mind.md"; ok "ln -s <pkg>/AGENTS.md ~/.grok/rules/mirror-mind.md" ;;
  esac
  look "the extensions plugin, as the install printed:"; grep -A1 "$(case "$rt" in claude) echo 'Claude Code';; codex) echo Codex;; agy) echo Antigravity;; grok) echo 'Grok Build';; esac): not wired" "$EVIDENCE/install-steps.txt" | show
  case "$rt" in
    claude) local SK; SK="$(claude_skills_dir)"; mkdir -p "$SK"; ln -sfn "$EXT_PLUGIN" "$SK/mirror-ext-$USER1"; ok "ln -s <home>/runtime/plugin/mirror-ext-$USER1 \$CLAUDE_CONFIG_DIR/skills/mirror-ext-$USER1" ;;
    codex) keep "$tag-codex-ext-mp" in_cell codex codex plugin marketplace add "$MHOME/runtime/plugin"
           keep "$tag-codex-ext-add" in_cell codex codex plugin add "mirror-ext-$USER1@mirror-ext-$USER1"
           [ "$(exit_of "$tag-codex-ext-add")" = 0 ] && ok "codex plugin marketplace add <home>/runtime/plugin; codex plugin add mirror-ext-$USER1@mirror-ext-$USER1" || { bad "codex plugin add mirror-ext: exit $(exit_of "$tag-codex-ext-add")"; tail -3 "$EVIDENCE/$tag-codex-ext-add.out" | show; } ;;
    agy) keep "$tag-agy-ext" in_cell agy agy plugin install "$EXT_PLUGIN"
         [ "$(exit_of "$tag-agy-ext")" = 0 ] && ok "agy plugin install <home>/runtime/plugin/mirror-ext-$USER1" || { bad "agy plugin install mirror-ext: exit $(exit_of "$tag-agy-ext")"; tail -3 "$EVIDENCE/$tag-agy-ext.out" | show; } ;;
    grok) keep "$tag-grok-ext" in_cell grok grok plugin install "$EXT_PLUGIN" --trust
          [ "$(exit_of "$tag-grok-ext")" = 0 ] && ok "grok plugin install <home>/runtime/plugin/mirror-ext-$USER1 --trust" || { bad "grok plugin install mirror-ext: exit $(exit_of "$tag-grok-ext")"; tail -3 "$EVIDENCE/$tag-grok-ext.out" | show; } ;;
  esac
  rm -f "$EVIDENCE/$tag-codex-prompt.out" "$EVIDENCE/$tag-agy-plugin-list.out" "$EVIDENCE/$tag-claude-plugin-list.out"
  look "the read after:"; { read_skill "$rt" "$tag" ext-review-copy; read_skill "$rt" "$tag" ext-hello; } | tee "$EVIDENCE/$tag.txt" | show
  row wire "$rt" ext-review-copy "$(grep 'ext-review-copy' "$EVIDENCE/$tag.txt" | sed 's/^[a-z]*: ext-review-copy //')"
  row wire "$rt" ext-hello "$(grep 'ext-hello' "$EVIDENCE/$tag.txt" | sed 's/^[a-z]*: ext-hello //')"
  grep -cE ': ext-[a-z-]+ listed' "$EVIDENCE/$tag.txt" | grep -q '^2$' && ok "both skills listed after the printed steps" || bad "a skill is not listed after the steps"
  result
}

# ---------------------------------------------------------------------------
# Live: one headless session, the literal invocation in the runtime's spelling (A5).
invocation() { # $1 rt, $2 skill
  case "$1" in
    claude|grok) echo "/$2" ;;                       # TS1's decision: the bare name on Claude Code and Grok
    codex) echo "\$mirror-ext-$USER1:$2" ;;
    agy) echo "/mirror-ext-$USER1:$2" ;;
  esac
}
invocation_alt() { case "$1" in claude|grok) echo "/mirror-ext-$USER1:$2" ;; *) echo "" ;; esac; }
prompt_for() { # $1 rt, $2 ext, $3 canary, $4 form (main|alt)
  local inv; if [ "$4" = alt ]; then inv="$(invocation_alt "$1" "ext-$2")"; else inv="$(invocation "$1" "ext-$2")"; fi
  case "$2" in
    review-copy) echo "$inv $D/copy.txt gemini lite — write the HTML report to $REPORTS/$1-$3.html instead of ~/Downloads, then tell me the path." ;;
    hello) echo "$inv ping $3 — then reply with the one line the command printed." ;;
  esac
}
live() {
  local rt="${1:-}" ext="${2:-}" mode="${3:-}"
  need_probe; need_key
  [ -n "$rt" ] && [ -n "$ext" ] || { echo "usage: bash route.sh live <claude|codex|agy|grok> <review-copy|hello|probe> [tui|alt]"; exit 2; }
  local H tag canary prompt model form=main; H="$(cell "$rt")"
  [ "$mode" = alt ] && form=alt
  [ -d "$H" ] || { echo "no cell for $rt; run wire $rt first"; exit 2; }
  canary="US3-$rt-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)"
  tag="live-$rt-$ext$([ "$form" = alt ] && echo -alt)-$(date -u +%H%M%S)"
  case "$ext" in
    probe) prompt='Reply with the single word: ready.' ;;
    review-copy|hello) prompt="$(prompt_for "$rt" "$ext" "$canary" "$form")" ;;
    *) echo "ext: review-copy|hello|probe"; exit 2 ;;
  esac
  # Spend, read before the turn (A6, A9).
  local g o; g="$(spend_grok)"; o="$(spend_openrouter)"
  [ "$rt" = grok ] && awk -v s="$g" -v cap="$GROK_CAP_USD" 'BEGIN{exit !(s+0 >= cap+0)}' && { echo "Grok spend US\$ $g has reached the cap US\$ $GROK_CAP_USD; refusing"; exit 2; }
  [ "$ext" = review-copy ] && awk -v s="$o" -v cap="$OPENROUTER_CAP_USD" 'BEGIN{exit !(s+0 >= cap+0)}' && { echo "OpenRouter spend US\$ $o has reached the cap US\$ $OPENROUTER_CAP_USD; refusing"; exit 2; }
  # Before-counts (A1), written beside the transcript.
  printf 'calls\t%s\npings\t%s\nconv\t%s\ncanary\t%s\nreport\t%s\n' "$(count_calls)" "$(count_pings)" "$(count_conv "$(interface_of "$rt")")" "$canary" "$REPORTS/$rt-$canary.html" >"$EVIDENCE/$tag.before"
  say "live — $rt, $ext${mode:+ ($mode)}"
  look "prompt: $prompt"
  look "before: consult calls $(count_calls), pings $(count_pings), $(interface_of "$rt") conversations $(count_conv "$(interface_of "$rt")"); spend grok US\$ $g, openrouter US\$ $o"
  if [ "$mode" = tui ]; then
    note "TUI session, the Navigator's: type the prompt above, let it finish, then /exit (or quit). The route reads the scratch home afterwards (verify $rt)."
    case "$rt" in
      agy) mkdir -p "$H/.gemini/antigravity-cli"; cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" "$H/.gemini/antigravity-cli/" 2>/dev/null; cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/installation_id" "$H/.gemini/antigravity-cli/" 2>/dev/null
           in_home "$H" agy; rm -f "$H/.gemini/antigravity-cli/antigravity-oauth-token" ;;
      codex) cp "$CODEX_LOGIN_DIR/auth.json" "$H/.codex/auth.json" 2>/dev/null; in_home "$H" codex; rm -f "$H/.codex/auth.json" ;;
      claude) in_cell claude claude ;;
      grok) in_home "$H" env GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" grok ;;
    esac
    printf '$ (tui session)\nexit 0\n' >"$EVIDENCE/$tag.out"; row live "$rt" "$ext-tui" "TUI session run; see verify $rt"; result; return
  fi
  case "$rt" in
    grok) keep "$tag" in_home "$H" env GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" \
            grok -p "$prompt" -m grok-4.7 --output-format streaming-messages-json --yolo --max-turns "$([ "$ext" = review-copy ] && echo 10 || echo 6)" --reasoning-effort low --no-auto-update
          model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)"
          grep -o '"total_cost_usd":[0-9.]*' "$EVIDENCE/$tag.out" | tail -1 | show ;;
    codex) if [ -f "$CODEX_LOGIN_DIR/auth.json" ]; then cp "$CODEX_LOGIN_DIR/auth.json" "$H/.codex/auth.json"; note "codex: the scratch login borrowed into the cell"; else note "codex: no scratch login (bash route.sh login codex)"; fi
           keep "$tag" in_home "$H" codex exec --skip-git-repo-check --json --dangerously-bypass-approvals-and-sandbox "$prompt"
           rm -f "$H/.codex/auth.json"; [ -f "$H/.codex/auth.json" ] && bad "cell credential still present" || ok "cell credential verified absent"
           model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
    agy) if [ -f "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" ]; then note "agy: the scratch login borrowed into the cell, verified removed on exit"; else note "agy: no scratch login (bash route.sh login agy)"; fi
         mkdir -p "$H/.gemini/antigravity-cli"
         cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" "$H/.gemini/antigravity-cli/" 2>/dev/null
         cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/installation_id" "$H/.gemini/antigravity-cli/" 2>/dev/null
         keep "$tag" in_home "$H" agy --print "$prompt" --output-format json --dangerously-skip-permissions --print-timeout 10m
         rm -f "$H/.gemini/antigravity-cli/antigravity-oauth-token"
         [ -f "$H/.gemini/antigravity-cli/antigravity-oauth-token" ] && bad "scratch credential still present" || ok "scratch credential verified absent"
         model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
    claude) [ -d "$CLAUDE_LOGIN_DIR" ] && note "claude: the route's logged-in config dir, the real HOME; tools scoped (A7)" || note "claude: no scratch login (bash route.sh login claude)"
            keep "$tag" in_cell claude claude -p "$prompt" --output-format json --allowedTools "Skill" "Read" "Write" "Bash(mirror:*)"
            model="$(grep -o '"model[^"]*":"[^"]*"\|"modelUsage":{"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
  esac
  look "exit $(exit_of "$tag"); model: ${model:-not reported}"
  tail -c 500 "$EVIDENCE/$tag.out" | tr '\n' ' ' | cut -c1-500 | show; echo
  if [ "$ext" = probe ]; then
    if grep -q -i 'not logged in\|please run /login\|login required\|unauthenticated' "$EVIDENCE/$tag.out"; then row live "$rt" probe "not logged in"
    elif grep -q -i 'ready' "$EVIDENCE/$tag.out"; then row live "$rt" probe "answered ready: the login holds"
    else row live "$rt" probe "no clear answer (see $tag.out)"; fi
  else
    local how; how="$(node "$D/turn.cjs" "$rt" "$EVIDENCE/$tag.out" "ext-$ext")"
    row live "$rt" "$ext$([ "$form" = alt ] && echo -alt)" "exit $(exit_of "$tag"); ${model:-model not reported}; $how"
    note "a miss gets one retry with the same prompt (or 'alt' for the plugin-prefixed form on Claude Code and Grok); both readings are kept"
  fi
  result
}

# ---------------------------------------------------------------------------
# Verify: reads, not claims, each a delta against the session's before-counts (A1, A3).
verify() {
  local rt="${1:-}"; [ -n "$rt" ] || { echo "verify claude|codex|agy|grok"; exit 2; }
  need_install
  local iface; iface="$(interface_of "$rt")"
  say "verify — $rt"
  local ext b after_calls after_pings after_conv canary report kind
  for ext in review-copy hello; do
    b="$(ls -t "$EVIDENCE"/live-"$rt"-"$ext"*.before 2>/dev/null | head -1)"
    [ -n "$b" ] || { note "no live $rt $ext session yet"; continue; }
    canary="$(sed -n 's/^canary\t//p' "$b")"; report="$(sed -n 's/^report\t//p' "$b")"
    after_calls=$(( $(count_calls) - $(sed -n 's/^calls\t//p' "$b") ))
    after_pings=$(( $(count_pings) - $(sed -n 's/^pings\t//p' "$b") ))
    after_conv=$(( $(count_conv "$iface") - $(sed -n 's/^conv\t//p' "$b") ))
    look "$ext (session $(basename "$b" .before)): +$after_calls consult calls, +$after_pings pings, +$after_conv $iface conversations"
    case "$ext" in
      review-copy)
        if [ "$after_calls" -gt 0 ]; then
          local models; models="$(dbq "$(MDB)" "SELECT model || ' US\$' || printf('%.4f', COALESCE(cost_usd,0)) FROM llm_calls WHERE role='consult' ORDER BY called_at DESC LIMIT $after_calls" | tr '\n' ';')"
          row verify "$rt" consult "$after_calls call(s): $models"
          if [ -f "$report" ]; then
            local mid; mid="$(dbq "$(MDB)" "SELECT model FROM llm_calls WHERE role='consult' ORDER BY called_at DESC LIMIT 1")"
            grep -q -- "$mid" "$report" && row verify "$rt" report "at the named path, carries the ledger's model id ($mid)" || row verify "$rt" report "at the named path, but without the ledger's model id ($mid): a report the model wrote on its own?"
          else
            local any; any="$(ls "$REPORTS"/"$rt"-* "$(cell "$rt")"/Downloads/*AI_Reviews* 2>/dev/null | head -1)"
            row verify "$rt" report "not at the named path${any:+; found instead: $(echo "$any" | sed "s|^$D/|\$D/|")}"
          fi
        else
          kind="$(node "$D/turn.cjs" "$rt" "$(ls -t "$EVIDENCE"/live-"$rt"-"$ext"*.out | head -1)" ext-review-copy)"
          case "$kind" in
            *"ran mirror consult"*) row verify "$rt" consult "0 calls in the ledger although the turn ran mirror consult: the command ran and failed (sandbox, key, or network) — see the transcript" ;;
            *"answered from context"*|"") row verify "$rt" consult "0 calls: the skill never loaded, or the model did the work itself ($kind)" ;;
            *) row verify "$rt" consult "0 calls: $kind" ;;
          esac
        fi ;;
      hello)
        if dbq "$(MDB)" "SELECT message FROM ext_hello_pings" | grep -q -- "$canary"; then row verify "$rt" ping "this cell's canary in ext_hello_pings ($canary)"
        else
          kind="$(node "$D/turn.cjs" "$rt" "$(ls -t "$EVIDENCE"/live-"$rt"-"$ext"*.out | head -1)" ext-hello)"
          case "$kind" in
            *"ran mirror ext hello ping"*) row verify "$rt" ping "no row with this cell's canary although the turn ran the command: it ran and failed — see the transcript" ;;
            *) row verify "$rt" ping "no row: the skill never loaded, or the model answered without the command ($kind)" ;;
          esac
        fi ;;
    esac
    # The expectation per runtime, from what DS4, DS7, and DS10 measured (A2): Grok runs
    # no user hooks in headless -p mode (DS10.US3), so its interface is a TUI measurement;
    # Antigravity's conversation closes at the next session start (DS7.US4).
    local tui; tui="$(ls "$EVIDENCE"/live-"$rt"-"$ext"*.out 2>/dev/null | xargs grep -l '(tui session)' 2>/dev/null | head -1)"
    case "$rt" in
      grok) if [ -n "$tui" ]; then row verify "$rt" "interface-$ext" "+$after_conv grok_build conversation(s) from the TUI session"
            else row verify "$rt" "interface-$ext" "+$after_conv in headless: expected, Grok runs no hooks in -p mode (DS10.US3); the TUI session (live grok $ext tui) is the measurement"; fi ;;
      agy) row verify "$rt" "interface-$ext" "+$after_conv antigravity conversation(s) (open until the next session start, DS7.US4)" ;;
      *) row verify "$rt" "interface-$ext" "+$after_conv $iface conversation(s)" ;;
    esac
  done
  look "spend: grok US\$ $(spend_grok) (cap $GROK_CAP_USD), openrouter US\$ $(spend_openrouter) (cap $OPENROUTER_CAP_USD)"
  grep -rl -- "$KEY" "$EVIDENCE" 2>/dev/null | head -1 | grep -q . && bad "the key's value reached an evidence file (A8)" || ok "no evidence file carries the key's value"
  result
}

# ---------------------------------------------------------------------------
static() {
  say "Static — the fixture, the classifier, the records"
  local S; S="$(mktemp -d /tmp/us3-static.XXXX)"
  local M="$ROOT/bin/mirror.js"
  if (cd "$ROOT" && env -u MIRROR_USER MIRROR_HOME="$S/h" MIRROR_USER=h node "$M" extensions install hello --extensions-root "$HERE/fixtures" >"$S/install.out" 2>&1) \
     && (cd "$ROOT" && env -u MIRROR_USER MIRROR_HOME="$S/h" MIRROR_USER=h node "$M" ext hello ping static-canary >"$S/ping.out" 2>&1) && grep -q 'ping: static-canary' "$S/ping.out"; then
    ok "fixtures/hello installs through the checkout's mirror and ext hello ping records a row"
  else bad "fixtures/hello: $(tail -2 "$S/install.out" "$S/ping.out" 2>/dev/null | tr '\n' ' ')"; fi
  rm -rf "$S"
  [ "$(node "$HERE/turn.cjs" grok "$HERE/evidence/classifier/find.jsonl")" = "read the path the runtime listed; ran mirror consult" ] && ok "turn.cjs reads the committed find transcript as a find" || bad "turn.cjs misreads find.jsonl: $(node "$HERE/turn.cjs" grok "$HERE/evidence/classifier/find.jsonl")"
  [ "$(node "$HERE/turn.cjs" grok "$HERE/evidence/classifier/search.jsonl")" = "searched the disk" ] && ok "turn.cjs reads the committed search transcript as a search" || bad "turn.cjs misreads search.jsonl: $(node "$HERE/turn.cjs" grok "$HERE/evidence/classifier/search.jsonl")"
  local f; for f in versions.tsv table.tsv; do
    if [ -f "$HERE/evidence/$f" ]; then awk -F'\t' 'NF<3{bad=1} END{exit bad}' "$HERE/evidence/$f" && ok "evidence/$f parses ($(wc -l <"$HERE/evidence/$f" | tr -d ' ') rows)" || bad "evidence/$f has a short row"
    else note "evidence/$f not committed yet (written by the live run)"; fi
  done
  grep -q 'CV21.DS5.US3' "$HERE/../index.md" && ok "the DS5 index names this story" || bad "the DS5 index does not name US3"
  (cd "$ROOT" && node ts/scripts/checkDocLinks.ts >/dev/null 2>&1) && ok "checkDocLinks clean" || bad "checkDocLinks"
  result
}

untouched() {
  say "Untouched — the real configuration vs the baseline"
  [ -f "$D_RAW.baseline" ] || { echo "No baseline at $D_RAW.baseline. Run setup first."; exit 2; }
  config_manifest >"$D_RAW.now"
  if diff -u "$D_RAW.baseline" "$D_RAW.now" >"$D_RAW.diff"; then
    ok "every entry hashes as it did before setup, and both real homes' conversation counts are unmoved ($(wc -l <"$D_RAW.now" | tr -d ' ') entries)"
    rm -f "$D_RAW.now" "$D_RAW.diff"
  else
    bad "the real configuration changed (see $D_RAW.diff)"; head -20 "$D_RAW.diff" | show
  fi
  # The skill's default report path is ~/Downloads; the prompt overrides it, a model may
  # not follow. Named, never deleted (A7).
  local new; new="$(find "$REAL_HOME/Downloads" -maxdepth 1 -name '*AI_Reviews*.html' -newer "$D_RAW.baseline" 2>/dev/null)"
  [ -z "$new" ] && ok "no new *AI_Reviews*.html in the real ~/Downloads since setup" || { note "new report(s) in the real ~/Downloads since setup — yours to keep or delete:"; echo "$new" | show; }
  result
}

clean() {
  say "Clean"
  local h
  for h in "$D"/cell-* "$PERSON"; do
    [ -d "$h" ] || continue
    [ -S "$h/.grok/leader.sock" ] && note "grok leader under ${h/#$D/\$D}: stopping" && env HOME="$h" GROK_HOME="$h/.grok" grok leader kill >/dev/null 2>&1
    rm -f "$h/.gemini/oauth_creds.json" "$h/.gemini/google_accounts.json" "$h/.gemini/antigravity-cli/antigravity-oauth-token" "$h/.codex/auth.json" 2>/dev/null
  done
  if [ -d "$D/claude-login" ]; then
    local since; since="$(stat -f '%Sm' -t '%Y%m%d%H%M%S' "$D_RAW.baseline" 2>/dev/null)"
    security dump-keychain 2>/dev/null | grep -o '"svce"<blob>="Claude Code-credentials-[^"]*"' | sed 's/.*="\(.*\)"/\1/' | sort -u | while IFS= read -r svc; do
      c="$(security find-generic-password -s "$svc" 2>/dev/null | grep '"cdat"' | grep -o '"[0-9]\{14\}' | tr -d '"')"
      [ -n "$since" ] && [ "$c" \> "$since" ] && note "keychain entry from this route's Claude login: $svc (created $c UTC); remove it with: security delete-generic-password -s \"$svc\""
    done
    note "removing the Claude Code scratch login dir"
  fi
  [ -d "$D/codex-login" ] && note "removing the Codex scratch login dir (CODEX_HOME=$CODEX_LOGIN_DIR codex logout first if you prefer)"
  [ -d "$AGY_LOGIN_HOME" ] && rm -f "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" "$AGY_LOGIN_HOME/.gemini/oauth_creds.json" && note "agy scratch credential removed (1.4.2's location, CR144)"
  pgrep -fl "codex.*$D" 2>/dev/null | sed 's/^/      | still running: /' && pkill -f "codex.*$D" 2>/dev/null && note "stopped codex processes under the scratch directory"
  if [ -d "$EVIDENCE" ]; then
    mkdir -p "$HERE/evidence"; cp "$EVIDENCE/versions.tsv" "$EVIDENCE/table.tsv" "$HERE/evidence/" 2>/dev/null && note "versions.tsv and table.tsv copied into the story package (the rest stays uncommitted)"
  fi
  [ -f "$D_RAW/.ds5-us3" ] && rm -rf "$D_RAW" && ok "removed $D_RAW (the baseline stays at $D_RAW.baseline for untouched)" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup "${2:-registry}" ;;
  probe) probe ;;
  install) install_exts ;;
  login) login "${2:-}" ;;
  trust) trust "${2:-}" ;;
  wire) wire "${2:-}" ;;
  live) live "${2:-}" "${3:-}" "${4:-}" ;;
  verify) verify "${2:-}" ;;
  static) static ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,38p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
