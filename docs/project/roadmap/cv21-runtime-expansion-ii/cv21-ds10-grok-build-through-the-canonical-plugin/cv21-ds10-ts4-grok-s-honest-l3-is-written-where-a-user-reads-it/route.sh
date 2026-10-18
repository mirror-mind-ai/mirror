#!/usr/bin/env bash
# CV21.DS10.TS4 — Grok's honest L3 is written where a user reads it.
#
#   bash route.sh docs        every sentence that must agree, grepped where it belongs;
#                             the negative greps; checkDocLinks; buildClaudePlugin --check
#   bash route.sh hook        the inject wrapper run with three payloads (Grok, Claude
#                             Code, Codex) against a scratch Mirror home, timed (CR143)
#   bash route.sh untouched   the real ~/.grok, ~/.claude, ~/.config/mirror vs the baseline
#   bash route.sh clean
#
# `hook` writes only under DS10_TS4_DIR (default /tmp/cv21-ds10-ts4). No model, no Grok.
set -u

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../../.." && pwd -P)"
D_RAW="${DS10_TS4_DIR:-/tmp/cv21-ds10-ts4}"
REAL_HOME="$HOME"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
note() { printf '  \033[33m•\033[0m %s\n' "$*"; }
look() { printf '  \033[36m→\033[0m %s\n' "$*"; }
show() { sed 's/^/      | /'; }
PASS=0
FAIL=0
result() { say "Result"; printf '  passed: %d   failed: %d\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]; }

has() { # file, fixed string, label
  grep -qF -- "$2" "$ROOT/$1" && ok "$1: $3" || bad "$1: missing — $3 ($2)"
}
lacks() { # file, regex, label
  grep -qiE -- "$2" "$ROOT/$1" && bad "$1: still says $3: $(grep -niE -- "$2" "$ROOT/$1" | head -1 | cut -c1-120)" || ok "$1: no $3"
}
section() { # file, heading, next-heading-regex -> prints the section
  awk -v h="$2" -v n="$3" '$0 == h {p=1; next} p && $0 ~ n {exit} p' "$ROOT/$1"
}

docs() {
  say "Docs — the sentences that must agree"
  local C=docs/product/specs/runtime-interface/index.md G=docs/getting-started.md R=REFERENCE.md
  has "$C" "five runtimes exist" "the opening counts five"
  has "$C" "### Grok Build" "a Grok Build reference implementation"
  has "$C" '| Grok Build | `sessionId` in JSON stdin (camelCase), or `GROK_SESSION_ID`' "the session-id row"
  has "$C" 'Grok Build (Codex likewise) | The close fits the runtime' "the extraction row"
  has "$C" "Explicit invocation, the hook inert" "the injection row"
  has "$C" "runtimeReadsPromptContext" "the injection row names the predicate"
  has "$C" "Honest parity **L3**: grok 1.0.62" "L3 with the version"
  has "$C" "(1474f9cbdd91), 2026-10-18" "the binary and the date"
  has "$C" "213–259 ms after SessionEnd" "the measured close"
  has "$C" "search_tool" "the MCP route"
  has "$C" 'grok plugin install "<pkg>/plugins/mirror-mind" --trust' "step 1 in the reference implementation"
  has "$C" 'ln -s "<pkg>/AGENTS.md" ~/.grok/rules/mirror-mind.md' "step 2 in the reference implementation"
  has README.md "Five supported runtimes: Pi, Claude Code, Codex,
Antigravity, Grok Build" "five runtimes named"
  has README.md "Antigravity, and Grok Build" "the multi-runtime bullet"
  has "$G" "- [Grok Build](https://x.ai/cli)" "the harness link"
  has "$G" "### Grok Build" "the run section"
  local SEC; SEC="$(section "$G" "### Grok Build" '^### ')"
  for want in "/mm-mirror should I raise my price?" "approve it" "grok_build" "search_tool" "use_tool" "What Grok does not do" "rule you linked in step 2" "2.2k tokens"; do
    printf '%s' "$SEC" | tr '\n' ' ' | grep -qF -- "$want" && ok "$G Grok section: $want" || bad "$G Grok section lacks: $want"
  done
  printf '%s' "$SEC" | grep -qE 'CV21|DS10|US[0-9]|TS[0-9]' && bad "$G Grok section carries a story code" || ok "$G Grok section: no story codes"
  printf '%s' "$SEC" | grep -qE '\bL[0-9]\b' && bad "$G Grok section says L-something" || ok "$G Grok section: no parity level"
  printf '%s' "$SEC" | grep -qE '[0-9]+ ms\b' && bad "$G Grok section carries millisecond figures" || ok "$G Grok section: no millisecond figures"
  printf '%s' "$SEC" | grep -qiE 'injected|once per turn' && bad "$G Grok section promises injection" || ok "$G Grok section: no 'injected' / 'once per turn'"
  has "$G" "Grok Build as
the rule you linked in step 2" "how the mirror reaches Grok"
  has "$R" "Pi and Grok Build use the \`/mm-\` prefix" "the prefix"
  for code in grok_plugin_copy_behind grok_plugin_copies_duplicated grok_rules_link_dangling; do has "$R" "$code" "diagnose finding $code"; done
  has "$R" 'grok plugin uninstall mirror-mind --confirm && grok plugin install "<pkg>/plugins/mirror-mind" --trust' "the repair line"
  has "$R" "A Grok copy behind the landed version earns the same line" "the update hint"
  has AGENTS.md "in Pi and Grok Build" "the skill-naming sentence"
  has plugins/mirror-mind/rules/AGENTS.md "in Pi and Grok Build" "the plugin's rules copy, regenerated"
  say "Docs — nothing stale"
  for f in README.md "$G" "$R" "$C"; do lacks "$f" 'four (supported )?runtimes' '"four runtimes"'; done
  say "Docs — the checks"
  (cd "$ROOT" && node ts/scripts/checkDocLinks.ts >/dev/null 2>&1) && ok "checkDocLinks clean" || bad "checkDocLinks"
  (cd "$ROOT" && node ts/scripts/buildClaudePlugin.ts --check >/dev/null 2>&1) && ok "buildClaudePlugin --check in sync" || bad "buildClaudePlugin --check"
  result
}

hook() {
  say "Hook — mirror-inject.sh with three payloads against a scratch home (CR143)"
  mkdir -p "$D_RAW" && D="$(cd "$D_RAW" && pwd -P)"
  local H="$D/home"; rm -rf "$H"; mkdir -p "$H"; chmod 700 "$H"
  local W="$ROOT/.claude/hooks/mirror-inject.sh"
  local ENV=(env DB_PATH="$H/memory.db" MEMORY_ENV=production MIRROR_HOME="$H" MIRROR_USER= MIRROR_NODE="$(command -v node)" OPENROUTER_API_KEY= MIRROR_BIN="$ROOT/bin")
  run_one() { # label, payload json, expect loads (0|1), extra env (k=v ...)
    local label="$1" payload="$2" expect="$3"; shift 3
    local t0 t1 out
    t0="$(node -e 'console.log(Date.now())')"
    out="$(printf '%s' "$payload" | "${ENV[@]}" "$@" bash "$W" 2>"$D/$label.err")"
    t1="$(node -e 'console.log(Date.now())')"
    local ms=$((t1 - t0)) loaded=0
    printf '%s' "$out" | grep -q "MIRROR MODE" && loaded=1
    look "$label: ${ms} ms · stdout $(printf '%s' "$out" | wc -c | tr -d ' ') bytes · context $([ "$loaded" = 1 ] && echo loaded || echo "not loaded")"
    if [ "$expect" = 1 ]; then [ "$loaded" = 1 ] && ok "$label: the explicit form loads context, as before" || bad "$label: no context loaded"
    else [ "$loaded" = 0 ] && [ -z "$out" ] && ok "$label: nothing loaded, nothing printed" || bad "$label: printed $(printf '%s' "$out" | wc -c | tr -d ' ') bytes"; fi
    echo "$ms" >"$D/$label.ms"
  }
  local P='"/mm-mirror should I raise my price?"'
  run_one grok     "{\"session_id\":\"ts4-g\",\"prompt\":$P,\"hookEventName\":\"UserPromptSubmit\",\"promptId\":\"p1\"}" 0
  run_one grok-env "{\"session_id\":\"ts4-g2\",\"prompt\":$P}" 0 GROK_HOOK_EVENT=UserPromptSubmit GROK_SESSION_ID=ts4-g2
  run_one claude   "{\"session_id\":\"ts4-c\",\"prompt\":$P}" 1
  run_one codex    "{\"session_id\":\"ts4-x\",\"prompt\":$P,\"turn_id\":\"t1\"}" 1
  local MS_G MS_C; MS_G="$(cat "$D/grok.ms")"; MS_C="$(cat "$D/claude.ms")"
  [ "$MS_G" -lt 1000 ] && ok "the Grok-shaped run took ${MS_G} ms (node start and payload parse; no load, no state read)" || bad "the Grok-shaped run took ${MS_G} ms"
  note "for scale: the Claude-shaped run, which loads, took ${MS_C} ms here; on Grok 1.0.62 the same load held the turn 2,293–2,610 ms (CR143 evidence)"
  result
}

untouched() {
  say "Untouched"
  local changed=0 f
  for f in .grok/config.toml .grok/rules .grok/installed-plugins .claude/settings.json .claude/skills .config/mirror/env; do
    [ -e "$REAL_HOME/$f" ] && [ -n "$(find "$REAL_HOME/$f" -newer "$SELF" -maxdepth 2 2>/dev/null | head -1)" ] && { changed=1; bad "$f changed since this route was written"; }
  done
  [ "$changed" = 0 ] && ok "the real ~/.grok, ~/.claude, and ~/.config/mirror untouched (nothing newer than this route)"
  result
}

clean() { rm -rf "$D_RAW" && echo "removed $D_RAW"; }

case "${1:-}" in
  docs) docs ;;
  hook) hook ;;
  untouched) untouched ;;
  clean) clean ;;
  *) sed -n '2,11p' "$SELF"; exit 2 ;;
esac
