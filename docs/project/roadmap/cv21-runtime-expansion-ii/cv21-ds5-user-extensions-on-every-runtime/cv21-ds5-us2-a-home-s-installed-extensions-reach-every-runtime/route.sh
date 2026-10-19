#!/usr/bin/env bash
# CV21.DS5.US2 — a home's installed extensions reach every runtime.
#
# Every step is isolated under a scratch directory (DS5_US2_DIR, default
# /tmp/cv21-ds5-us2). The real claude, codex, agy, and grok binaries run only with
# a scratch HOME and each runtime's own home variable (CLAUDE_CONFIG_DIR,
# CODEX_HOME, GROK_HOME), from an empty project, with no model call and no login.
# `untouched` READS the real configuration, against a baseline kept BESIDE the
# scratch directory (TS1's lesson: clean removed its own baseline).
#
#   bash route.sh setup       pack, install into a prefix whose path holds a space,
#                             a scratch Mirror home with review-copy, the baseline
#   bash route.sh probe       versions; Grok with and without --trust on a
#                             skills-only plugin; Codex's cache after a version change
#   bash route.sh generate    the plugin as `mirror extensions install` writes it:
#                             the tree, the version held on a second install, the
#                             report's block with stand-in PATH and homes, the counts
#   bash route.sh wire        a negative read, the printed step, the reader, per runtime
#   bash route.sh change      the three transitions — added, changed, removed — each
#                             one generation, diagnose, the reinstalls, the readers
#   bash route.sh two-homes   a second home's plugin wired beside the first
#   bash route.sh diagnose    a dangling link, two Grok copies, a copy at a version
#                             the home never produced, nothing on a clean home
#   bash route.sh cost        Codex's prompt bytes: no plugin, one skill, thirteen
#   bash route.sh static      the contract, REFERENCE, pack-contents, the smokes
#   bash route.sh clean       stop what the route spawned, remove the scratch directory
#   bash route.sh untouched   the real configuration vs the baseline
#
# Raw outputs stay under $D/evidence (never committed); the summary each step
# prints is what test-guide.md records.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
HERE="$(dirname "$SELF")"
ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
D_RAW="${DS5_US2_DIR:-/tmp/cv21-ds5-us2}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"
USER1=us2user
USER2=us2other
RUNTIMES="claude codex agy grok"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/pre fix"
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  EVIDENCE="$D/evidence"
  PROJECT="$D/project"
  MHOME="$D/homes/$USER1"
  MHOME2="$D/homes/$USER2"
  PLUGIN="$MHOME/runtime/plugin/mirror-ext-$USER1"
  MARKET="$MHOME/runtime/plugin"
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
result() { say "Result"; printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]; }

keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  { printf '$ %s\n' "$*"; "$@"; printf '\nexit %s\n' "$?"; } >"$EVIDENCE/$name.out" 2>&1
}
body_of() { sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/$1.out"; }
exit_of() { sed -n 's/^exit \([0-9]*\)$/\1/p' "$EVIDENCE/$1.out" | tail -1; }
row() { mkdir -p "$EVIDENCE"; printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$EVIDENCE/table.tsv"; look "$2 · $3: $4"; }

versions_now() {
  local rt; for rt in claude codex agy grok; do
    printf '%s\t%s\t%s\n' "$rt" "$("$rt" --version 2>/dev/null | head -1)" "$(readlink -f "$(command -v "$rt" 2>/dev/null)" 2>/dev/null)"
  done
}
need_install() { [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }; }
need_probe() {
  need_install
  [ -f "$EVIDENCE/versions.tsv" ] || { echo "Run probe first: bash $SELF probe"; exit 2; }
  if ! diff -q <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) >/dev/null; then
    echo "a runtime changed version since the probe; re-run probe:"; diff <(cut -f1,2 "$EVIDENCE/versions.tsv") <(versions_now | cut -f1,2) | sed 's/^/  /'; exit 2
  fi
}
evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  versions_now | while IFS=$'\t' read -r rt ver bin; do look "$rt: ${ver:-not on the PATH} — $bin"; done
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
}

# A scratch HOME per runtime per step; the scratch install first on the PATH.
fresh_home() {
  local home="$1"; rm -rf "$home"
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
# `mirror` against a scratch Mirror home, with the readers pointed at a scratch HOME ($1)
# and a PATH that holds the stand-in runtimes named in $2 (space-separated) or the real ones.
mirror_in() { # $1 home, $2 mirror-home, $3.. args
  local home="$1" mh="$2"; shift 2
  in_home "$home" mirror "$@" --mirror-home "$mh"
}

write_readers() {
  cat >"$D/readers.js" <<'EOF'
const fs = require("fs");
const [kind, file, skill] = process.argv.slice(2);
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const want = skill || "ext-review-copy";
const out = (s) => { console.log(s); process.exit(0); };
if (kind === "grok-inspect") {
  let j; try { j = JSON.parse(text); } catch { out("grok: inspect not JSON"); }
  const skills = (j.skills || []).filter((s) => s.name.endsWith(want));
  const srcs = skills.map((s) => (s.source ? s.source.type + (s.source.plugin_name ? ":" + s.source.plugin_name : "") : "?"));
  out(`grok: ${skills.length ? "listed " + skills.length + " (" + srcs.join(" | ") + ")" : "not listed"}`);
}
if (kind === "codex-prompt") {
  const n = (text.match(new RegExp(want.replace(/[-]/g, "\\-"), "g")) || []).length;
  out(`codex: ${n ? "listed (" + n + " mentions)" : "not listed"}`);
}
if (kind === "codex-bytes") out(String(Buffer.byteLength(text, "utf8")));
EOF
}
read_grok() { keep "$1-grok-inspect" in_home "$2" grok inspect --json; body_of "$1-grok-inspect" >"$EVIDENCE/$1-grok-inspect.json"; node "$D/readers.js" grok-inspect "$EVIDENCE/$1-grok-inspect.json" "${3:-}"; }
read_codex() { keep "$1-codex-prompt" in_home "$2" codex debug prompt-input hello; node "$D/readers.js" codex-prompt "$EVIDENCE/$1-codex-prompt.out" "${3:-}"; }
read_agy() { # the staged tree
  local want="${3:-ext-review-copy}" staged; staged="$(find "$2/.gemini/config/plugins" -path "*/skills/$want/SKILL.md" 2>/dev/null | sed "s|^$2/|~/|" | tr '\n' ' ')"
  if [ -n "$staged" ]; then echo "agy: listed (staged: $staged)"; else echo "agy: not listed"; fi
}
read_claude() { keep "$1-claude-plugin-list" in_home "$2" claude plugin list; local n; n="$(grep -o 'mirror-ext-[a-z0-9]*' "$EVIDENCE/$1-claude-plugin-list.out" | sort -u | tr '\n' ' ')"; echo "claude: plugins [${n% }]"; }
read_rt() { # $1 rt, $2 tag, $3 home, $4 skill
  case "$1" in grok) read_grok "$2" "$3" "${4:-}" ;; codex) read_codex "$2" "$3" "${4:-}" ;; agy) read_agy "$2" "$3" "${4:-}" ;; claude) read_claude "$2" "$3" ;; esac
}

# The real configuration this route promises not to touch (TS1's set).
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
    if [ -L "$path" ]; then printf 'L %s -> %s\n' "$rel" "$(readlink "$path")"
    elif [ -f "$path" ]; then printf 'F %s %s\n' "$rel" "$(shasum -a 256 "$path" | cut -d' ' -f1)"
    elif [ -d "$path" ]; then
      find "$path" -maxdepth 5 \( -type f -o -type l \) 2>/dev/null | LC_ALL=C sort | while read -r f; do
        if [ -L "$f" ]; then printf 'L %s -> %s\n' "${f#"$REAL_HOME"/}" "$(readlink "$f")"
        else printf 'F %s %s\n' "${f#"$REAL_HOME"/}" "$(shasum -a 256 "$f" | cut -d' ' -f1)"; fi
      done
    else printf -- "- %s absent\n" "$rel"; fi
  done
}

# The printed step for a runtime, taken from the report's own block (never retyped).
printed_steps() { # $1 rt title, $2 report file -> that runtime's commands, one per line
  awk -v t="$1" '
    $0 ~ "^    " t ": " { inside = 1; sub("^    " t ": [^—]*— ", ""); print; next }
    $0 ~ "^    [A-Z][A-Za-z ]*: " { inside = 0; next }
    inside && $0 ~ "^ +then " { sub("^ +then ", ""); print; next }
    inside && $0 ~ "^ +\\(" { next }
    { inside = 0 }
  ' "$2"
}
run_steps() { # $1 home, $2 tag, then the commands on stdin: each run through in_home with bash -c
  local home="$1" tag="$2" i=0 cmd
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    case "$cmd" in \(*) continue ;; esac
    i=$((i + 1)); keep "$tag-step$i" in_home "$home" bash -c "$cmd"
    look "ran: $cmd (exit $(exit_of "$tag-step$i"))"
  done
}
plugin_version() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$1/.claude-plugin/plugin.json" 2>/dev/null; }

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install, scratch Mirror home with review-copy, the baseline beside the scratch dir"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds5-us2" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then echo "$D_RAW exists and is not this route's directory"; exit 2; fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds5-us2" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT" "$D/homes"
  config_manifest >"$D_RAW.baseline"
  ok "real configuration recorded beside the scratch directory: $(wc -l <"$D_RAW.baseline" | tr -d ' ') entries"
  local TARBALL; TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) && ok "installed into a prefix whose path holds a space" || { bad "npm install failed"; result; return; }
  local H="$D/home-setup"; fresh_home "$H"
  keep mirror-init in_home "$H" env MIRROR_HOME="$MHOME" mirror init "$USER1"
  mkdir -p "$MHOME"
  write_readers
  result
}

# ---------------------------------------------------------------------------
probe() {
  say "Probe — versions; Grok without --trust; Codex's cache key (plan.md step 0)"
  need_install; evidence_header; versions_now >"$EVIDENCE/versions.tsv"; write_readers
  local rt; for rt in $RUNTIMES; do command -v "$rt" >/dev/null 2>&1 && ok "$rt on the PATH" || bad "$rt not on the PATH"; done
  # A skills-only fixture plugin, hand-made, like TS1's shape (b).
  local F="$D/plugin-fixture"; rm -rf "$F"; mkdir -p "$F/.claude-plugin" "$F/skills/ext-probe"
  printf -- '---\nname: "ext-probe"\ndescription: probe\n---\n# Probe\n' >"$F/skills/ext-probe/SKILL.md"
  local m='{"name":"ds5-us2-probe","version":"0.1.1","description":"probe"}'; echo "$m" >"$F/.claude-plugin/plugin.json"; echo "$m" >"$F/plugin.json"

  say "1. Grok: a skills-only plugin installed with and without --trust"
  local H="$D/probe-grok-notrust"; fresh_home "$H"
  keep probe-grok-install-notrust in_home "$H" grok plugin install "$F"
  tail -3 "$EVIDENCE/probe-grok-install-notrust.out" | show
  row probe grok "without --trust" "$(read_grok probe-grok-notrust "$H" ext-probe)"
  H="$D/probe-grok-trust"; fresh_home "$H"
  keep probe-grok-install-trust in_home "$H" grok plugin install "$F" --trust
  row probe grok "with --trust" "$(read_grok probe-grok-trust "$H" ext-probe)"

  say "2. Codex: the cache after a version change and a re-add"
  H="$D/probe-codex"; fresh_home "$H"
  local MP="$D/probe-mp"; rm -rf "$MP"; mkdir -p "$MP/.agents/plugins"; ln -s "$F" "$MP/ds5-us2-probe"
  printf '{"name":"ds5-us2-probe","owner":{"name":"route"},"plugins":[{"name":"ds5-us2-probe","source":{"source":"local","path":"./ds5-us2-probe"},"description":"probe"}]}\n' >"$MP/.agents/plugins/marketplace.json"
  keep probe-codex-mp in_home "$H" codex plugin marketplace add "$MP"
  keep probe-codex-add1 in_home "$H" codex plugin add ds5-us2-probe@ds5-us2-probe
  row probe codex "cache after 0.1.1" "$(ls "$H/.codex/plugins/cache/ds5-us2-probe/ds5-us2-probe/" 2>/dev/null | tr '\n' ' ')"
  m='{"name":"ds5-us2-probe","version":"0.1.2","description":"probe"}'; echo "$m" >"$F/.claude-plugin/plugin.json"; echo "$m" >"$F/plugin.json"
  keep probe-codex-add2 in_home "$H" codex plugin add ds5-us2-probe@ds5-us2-probe
  row probe codex "cache after 0.1.2 re-add" "$(ls "$H/.codex/plugins/cache/ds5-us2-probe/ds5-us2-probe/" 2>/dev/null | tr '\n' ' ')"
  row probe codex "prompt lists" "$(read_codex probe-codex "$H" ext-probe)"
  result
}

# ---------------------------------------------------------------------------
generate() {
  say "Generate — the plugin as mirror extensions install writes it (plan.md step 1)"
  need_probe
  local H="$D/home-generate"; fresh_home "$H"
  look "the tree before any install, after review-copy's install:"
  keep gen-install mirror_in "$H" "$MHOME" extensions install review-copy --extensions-root "$ROOT/examples/extensions"
  [ "$(exit_of gen-install)" = 0 ] && ok "review-copy installed (exit 0)" || { bad "install failed"; tail -3 "$EVIDENCE/gen-install.out" | show; }
  local tree; tree="$(cd "$MARKET" && find . \( -type f -o -type l \) | LC_ALL=C sort | sed 's|^\./||')"
  echo "$tree" | show
  [ "$tree" = "$(printf '.agents/plugins/marketplace.json\nmirror-ext-%s/.claude-plugin/plugin.json\nmirror-ext-%s/plugin.json\nmirror-ext-%s/skills/ext-review-copy/SKILL.md' "$USER1" "$USER1" "$USER1")" ] && ok "exactly the planned files" || bad "the tree differs from the plan's layout"
  [ -z "$(find "$MARKET" -type l)" ] && ok "no link in the tree" || bad "a link in the tree"
  [ "$(stat -f '%Lp' "$MARKET")" = "700" ] && ok "runtime/plugin is 0700" || bad "mode $(stat -f '%Lp' "$MARKET")"
  row generate plugin version "$(plugin_version "$PLUGIN")"
  [ "$(plugin_version "$PLUGIN")" = "0.1.1" ] && ok "version 0.1.1" || bad "version $(plugin_version "$PLUGIN")"
  cmp -s "$PLUGIN/skills/ext-review-copy/SKILL.md" "$MHOME/runtime/skills/claude/ext-review-copy/SKILL.md" && ok "the skill is the catalog's file byte for byte" || bad "the skill differs from the catalog's"
  grep -q 'hooks\|mcpServers\|commands' "$PLUGIN/.claude-plugin/plugin.json" && bad "the manifest carries hooks/mcpServers/commands" || ok "no hooks, no mcpServers, no commands in the manifest"
  grep -q "Extensions of the Mirror home $USER1: 1 skill" "$PLUGIN/plugin.json" && ok "the description names the home" || bad "description: $(grep description "$PLUGIN/plugin.json")"
  look "the report's block (real PATH, scratch HOME: every runtime on this machine not wired):"
  grep -A8 '^  plugin:' "$EVIDENCE/gen-install.out" | show
  grep -q "^  plugin: mirror-ext-$USER1 0.1.1, 1 skill" "$EVIDENCE/gen-install.out" && ok "the plugin line" || bad "no plugin line"
  grep -q '^    Pi' "$EVIDENCE/gen-install.out" && bad "a line for Pi" || ok "no line for Pi"
  look "a second install with nothing changed:"
  local before; before="$(cd "$MARKET" && find . -type f -exec shasum -a 256 {} + | LC_ALL=C sort)"
  keep gen-install2 mirror_in "$H" "$MHOME" extensions install review-copy --extensions-root "$ROOT/examples/extensions"
  [ "$before" = "$(cd "$MARKET" && find . -type f -exec shasum -a 256 {} + | LC_ALL=C sort)" ] && ok "byte-identical tree" || bad "the tree changed"
  grep -q "^  plugin: mirror-ext-$USER1 0.1.1, 1 skill" "$EVIDENCE/gen-install2.out" && ok "version held at 0.1.1" || bad "$(grep '^  plugin' "$EVIDENCE/gen-install2.out")"
  look "the block with a PATH holding only a stand-in codex (no real runtime):"
  local SB="$D/standin-bin"; rm -rf "$SB"; mkdir -p "$SB"; printf '#!/bin/sh\nexit 0\n' >"$SB/codex"; chmod +x "$SB/codex"
  keep gen-standin env -u MIRROR_USER -u MIRROR_HOME HOME="$H" PATH="$SB:$PREFIX/bin:$NODE_DIR" mirror extensions install review-copy --extensions-root "$ROOT/examples/extensions" --mirror-home "$MHOME"
  grep -A3 '^  plugin:' "$EVIDENCE/gen-standin.out" | show
  grep -q '^    Codex: not wired' "$EVIDENCE/gen-standin.out" && ok "Codex's line, and" || bad "no Codex line"
  grep -q '^    \(Claude Code\|Antigravity\|Grok Build\):' "$EVIDENCE/gen-standin.out" && bad "a line for a runtime absent from the PATH" || ok "none for the runtimes absent from that PATH"
  look "the count, three ways:"
  local c1 c2 c3; c1="$(grep -o '^  plugin: [^,]*, [0-9]* skill' "$EVIDENCE/gen-install.out" | grep -o '[0-9]* skill' | cut -d' ' -f1)"
  keep gen-status mirror_in "$H" "$MHOME" runtime status; c2="$(grep -o 'Extensions plugin: .*(\([0-9]*\) skill' "$EVIDENCE/gen-status.out" | grep -o '([0-9]*' | tr -d '(')"
  c3="$(find "$PLUGIN/skills" -name SKILL.md | wc -l | tr -d ' ')"
  [ "$c1" = "$c2" ] && [ "$c2" = "$c3" ] && ok "report $c1 = status $c2 = tree $c3" || bad "report $c1, status $c2, tree $c3"
  result
}

# ---------------------------------------------------------------------------
wire() {
  say "Wire — the printed step per runtime, then the reader (plan.md step 2)"
  need_probe; [ -d "$PLUGIN" ] || { echo "run generate first"; exit 2; }
  local rt H tag title
  for rt in $RUNTIMES; do
    H="$D/wire-$rt"; fresh_home "$H"; tag="wire-$rt"
    case "$rt" in claude) title="Claude Code" ;; codex) title="Codex" ;; agy) title="Antigravity" ;; grok) title="Grok Build" ;; esac
    say "$rt"
    look "negative read on the clean home:"; read_rt "$rt" "$tag-before" "$H" | tee "$EVIDENCE/$tag-before.txt" | show
    grep -q ': listed\|plugins \[mirror' "$EVIDENCE/$tag-before.txt" && bad "listed before wiring" || ok "nothing before wiring"
    keep "$tag-report" mirror_in "$H" "$MHOME" extensions install review-copy --extensions-root "$ROOT/examples/extensions"
    look "the printed step(s):"; printed_steps "$title" "$EVIDENCE/$tag-report.out" | show
    printed_steps "$title" "$EVIDENCE/$tag-report.out" | run_steps "$H" "$tag"
    look "the reader:"; read_rt "$rt" "$tag" "$H" | tee "$EVIDENCE/$tag.txt" | show
    row wire "$rt" listed "$(cat "$EVIDENCE/$tag.txt")"
    keep "$tag-after" mirror_in "$H" "$MHOME" extensions install review-copy --extensions-root "$ROOT/examples/extensions"
    grep "$title" "$EVIDENCE/$tag-after.out" | show
    if grep -q "^    $title:" "$EVIDENCE/$tag-after.out"; then bad "the next report still names $title: $(grep "^    $title:" "$EVIDENCE/$tag-after.out")"; else ok "the next report has no line for $title: wired"; fi
  done
  result
}

# ---------------------------------------------------------------------------
# The three transitions, on the homes `wire` left: a second extension added, review-copy
# changed, review-copy removed. Each one generation; diagnose names the copies; the
# reinstall is the report's own line; the reader confirms.
transition() { # $1 label, $2 expected version, $3 skill to read, $4 expect listed (1/0)
  local label="$1" want="$2" skill="$3" expect="$4" rt H tag title
  say "$label → expected version $want"
  [ "$(plugin_version "$PLUGIN")" = "$want" ] && ok "version $want" || bad "version $(plugin_version "$PLUGIN"), expected $want"
  for rt in $RUNTIMES; do
    H="$D/wire-$rt"; tag="change-$label-$rt"
    case "$rt" in claude) title="Claude Code" ;; codex) title="Codex" ;; agy) title="Antigravity" ;; grok) title="Grok Build" ;; esac
    keep "$tag-diagnose" mirror_in "$H" "$MHOME" runtime diagnose
    local codes; codes="$(grep -o 'ext_plugin_[a-z_]*' "$EVIDENCE/$tag-diagnose.out" | sort -u | tr '\n' ' ')"
    if [ "$rt" = claude ]; then [ -z "$codes" ] && ok "claude: no finding (a link)" || bad "claude: $codes"
    else case "$codes" in *stale*) ok "$rt: diagnose names a stale copy ($codes)" ;; *) bad "$rt: no stale finding ($codes)" ;; esac; fi
    # The report, refreshed by a no-op install of an extension that stays installed
    # throughout (its source is the home's own copy): `sync --extensions-root` would
    # rewrite the catalog from that root, which the route's first version did.
    keep "$tag-report" mirror_in "$H" "$MHOME" extensions install us2-second --extensions-root "$MHOME/extensions"
    grep "^    $title:" "$EVIDENCE/$tag-report.out" | show
    printed_steps "$title" "$EVIDENCE/$tag-report.out" | run_steps "$H" "$tag"
    read_rt "$rt" "$tag" "$H" "$skill" | tee "$EVIDENCE/$tag.txt" | show
    if [ "$expect" = 1 ]; then grep -q ': listed\|plugins \[' "$EVIDENCE/$tag.txt" && ok "$rt lists $skill after the reinstall" || bad "$rt does not list $skill"
    else grep -q ': listed' "$EVIDENCE/$tag.txt" && bad "$rt still lists $skill" || ok "$rt no longer lists $skill"; fi
    [ "$rt" = claude ] && [ "$expect" = 0 ] && { [ -f "$H/.claude/skills/mirror-ext-$USER1/skills/$skill/SKILL.md" ] && bad "claude's link still shows $skill" || ok "claude's link no longer shows $skill"; }
    keep "$tag-diagnose2" mirror_in "$H" "$MHOME" runtime diagnose
    grep -q 'ext_plugin_' "$EVIDENCE/$tag-diagnose2.out" && bad "$rt: diagnose not clean after the reinstall" || ok "$rt: diagnose clean"
  done
}
change() {
  say "Change — added, changed, removed (plan.md step 3)"
  need_probe; [ -d "$D/wire-grok" ] || { echo "run wire first"; exit 2; }
  local STAND="$D/standin-ext"; rm -rf "$STAND"; mkdir -p "$STAND/us2-second"
  printf 'id: us2-second\nname: Second\ncategory: extension\nkind: prompt-skill\nsummary: a second extension\nruntimes:\n  claude:\n    command_name: ext:us2-second\n    skill_file: SKILL.md\n' >"$STAND/us2-second/skill.yaml"
  printf -- '---\nname: "ext-us2-second"\ndescription: the second extension\n---\n# Second\n' >"$STAND/us2-second/SKILL.md"
  keep change-add mirror_in "$D/wire-grok" "$MHOME" extensions install us2-second --extensions-root "$STAND"
  grep -A6 '^  plugin:' "$EVIDENCE/change-add.out" | show
  transition added 0.1.2 ext-us2-second 1
  printf '\nChanged in place by the route.\n' >>"$MHOME/extensions/review-copy/SKILL.md"
  keep change-edit mirror_in "$D/wire-grok" "$MHOME" extensions install review-copy --extensions-root "$MHOME/extensions"
  grep -A6 '^  plugin:' "$EVIDENCE/change-edit.out" | show
  grep -q 'Changed in place by the route' "$PLUGIN/skills/ext-review-copy/SKILL.md" && ok "the plugin carries the change" || bad "the plugin does not carry the change"
  transition changed 0.1.3 ext-review-copy 1
  keep change-uninstall mirror_in "$D/wire-grok" "$MHOME" extensions uninstall review-copy
  grep -A6 '^  plugin:' "$EVIDENCE/change-uninstall.out" | show
  grep -q 'still has ext-review-copy' "$EVIDENCE/change-uninstall.out" && ok "the report says what the copies still have" || note "no 'still has' line (every copy may already be level, or no runtime on the PATH)"
  transition removed 0.1.4 ext-review-copy 0
  result
}

# ---------------------------------------------------------------------------
two_homes() {
  say "Two homes — a second home's plugin beside the first (plan.md step 4)"
  need_probe
  local H2="$D/home-two"; fresh_home "$H2"
  keep two-init in_home "$H2" env MIRROR_HOME="$MHOME2" mirror init "$USER2"; mkdir -p "$MHOME2"
  keep two-install mirror_in "$H2" "$MHOME2" extensions install review-copy --extensions-root "$ROOT/examples/extensions"
  local rt H tag title
  for rt in $RUNTIMES; do
    H="$D/wire-$rt"; tag="two-$rt"
    case "$rt" in claude) title="Claude Code" ;; codex) title="Codex" ;; agy) title="Antigravity" ;; grok) title="Grok Build" ;; esac
    keep "$tag-report" mirror_in "$H" "$MHOME2" extensions install review-copy --extensions-root "$MHOME2/extensions"
    printed_steps "$title" "$EVIDENCE/$tag-report.out" | run_steps "$H" "$tag"
    case "$rt" in
      claude) read_claude "$tag" "$H" | tee "$EVIDENCE/$tag.txt" | show ;;
      codex) keep "$tag-codex-prompt" in_home "$H" codex debug prompt-input hello; grep -o "mirror-ext-[a-z0-9]*:ext-[a-z0-9-]*" "$EVIDENCE/$tag-codex-prompt.out" | sed "s/:.*//" | sort -u | tr '\n' ' ' | sed 's/^/codex: /' | tee "$EVIDENCE/$tag.txt" | show; echo ;;
      agy) find "$H/.gemini/config/plugins" -maxdepth 1 -name 'mirror-ext-*' | sed "s|.*/||" | tr '\n' ' ' | sed 's/^/agy: /' | tee "$EVIDENCE/$tag.txt" | show; echo ;;
      grok) keep "$tag-grok-inspect" in_home "$H" grok inspect --json; node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(l=>!/^\$|^exit /.test(l)).join("\n"));console.log("grok: "+(j.plugins||[]).map(p=>p.name).join(" "))' "$EVIDENCE/$tag-grok-inspect.out" | tee "$EVIDENCE/$tag.txt" | show ;;
    esac
    grep -q "mirror-ext-$USER1" "$EVIDENCE/$tag.txt" && grep -q "mirror-ext-$USER2" "$EVIDENCE/$tag.txt" && ok "$rt holds both homes' plugins" || bad "$rt: $(cat "$EVIDENCE/$tag.txt")"
  done
  result
}

# ---------------------------------------------------------------------------
diagnose_step() {
  say "Diagnose — a dangling link, two Grok copies, a never-produced version, a clean home"
  need_probe
  local H="$D/diag"; fresh_home "$H"
  keep diag-clean mirror_in "$H" "$MHOME" runtime diagnose
  grep -q 'ext_plugin_' "$EVIDENCE/diag-clean.out" && bad "a finding on a home with nothing wired" || ok "nothing wired: no finding"
  mkdir -p "$H/.claude/skills"; ln -s "$D/nowhere" "$H/.claude/skills/mirror-ext-$USER1"
  keep diag-dangling mirror_in "$H" "$MHOME" runtime diagnose
  grep -q 'ext_plugin_claude_link_dangling' "$EVIDENCE/diag-dangling.out" && ok "a dangling link is one finding" || bad "no dangling finding"
  rm "$H/.claude/skills/mirror-ext-$USER1"
  keep diag-grok1 in_home "$H" grok plugin install "$PLUGIN" --trust
  local RESPELT="/private${MARKET#/private}"; [ "$RESPELT" = "$MARKET" ] && RESPELT="${MARKET/\/private/}"
  keep diag-grok2 in_home "$H" grok plugin install "$RESPELT/mirror-ext-$USER1" --trust
  keep diag-dup mirror_in "$H" "$MHOME" runtime diagnose
  grep -q 'ext_plugin_grok_copies_duplicated' "$EVIDENCE/diag-dup.out" && ok "two Grok copies are one finding" || bad "no duplicate finding: $(grep -o 'ext_plugin_[a-z_]*' "$EVIDENCE/diag-dup.out" | sort -u | tr '\n' ' ')"
  look "a copy at a version the home never produced (the copy's manifest edited to 0.1.9):"
  local copy; copy="$(find "$H/.grok/installed-plugins" -path '*/.claude-plugin/plugin.json' | head -1)"
  keep diag-grok-rm1 in_home "$H" grok plugin uninstall "mirror-ext-$USER1" --confirm
  copy="$(find "$H/.grok/installed-plugins" -path '*/.claude-plugin/plugin.json' | head -1)"
  [ -n "$copy" ] && sed -i '' 's/"version": "0\.1\.[0-9]*"/"version": "0.1.9"/' "$copy"
  keep diag-ahead mirror_in "$H" "$MHOME" runtime diagnose
  grep -q 'ext_plugin_grok_copy_stale' "$EVIDENCE/diag-ahead.out" && ok "a copy 'ahead' of the home is stale, not silent" || bad "a never-produced version is silent"
  result
}

# ---------------------------------------------------------------------------
cost() {
  say "Cost — Codex's prompt bytes with no plugin, one skill, thirteen (plan.md amendment 16)"
  need_probe
  local H="$D/cost"; fresh_home "$H" b0 b1 b13
  keep cost-0 in_home "$H" codex debug prompt-input hello; b0="$(node "$D/readers.js" codex-bytes "$EVIDENCE/cost-0.out")"
  printed_steps "Codex" "$EVIDENCE/wire-codex-report.out" | run_steps "$H" cost-wire1 >/dev/null
  keep cost-1 in_home "$H" codex debug prompt-input hello; b1="$(node "$D/readers.js" codex-bytes "$EVIDENCE/cost-1.out")"
  local STAND="$D/standin-13" i; rm -rf "$STAND"
  for i in 01 02 03 04 05 06 07 08 09 10 11 12; do
    mkdir -p "$STAND/us2-ext$i"
    printf 'id: us2-ext%s\nname: Ext %s\ncategory: extension\nkind: prompt-skill\nsummary: a stand-in extension\nruntimes:\n  claude:\n    command_name: ext:us2-ext%s\n    skill_file: SKILL.md\n' "$i" "$i" "$i" >"$STAND/us2-ext$i/skill.yaml"
    printf -- '---\nname: "ext-us2-ext%s"\ndescription: Stand-in extension %s, which does one thing a user might ask for\n---\n# Ext %s\n' "$i" "$i" "$i" >"$STAND/us2-ext$i/SKILL.md"
    keep "cost-install-$i" mirror_in "$H" "$MHOME" extensions install "us2-ext$i" --extensions-root "$STAND"
  done
  keep cost-readd in_home "$H" bash -c "codex plugin add mirror-ext-$USER1@mirror-ext-$USER1"
  keep cost-13 in_home "$H" codex debug prompt-input hello; b13="$(node "$D/readers.js" codex-bytes "$EVIDENCE/cost-13.out")"
  row cost codex "prompt bytes" "none $b0, one skill $b1, thirteen $b13; per extension ≈ $(( (b13 - b1) / 12 )) bytes"
  result
}

# ---------------------------------------------------------------------------
static() {
  say "Static — the records and the checks"
  grep -q 'per-home extensions plugin' "$ROOT/docs/product/specs/runtime-interface/index.md" && ok "the contract carries the plugin section" || bad "contract"
  grep -q 'ext_plugin_codex_cache_stale' "$ROOT/REFERENCE.md" && ok "REFERENCE names the findings" || bad "REFERENCE"
  (cd "$ROOT" && node ts/scripts/checkDocLinks.ts >/dev/null 2>&1) && ok "checkDocLinks clean" || bad "checkDocLinks"
  (cd "$ROOT" && node ts/scripts/checkPackContents.ts >/dev/null 2>&1) && ok "pack contents" || bad "pack contents"
  (cd "$ROOT" && bash scripts/smoke_npm_package.sh >"$EVIDENCE/smoke-npm.out" 2>&1) && ok "smoke_npm_package" || bad "smoke_npm_package: $(tail -2 "$EVIDENCE/smoke-npm.out" | tr '\n' ' ')"
  (cd "$ROOT" && bash scripts/smoke_claude_plugin.sh >"$EVIDENCE/smoke-plugin.out" 2>&1) && ok "smoke_claude_plugin" || note "smoke_claude_plugin: $(tail -1 "$EVIDENCE/smoke-plugin.out") (CR142 on this machine)"
  result
}

untouched() {
  say "Untouched — the real configuration vs the baseline"
  [ -f "$D_RAW.baseline" ] || { echo "No baseline at $D_RAW.baseline. Run setup first."; exit 2; }
  config_manifest >"$D_RAW.now"
  if diff -u "$D_RAW.baseline" "$D_RAW.now" >"$D_RAW.diff"; then ok "every entry hashes as it did before setup ($(wc -l <"$D_RAW.now" | tr -d ' ') entries)"; rm -f "$D_RAW.now" "$D_RAW.diff"
  else bad "the real configuration changed (see $D_RAW.diff)"; head -20 "$D_RAW.diff" | show; fi
  result
}

clean() {
  say "Clean"
  local h
  for h in "$D"/*; do
    [ -d "$h" ] || continue
    [ -S "$h/.grok/leader.sock" ] && note "grok leader under ${h/#$D/\$D}: stopping" && env HOME="$h" GROK_HOME="$h/.grok" grok leader kill >/dev/null 2>&1
  done
  pgrep -fl "codex.*$D" >/dev/null 2>&1 && pkill -f "codex.*$D" && note "stopped codex processes under the scratch directory"
  [ -f "$D_RAW/.ds5-us2" ] && rm -rf "$D_RAW" && ok "removed $D_RAW (the baseline stays at $D_RAW.baseline for untouched)" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup ;; probe) probe ;; generate) generate ;; wire) wire ;; change) change ;;
  two-homes) two_homes ;; diagnose) diagnose_step ;; cost) cost ;; static) static ;;
  untouched) untouched ;; clean) clean ;;
  *) sed -n '2,30p' "$SELF" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
