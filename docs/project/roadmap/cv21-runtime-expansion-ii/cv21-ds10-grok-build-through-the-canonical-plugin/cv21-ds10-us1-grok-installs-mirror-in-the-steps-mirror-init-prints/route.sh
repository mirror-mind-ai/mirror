#!/usr/bin/env bash
# CV21.DS10.US1 — Grok installs Mirror in the steps `mirror init` prints.
#
# Every step is isolated under a scratch directory (DS10_US1_DIR, default
# /tmp/cv21-ds10-us1). Nothing here reads or writes ~/.grok, ~/.claude,
# ~/.mirror-minds, or the checkout: the real `grok` binary runs only with a
# scratch HOME and a scratch GROK_HOME, from an empty project, with no model
# call. `untouched` READS the real configuration, to prove nothing reached it.
#
#   bash route.sh setup       pack, install into a prefix whose path holds a
#                             space, record the real-config baseline
#   bash route.sh probe       the install shapes (a)–(e) of plan.md, measured
#                             on the installed Grok; the decision rule applied
#   bash route.sh static      what `mirror init` prints, the other blocks held, the
#                             docs tables in step, the two package smokes
#   bash route.sh guards      the manifest on every runtime that reads the plugin
#                             directory: one MCP server each (decision 1)
#   bash route.sh grok        the two printed steps on the installed Grok, read
#                             back by field, then undone
#   bash route.sh diagnose    one finding per broken Grok wiring, none when clean
#   bash route.sh untouched   real ~/.grok and ~/.claude configuration vs the baseline
#   bash route.sh clean       remove the scratch directory and any leader it spawned
#   bash route.sh all         setup, probe, static, guards, grok, diagnose, untouched
#
# Raw outputs stay under $D/evidence (never committed: they carry home paths);
# the summary each step prints is what test-guide.md records.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS10_US1_DIR:-/tmp/cv21-ds10-us1}"
REAL_PATH="$PATH"
REAL_HOME="$HOME"
NODE_DIR="$(dirname "$(command -v node)")"

resolve() {
  if [ -d "$D_RAW" ]; then D="$(cd "$D_RAW" && pwd -P)"; else D="$D_RAW"; fi
  PREFIX="$D/pre fix"                       # a space on purpose (DS4.US1 decision 3)
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  PLUGIN="$PKG/plugins/mirror-mind"
  EVIDENCE="$D/evidence"
  PROJECT="$D/project"
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

# The JSON body of a kept output: everything after the command line and before "exit N".
json_of() { sed -e '1d' -e '/^exit [0-9]*$/d' "$EVIDENCE/$1.out"; }

# The evidence rule's header: version, every binary on the PATH, the date, the package.
evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  look "grok: $(grok --version 2>/dev/null || echo 'not on the PATH')"
  look "binary: $(which -a grok 2>/dev/null | awk '!seen[$0]++' | tr '\n' ' ')"
  look "resolves to: $(readlink -f "$(command -v grok)" 2>/dev/null)"
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
  look "guide: $REAL_HOME/.grok/docs/user-guide/09-plugins.md ($(stat -f '%Sm' -t '%Y-%m-%d' "$REAL_HOME/.grok/docs/user-guide/09-plugins.md" 2>/dev/null || echo '?'))"
  mkdir -p "$EVIDENCE"
  printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(grok --version 2>/dev/null)" "$(readlink -f "$(command -v grok)")" >>"$EVIDENCE/versions.tsv"
}

# A clean scratch HOME for one shape: its own GROK_HOME, the scratch install first on
# the PATH (so plugin hooks and the MCP locator find it), nothing of the person's.
# HOME and GROK_HOME are both set (the guide names $GROK_HOME); which one Grok honours
# is a recorded finding.
fresh_home() {
  local home="$1"
  rm -rf "$home"
  mkdir -p "$home/.grok" "$home/.claude" "$home/.config"
  chmod 700 "$home"
}
in_home() {
  local home="$1" project="$2"; shift 2
  (cd "$project" && env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE \
    -u NODE_OPTIONS -u OPENROUTER_API_KEY -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$home" GROK_HOME="$home/.grok" DISABLE_AUTOUPDATER=1 \
    PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" "$@")
}

# Read one shape: list, details, inspect; summarise from Grok's own JSON, never from
# substrings over the whole document (QA amendment 3). The summariser prints the
# top-level keys it found so a schema change is visible, not silently zero.
# Read one shape from Grok's own JSON — `grok inspect --json` (top-level `plugins`,
# `skills`, `hooks`, `mcpServers`, `projectInstructions`) and `grok plugin list --json`
# — never from substrings over the whole document (QA amendment 3). The summariser
# names the keys it read, so a schema change shows as a named gap, not a silent zero.
read_shape() {
  local tag="$1" home="$2" project="${3:-$PROJECT}"
  keep "$tag-plugin-list" in_home "$home" "$project" grok plugin list --json
  keep "$tag-plugin-details" in_home "$home" "$project" grok plugin details mirror-mind
  keep "$tag-inspect" in_home "$home" "$project" grok inspect --json
  json_of "$tag-inspect" >"$EVIDENCE/$tag-inspect.json"
  json_of "$tag-plugin-list" >"$EVIDENCE/$tag-plugin-list.json"
  node "$D/summarise.js" "$EVIDENCE/$tag-inspect.json" "$EVIDENCE/$tag-plugin-list.json" "$PLUGIN" | tee "$EVIDENCE/$tag-summary.txt" | show
}

write_summariser() {
  cat >"$D/summarise.js" <<'EOF'
const fs = require("fs");
const [inspectPath, listPath, pluginDir] = process.argv.slice(2);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } };
const j = read(inspectPath), list = read(listPath);
const expected = fs.readdirSync(`${pluginDir}/skills`).filter((d) => fs.existsSync(`${pluginDir}/skills/${d}/SKILL.md`)).length;
if (!j) { console.log("inspect: not JSON"); process.exit(0); }
const miss = ["plugins", "skills", "hooks", "mcpServers", "projectInstructions", "projectTrusted"].filter((k) => !(k in j));
if (miss.length) console.log(`inspect: keys missing from the schema this summariser reads: ${miss.join(", ")}`);
const plugins = (j.plugins || []).map((p) => `${p.name}@${p.scope} enabled=${p.enabled} provides=${JSON.stringify(p.provides)} path=${p.path.replace(/^.*\/(\.grok\/.*)$/, "~/$1")}`);
console.log(`plugins discovered: ${plugins.length ? plugins.join(" | ") : "none"}`);
const skills = j.skills || [];
const mm = skills.filter((s) => /(^|:)mm-[a-z-]+$/.test(s.name));
const names = new Set(mm.map((s) => s.name.replace(/^.*:/, "")));
const bySource = {};
for (const s of mm) { const k = s.source ? s.source.type + (s.source.plugin_name ? ":" + s.source.plugin_name : "") : "?"; bySource[k] = (bySource[k] || 0) + 1; }
const qualified = mm.filter((s) => s.name.includes(":")).length;
console.log(`skills loaded: ${mm.length} mm-* entries, ${names.size} distinct names (plugin has ${expected}); by source ${JSON.stringify(bySource)}; qualified names ${qualified}`);
const hooks = (j.hooks || []).map((h) => `${h.event}/${h.hookType} source=${h.source ? h.source.type + (h.source.plugin_name ? ":" + h.source.plugin_name : "") : "?"} target=${(h.target || "").replace(/^.*\/(\.grok\/|\.claude\/)/, "~/$1")}`);
console.log(`hooks registered: ${hooks.length ? hooks.join(" | ") : "none"}`);
const mcp = (j.mcpServers || []).map((m) => `${m.name} ${m.transport} target=${m.target} source=${m.source ? m.source.type + (m.source.plugin_name ? ":" + m.source.plugin_name : "") : "?"}`);
console.log(`mcp servers: ${mcp.length ? mcp.join(" | ") : "none"}`);
const rules = (j.projectInstructions || []).map((r) => `${r.scope}/${r.fileType} ${r.path.replace(/^.*\/(\.grok\/.*)$/, "~/$1")} ~${r.approxTokens} tokens`);
console.log(`instructions loaded: ${rules.length ? rules.join(" | ") : "none"} (project trusted: ${j.projectTrusted})`);
const installed = Array.isArray(list) ? list.map((p) => `${p.name} status=${p.status} version=${p.version} key=${p.repo_key}`) : ["(no list)"];
console.log(`plugin list: ${installed.join(" | ") || "empty"}`);
EOF
}

# The real runtime configuration this route promises not to touch (devops amendment 6).
REAL_CONFIG=(
  .grok/config.toml .grok/settings.json .grok/hooks .grok/skills .grok/plugins .grok/rules
  .grok/installed-plugins .grok/marketplace-cache .grok/trusted-hook-projects
  .claude/settings.json .claude/settings.local.json .claude/skills .claude/plugins
  .gemini/config/plugins .gemini/config/import_manifest.json
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

# A plugin variant for the manifest shapes: a copy of the installed plugin with one
# change. The installed plugin itself is never edited.
variant() { # $1=name $2=shape
  local dir="$D/plugin-$1"
  rm -rf "$dir" && cp -R "$PLUGIN" "$dir"
  case "$2" in
    no-marker) rm "$dir/plugin.json" ;;
    grok-plugin-dir) mkdir -p "$dir/.grok-plugin" && cp "$dir/.claude-plugin/plugin.json" "$dir/.grok-plugin/plugin.json" ;;
    mcp-json) node -e 'const fs=require("fs"),d=process.argv[1];const m=JSON.parse(fs.readFileSync(d+"/.claude-plugin/plugin.json","utf8"));fs.writeFileSync(d+"/.mcp.json",JSON.stringify({mcpServers:m.mcpServers},null,2)+"\n")' "$dir" ;;
    marker-carries) node -e 'const fs=require("fs"),d=process.argv[1];const c=JSON.parse(fs.readFileSync(d+"/.claude-plugin/plugin.json","utf8"));const r=JSON.parse(fs.readFileSync(d+"/plugin.json","utf8"));r.version=c.version;r.mcpServers=c.mcpServers;fs.writeFileSync(d+"/plugin.json",JSON.stringify(r,null,2)+"\n")' "$dir" ;;
  esac
  echo "$dir"
}

# ---------------------------------------------------------------------------
setup() {
  say "Setup — scratch install and the real-config baseline"
  if [ -e "$D_RAW" ] && [ ! -f "$D_RAW/.ds10-us1" ] && [ -n "$(ls -A "$D_RAW" 2>/dev/null)" ]; then
    echo "$D_RAW exists and is not this route's directory; refusing to replace it."; exit 2
  fi
  rm -rf "$D_RAW" && mkdir -p "$D_RAW" && touch "$D_RAW/.ds10-us1" && resolve
  mkdir -p "$PREFIX" "$EVIDENCE" "$PROJECT" "$D/bin"
  config_manifest >"$D/real-baseline.txt"
  ok "real runtime configuration recorded: $(wc -l <"$D/real-baseline.txt" | tr -d ' ') entries"
  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; result; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into a prefix whose path holds a space: $PREFIX" \
    || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; result; return; }
  [ -f "$PLUGIN/.claude-plugin/plugin.json" ] && ok "the installed plugin carries .claude-plugin/plugin.json ($(node -e 'console.log(require(process.argv[1]).version)' "$PLUGIN/.claude-plugin/plugin.json"))" || bad "no .claude-plugin/plugin.json"
  [ -f "$PLUGIN/plugin.json" ] && note "and the root plugin.json marker (DS7.US1): $(cat "$PLUGIN/plugin.json" | tr -d '\n' | cut -c1-80)" || note "no root plugin.json marker"
  write_summariser
  result
}


# ---------------------------------------------------------------------------
probe() {
  say "Probe — Grok's install shapes, measured (plan.md step 0)"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  command -v grok >/dev/null 2>&1 || { bad "grok is not on the PATH"; result; return; }
  evidence_header
  write_summariser
  local H V

  say "(a) the Claude link alone: ~/.claude/skills/mirror-mind → the plugin"
  H="$D/home-a"; fresh_home "$H"; mkdir -p "$H/.claude/skills"
  ln -s "$PLUGIN" "$H/.claude/skills/mirror-mind"
  read_shape a "$H"

  say "(b) a link in Grok's user plugin directory: ~/.grok/plugins/mirror-mind → the plugin"
  H="$D/home-b"; fresh_home "$H"; mkdir -p "$H/.grok/plugins"
  ln -s "$PLUGIN" "$H/.grok/plugins/mirror-mind"
  read_shape b "$H"
  look "(b′) the same, with [plugins] enabled = [\"mirror-mind\"] written into ~/.grok/config.toml by hand:"
  printf '[plugins]\nenabled = ["mirror-mind"]\n' >"$H/.grok/config.toml"
  read_shape b-enabled "$H"
  look "(b″) can \`grok plugin enable\` write that entry for a user-directory plugin?"
  rm -f "$H/.grok/config.toml"
  keep b-enable in_home "$H" "$PROJECT" grok plugin enable mirror-mind
  tail -3 "$EVIDENCE/b-enable.out" | show

  say "(c) the trusted install: grok plugin install <plugin> --trust"
  H="$D/home-c"; fresh_home "$H"
  keep c-install in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  tail -3 "$EVIDENCE/c-install.out" | show
  grep -q "^exit 0" "$EVIDENCE/c-install.out" && ok "install exited 0 from a path with a space, outside \$HOME" || bad "install failed (evidence/c-install.out)"
  read_shape c "$H"
  look "config.toml after the install: $(tr '\n' ' ' <"$H/.grok/config.toml" 2>/dev/null)"
  local COPY COPY_ROOT
  COPY="$(find "$H/.grok" -path '*/.claude-plugin/plugin.json' 2>/dev/null | head -1)"
  if [ -n "$COPY" ]; then
    COPY_ROOT="$(dirname "$(dirname "$COPY")")"
    look "copy root: ~/${COPY_ROOT#"$H"/} · manifest version $(node -e 'console.log(require(process.argv[1]).version)' "$COPY")"
    [ -L "$COPY_ROOT" ] && note "the root is a symlink → $(readlink "$COPY_ROOT")" || note "a real directory: $(find "$COPY_ROOT" -type f | wc -l | tr -d ' ') files copied, $(find "$COPY_ROOT" -type l | wc -l | tr -d ' ') symlinks"
    look "registry: $(node -e 'const r=require(process.argv[1]);for(const [k,v] of Object.entries(r.repos))console.log(k, v.kind.type, "source_path="+v.kind.source_path)' "$H/.grok/installed-plugins/registry.json" 2>/dev/null)"
  else
    note "no .claude-plugin/plugin.json below ~/.grok (read evidence/c-install.out)"
  fi
  grep -qiE "MCP servers" "$EVIDENCE/c-plugin-details.out" && ok "plugin details names MCP servers" || bad "plugin details does not name MCP servers (DS12.TS4 static 1 did, on 1.0.52 before the root marker)"

  say "(c′) refresh paths for a stale copy"
  local SRC_MANIFEST="$PLUGIN/.claude-plugin/plugin.json"
  cp "$SRC_MANIFEST" "$D/plugin.json.orig"
  node -e 'const f=process.argv[1],fs=require("fs");const m=JSON.parse(fs.readFileSync(f,"utf8"));m.version="99.0.0";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n");' "$SRC_MANIFEST"
  echo "probe" >"$PLUGIN/skills/mm-backup/PROBE.txt"
  look "source bumped to 99.0.0 with a new file in skills/mm-backup/"
  keep c-update in_home "$H" "$PROJECT" grok plugin update mirror-mind
  look "grok plugin update mirror-mind → $(sed -n 2p "$EVIDENCE/c-update.out") · copy version now $(node -e 'console.log(require(process.argv[1]).version)' "$COPY") · new file copied: $([ -f "$COPY_ROOT/skills/mm-backup/PROBE.txt" ] && echo yes || echo no)"
  keep c-reinstall-same in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  look "install again, same path string → $(sed -n 2p "$EVIDENCE/c-reinstall-same.out")"
  keep c-reinstall-other in_home "$H" "$PROJECT" grok plugin install "${PLUGIN#/private}" --trust
  look "install again, the path spelt /tmp instead of /private/tmp → $(sed -n 2p "$EVIDENCE/c-reinstall-other.out")"
  look "copies now: $(ls "$H/.grok/installed-plugins" | grep -c mirror-mind) · $(in_home "$H" "$PROJECT" grok inspect --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const j=JSON.parse(s);console.log("skills loaded: "+j.skills.length+", plugins: "+j.plugins.length)})')"
  keep c-uninstall in_home "$H" "$PROJECT" grok plugin uninstall mirror-mind --confirm
  look "uninstall mirror-mind --confirm → $(sed -n 2p "$EVIDENCE/c-uninstall.out") · copies left: $(ls "$H/.grok/installed-plugins" | grep -c mirror-mind) · config.toml: $(tr '\n' ' ' <"$H/.grok/config.toml")"
  keep c-uninstall-2 in_home "$H" "$PROJECT" grok plugin uninstall mirror-mind --confirm
  look "uninstall again → $(sed -n 2p "$EVIDENCE/c-uninstall-2.out") · copies left: $(ls "$H/.grok/installed-plugins" | grep -c mirror-mind)"
  keep c-reinstall-after in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  look "install after uninstall → $(sed -n 2p "$EVIDENCE/c-reinstall-after.out") · copy version $(node -e 'console.log(require(process.argv[1]).version)' "$(find "$H/.grok" -path '*/.claude-plugin/plugin.json' | head -1)")"
  cp "$D/plugin.json.orig" "$SRC_MANIFEST"; rm -f "$PLUGIN/skills/mm-backup/PROBE.txt"
  note "source restored to $(node -e 'console.log(require(process.argv[1]).version)' "$SRC_MANIFEST")"

  say "(d) both wired: the Claude link plus the trusted install"
  H="$D/home-d"; fresh_home "$H"; mkdir -p "$H/.claude/skills"
  ln -s "$PLUGIN" "$H/.claude/skills/mirror-mind"
  keep d-install in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  read_shape d "$H"

  say "(e) the Operating Instructions as a home-level rule: ~/.grok/rules/mirror-mind.md → AGENTS.md"
  H="$D/home-e"; fresh_home "$H"; mkdir -p "$H/.grok/rules"
  ln -s "$PKG/AGENTS.md" "$H/.grok/rules/mirror-mind.md"
  keep e-install in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  read_shape e "$H"
  look "(e′) a project AGENTS.md, for comparison (a fresh, untrusted project directory):"
  rm -rf "$D/project-agents" && mkdir -p "$D/project-agents" && cp "$PKG/AGENTS.md" "$D/project-agents/AGENTS.md"
  read_shape e-project "$H" "$D/project-agents"

  say "(m) which manifest Grok reads: the root plugin.json marker (DS7.US1) beside .claude-plugin/plugin.json"
  for shape in no-marker grok-plugin-dir mcp-json marker-carries; do
    V="$(variant "$shape" "$shape")"; H="$D/home-m-$shape"; fresh_home "$H"
    keep "m-$shape-validate" in_home "$H" "$PROJECT" grok plugin validate "$V"
    keep "m-$shape-install" in_home "$H" "$PROJECT" grok plugin install "$V" --trust
    look "$shape: validate says: $(grep -E 'version|components' "$EVIDENCE/m-$shape-validate.out" | tr '\n' ' ')"
    read_shape "m-$shape" "$H" | grep -E "skills loaded|mcp servers|plugin list"
  done
  if command -v agy >/dev/null 2>&1; then
    look "agy $(agy --version 2>/dev/null | head -1) staging the marker-carries variant, beside the shipped plugin (static, scratch HOME):"
    for v in shipped marker-carries; do
      H="$D/agy-home-$v"; rm -rf "$H"; mkdir -p "$H"
      local SRC="$PLUGIN"; [ "$v" = marker-carries ] && SRC="$D/plugin-marker-carries"
      keep "agy-$v-validate" env HOME="$H" agy plugin validate "$SRC"
      keep "agy-$v-install" env HOME="$H" agy plugin install "$SRC"
      note "$v: $(sed 's/\x1b\[[0-9;]*m//g' "$EVIDENCE/agy-$v-validate.out" | grep -E 'Validation passed|unknown field' | tr '\n' ' ')"
    done
    diff -r "$D/agy-home-shipped/.gemini/config/plugins" "$D/agy-home-marker-carries/.gemini/config/plugins" >"$EVIDENCE/agy-staged.diff" 2>&1
    note "staged trees differ only in: $(grep '^diff' "$EVIDENCE/agy-staged.diff" | sed 's|.*/||' | tr '\n' ' ')"
  fi

  say "Isolation"
  [ -n "$(find "$REAL_HOME/.grok/installed-plugins" "$REAL_HOME/.grok/config.toml" -newer "$D/.ds10-us1" 2>/dev/null)" ] && bad "the REAL ~/.grok changed during the probe" || ok "the real ~/.grok/installed-plugins and config.toml did not change"
  look "leaders: $(grok leader list 2>/dev/null | tr '\n' ' ')"

  say "Summary"
  for tag in a b b-enabled c d e e-project m-no-marker m-grok-plugin-dir m-mcp-json m-marker-carries; do
    [ -f "$EVIDENCE/$tag-summary.txt" ] || continue
    printf '  [%s]\n' "$tag"; grep -E '^(skills loaded|hooks registered|mcp servers|instructions loaded|plugin list)' "$EVIDENCE/$tag-summary.txt" | cut -c1-200 | show
  done
  note "raw outputs: $EVIDENCE (not committed; they carry home paths)"
  result
}

# ---------------------------------------------------------------------------
static() {
  say "Static — what \`mirror init\` prints for Grok Build"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  local H="$D/home-static"; fresh_home "$H"
  # A stand-in grok, so init finds the runtime; the real one is step 3's.
  mkdir -p "$D/bin"; printf '#!/bin/sh\nexit 0\n' >"$D/bin/grok" && chmod +x "$D/bin/grok"
  local INIT=(env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS \
    HOME="$H" MIRROR_USER= MIRROR_HOME= XDG_CONFIG_HOME= PATH="$PREFIX/bin:$D/bin:$NODE_DIR:/usr/bin:/bin")
  keep init "${INIT[@]}" mirror init routeuser
  local BLOCK
  BLOCK="$(awk '/^Grok Build:/{p=1} p&&/^$/{exit} p' "$EVIDENCE/init.out")"
  echo "$BLOCK" | show
  local STEP1="grok plugin install \"$PLUGIN\" --trust" STEP2="ln -s \"$PKG/AGENTS.md\" ~/.grok/rules/mirror-mind.md"
  echo "$BLOCK" | grep -qF "1. $STEP1" && ok "step 1: the trusted install, the package path quoted" || bad "step 1 wrong or missing"
  echo "$BLOCK" | grep -qF "2. $STEP2" && ok "step 2: the rules link" || bad "step 2 wrong or missing"
  echo "$BLOCK" | grep -q -- "--trust activates the plugin's hooks and MCP server, and Grok does not ask again" && ok "the trust note says what is activated and that Grok does not ask" || bad "no trust note"
  echo "$BLOCK" | grep -q "every project" && echo "$BLOCK" | grep -q "tokens" && ok "the rule note names its scope and cost" || bad "no scope/cost note"
  [ "$(echo "$BLOCK" | grep -cE '^  [0-9]+\. ')" = "2" ] && ok "exactly two numbered steps" || bad "step count is not 2"
  echo "$BLOCK" | grep -qiE "marketplace|config\.toml|plugin enable|~/\.grok/plugins" && bad "a shape not chosen is named" || ok "no marketplace, config edit, enable verb, or user-directory link"

  say "Static — the other runtimes' blocks, unchanged"
  for cmd in pi claude codex agy; do printf '#!/bin/sh\nexit 0\n' >"$D/bin/$cmd" && chmod +x "$D/bin/$cmd"; done
  keep init-all "${INIT[@]}" mirror init routeuser2
  grep -q "pi install \"$PKG\"" "$EVIDENCE/init-all.out" && ok "Pi: pi install, as before" || bad "Pi block changed"
  grep -q "ln -s \"$PLUGIN\" ~/.claude/skills/mirror-mind" "$EVIDENCE/init-all.out" && ok "Claude Code: the skills-dir link, as before" || bad "Claude Code block changed"
  grep -q "1\. codex plugin marketplace add \"$PKG\"" "$EVIDENCE/init-all.out" && grep -q "2\. codex plugin add mirror-mind@mirror-mind" "$EVIDENCE/init-all.out" && ok "Codex: the two marketplace steps, as before" || bad "Codex block changed"
  grep -q "agy plugin install \"$PLUGIN\"" "$EVIDENCE/init-all.out" && ok "Antigravity: the plugin install, as before" || bad "Antigravity block changed"
  [ "$(grep -cE '^(Pi|Claude Code|Codex|Antigravity|Grok Build):$' "$EVIDENCE/init-all.out")" = "5" ] && ok "five runtime blocks, Grok Build last" || bad "block count is not 5"
  rm -f "$D/bin/pi" "$D/bin/claude" "$D/bin/codex" "$D/bin/agy"
  keep init-none "${INIT[@]}" env PATH="$PREFIX/bin:$NODE_DIR:/usr/bin:/bin" mirror init routeuser3
  grep -q "^Grok Build:" "$EVIDENCE/init-none.out" && bad "a Grok block with no grok on the PATH" || ok "no Grok block without grok on the PATH"

  say "Static — the docs carry the printed steps verbatim (QA amendment 8)"
  local GS="$ROOT/docs/getting-started.md" SPEC="$ROOT/docs/product/specs/runtime-interface/index.md"
  for f in "$GS" "$SPEC"; do
    grep -qF 'grok plugin install "<pkg>/plugins/mirror-mind" --trust' "$f" && grep -qF 'ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md' "$f" \
      && ok "both steps in ${f#"$ROOT"/}" || bad "a step is missing from ${f#"$ROOT"/}"
  done

  say "Static — the package smokes"
  (cd "$ROOT" && bash scripts/smoke_npm_package.sh >"$EVIDENCE/smoke-npm.out" 2>&1) && ok "smoke_npm_package.sh" || bad "smoke_npm_package.sh (evidence/smoke-npm.out)"
  if (cd "$ROOT" && bash scripts/smoke_claude_plugin.sh >"$EVIDENCE/smoke-plugin.out" 2>&1); then
    ok "smoke_claude_plugin.sh: $(grep 'grok plugin validate' "$EVIDENCE/smoke-plugin.out" | head -1)"
  elif grep -q "no hooks.log line after mirror-hook went missing" "$EVIDENCE/smoke-plugin.out" \
      && { [ -x /opt/homebrew/bin/mirror-hook ] || [ -x /usr/local/bin/mirror-hook ] || [ -x "$REAL_HOME/.nvm/current/bin/mirror-hook" ]; }; then
    # Pre-existing and machine-bound, reproduced on the unchanged tree: the
    # wrappers probe /opt/homebrew/bin, /usr/local/bin, and ~/.nvm/current/bin
    # for mirror-hook, so on a machine with a global install step 5's "missing
    # mirror-hook" never happens. CI has no global install. Debt Review's.
    grep -q 'grok plugin validate passed' "$EVIDENCE/smoke-plugin.out" && ok "smoke_claude_plugin.sh through step 4: $(grep 'grok plugin validate' "$EVIDENCE/smoke-plugin.out" | head -1)" || bad "smoke_claude_plugin.sh: grok plugin validate did not pass"
    note "step 5 cannot miss mirror-hook on this machine (a global mirror-hook sits in a directory the wrappers probe); pre-existing, not this story's"
  else
    bad "smoke_claude_plugin.sh (evidence/smoke-plugin.out): $(tail -1 "$EVIDENCE/smoke-plugin.out")"
  fi
  result
}

# ---------------------------------------------------------------------------
guards() {
  say "Guards — the manifest on every runtime that reads the plugin directory (decision 1)"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  evidence_header
  local H
  if command -v claude >/dev/null 2>&1; then
    H="$D/guard-claude"; rm -rf "$H"; mkdir -p "$H/.claude/skills"; ln -s "$PLUGIN" "$H/.claude/skills/mirror-mind"
    keep guard-claude-validate env HOME="$H" CLAUDE_CONFIG_DIR="$H/.claude" claude plugin validate "$PLUGIN"
    keep guard-claude-details env HOME="$H" CLAUDE_CONFIG_DIR="$H/.claude" claude plugin details mirror-mind
    grep -q "^exit 0" "$EVIDENCE/guard-claude-validate.out" && ok "claude plugin validate ($(claude --version 2>/dev/null | head -1))" || bad "claude plugin validate refused (evidence/guard-claude-validate.out)"
    grep -qF "MCP servers (1)" "$EVIDENCE/guard-claude-details.out" && ok "claude plugin details: MCP servers (1)" || bad "claude plugin details does not say MCP servers (1): $(grep -E 'MCP servers' "$EVIDENCE/guard-claude-details.out" | head -1)"
  else note "claude not on the PATH: skipped"; fi
  if command -v agy >/dev/null 2>&1; then
    H="$D/guard-agy"; rm -rf "$H"; mkdir -p "$H"
    keep guard-agy-validate env HOME="$H" agy plugin validate "$PLUGIN"
    local AGY; AGY="$(sed 's/\x1b\[[0-9;]*m//g' "$EVIDENCE/guard-agy-validate.out")"
    echo "$AGY" | grep -q "Validation passed" && ok "agy plugin validate ($(agy --version 2>/dev/null | head -1)): $(echo "$AGY" | grep -oE 'mcpServers [0-9]+' | head -1)" || bad "agy plugin validate refused"
    echo "$AGY" | grep -q 'unknown field "mcpServers" is ignored' && note "agy warns, as measured: unknown field \"mcpServers\" is ignored" || note "agy did not warn about mcpServers"
    echo "$AGY" | grep -qE 'mcpServers 1\b' && ok "agy: one MCP server" || bad "agy: not one MCP server"
  else note "agy not on the PATH: skipped"; fi
  if command -v codex >/dev/null 2>&1; then
    H="$D/guard-codex"; rm -rf "$H"; mkdir -p "$H/codex-home" "$H/home"; chmod 700 "$H/codex-home"
    local CX=(env HOME="$H/home" CODEX_HOME="$H/codex-home" PATH="$PREFIX/bin:$NODE_DIR:$REAL_PATH" codex)
    keep guard-codex-mp "${CX[@]}" plugin marketplace add "$PKG"
    keep guard-codex-add "${CX[@]}" plugin add mirror-mind@mirror-mind
    keep guard-codex-mcp "${CX[@]}" mcp list
    local N; N="$(grep -c "mirror-mind" "$EVIDENCE/guard-codex-mcp.out" || true)"
    [ "$N" = "1" ] && ok "codex mcp list ($(codex --version 2>/dev/null | head -1)): one mirror-mind server" || bad "codex mcp list names mirror-mind $N times (evidence/guard-codex-mcp.out)"
    keep guard-codex-rm "${CX[@]}" plugin remove mirror-mind@mirror-mind
    keep guard-codex-mp-rm "${CX[@]}" plugin marketplace remove mirror-mind
  else note "codex not on the PATH: skipped"; fi
  if command -v grok >/dev/null 2>&1; then
    H="$D/guard-grok"; fresh_home "$H"
    keep guard-grok-validate in_home "$H" "$PROJECT" grok plugin validate "$PLUGIN"
    local V; V="$(node -e 'console.log(require(process.argv[1]).version)' "$PLUGIN/.claude-plugin/plugin.json")"
    grep -qF "version: $V" "$EVIDENCE/guard-grok-validate.out" && grep -q "MCP servers" "$EVIDENCE/guard-grok-validate.out" \
      && ok "grok plugin validate ($(grok --version 2>/dev/null | head -1)): version $V, MCP servers" || bad "grok plugin validate: $(grep -E 'version|components' "$EVIDENCE/guard-grok-validate.out" | tr '\n' ' ')"
  else note "grok not on the PATH: skipped"; fi
  result
}

# ---------------------------------------------------------------------------
grok_step() {
  say "Grok — the two printed steps on the installed binary, read back by field, then undone"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  command -v grok >/dev/null 2>&1 || { bad "grok is not on the PATH"; result; return; }
  evidence_header; write_summariser
  local H="$D/home-grok"; fresh_home "$H"; mkdir -p "$H/.grok/rules"
  local EXPECTED; EXPECTED="$(find "$PLUGIN/skills" -name SKILL.md | wc -l | tr -d ' ')"
  local V; V="$(node -e 'console.log(require(process.argv[1]).version)' "$PLUGIN/.claude-plugin/plugin.json")"

  look "step 1: grok plugin install \"$PLUGIN\" --trust"
  keep grok-install in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  grep -q "^exit 0" "$EVIDENCE/grok-install.out" && ok "installed, exit 0" || { bad "install failed: $(sed -n 2p "$EVIDENCE/grok-install.out")"; result; return; }
  look "step 2: ln -s \"$PKG/AGENTS.md\" ~/.grok/rules/mirror-mind.md"
  ln -s "$PKG/AGENTS.md" "$H/.grok/rules/mirror-mind.md" && ok "linked"

  read_shape grok "$H"
  node -e '
    const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const list=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    const expected=Number(process.argv[3]), version=process.argv[4]; let pass=0, fail=0;
    const ok=(c,m)=>{ if(c){pass++;console.log("  ✓ "+m);} else {fail++;console.log("  ✗ "+m);} };
    const mm=j.skills.filter(s=>/^mm-/.test(s.name));
    ok(mm.length===expected && mm.every(s=>s.source&&s.source.type==="plugin"&&s.source.plugin_name==="mirror-mind"), `${mm.length} mm-* skills, all from source plugin:mirror-mind (plugin has ${expected})`);
    ok(j.skills.filter(s=>s.source&&s.source.type==="user").length===0, "no skill from source user (no Claude link in this home)");
    const hooks=j.hooks.filter(h=>h.source&&h.source.plugin_name==="mirror-mind");
    ok(hooks.length===1 && /hooks\/hooks\.json$/.test(hooks[0].target), "the plugin hooks file registered once");
    const mcp=j.mcpServers.filter(m=>m.name==="mirror-mind");
    ok(mcp.length===1 && mcp[0].transport==="stdio", "the mirror-mind MCP server listed, transport stdio");
    const rules=j.projectInstructions.filter(r=>/\/\.grok\/rules\/mirror-mind\.md$/.test(r.path));
    ok(rules.length===1 && rules[0].scope==="global", `the rule loaded with scope global (~${rules[0]&&rules[0].approxTokens} tokens)`);
    const p=j.plugins.find(p=>p.name==="mirror-mind");
    ok(!!p && p.enabled===true && p.provides.hooks===true, "the plugin discovered and enabled, hooks provided");
    const l=list.find(p=>p.name==="mirror-mind");
    ok(!!l && l.version===version && l.status==="installed", `plugin list: installed, version ${l&&l.version} (installed plugin ${version})`);
    process.exit(fail?1:0);
  ' "$EVIDENCE/grok-inspect.json" "$EVIDENCE/grok-plugin-list.json" "$EXPECTED" "$V" | tee "$EVIDENCE/grok-asserts.txt"
  local n_ok n_bad; n_ok="$(grep -c '✓' "$EVIDENCE/grok-asserts.txt")"; n_bad="$(grep -c '✗' "$EVIDENCE/grok-asserts.txt")"
  PASS=$((PASS + n_ok)); FAIL=$((FAIL + n_bad))
  look "the copied hooks.json keeps its quoted commands: $(grep -c '\\"${CLAUDE_PLUGIN_ROOT}' "$(find "$H/.grok/installed-plugins" -path '*/hooks/hooks.json' | head -1)") quoted command(s)"

  say "Grok — the undo"
  keep grok-uninstall in_home "$H" "$PROJECT" grok plugin uninstall mirror-mind --confirm
  rm -f "$H/.grok/rules/mirror-mind.md"
  [ -z "$(find "$H/.grok/installed-plugins" -path '*/.claude-plugin/plugin.json' 2>/dev/null)" ] && ok "no copy left under installed-plugins/" || bad "a copy remains"
  [ ! -e "$H/.grok/rules/mirror-mind.md" ] && ok "the rules link removed" || bad "the rules link remains"
  grep -q 'enabled = \["mirror-mind"\]' "$H/.grok/config.toml" 2>/dev/null && note "config.toml keeps enabled = [\"mirror-mind\"], as uninstall leaves it (measured; harmless)" || note "config.toml holds no enabled entry"
  result
}

# ---------------------------------------------------------------------------
diagnose_step() {
  say "Diagnose — one finding per broken Grok wiring, none on a clean home"
  [ -d "$PKG" ] || { echo "Run setup first: bash $SELF setup"; exit 2; }
  command -v grok >/dev/null 2>&1 || { bad "grok is not on the PATH"; result; return; }
  local H="$D/home-diagnose"; fresh_home "$H"; mkdir -p "$H/.grok/rules"
  local DIAG=(env -u MIRROR_USER -u MIRROR_HOME -u XDG_CONFIG_HOME -u MIRROR_BIN -u MIRROR_NODE -u NODE_OPTIONS -u CODEX_HOME \
    HOME="$H" MIRROR_USER= MIRROR_HOME= XDG_CONFIG_HOME= GROK_HOME="$H/.grok" PATH="$PREFIX/bin:$NODE_DIR:/usr/bin:/bin")
  "${DIAG[@]}" mirror init diaguser >/dev/null 2>&1
  local V; V="$(node -e 'console.log(require(process.argv[1]).version)' "$PLUGIN/.claude-plugin/plugin.json")"
  local REINSTALL="grok plugin uninstall mirror-mind --confirm && grok plugin install \"$PLUGIN\" --trust"
  grok_findings() { grep -oE 'grok_[a-z_]+' "$EVIDENCE/$1.out" | sort -u | tr '\n' ' '; }

  look "a copy one version behind"
  keep diag-install in_home "$H" "$PROJECT" grok plugin install "$PLUGIN" --trust
  local COPY; COPY="$(find "$H/.grok/installed-plugins" -path '*/.claude-plugin/plugin.json' | head -1)"
  node -e 'const f=process.argv[1],fs=require("fs");const m=JSON.parse(fs.readFileSync(f,"utf8"));m.version="0.1.0";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n");' "$COPY"
  keep diag-behind "${DIAG[@]}" mirror runtime diagnose
  [ "$(grok_findings diag-behind)" = "grok_plugin_copy_behind " ] && ok "grok_plugin_copy_behind, and nothing else" || bad "findings: $(grok_findings diag-behind)"
  grep -qF "$REINSTALL" "$EVIDENCE/diag-behind.out" && ok "the repair is the reinstall line with the printed path" || bad "the repair line differs (evidence/diag-behind.out)"
  grep -qF "copied 0.1.0 < installed $V" "$EVIDENCE/diag-behind.out" && ok "both versions named" || bad "versions not named"

  look "a second copy, from the path spelt differently"
  keep diag-install-2 in_home "$H" "$PROJECT" grok plugin install "${PLUGIN#/private}" --trust
  keep diag-dup "${DIAG[@]}" mirror runtime diagnose
  grok_findings diag-dup | grep -q "grok_plugin_copies_duplicated" && ok "grok_plugin_copies_duplicated" || bad "no duplicate finding: $(grok_findings diag-dup)"
  grep -c "mirror-mind-" "$EVIDENCE/diag-dup.out" >/dev/null && note "copies named: $(grep -oE 'mirror-mind-[0-9a-f]{8}' "$EVIDENCE/diag-dup.out" | sort -u | tr '\n' ' ')"

  look "a rules link that no longer reads"
  ln -s "$D/removed/AGENTS.md" "$H/.grok/rules/mirror-mind.md"
  keep diag-rule "${DIAG[@]}" mirror runtime diagnose
  grok_findings diag-rule | grep -q "grok_rules_link_dangling" && ok "grok_rules_link_dangling" || bad "no dangling-rule finding: $(grok_findings diag-rule)"
  grep -q 'ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md' "$EVIDENCE/diag-rule.out" && ok "the relink route named" || bad "no relink route"

  look "the wiring removed"
  keep diag-rm-1 in_home "$H" "$PROJECT" grok plugin uninstall mirror-mind --confirm
  keep diag-rm-2 in_home "$H" "$PROJECT" grok plugin uninstall mirror-mind --confirm
  rm -f "$H/.grok/rules/mirror-mind.md"
  keep diag-clean "${DIAG[@]}" mirror runtime diagnose
  [ -z "$(grok_findings diag-clean)" ] && ok "no Grok finding on the clean home" || bad "findings on the clean home: $(grok_findings diag-clean)"
  result
}

# ---------------------------------------------------------------------------
untouched() {
  say "Untouched — the real ~/.grok and ~/.claude configuration vs the baseline"
  [ -f "$D/real-baseline.txt" ] || { echo "No baseline. Run setup first."; exit 2; }
  config_manifest >"$D/real-now.txt"
  if diff -u "$D/real-baseline.txt" "$D/real-now.txt" >"$D/real-diff.txt"; then
    ok "every entry hashes as it did before setup ($(wc -l <"$D/real-now.txt" | tr -d ' ') entries)"
  else
    bad "the real configuration changed (see $D/real-diff.txt)"; head -20 "$D/real-diff.txt" | show
  fi
  result
}

clean() {
  say "Clean"
  for h in "$D"/home-*; do
    [ -S "$h/.grok/leader.sock" ] && note "leader socket under ${h/#$D/\$D}: stopping" && env HOME="$h" GROK_HOME="$h/.grok" grok leader kill >/dev/null 2>&1
  done
  [ -f "$D_RAW/.ds10-us1" ] && rm -rf "$D_RAW" && ok "removed $D_RAW" || note "nothing to remove"
}

case "${1:-}" in
  setup) setup ;;
  probe) probe ;;
  untouched) untouched ;;
  clean) clean ;;
  static) static ;;
  guards) guards ;;
  grok) grok_step ;;
  diagnose) diagnose_step ;;
  all) setup && probe; static; guards; grok_step; diagnose_step; untouched ;;
  *) sed -n '2,22p' "$SELF"; exit 2 ;;
esac
