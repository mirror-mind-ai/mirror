#!/usr/bin/env bash
# CV21.DS5.TS1 — one exposure for user extensions, chosen from three shapes measured
# on today's runtimes.
#
# Every step is isolated under a scratch directory (DS5_TS1_DIR, default
# /tmp/cv21-ds5-ts1). The real claude, codex, agy, and grok binaries run only with
# a scratch HOME and each runtime's own home variable (CLAUDE_CONFIG_DIR, CODEX_HOME,
# GROK_HOME), from an empty project, and with no model call except in `live`.
# `untouched` READS the real configuration, to prove nothing reached it.
#
#   bash route.sh setup            pack, install into a prefix whose path holds a
#                                  space, a scratch Mirror home with review-copy, the
#                                  inert canaried skill, the real-config baseline
#   bash route.sh probe            versions, binaries, date; the reader per runtime
#                                  and shape; the installed manifests' runtimes keys
#   bash route.sh shape-a          the user-level skill roots, one at a time, then two
#   bash route.sh shape-b          a per-home plugin, installed as each runtime takes
#                                  the canonical one; the in-place change; the
#                                  reinstall; a second plugin named for another home
#   bash route.sh shape-c          the probe MCP server serving one prompt, carried
#                                  as each runtime takes the canonical plugin's server
#   bash route.sh live <rt> <shape> [root]
#                                  one headless turn (the Navigator's): does the model
#                                  find the extension and answer with the canary
#   bash route.sh static           the records: decisions.md and the CV21 index
#   bash route.sh clean            stop what the route spawned, remove the scratch
#                                  directory and any login copied into it
#   bash route.sh untouched        the real configuration vs the baseline
#
# Raw outputs stay under $D/evidence (never committed: they carry home paths); the
# summary each step prints is what test-guide.md records. A shape step refuses to run
# when a runtime's version differs from the probe's stamp (amendment 3).
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS5_TS1_DIR:-/tmp/cv21-ds5-ts1}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"
USER1=ts1user
USER2=ts1other
RUNTIMES="claude codex agy grok"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/pre fix"                       # a space on purpose (DS4.US1 decision 3)
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  PLUGIN="$PKG/plugins/mirror-mind"
  EVIDENCE="$D/evidence"
  PROJECT="$D/project"
  MHOME="$D/mirror-home"                    # the scratch Mirror home review-copy is installed into
  SKILL="$D/skill/ext-review-copy"          # the inert skill directory, as expose-claude shapes it
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
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  { printf '$ %s\n' "$*"; "$@"; printf '\nexit %s\n' "$?"; } >"$EVIDENCE/$name.out" 2>&1
}
body_of() { sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/$1.out"; }
exit_of() { sed -n 's/^exit \([0-9]*\)$/\1/p' "$EVIDENCE/$1.out" | tail -1; }

# A table row the summaries are built from: shape, runtime, cell, value.
row() { mkdir -p "$EVIDENCE"; printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$EVIDENCE/table.tsv"; look "$2 · $3: $4"; }

# ---------------------------------------------------------------------------
# Versions: the evidence rule's stamp, taken by probe and re-read by every step.
versions_now() {
  printf 'claude\t%s\t%s\n' "$(claude --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v claude 2>/dev/null)" 2>/dev/null)"
  printf 'codex\t%s\t%s\n' "$(codex --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v codex 2>/dev/null)" 2>/dev/null)"
  printf 'agy\t%s\t%s\n' "$(agy --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v agy 2>/dev/null)" 2>/dev/null)"
  printf 'grok\t%s\t%s\n' "$(grok --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v grok 2>/dev/null)" 2>/dev/null)"
}
need_install() { [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }; }
need_probe() {
  need_install
  [ -f "$EVIDENCE/versions.tsv" ] || { echo "Run probe first: bash $SELF probe"; exit 2; }
  if ! diff -q <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) >/dev/null; then
    echo "a runtime changed version since the probe (amendment 3); re-run probe:"
    diff <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) | sed 's/^/  /'
    exit 2
  fi
}
evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  versions_now | while IFS=$'\t' read -r rt ver bin; do look "$rt: ${ver:-not on the PATH} — $bin"; done
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
}

# ---------------------------------------------------------------------------
# Scratch homes. One per runtime per shape, each with every root the shapes use, the
# scratch install first on the PATH, nothing of the person's.
fresh_home() {
  local home="$1"
  rm -rf "$home"
  mkdir -p "$home/.claude" "$home/.agents" "$home/.gemini/config" "$home/.grok" "$home/.codex" "$home/.config"
  chmod 700 "$home"
}
in_home() {
  local home="$1"; shift
  (cd "$PROJECT" && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY \
    HOME="$home" CLAUDE_CONFIG_DIR="$home/.claude" CODEX_HOME="$home/.codex" GROK_HOME="$home/.grok" \
    DISABLE_AUTOUPDATER=1 PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
as_scratch_mirror() { in_home "$D/mirror-person" mirror "$@" --mirror-home "$MHOME"; }
# Claude Code keys its login to the config directory AND to HOME: the probe found a
# scratch CLAUDE_CONFIG_DIR "Not logged in" until the Navigator logged in inside it
# (`live claude login`, DS12's step), and the same logged-in config dir answers only
# under the real HOME ("ready") and not under a scratch one ("Not logged in"). The
# path must be the resolved one: /tmp/... and /private/tmp/... are two logins. So the
# Claude turns keep the real HOME with the scratch config dir, each cell's skills
# synced into it, and the ~/.agents/skills/ cell is recorded as not measurable by this
# route rather than written into the real ~/.agents/ (amendment 6). `clean` removes
# the scratch login.
CLAUDE_LOGIN_DIR="$D/claude-login/.claude"
CODEX_LOGIN_DIR="$D/codex-login/.codex"
AGY_LOGIN_HOME="$D/agy-login"
in_home_claude_login() {
  local home="$1"; shift
  (cd "$PROJECT" && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CODEX_HOME -u GROK_HOME \
    CLAUDE_CONFIG_DIR="$CLAUDE_LOGIN_DIR" DISABLE_AUTOUPDATER=1 PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}
sync_claude_skills() { # the cell's ~/.claude/skills into the login config dir, nothing else
  rm -rf "$CLAUDE_LOGIN_DIR/skills"
  [ -d "$1/.claude/skills" ] && cp -R "$1/.claude/skills" "$CLAUDE_LOGIN_DIR/skills"
  ls "$CLAUDE_LOGIN_DIR/skills" 2>/dev/null | tr '\n' ' '
}

# ---------------------------------------------------------------------------
# The inert skill (amendments 1, 9, 12): expose-claude's directory, review-copy's
# frontmatter, a body of the heading, the canary, and "do nothing else".
canary() { cat "$D/canary"; }
write_inert_skill() { # $1 = target SKILL.md, $2 = canary
  local src="$D/expose/.claude/skills/ext-review-copy/SKILL.md"
  awk 'NR==1{print; next} /^---$/ && !done {print; done=1; exit} {print}' "$src" >"$1"
  printf '\n# Review Copy\n\n%s\n\nThis is a probe copy of the review-copy skill for CV21.DS5.TS1. When asked for\nthe canary, answer with the line above, exactly, and do nothing else: run no\ncommand, read no other file, call no tool.\n' "$2" >>"$1"
}
place_skill() { # $1 = directory that will hold ext-review-copy/
  mkdir -p "$1/ext-review-copy"
  cp "$SKILL/SKILL.md" "$1/ext-review-copy/SKILL.md"
}

# ---------------------------------------------------------------------------
# Readers: what each runtime lists, from its own output, never from the file's
# presence. Each prints one line: "<runtime>: listed N (<how>)" or "not listed".
write_turn_classifier() {
  cat >"$D/turn.js" <<'EOF'
const fs = require("fs");
const [rt, file] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const cmds = [];
const walk = (m) => { if (m && m.type === "tool_use") cmds.push(m.name + " " + JSON.stringify(m.input || {})); };
for (const line of text.split("\n")) {
  let j; try { j = JSON.parse(line); } catch { continue; }
  if (rt === "codex" && j.type === "item.completed" && j.item && j.item.type === "command_execution") cmds.push(j.item.command || "");
  if ((rt === "grok" || rt === "claude") && j.type === "assistant" && j.message) for (const c of j.message.content || []) walk(c);
  if (rt === "claude" && Array.isArray(j)) for (const e of j) if (e.message) for (const c of e.message.content || []) walk(c);
  if (rt === "agy" && j.denied_actions) for (const d of j.denied_actions) cmds.push("denied " + d.display_name);
}
const isSearch = (c) => /(^|\s|')(find|rg --files|rg -l|grep -r|grep -rn|Glob|Grep|ls -R|locate)(\s|$)/.test(c) || /"pattern":/.test(c);
const isListedRead = (c) => /(cat|Read|read_file).*(\.agents\/skills|\.codex\/plugins\/cache|\.claude\/skills|installed-plugins|\.gemini\/config)[^ ]*ext-review-copy\/SKILL\.md/.test(c);
const out = [];
let searched = false, listed = false;
for (const c of cmds) { if (isSearch(c)) searched = true; else if (isListedRead(c) && !searched) listed = true; }
if (cmds.length === 0) out.push("no tool used: answered from context");
if (listed) out.push("read the path the runtime listed");
if (searched) out.push("searched the disk");
const denied = cmds.filter((c) => c.startsWith("denied"));
if (denied.length) out.push(denied.join(", "));
console.log(out.join("; "));
EOF
}
write_readers() {
  write_turn_classifier
  cat >"$D/readers.js" <<'EOF'
const fs = require("fs");
const [kind, file] = process.argv.slice(2);
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const out = (s) => { console.log(s); process.exit(0); };
if (kind === "grok-inspect") {
  let j; try { j = JSON.parse(text); } catch { out("grok: inspect not JSON"); }
  const skills = (j.skills || []).filter((s) => /(^|:)ext-review-copy$/.test(s.name));
  const srcs = skills.map((s) => (s.source ? s.source.type + (s.source.plugin_name ? ":" + s.source.plugin_name : "") : "?") + (s.path ? " " + s.path.replace(/^.*?\/(\.claude|\.agents|\.grok|\.gemini)\//, "~/$1/") : ""));
  const mcp = (j.mcpServers || []).map((m) => `${m.name}/${m.transport}`);
  const plugins = (j.plugins || []).map((p) => `${p.name}@${p.scope} enabled=${p.enabled}`);
  out(`grok: ${skills.length ? "listed " + skills.length + " (" + srcs.join(" | ") + ")" : "not listed"}; mcp [${mcp.join(", ")}]; plugins [${plugins.join(", ")}]`);
}
if (kind === "codex-prompt") {
  const n = (text.match(/ext-review-copy/g) || []).length;
  const where = (text.match(/[^\s"']*ext-review-copy[^\s"']*/g) || []).map((s) => s.replace(/^.*?\/(\.agents|\.codex|\.claude)\//, "~/$1/")).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  out(`codex: ${n ? "listed (" + n + " mentions: " + where.join(" | ") + ")" : "not listed"}`);
}
if (kind === "claude-plugins") {
  const n = (text.match(/mirror-ext-[a-z0-9]+/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  out(`claude: plugins [${n.join(", ")}]`);
}
EOF
}

read_grok() { # $1 tag, $2 home
  keep "$1-grok-inspect" in_home "$2" grok inspect --json
  body_of "$1-grok-inspect" >"$EVIDENCE/$1-grok-inspect.json"
  node "$D/readers.js" grok-inspect "$EVIDENCE/$1-grok-inspect.json"
}
read_codex() { # $1 tag, $2 home
  keep "$1-codex-prompt" in_home "$2" codex debug prompt-input hello
  node "$D/readers.js" codex-prompt "$EVIDENCE/$1-codex-prompt.out"
}
read_agy_staged() { # $1 tag, $2 home: the staged plugin trees (agy's static reader for a plugin)
  local staged; staged="$(find "$2/.gemini/config/plugins" -path '*/skills/ext-review-copy/SKILL.md' 2>/dev/null | sed "s|^$2/|~/|" | tr '\n' ' ')"
  keep "$1-agy-plugin-list" in_home "$2" agy plugin list --json
  if [ -n "$staged" ]; then echo "agy: listed (staged: $staged)"; else echo "agy: not listed (no staged ext-review-copy)"; fi
}
read_claude_plugins() { # $1 tag, $2 home
  keep "$1-claude-plugin-list" in_home "$2" claude plugin list
  node "$D/readers.js" claude-plugins "$EVIDENCE/$1-claude-plugin-list.out"
}

# ---------------------------------------------------------------------------
# The real configuration this route promises not to touch (amendment 4).
REAL_CONFIG=(
  .claude/settings.json .claude/settings.local.json .claude/skills .claude/plugins .claude.json
  .codex/config.toml .codex/plugins .codex/skills
  .agents/skills .agents/plugins
  .gemini/config/plugins .gemini/config/skills .gemini/config/import_manifest.json .gemini/settings.json
  .grok/config.toml .grok/settings.json .grok/hooks .grok/skills .grok/plugins .grok/rules
  .grok/installed-plugins .grok/marketplace-cache
  .mirror-minds/vinicius/extensions .mirror-minds/vinicius/runtime/skills
  .mirror-minds/vinicius-dev/extensions .mirror-minds/vinicius-dev/runtime/skills
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
}

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install, scratch Mirror home, the inert skill, the baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds5-ts1" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds5-ts1" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT" "$D/mirror-person"
  # The baseline lives BESIDE the scratch directory, not in it: `untouched` runs after
  # `clean` (amendment 7), and the first run of this route deleted its own baseline.
  config_manifest >"$D_RAW.baseline"
  ok "real configuration recorded: $(wc -l <"$D_RAW.baseline" | tr -d ' ') entries (auth.json, logs, memory.db outside the set by design)"
  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into a prefix whose path holds a space" \
    || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; result; return; }
  keep mirror-init in_home "$D/mirror-person" mirror init "$USER1"
  mkdir -p "$MHOME"
  keep ext-install as_scratch_mirror extensions install review-copy --extensions-root "$ROOT/examples/extensions"
  [ "$(exit_of ext-install)" = 0 ] && ok "review-copy installed into the scratch Mirror home" || { bad "install failed"; tail -3 "$EVIDENCE/ext-install.out" | show; }
  local rt; for rt in claude pi codex antigravity grok; do
    [ -f "$MHOME/runtime/skills/$rt/extensions.json" ] && note "catalog written for $rt" || note "no $rt catalog (the manifest declares no $rt block)"
  done
  mkdir -p "$D/expose"
  keep ext-expose as_scratch_mirror extensions expose-claude --target-root "$D/expose"
  [ -f "$D/expose/.claude/skills/ext-review-copy/SKILL.md" ] && ok "expose-claude wrote ext-review-copy/SKILL.md (amendment 1)" || { bad "expose-claude wrote nothing"; result; return; }
  printf 'CANARY-DS5-%s\n' "$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 6)" >"$D/canary"
  mkdir -p "$SKILL"
  write_inert_skill "$SKILL/SKILL.md" "$(canary)"
  ok "the inert skill: review-copy's frontmatter, body = heading + $(canary) + do nothing else"
  head -5 "$SKILL/SKILL.md" | show
  cp "$HERE/probe-mcp.mjs" "$D/probe-mcp.mjs"
  write_readers
  result
}

# ---------------------------------------------------------------------------
probe() {
  say "Probe — versions, readers, the installed manifests (plan.md step 0)"
  need_install
  evidence_header
  versions_now >"$EVIDENCE/versions.tsv"
  local rt; for rt in $RUNTIMES; do command -v "$rt" >/dev/null 2>&1 && ok "$rt on the PATH" || bad "$rt not on the PATH"; done
  write_readers
  local H="$D/home-probe"; fresh_home "$H"

  say "The readers, each run once on an empty scratch home"
  look "grok: grok inspect --json (skills, plugins, mcpServers)"; read_grok probe "$H" | show
  look "codex: codex debug prompt-input (the rendered prompt, no model)"; read_codex probe "$H" | show
  look "codex: codex mcp list"; keep probe-codex-mcp in_home "$H" codex mcp list; tail -3 "$EVIDENCE/probe-codex-mcp.out" | show
  look "claude: claude plugin list (plugins only)"; read_claude_plugins probe "$H" | show
  look "claude: a static listing of personal skills? (claude --help, skills)"
  keep probe-claude-help in_home "$H" claude --help
  grep -i -c 'skill' "$EVIDENCE/probe-claude-help.out" | sed 's/^/      | mentions of skill in --help: /'
  note "claude: no listing command for a personal skill is known; reader: model (amendment 10)"
  look "agy: agy plugin list --json (plugins); agy mcp list (servers)"; read_agy_staged probe "$H" | show
  keep probe-agy-mcp in_home "$H" agy mcp list; tail -3 "$EVIDENCE/probe-agy-mcp.out" | show
  look "agy: a static listing of ~/.gemini/config/skills/? (agy --help)"
  keep probe-agy-help in_home "$H" agy --help
  grep -i -c 'skill' "$EVIDENCE/probe-agy-help.out" | sed 's/^/      | mentions of skill in --help: /'
  note "agy: no skills listing is known; reader: model for the skills root (amendment 10)"

  say "The installed manifests, read-only: runtimes keys per extension (amendment 4, rule 2)"
  : >"$EVIDENCE/installed-manifests.tsv"
  local home id kind keys
  for home in vinicius vinicius-dev; do
    for m in "$REAL_HOME/.mirror-minds/$home/extensions"/*/skill.yaml; do
      [ -f "$m" ] || continue
      id="$(basename "$(dirname "$m")")"
      kind="$(sed -n 's/^kind:[[:space:]]*"\{0,1\}\([a-z-]*\).*/\1/p' "$m" | head -1)"
      keys="$(awk '/^runtimes:/{f=1;next} f&&/^[^ ]/{f=0} f&&/^  [a-z][a-z0-9_-]*:/{gsub(/[ :]/,"");printf "%s ",$0}' "$m")"
      printf '%s\t%s\t%s\t%s\n' "$home" "$id" "$kind" "$keys" >>"$EVIDENCE/installed-manifests.tsv"
    done
  done
  awk -F'\t' '{k[$4]++; n++} END {for (x in k) printf "      | %d of %d declare: %s\n", k[x], n, x}' "$EVIDENCE/installed-manifests.tsv"
  note "Claude Code's login in a scratch HOME: settled by 'bash route.sh live claude probe' (amendment 6)"
  result
}

# ---------------------------------------------------------------------------
# Shape (a): the user-level skill roots.
root_dir() { case "$1" in claude) echo ".claude/skills" ;; agents) echo ".agents/skills" ;; gemini) echo ".gemini/config/skills" ;; esac; }
read_all_static() { # $1 tag, $2 home — the three static readers for a skill
  read_grok "$1" "$2"; read_codex "$1" "$2"
  local staged; staged="$(find "$2/.gemini/config/skills" -path '*/ext-review-copy/SKILL.md' 2>/dev/null | head -1)"
  echo "agy: reader model (skills root${staged:+; the file is placed})"
  echo "claude: reader model"
}
shape_a() {
  say "Shape (a) — the user-level skill roots (plan.md Scope)"
  need_probe
  local root H tag line
  for root in claude agents gemini; do
    H="$D/a-$root"; fresh_home "$H"; tag="a-$root"
    say "root ~/$(root_dir "$root")/"
    look "negative read on the clean home (amendment 8):"
    read_all_static "$tag-before" "$H" | tee "$EVIDENCE/$tag-before.txt" | show
    grep -q '^[a-z]*: listed' "$EVIDENCE/$tag-before.txt" && bad "something listed before placement" || ok "nothing listed before placement"
    mkdir -p "$H/$(root_dir "$root")"; place_skill "$H/$(root_dir "$root")"
    look "placed; the readers:"
    read_all_static "$tag" "$H" | tee "$EVIDENCE/$tag.txt" | show
    while IFS= read -r line; do row a "$root" "${line%%:*}" "${line#*: }"; done <"$EVIDENCE/$tag.txt"
  done
  say "two roots at once: ~/.claude/skills/ and ~/.agents/skills/ — does Grok list it twice?"
  H="$D/a-two"; fresh_home "$H"
  mkdir -p "$H/.claude/skills" "$H/.agents/skills"; place_skill "$H/.claude/skills"; place_skill "$H/.agents/skills"
  read_grok a-two "$H" | tee "$EVIDENCE/a-two.txt" | show
  row a two-roots grok "$(sed 's/^grok: //' "$EVIDENCE/a-two.txt")"
  read_codex a-two "$H" | show
  note "a root is shared by every Mirror home on the machine: two homes exposing the same id write the same ~/<root>/ext-review-copy/ (amendment 4 of the rule); the file carries no home name"
  note "uninstall in this shape: remove ext-review-copy/ from each root (rule 20)"
  note "Claude Code's cells: ~/.claude/skills/ and ~/.agents/skills/ by 'live claude a <root>' (amendments 6, 10)"
  result
}

# ---------------------------------------------------------------------------
# Shape (b): a per-home plugin in the canonical plugin's format.
write_ext_plugin() { # $1 user, $2 with-mcp (0/1) -> prints dir
  local name="mirror-ext-$1" dir="$D/plugin-$1$([ "$2" = 1 ] && echo -mcp)"
  rm -rf "$dir"; mkdir -p "$dir/.claude-plugin"
  # (b) carries the skill; (c) carries the server alone, so a find is the prompt's and not the skill's
  [ "$2" = 1 ] || { mkdir -p "$dir/skills"; place_skill "$dir/skills"; }
  node -e '
const fs=require("fs"),[dir,name,mcp,node,server,skill]=process.argv.slice(1);
const m={name,version:"0.0.1",description:"CV21.DS5.TS1 fixture: one Mirror home'"'"'s extensions as a plugin (shape (b))."};
if(mcp==="1") m.mcpServers={[name]:{command:node,args:[server,skill]}};
fs.writeFileSync(dir+"/.claude-plugin/plugin.json",JSON.stringify(m,null,2)+"\n");
fs.writeFileSync(dir+"/plugin.json",JSON.stringify(m,null,2)+"\n");
if(mcp==="1") fs.writeFileSync(dir+"/mcp_config.json",JSON.stringify({mcpServers:m.mcpServers},null,2)+"\n");
' "$dir" "$name" "$2" "$NODE_DIR/node" "$D/probe-mcp.mjs" "$SKILL/SKILL.md"
  echo "$dir"
}
list_fixture() { (cd "$1" && find . -type f | LC_ALL=C sort | sed 's|^\./||'); }
# One marketplace per Mirror home, named for it: Codex refuses a second marketplace
# under a name already added from another path.
codex_marketplace() { # $1 plugin dir, $2 name -> marketplace dir
  local MP="$D/codex-mp-$2"; rm -rf "$MP"; mkdir -p "$MP/.agents/plugins"; ln -s "$1" "$MP/$2"   # a link: the marketplace serves the plugin directory itself
  node -e 'const fs=require("fs"),[mp,name]=process.argv.slice(1);fs.writeFileSync(mp+"/.agents/plugins/marketplace.json",JSON.stringify({name:"mp-"+name,owner:{name:"CV21.DS5.TS1 route"},plugins:[{name,source:{source:"local",path:"./"+name},description:"fixture"}]},null,2)+"\n")' "$MP" "$2"
  echo "$MP"
}
loaded_copy() { # $1 runtime, $2 home, $3 plugin name: the SKILL.md the runtime loads, if it copied
  case "$1" in
    claude) echo "$2/.claude/skills/$3/skills/ext-review-copy/SKILL.md" ;;
    codex) find "$2/.codex" -path "*$3*" -path '*/skills/ext-review-copy/SKILL.md' 2>/dev/null | head -1 ;;
    agy) find "$2/.gemini/config/plugins" -path "*$3*" -path '*/skills/ext-review-copy/SKILL.md' 2>/dev/null | head -1 ;;
    grok) # Grok keys the copy by the source directory's name and a hash, not the plugin's name
          local f; for f in $(find "$2/.grok/installed-plugins" -path '*/skills/ext-review-copy/SKILL.md' 2>/dev/null); do
            grep -q "\"name\": \"$3\"" "${f%/skills/ext-review-copy/SKILL.md}/plugin.json" 2>/dev/null && { echo "$f"; break; }
          done ;;
  esac
}
install_plugin() { # $1 runtime, $2 home, $3 plugin dir, $4 name, $5 tag
  case "$1" in
    claude) mkdir -p "$2/.claude/skills"; ln -s "$3" "$2/.claude/skills/$4"; keep "$5-claude-details" in_home "$2" claude plugin details "$4" ;;
    codex) local MP; MP="$(codex_marketplace "$3" "$4")"
           keep "$5-codex-mp-add" in_home "$2" codex plugin marketplace add "$MP"
           keep "$5-codex-add" in_home "$2" codex plugin add "$4@mp-$4" ;;
    agy) keep "$5-agy-install" in_home "$2" agy plugin install "$3" ;;
    grok) keep "$5-grok-install" in_home "$2" grok plugin install "$3" --trust ;;
  esac
}
reinstall_plugin() { # the command diagnose would name, run on the scratch home
  case "$1" in
    claude) echo "(a link: nothing to reinstall)" ;;
    codex) keep "$5-codex-readd" in_home "$2" codex plugin add "$4@mp-$4"
           if grep -q -- "$(canary)-v2" "$(loaded_copy codex "$2" "$4")" 2>/dev/null; then echo "codex plugin add $4@mp-$4 (exit $(exit_of "$5-codex-readd"))"
           else keep "$5-codex-remove" in_home "$2" codex plugin remove "$4@mp-$4"; keep "$5-codex-readd2" in_home "$2" codex plugin add "$4@mp-$4"
             echo "codex plugin add alone left the same-version copy as it was; codex plugin remove $4@mp-$4 (exit $(exit_of "$5-codex-remove")) && codex plugin add $4@mp-$4 (exit $(exit_of "$5-codex-readd2"))"; fi ;;
    agy) keep "$5-agy-reinstall" in_home "$2" agy plugin install "$3"; echo "agy plugin install <dir> (exit $(exit_of "$5-agy-reinstall"))" ;;
    grok) keep "$5-grok-uninstall" in_home "$2" grok plugin uninstall "$4" --confirm; keep "$5-grok-reinstall" in_home "$2" grok plugin install "$3" --trust
          echo "grok plugin uninstall $4 --confirm && grok plugin install <dir> --trust (exit $(exit_of "$5-grok-reinstall"))" ;;
  esac
}
read_plugin_skill() { # $1 runtime, $2 tag, $3 home
  case "$1" in
    grok) read_grok "$2" "$3" ;;
    codex) read_codex "$2" "$3" ;;
    agy) read_agy_staged "$2" "$3" ;;
    claude) read_claude_plugins "$2" "$3"; echo "claude: skill listing reader model" ;;
  esac
}
shape_b() {
  say "Shape (b) — a per-home plugin, installed as each runtime takes the canonical one"
  need_probe
  local P1 P2 rt H tag copy
  P1="$(write_ext_plugin "$USER1" 0)"; P2="$(write_ext_plugin "$USER2" 0)"
  look "the fixture, listed before any install (amendment 13):"; list_fixture "$P1" | show
  for rt in $RUNTIMES; do
    H="$D/b-$rt"; fresh_home "$H"; tag="b-$rt"
    say "$rt"
    look "negative read (amendment 8):"; read_plugin_skill "$rt" "$tag-before" "$H" | tee "$EVIDENCE/$tag-before.txt" | show
    grep -q '^[a-z]*: listed' "$EVIDENCE/$tag-before.txt" && bad "listed before install" || ok "nothing listed before install"
    install_plugin "$rt" "$H" "$P1" "mirror-ext-$USER1" "$tag"
    look "installed; the reader:"; read_plugin_skill "$rt" "$tag" "$H" | tee "$EVIDENCE/$tag.txt" | show
    row b "$rt" listed "$(grep -v 'reader model' "$EVIDENCE/$tag.txt" | head -1 | sed 's/^[a-z]*: //')"
    copy="$(loaded_copy "$rt" "$H" "mirror-ext-$USER1")"
    if [ -n "$copy" ] && [ -e "$copy" ]; then
      if [ -L "$H/.claude/skills/mirror-ext-$USER1" ] && [ "$rt" = claude ]; then row b "$rt" refresh "in place (a link): a change is read on the next session"
      else
        look "changing the skill in place (a second canary) and reading the loaded copy:"
        write_inert_skill "$P1/skills/ext-review-copy/SKILL.md" "$(canary)-v2"
        if grep -q -- "$(canary)-v2" "$copy"; then row b "$rt" refresh "in place: the loaded file carries the change"
        else row b "$rt" refresh "stale: a copy ($(echo "$copy" | sed "s|^$H/|~/|"))"
          look "the reinstall diagnose would name, run (amendment 11):"
          row b "$rt" reinstall "$(reinstall_plugin "$rt" "$H" "$P1" "mirror-ext-$USER1" "$tag")"
          copy="$(loaded_copy "$rt" "$H" "mirror-ext-$USER1")"
          grep -q -- "$(canary)-v2" "${copy:-/nonexistent}" && row b "$rt" after-reinstall "level: the copy carries the change" || row b "$rt" after-reinstall "still stale"
        fi
        write_inert_skill "$P1/skills/ext-review-copy/SKILL.md" "$(canary)"
      fi
    else
      row b "$rt" refresh "no loaded copy found under the scratch home (the install did not land, or loads from the source)"
    fi
    look "a second plugin named for another home, beside the first:"
    install_plugin "$rt" "$H" "$P2" "mirror-ext-$USER2" "$tag-2"
    read_plugin_skill "$rt" "$tag-2" "$H" | tee "$EVIDENCE/$tag-2.txt" | show
    row b "$rt" two-homes "$(grep -v 'reader model' "$EVIDENCE/$tag-2.txt" | head -1 | sed 's/^[a-z]*: //')"
  done
  note "uninstall in this shape: regenerate the plugin without the extension, then the reinstall per runtime (rule 20)"
  result
}

# ---------------------------------------------------------------------------
# Shape (c): the probe MCP server serving one prompt.
shape_c() {
  say "Shape (c) — MCP prompts from a plugin-carried server"
  need_probe
  local P rt H tag
  P="$(write_ext_plugin "$USER1" 1)"
  look "the fixture, listed before any install (amendment 13):"; list_fixture "$P" | show
  look "the server answers prompts/list on its own:"
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"prompts/list"}\n' \
    | node "$D/probe-mcp.mjs" "$SKILL/SKILL.md" | tee "$EVIDENCE/c-self.out" | cut -c1-160 | show
  grep -q '"ext-review-copy"' "$EVIDENCE/c-self.out" && ok "prompts/list names ext-review-copy" || bad "the probe server does not list the prompt"
  for rt in $RUNTIMES; do
    H="$D/c-$rt"; fresh_home "$H"; tag="c-$rt"
    say "$rt"
    install_plugin "$rt" "$H" "$P" "mirror-ext-$USER1" "$tag"
    case "$rt" in
      claude) keep "$tag-claude-details" in_home "$H" claude plugin details "mirror-ext-$USER1"
              grep -i -E 'mcp|server' "$EVIDENCE/$tag-claude-details.out" | head -3 | show
              row c claude attached "$(grep -i -c 'mcp server' "$EVIDENCE/$tag-claude-details.out") 'MCP server' lines in plugin details"
              row c claude prompt-user "documented as /mcp__mirror-ext-${USER1}__ext-review-copy; reader model" ;;
      codex) keep "$tag-codex-mcp" in_home "$H" codex mcp list; tail -4 "$EVIDENCE/$tag-codex-mcp.out" | show
             row c codex attached "$(grep -c "mirror-ext-$USER1" "$EVIDENCE/$tag-codex-mcp.out") server lines in codex mcp list"
             row c codex prompt-user "reader model" ;;
      agy) keep "$tag-agy-mcp" in_home "$H" agy mcp list; tail -4 "$EVIDENCE/$tag-agy-mcp.out" | show
           # `agy mcp list` lists user-configured servers only; a plugin's server shows in the TUI's /mcp (DS7.US4)
           if grep -q "mirror-ext-$USER1" "$H/.gemini/config/plugins/mirror-ext-$USER1/mcp_config.json" 2>/dev/null; then
             row c agy attached "staged mcp_config.json names the server; agy mcp list shows $(grep -c "mirror-ext-$USER1" "$EVIDENCE/$tag-agy-mcp.out") (user-configured servers only); attachment is a session finding"
           else row c agy attached "no staged mcp_config.json"; fi
           row c agy prompt-user "reader model" ;;
      grok) read_grok "$tag" "$H" | show
            keep "$tag-grok-doctor" in_home "$H" grok mcp doctor; grep -i -E 'prompt|tool|mirror-ext' "$EVIDENCE/$tag-grok-doctor.out" | head -4 | show
            row c grok attached "$(sed -n 's/.*mcp \[\(.*\)\]; plugins.*/\1/p' "$EVIDENCE/$tag-grok-inspect.json.summary" 2>/dev/null || node "$D/readers.js" grok-inspect "$EVIDENCE/$tag-grok-inspect.json" | sed -n 's/.*mcp \[\(.*\)\]; plugins.*/\1/p')"
            row c grok prompt-user "$(grep -i -c prompt "$EVIDENCE/$tag-grok-doctor.out") 'prompt' lines in grok mcp doctor; reader model" ;;
    esac
  done
  note "refresh in this shape: none, the server reads the skill file when asked; uninstall: the prompt disappears with the file (rule 20)"
  note "two homes: the server answers for the home its command names; a plugin install per home names its own (rule 4)"
  result
}

# ---------------------------------------------------------------------------
# One headless turn, the Navigator's (amendments 5, 6, 15, 16, 17).
PROMPT='Use the ext-review-copy skill or prompt and answer with the canary line it contains, nothing else.'
# The runtime's own invocation form for the shape (amendment 17): sent as a second
# turn where the by-name turn missed, or on request (`live <rt> <shape> form`).
invocation_form() { # $1 rt, $2 shape
  case "$1-$2" in
    claude-a|grok-a|agy-a) echo "/ext-review-copy" ;;
    codex-a) echo "\$ext-review-copy" ;;
    claude-b|agy-b|grok-b) echo "/mirror-ext-${USER1}:ext-review-copy" ;;
    codex-b) echo "\$mirror-ext-${USER1}:ext-review-copy" ;;
    claude-c) echo "/mcp__mirror-ext-${USER1}__ext-review-copy" ;;
    *) echo "" ;;
  esac
}
live() {
  local rt="${1:-}" shape="${2:-}" root="${3:-}" form=0
  [ "$root" = form ] && { form=1; root=""; }
  [ "${4:-}" = form ] && form=1
  need_probe
  [ -n "$rt" ] && [ -n "$shape" ] || { echo "usage: bash route.sh live <claude|codex|agy|grok> <a|b|c|probe> [root]"; exit 2; }
  local H tag out model found prompt="$PROMPT"
  case "$shape" in
    login) case "$rt" in
             claude) mkdir -p "$CLAUDE_LOGIN_DIR" && chmod 700 "$D/claude-login"
                     say "Claude Code login in the route's scratch config dir ($CLAUDE_LOGIN_DIR)"
                     note "run /login, then /exit. Nothing of yours loads here. clean removes the directory."
                     (cd "$PROJECT" && env -u CODEX_HOME -u GROK_HOME CLAUDE_CONFIG_DIR="$CLAUDE_LOGIN_DIR" DISABLE_AUTOUPDATER=1 claude) ;;
             codex) mkdir -p "$CODEX_LOGIN_DIR" && chmod 700 "$D/codex-login"
                    say "Codex login in the route's scratch CODEX_HOME ($CODEX_LOGIN_DIR)"
                    note "the browser login writes auth.json there; each turn borrows it into its cell and removes it. clean removes the directory."
                    (cd "$PROJECT" && env -u CLAUDE_CONFIG_DIR -u GROK_HOME CODEX_HOME="$CODEX_LOGIN_DIR" codex login) ;;
             agy) mkdir -p "$AGY_LOGIN_HOME/.gemini" && chmod 700 "$AGY_LOGIN_HOME"
                  say "agy login in the route's scratch HOME ($AGY_LOGIN_HOME)"
                  note "open the auth URL, approve, paste the code at agy's prompt (DS7.US4's step 0). Each turn borrows the two credential files into its cell and removes them."
                  (cd "$PROJECT" && env -u CLAUDE_CONFIG_DIR -u CODEX_HOME -u GROK_HOME HOME="$AGY_LOGIN_HOME" agy --print "Reply with the single word: ready.") ;;
             *) echo "login is a Claude Code, Codex, or agy step; Grok reads auth.json in place"; exit 2 ;;
           esac; return ;;
    probe) H="$D/live-probe-$rt"; fresh_home "$H"; prompt='Reply with the single word: ready.' ;;
    a) [ -n "$root" ] || { echo "shape a needs a root: claude|agents|gemini"; exit 2; }; H="$D/a-$root"
       if [ "$rt" = claude ] && [ "$root" != claude ]; then row live claude "a-$root" "not measurable by this route: Claude Code's login needs the real HOME, and the real ~/$(root_dir "$root")/ is not written (amendment 6)"; return; fi; [ "$rt" = claude ] && [ ! -d "$H" ] && { fresh_home "$H"; mkdir -p "$H/$(root_dir "$root")"; place_skill "$H/$(root_dir "$root")"; } ;;
    b) H="$D/b-$rt" ;;
    c) H="$D/c-$rt" ;;
    *) echo "shape: a|b|c|probe|login"; exit 2 ;;
  esac
  [ -d "$H" ] || { echo "no home for $rt/$shape; run shape-$shape first"; exit 2; }
  if [ "$form" = 1 ]; then
    local f; f="$(invocation_form "$rt" "$shape")"
    [ -n "$f" ] || { echo "no documented invocation form for $rt in shape $shape"; exit 2; }
    prompt="$f answer with the canary line it contains, nothing else."
  fi
  tag="live-$rt-$shape${root:+-$root}$([ "$form" = 1 ] && echo -form)-$(date -u +%H%M%S)"
  say "live — $rt, shape $shape${root:+, root $root}"
  look "prompt: $prompt"
  case "$rt" in
    grok) keep "$tag" in_home "$H" env GROK_AUTH_PATH="$REAL_HOME/.grok/auth.json" \
            grok -p "$prompt" -m grok-4.7 --output-format streaming-messages-json --yolo --max-turns 3 --reasoning-effort low --no-auto-update
          model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)"
          grep -o '"total_cost_usd":[0-9.]*' "$EVIDENCE/$tag.out" | tail -1 | sed 's/^/      | /' ;;
    codex) if [ -f "$CODEX_LOGIN_DIR/auth.json" ]; then cp "$CODEX_LOGIN_DIR/auth.json" "$H/.codex/auth.json"; note "codex: the scratch login borrowed into the cell"; else note "codex: no scratch login (bash route.sh live codex login)"; fi
           keep "$tag" in_home "$H" codex exec --skip-git-repo-check --json "$prompt"
           rm -f "$H/.codex/auth.json"; [ -f "$H/.codex/auth.json" ] && bad "cell credential still present" || ok "cell credential verified absent"
           model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
    agy) # agy 1.4.2 keeps its login at .gemini/antigravity-cli/antigravity-oauth-token (1.3.x: oauth_creds.json)
         if [ -f "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" ]; then note "agy: the scratch login borrowed into the cell, verified removed on exit"; else note "agy: no scratch login (bash route.sh live agy login)"; fi
         mkdir -p "$H/.gemini/antigravity-cli"
         cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" "$H/.gemini/antigravity-cli/" 2>/dev/null
         cp "$AGY_LOGIN_HOME/.gemini/antigravity-cli/installation_id" "$H/.gemini/antigravity-cli/" 2>/dev/null
         keep "$tag" in_home "$H" agy --print "$prompt" --output-format json
         rm -f "$H/.gemini/antigravity-cli/antigravity-oauth-token"
         [ -f "$H/.gemini/antigravity-cli/antigravity-oauth-token" ] && bad "scratch credential still present" || ok "scratch credential verified absent"
         model="$(grep -o '"model":"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
    claude) # scratch HOME and CLAUDE_CONFIG_DIR; whether the keychain login survives is the probe's finding (amendment 6)
            if [ -d "$CLAUDE_LOGIN_DIR" ]; then
              note "claude: the route's logged-in config dir; skills synced from the cell: $(sync_claude_skills "$H")"
              keep "$tag" in_home_claude_login "$H" claude -p "$prompt" --output-format json --allowedTools Skill
            else
              keep "$tag" in_home "$H" claude -p "$prompt" --output-format json --allowedTools Skill
            fi
            model="$(grep -o '"model[^"]*":"[^"]*"\|"modelUsage":{"[^"]*"' "$EVIDENCE/$tag.out" | head -1)" ;;
  esac
  look "exit $(exit_of "$tag"); model: ${model:-not reported}"
  tail -c 600 "$EVIDENCE/$tag.out" | tr '\n' ' ' | cut -c1-600 | sed 's/^/      | /'; echo
  if [ "$shape" = probe ]; then
    if grep -q -i 'not logged in\|please run /login\|login required\|unauthenticated' "$EVIDENCE/$tag.out"; then row live "$rt" "login-$shape" "not logged in"
    elif grep -q -i '"result":"[^"]*ready\|^ready\|: ready' "$EVIDENCE/$tag.out"; then row live "$rt" "login-$shape" "answered ready: the login holds"
    else row live "$rt" "login-$shape" "no clear answer (see $tag.out)"; fi
  else
    grep -q -- "$(canary)" "$EVIDENCE/$tag.out" && found=found || found="not found"
    # A find reached by searching the disk is not the shape's: Grok's (c) turn ran grep and
    # find over the scratch directory, and Codex's (c) turn ran rg --files over /Users and
    # read the route's own copy of the skill. The turn's commands are classified: a read
    # of a path the runtime listed (Codex names skills with their paths) is the shape's;
    # a search (find, rg --files, grep -r) before the answer is not.
    local how; how="$(node "$D/turn.js" "$rt" "$EVIDENCE/$tag.out")"
    [ -n "$how" ] && found="$found ($how)"
    # A listed read before any search is the shape's find (Codex (b) read the cached path,
    # then searched anyway); a search with no listed read before it is not.
    case "$how" in *"read the path the runtime listed"*) ;; *"searched the disk"*) case "$found" in found*) found="not found by the shape; $found" ;; esac ;; esac
    row live "$rt" "$shape${root:+-$root}$([ "$form" = 1 ] && echo -form)" "$found; ${model:-model not reported}"
    [ "$found" = found ] || note "a miss gets one retry with the same prompt; two misses are the finding (amendment 15)"
  fi
  result
}

# ---------------------------------------------------------------------------
static() {
  say "Static — the records"
  local CV="$ROOT/docs/project/roadmap/cv21-runtime-expansion-ii/index.md"
  grep -q 'riding the same plugin/MCP package' "$CV" && bad "CV21 Product Outcome still says the shared package carries extensions" || ok "CV21 Product Outcome reworded"
  grep -q 'via the\s*shared package\|shared package;' "$CV" && bad "CV21 Done Condition still says via the shared package" || ok "CV21 Done Condition reworded"
  grep -q '^### User extensions reach every runtime' "$ROOT/docs/project/decisions.md" && ok "decisions.md carries the entry" || bad "no decisions.md entry yet"
  (cd "$ROOT" && node ts/scripts/checkDocLinks.ts >/dev/null 2>&1) && ok "checkDocLinks clean" || bad "checkDocLinks"
  result
}

untouched() {
  say "Untouched — the real configuration vs the baseline"
  [ -f "$D_RAW.baseline" ] || { echo "No baseline at $D_RAW.baseline. Run setup first."; exit 2; }
  config_manifest >"$D_RAW.now"
  if diff -u "$D_RAW.baseline" "$D_RAW.now" >"$D_RAW.diff"; then
    ok "every entry hashes as it did before setup ($(wc -l <"$D_RAW.now" | tr -d ' ') entries)"
    rm -f "$D_RAW.now" "$D_RAW.diff"
  else
    bad "the real configuration changed (see $D_RAW.diff)"; head -20 "$D_RAW.diff" | show
  fi
  result
}

clean() {
  say "Clean"
  local h
  for h in "$D"/*-*; do
    [ -d "$h" ] || continue
    [ -S "$h/.grok/leader.sock" ] && note "grok leader under ${h/#$D/\$D}: stopping" && env HOME="$h" GROK_HOME="$h/.grok" grok leader kill >/dev/null 2>&1
    rm -f "$h/.gemini/oauth_creds.json" "$h/.gemini/google_accounts.json" "$h/.gemini/antigravity-cli/antigravity-oauth-token" 2>/dev/null
  done
  if [ -d "$D/claude-login" ]; then
    # Claude Code keeps the scratch login's token in the macOS keychain, keyed to the
    # config dir; removing the dir orphans the token. Name it so the Navigator can delete
    # it: the entry created since setup, `Claude Code-credentials-<hash>`.
    local since; since="$(stat -f '%Sm' -t '%Y%m%d%H%M%S' "$D_RAW.baseline" 2>/dev/null)"
    security dump-keychain 2>/dev/null | grep -o '"svce"<blob>="Claude Code-credentials-[^"]*"' | sed 's/.*="\(.*\)"/\1/' | sort -u | while IFS= read -r svc; do
      c="$(security find-generic-password -s "$svc" 2>/dev/null | grep '"cdat"' | grep -o '"[0-9]\{14\}' | tr -d '"')"
      [ -n "$since" ] && [ "$c" \> "$since" ] && note "keychain entry from this route's Claude login: $svc (created $c UTC); remove it with: security delete-generic-password -s \"$svc\""
    done
    note "removing the Claude Code scratch login dir"
  fi
  [ -d "$D/codex-login" ] && note "removing the Codex scratch login dir (CODEX_HOME=$CODEX_LOGIN_DIR codex logout first if you prefer)"
  [ -d "$AGY_LOGIN_HOME" ] && rm -f "$AGY_LOGIN_HOME/.gemini/antigravity-cli/antigravity-oauth-token" "$AGY_LOGIN_HOME/.gemini/oauth_creds.json" && note "agy scratch credential removed"
  pgrep -fl "codex.*$D" 2>/dev/null | sed 's/^/      | still running: /' && pkill -f "codex.*$D" 2>/dev/null && note "stopped codex processes under the scratch directory"
  pgrep -fl "probe-mcp.mjs" 2>/dev/null | sed 's/^/      | still running: /' && pkill -f "probe-mcp.mjs" 2>/dev/null && note "stopped probe servers"
  [ -f "$D_RAW/.ds5-ts1" ] && rm -rf "$D_RAW" && ok "removed $D_RAW (the baseline stays at $D_RAW.baseline for untouched)" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup ;;
  probe) probe ;;
  shape-a) shape_a ;;
  shape-b) shape_b ;;
  shape-c) shape_c ;;
  live) live "${2:-}" "${3:-}" "${4:-}" ;;
  static) static ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,33p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
