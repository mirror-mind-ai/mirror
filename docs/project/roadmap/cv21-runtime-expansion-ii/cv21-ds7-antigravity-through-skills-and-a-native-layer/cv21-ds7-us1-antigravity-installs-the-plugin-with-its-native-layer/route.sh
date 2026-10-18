#!/usr/bin/env bash
# CV21.DS7.US1 — the install probe and the Navigator route, re-runnable.
#
# Probes the installed agy in a scratch HOME and records what it does with a
# plugin carrying BOTH the Claude surfaces and the agy-native layer. Nothing
# touches production config: HOME is a scratch directory for every agy call.
#
#   bash route.sh probe     # staging behavior for the two layout variants
#   bash route.sh stage     # the Navigator route: install the real plugin
#   bash route.sh verify    # compare installed agy with the recorded one
#
# Findings land in evidence/ beside this script (probe mode).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
RECORDED_AGY="1.4.2"

say() { printf '\n== %s ==\n' "$1"; }

need_agy() {
  command -v agy >/dev/null || { echo "agy not on PATH"; exit 1; }
}

agy_version() { agy --version 2>/dev/null | head -1; }

# A scratch copy of the plugin, with the agy layer files added when asked.
make_variant() { # $1=dir $2=with_root_plugin_json(yes/no)
  local dir="$1" marker="$2"
  cp -R "$REPO_ROOT/plugins/mirror-mind" "$dir"
  # The agy-schema hooks skeleton (named hook, no handlers yet: TS2/TS3's).
  cat > "$dir/hooks.json" <<'EOF'
{
  "mirror-mind": {
    "enabled": true
  }
}
EOF
  # The MCP entry, same shape as the Claude manifest's mcpServers.
  python3 - "$REPO_ROOT" "$dir" <<'PYEOF'
import json, sys
manifest = json.load(open(f"{sys.argv[1]}/plugins/mirror-mind/.claude-plugin/plugin.json"))
json.dump({"mcpServers": manifest["mcpServers"]}, open(f"{sys.argv[2]}/mcp_config.json", "w"), indent=2)
PYEOF
  mkdir -p "$dir/rules"
  cp "$REPO_ROOT/AGENTS.md" "$dir/rules/AGENTS.md"
  if [ "$marker" = "yes" ]; then
    printf '{\n  "name": "mirror-mind"\n}\n' > "$dir/plugin.json"
  fi
}

inspect_staged() { # $1=scratch home
  say "staged tree under $1"
  find "$1/.gemini" -maxdepth 6 -name "*.json" -o -maxdepth 6 -name "AGENTS.md" 2>/dev/null | sed "s|$1/||" | sort
  local staged
  staged="$(find "$1/.gemini" -maxdepth 5 -type d -name "mirror-mind" 2>/dev/null | head -1)"
  if [ -n "$staged" ]; then
    say "staged root entries"
    ls "$staged"
    say "staged hooks.json (first 12 lines)"
    head -12 "$staged/hooks.json" 2>/dev/null || echo "(no root hooks.json)"
    say "skill count"
    find "$staged" -name "SKILL.md" | wc -l
  fi
}

probe() {
  need_agy
  say "agy version (recorded: $RECORDED_AGY)"
  agy_version
  local work; work="$(mktemp -d)"
  mkdir -p "$HERE/evidence"

  say "VARIANT A — Claude surfaces + agy layer, NO root plugin.json"
  local homeA="$work/homeA"; mkdir -p "$homeA"
  make_variant "$work/variantA" no
  HOME="$homeA" agy plugin validate "$work/variantA" 2>&1 | tail -3 || true
  HOME="$homeA" agy plugin install "$work/variantA" 2>&1 | tail -2 || true
  inspect_staged "$homeA"

  say "VARIANT B — the same, WITH root plugin.json (native marker)"
  local homeB="$work/homeB"; mkdir -p "$homeB"
  make_variant "$work/variantB" yes
  HOME="$homeB" agy plugin validate "$work/variantB" 2>&1 | tail -3 || true
  HOME="$homeB" agy plugin install "$work/variantB" 2>&1 | tail -2 || true
  inspect_staged "$homeB"

  say "GEMINI COEXISTENCE — what agy writes under .gemini, beside Gemini CLI's keys"
  echo "agy wrote:"; (cd "$homeB/.gemini" 2>/dev/null && find . -maxdepth 2 | sort) || echo "(nothing)"
  echo "Gemini CLI reads: ~/.gemini/settings.json (hooks; absent in scratch: $([ -f "$homeB/.gemini/settings.json" ] && echo PRESENT || echo absent))"

  rm -rf "$work"
  echo
  echo "Record the output above into evidence/probe-$(date -u +%Y%m%d).txt"
}

stage() {
  need_agy
  say "Navigator route: the real plugin, scratch HOME"
  local work; work="$(mktemp -d)"; local home="$work/home"; mkdir -p "$home"
  HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -2
  inspect_staged "$home"
  rm -rf "$work"
}

verify() {
  need_agy
  local now; now="$(agy_version)"
  echo "recorded: agy $RECORDED_AGY"
  echo "installed: $now"
  case "$now" in *"$RECORDED_AGY"*) echo "match" ;; *) echo "DIFFERS — re-run probe before trusting the layer" ;; esac
}

case "${1:-probe}" in
  probe) probe ;;
  stage) stage ;;
  verify) verify ;;
  *) echo "usage: route.sh [probe|stage|verify]"; exit 2 ;;
esac
