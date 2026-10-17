#!/usr/bin/env bash
# CV21.DS4.US1 — Codex installs Mirror from the marketplace the package ships.
#
# Three steps, each isolated under a scratch directory (DS4_US1_DIR, default
# /tmp/cv21-ds4-us1). Nothing here reads or writes ~/.codex, ~/.mirror-minds,
# or the checkout; the real `codex` binary runs only against a scratch
# CODEX_HOME and a scratch HOME, with no model call.
#
#   bash route.sh static      pack, install into a prefix whose path holds a
#                             space, and read what `mirror init` prints for Codex
#   bash route.sh codex       the two printed commands on the installed Codex,
#                             the skills count, the MCP server, then removal
#   bash route.sh workspace   what Codex does, unprompted, with a project that
#                             carries the tree's marketplace file
#   bash route.sh all         the three, in order
#
# Evidence goes to $D/evidence/*.out, each with the command and its exit code.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS4_US1_DIR:-/tmp/cv21-ds4-us1}"

# The scratch directory, resolved (macOS reports /tmp as /private/tmp, and the
# installed package prints the resolved path). Decision 3: a space in the prefix
# path. The wrapper's worst defect was a path with a space splitting a command
# (CV22.DS10.TS5, N3).
resolve() {
  mkdir -p "$D_RAW"
  D="$(cd "$D_RAW" && pwd -P)"
  PREFIX="$D/pre fix"
  PKG="$PREFIX/lib/node_modules/mirror-mind"
  EVIDENCE="$D/evidence"
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

# keep <name> <command...>: run, record stdout+stderr and the exit code.
keep() {
  local name="$1"; shift
  mkdir -p "$EVIDENCE"
  { printf '$ %s\n' "$*"; "$@"; printf '\nexit %s\n' "$?"; } >"$EVIDENCE/$name.out" 2>&1
}

evidence_header() {
  say "Evidence"
  look "date: $(date -u '+%Y-%m-%d %H:%M UTC')"
  look "codex: $(codex --version 2>/dev/null || echo 'not on the PATH')"
  look "binary: $(which -a codex 2>/dev/null | tr '\n' ' ')"
  look "package: $(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
}

# A scratch HOME with a stand-in or the real codex on the PATH, and nothing of
# the person's. `node` and `npm` stay reachable.
scratch_env() {
  local home="$1"
  mkdir -p "$home"
  SCRATCH_ENV=(env HOME="$home" PATH="$PREFIX/bin:$D/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
    MIRROR_HOME= MIRROR_USER= MEMORY_DIR= DB_PATH= MEMORY_ENV= XDG_CONFIG_HOME=)
}

# ---------------------------------------------------------------------------
static() {
  say "Static — what \`mirror init\` prints for Codex"
  rm -rf "$D" && resolve && mkdir -p "$D/bin" "$PREFIX" "$EVIDENCE"
  local TARBALL
  TARBALL="$(cd "$ROOT" && npm pack --pack-destination "$D" 2>/dev/null | tail -1)"
  [ -f "$D/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; return; }
  (cd "$D" && npm install -g --prefix "$PREFIX" "$D/$TARBALL" >"$EVIDENCE/npm-install.out" 2>&1) \
    && ok "installed into a prefix whose path holds a space: $PREFIX" \
    || { bad "npm install failed: $(tail -3 "$EVIDENCE/npm-install.out")"; return; }

  [ -f "$PKG/.agents/plugins/marketplace.json" ] && ok "the package carries .agents/plugins/marketplace.json" || bad "no marketplace in the package"
  [ ! -e "$PKG/.agents/skills" ] && ok "and not the checkout's .agents/skills links" || bad ".agents/skills shipped"

  # A stand-in codex, so init finds the runtime; the real one is step 2's.
  printf '#!/bin/sh\nexit 0\n' >"$D/bin/codex" && chmod +x "$D/bin/codex"
  scratch_env "$D/home-static"
  keep init "${SCRATCH_ENV[@]}" mirror init routeuser
  local BLOCK
  BLOCK="$(awk '/^Codex:/{p=1} p&&/^$/{exit} p' "$EVIDENCE/init.out")"
  echo "$BLOCK" | show
  echo "$BLOCK" | grep -q "1\. codex plugin marketplace add \"$PKG\"" && ok "step 1: marketplace add, the package path quoted" || bad "step 1 wrong or missing"
  echo "$BLOCK" | grep -q "2\. codex plugin add mirror-mind@mirror-mind" && ok "step 2: plugin add mirror-mind@mirror-mind" || bad "step 2 wrong or missing"
  echo "$BLOCK" | grep -qi "trust" && ok "the note names the one-time hook trust" || bad "no trust note"
  echo "$BLOCK" | grep -qE "~/.codex/skills|~/.codex/AGENTS.md|codex-mirror.sh" && bad "the old wiring is still named" || ok "nothing names the skills link, AGENTS.md, or the wrapper"
  [ "$(echo "$BLOCK" | grep -cE '^  [0-9]+\. ')" = "2" ] && ok "exactly two numbered steps" || bad "step count is not 2"

  say "Static — the other runtimes' blocks, unchanged"
  for cmd in pi claude gemini; do printf '#!/bin/sh\nexit 0\n' >"$D/bin/$cmd" && chmod +x "$D/bin/$cmd"; done
  keep init-all "${SCRATCH_ENV[@]}" mirror init routeuser2
  grep -q "^Pi:" "$EVIDENCE/init-all.out" && grep -q "pi install \"$PKG\"" "$EVIDENCE/init-all.out" && ok "Pi: pi install, as before" || bad "Pi block changed"
  grep -q "ln -s \"$PKG/plugins/mirror-mind\" ~/.claude/skills/mirror-mind" "$EVIDENCE/init-all.out" && ok "Claude Code: the skills-dir link, as before" || bad "Claude Code block changed"
  grep -q "gemini skills link --consent \"$PKG/.pi/skills\"" "$EVIDENCE/init-all.out" && ok "Gemini CLI: skills link and hooks, as before" || bad "Gemini CLI block changed"
  rm -f "$D/bin/pi" "$D/bin/claude" "$D/bin/gemini"
}

# ---------------------------------------------------------------------------
codex_step() {
  say "Codex — the install, and its removal, on the installed binary"
  [ -d "$PKG" ] || { echo "Run the static step first: bash $SELF static"; return; }
  command -v codex >/dev/null 2>&1 || { bad "codex is not on the PATH"; return; }
  rm -f "$D/bin/codex"  # the stand-in; the real one from here
  evidence_header
  local CX="$D/codex-home" HOME_C="$D/home-codex" P="$D/project-codex"
  rm -rf "$CX" "$HOME_C" "$P" && mkdir -p "$CX" "$HOME_C" "$P" && chmod 700 "$CX"
  scratch_env "$HOME_C"
  local CODEX=("${SCRATCH_ENV[@]}" CODEX_HOME="$CX" codex)

  keep mp-add "${CODEX[@]}" plugin marketplace add "$PKG"
  tail -3 "$EVIDENCE/mp-add.out" | show
  grep -q "^exit 0" "$EVIDENCE/mp-add.out" && ok "marketplace added from a path outside \$HOME, with a space in it" || { bad "marketplace add refused (a stop condition: see plan.md)"; return; }

  keep plugin-add "${CODEX[@]}" plugin add mirror-mind@mirror-mind
  tail -3 "$EVIDENCE/plugin-add.out" | show
  grep -q "^exit 0" "$EVIDENCE/plugin-add.out" && ok "plugin add mirror-mind@mirror-mind" || { bad "plugin add failed"; return; }
  local VERSION; VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$PKG/package.json")"
  local CACHE; CACHE="$(find "$CX/plugins/cache" -type d -path "*mirror-mind*" -name "$VERSION" 2>/dev/null | head -1)"
  [ -n "$CACHE" ] && ok "cached at ${CACHE#"$CX"/} (the plugin's version)" || bad "no cache directory at the plugin's version under $CX/plugins/cache"
  grep -q 'plugins."mirror-mind@mirror-mind"' "$CX/config.toml" 2>/dev/null && ok "config.toml holds [plugins.\"mirror-mind@mirror-mind\"]" || bad "no plugin entry in config.toml"

  keep plugin-list "${CODEX[@]}" plugin list
  grep -i "mirror-mind" "$EVIDENCE/plugin-list.out" | head -3 | show
  grep -qi "mirror-mind" "$EVIDENCE/plugin-list.out" && ok "codex plugin list shows mirror-mind" || bad "plugin list does not show mirror-mind"

  [ ! -e "$CX/skills" ] && ok "no skills link in CODEX_HOME: whatever reaches the prompt came through the plugin" || bad "a skills link is present"
  (cd "$P" && "${CODEX[@]}" debug prompt-input hello >"$EVIDENCE/prompt-input.json" 2>"$EVIDENCE/prompt-input.err")
  local IN_PROMPT EXPECTED
  IN_PROMPT="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/prompt-input.json" | sort -u | wc -l | tr -d ' ')"
  # Decision 3: the expected count is the installed plugin's, never a literal.
  EXPECTED="$(find "$PKG/plugins/mirror-mind/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  [ "$IN_PROMPT" = "$EXPECTED" ] && ok "the rendered prompt carries $IN_PROMPT mm-* skills, the plugin's $EXPECTED" || bad "the prompt carries $IN_PROMPT mm-* skills; the plugin has $EXPECTED"

  keep mcp-list "${CODEX[@]}" mcp list
  grep -i "mirror-mind" "$EVIDENCE/mcp-list.out" | head -2 | show
  grep -qi "mirror-mind" "$EVIDENCE/mcp-list.out" && ok "codex mcp list names the mirror-mind server" || bad "no mirror-mind server in codex mcp list"

  say "Codex — the way back"
  keep plugin-remove "${CODEX[@]}" plugin remove mirror-mind@mirror-mind
  tail -2 "$EVIDENCE/plugin-remove.out" | show
  grep -q "^exit 0" "$EVIDENCE/plugin-remove.out" && ok "codex plugin remove mirror-mind@mirror-mind" || bad "plugin remove failed"
  # Codex leaves the marketplace-level folder (`cache/mirror-mind/`, empty); the
  # plugin's own directory and every file under it must be gone.
  [ -z "$(find "$CX/plugins/cache" -type f 2>/dev/null | head -1)" ] && [ ! -d "$CACHE" ] && ok "the plugin's cache directory and its files are gone" || bad "the plugin's cache remains"
  grep -q 'plugins."mirror-mind@mirror-mind"' "$CX/config.toml" 2>/dev/null && bad "config.toml still holds the plugin entry" || ok "config.toml no longer holds the plugin entry"
  keep mp-remove "${CODEX[@]}" plugin marketplace remove mirror-mind
  tail -2 "$EVIDENCE/mp-remove.out" | show
  grep -q "^exit 0" "$EVIDENCE/mp-remove.out" && ok "codex plugin marketplace remove mirror-mind" || bad "marketplace remove failed"
  keep mp-list-after "${CODEX[@]}" plugin marketplace list
  grep -qi "mirror-mind" "$EVIDENCE/mp-list-after.out" && bad "the marketplace is still listed" || ok "the marketplace is no longer listed"
}

# ---------------------------------------------------------------------------
workspace() {
  say "Workspace — a project carrying the tree's marketplace file, unprompted (decision 4)"
  command -v codex >/dev/null 2>&1 || { bad "codex is not on the PATH"; return; }
  rm -f "$D/bin/codex"
  evidence_header
  local CX="$D/codex-home-ws" HOME_W="$D/home-ws" W="$D/project-ws"
  rm -rf "$CX" "$HOME_W" "$W" && mkdir -p "$CX" "$HOME_W" "$W/.agents/plugins" "$W/plugins" && chmod 700 "$CX"
  cp "$ROOT/.agents/plugins/marketplace.json" "$W/.agents/plugins/"
  cp -R "$ROOT/plugins/mirror-mind" "$W/plugins/mirror-mind"
  scratch_env "$HOME_W"
  local CODEX=("${SCRATCH_ENV[@]}" CODEX_HOME="$CX" codex)
  note "Nothing is installed here. Codex reads the project from $W."
  (cd "$W" && keep ws-mp-list "${CODEX[@]}" plugin marketplace list)
  sed -n '2,8p' "$EVIDENCE/ws-mp-list.out" | show
  (cd "$W" && keep ws-plugin-list "${CODEX[@]}" plugin list)
  grep -i "mirror-mind" "$EVIDENCE/ws-plugin-list.out" | head -3 | show
  (cd "$W" && "${CODEX[@]}" debug prompt-input hello >"$EVIDENCE/ws-prompt-input.json" 2>/dev/null)
  local IN_PROMPT; IN_PROMPT="$(grep -o 'mm-[a-z-]*/SKILL\.md' "$EVIDENCE/ws-prompt-input.json" | sort -u | wc -l | tr -d ' ')"
  if grep -qi "mirror-mind" "$EVIDENCE/ws-mp-list.out" "$EVIDENCE/ws-plugin-list.out"; then
    note "Codex LISTS the project's marketplace or plugin (an offer; fine)"
  else
    note "Codex ignores the project's marketplace file"
  fi
  [ -z "$(find "$CX/plugins/cache" -type f 2>/dev/null | head -1)" ] && ok "nothing installed: no file under the plugin cache" || bad "a plugin was INSTALLED with no user action (stop condition: Navigator decision before Done)"
  ! grep -q 'plugins."mirror-mind' "$CX/config.toml" 2>/dev/null && ok "nothing enabled: no [plugins.\"mirror-mind…\"] in config.toml" || bad "a plugin was ENABLED with no user action (stop condition)"
  [ "$IN_PROMPT" = "0" ] && ok "no mm-* skill reached the rendered prompt from the project file alone" || note "$IN_PROMPT mm-* skills reached the prompt from the project (record how)"
}

# ---------------------------------------------------------------------------
case "${1:-}" in
  static) static ;;
  codex) codex_step ;;
  workspace) workspace ;;
  all) static; codex_step; workspace ;;
  *) sed -n '2,17p' "$SELF"; exit 2 ;;
esac

say "Result"
echo "  passed: $PASS   failed: $FAIL   evidence: $EVIDENCE"
[ "$FAIL" = "0" ]
