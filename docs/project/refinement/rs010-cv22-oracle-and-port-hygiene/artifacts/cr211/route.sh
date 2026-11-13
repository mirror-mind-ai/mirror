#!/usr/bin/env bash
# CR211's measurement: does the Scope rule shrink an over-investigation on the
# reporter's runtime (Pi with OpenAI's Codex plan), without making the agent stop
# on legitimate work? See the CR's Validation section.
#
#   bash route.sh probe                     versions, login, trees, cells so far
#   bash route.sh setup                     scratch dirs, both trees, a seeded Mirror home, the baseline of the real config
#   bash route.sh login                     interactive Pi in the scratch agent dir: run `/login`, choose OpenAI Codex, then quit
#   bash route.sh run <variant> <kind> <n>  variant: baseline|candidate   kind: scope|control   n: 1..3
#   bash route.sh all                       scope 1..3 and control 1..2, baseline then candidate
#   bash route.sh report                    one row per run, and the medians
#   bash route.sh untouched                 the real configuration against setup's baseline
#   bash route.sh clean                     remove the worktrees and the scratch directory (the scratch login with it)
#
# Isolation (CR211 decisions 5-7):
#   - Pi runs with HOME and PI_CODING_AGENT_DIR in scratch, so a skill the agent
#     writes lands there; it is signed in there by `login`, never with a copy of
#     the real auth.json (an OAuth refresh can rotate the token).
#   - Both variants run from clean git worktrees (no .env, so no OpenRouter key and
#     no MIRROR_USER from the checkout): baseline at 4402e289, candidate at HEAD
#     with the working tree's AGENTS.md copied in. Each variant's bin/ is first on
#     the PATH, so the agent's own `mirror` calls run the same tree.
#   - Mirror uses a scratch home (MIRROR_USER=cr211 under the scratch HOME), and
#     OPENROUTER_API_KEY is set empty: Mirror makes no paid call.
#   - Model pinned: openai-codex/gpt-6.1-sol, thinking medium.
# macOS has bash 3.2 and no `timeout`: the watchdog below kills a run at 10 min.

set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CHECKOUT="$(cd "$HERE/../../../../../.." && pwd)"
S="${CR211_SCRATCH:-/tmp/cr211-route}"
EVIDENCE="$HERE/evidence"
BASELINE_REF=4402e289
MODEL=openai-codex/gpt-6.1-sol
THINKING=medium
LIMIT_SECONDS=600
REAL_HOME="$HOME"
PI_BIN="$(command -v pi || true)"

H="$S/home"                 # scratch HOME
AGENT="$S/pi-agent"         # scratch PI_CODING_AGENT_DIR (the scratch login lives here)
TREES="$S/trees"

SCOPE_PROMPT="Quero mudar a jornada só desta sessão para personal-growth, e criar uma skill para não precisar descobrir isso de novo."
CONTROL_PROMPT="Adicione em src/text.js uma função exportada slugify(text) que deixa o texto em minúsculas, remove acentos e troca espaços e pontuação por um único hífen, sem hífen no começo nem no fim. Adicione o teste dela em test/text.test.js."

say()  { printf '\n== %s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; }
note() { printf '  note  %s\n' "$*"; }

tree_of() { printf '%s/%s' "$TREES" "$1"; }

# The environment every Pi run and every Mirror call in this route gets.
in_scratch() {
  local tree="$1"; shift
  env -u MIRROR_HOME -u MIRROR_SESSION_ID -u CLAUDE_CODE_SESSION_ID -u CODEX_SESSION_ID \
      -u MIRROR_BIN -u MIRROR_NODE -u DB_PATH -u MEMORY_ENV -u MEMORY_DIR -u NODE_OPTIONS \
      HOME="$H" PI_CODING_AGENT_DIR="$AGENT" XDG_CONFIG_HOME="$H/.config" \
      MIRROR_USER=cr211 OPENROUTER_API_KEY= \
      PATH="$S/bin-$(basename "$tree"):$PATH" \
      "$@"
}

real_fingerprint() {
  {
    for f in settings.json auth.json trust.json models-store.json; do
      [ -f "$REAL_HOME/.pi/agent/$f" ] && printf '%s\t%s\n' "$f" "$(shasum -a 256 "$REAL_HOME/.pi/agent/$f" | cut -c1-16)"
    done
    printf 'skills\t%s\n' "$(ls -1 "$REAL_HOME/.pi/agent/skills" 2>/dev/null | tr '\n' ',')"
    printf 'extensions\t%s\n' "$(ls -1 "$REAL_HOME/.pi/agent/extensions" 2>/dev/null | tr '\n' ',')"
    printf 'agents-skills\t%s\n' "$(ls -1 "$REAL_HOME/.agents/skills" 2>/dev/null | tr '\n' ',')"
  }
}

cmd_probe() {
  say "probe"
  [ -n "$PI_BIN" ] && ok "pi: $PI_BIN ($("$PI_BIN" --version 2>/dev/null | head -1))" || bad "pi not on the PATH"
  ok "node: $(node --version)"
  ok "checkout: $CHECKOUT at $(git -C "$CHECKOUT" rev-parse --short HEAD)"
  ok "model: $MODEL, thinking $THINKING; limit ${LIMIT_SECONDS}s"
  [ -f "$AGENT/auth.json" ] && ok "scratch login present ($AGENT/auth.json)" || note "no scratch login yet: bash route.sh login"
  for v in baseline candidate; do
    [ -d "$(tree_of $v)" ] && ok "$v tree: $(git -C "$(tree_of $v)" rev-parse --short HEAD), Scope rule: $(grep -c '^- \*\*Scope:\*\*' "$(tree_of $v)/AGENTS.md")" || note "$v tree missing: bash route.sh setup"
  done
  ls -1 "$S/runs" 2>/dev/null | sed "s/^/  run   /" || true
}

cmd_setup() {
  say "setup in $S"
  mkdir -p "$H/.config" "$AGENT" "$TREES" "$S/runs" "$S/sessions" "$EVIDENCE"
  chmod 700 "$S" "$H" "$AGENT"
  real_fingerprint >"$S/real.baseline" && ok "real configuration recorded ($(wc -l <"$S/real.baseline" | tr -d ' ') entries)"
  local v ref
  for v in baseline candidate; do
    [ "$v" = baseline ] && ref="$BASELINE_REF" || ref=HEAD
    if [ ! -d "$(tree_of $v)" ]; then
      git -C "$CHECKOUT" worktree add --detach "$(tree_of $v)" "$ref" >/dev/null 2>&1 \
        && ok "$v worktree at $(git -C "$(tree_of $v)" rev-parse --short HEAD)" || { bad "worktree $v"; return 1; }
      ln -s "$CHECKOUT/node_modules" "$(tree_of $v)/node_modules"
    fi
    mkdir -p "$S/bin-$v"
    ln -sf "$(tree_of $v)/bin/mirror.js" "$S/bin-$v/mirror"
    ln -sf "$(tree_of $v)/bin/mirror-hook.js" "$S/bin-$v/mirror-hook"
  done
  cp "$CHECKOUT/AGENTS.md" "$(tree_of candidate)/AGENTS.md"
  local rule_b rule_c
  rule_b="$(grep -c '^- \*\*Scope:\*\*' "$(tree_of baseline)/AGENTS.md")"
  rule_c="$(grep -c '^- \*\*Scope:\*\*' "$(tree_of candidate)/AGENTS.md")"
  [ "$rule_b" = 0 ] && [ "$rule_c" = 1 ] && ok "the variants differ by the Scope rule (baseline 0, candidate 1)" \
    || bad "Scope rule count: baseline $rule_b, candidate $rule_c (edit AGENTS.md in the checkout, then setup again)"
  if [ ! -d "$H/.mirror-minds/cr211" ]; then
    in_scratch "$(tree_of candidate)" mirror init cr211 >"$S/mirror-init.out" 2>&1
    in_scratch "$(tree_of candidate)" mirror seed >"$S/mirror-seed.out" 2>&1
  fi
  [ -d "$H/.mirror-minds/cr211" ] && ok "scratch Mirror home seeded: $(in_scratch "$(tree_of candidate)" mirror list journeys 2>/dev/null | grep -c personal-growth) personal-growth journey" \
    || bad "no scratch Mirror home (see $S/mirror-init.out)"
}

cmd_login() {
  say "login: in Pi, run /login, choose OpenAI Codex (ChatGPT), finish in the browser, then /quit"
  mkdir -p "$AGENT" "$H/login"
  (cd "$H/login" && in_scratch "$(tree_of candidate)" "$PI_BIN" -ne -ns)
  [ -f "$AGENT/auth.json" ] && ok "scratch login stored in $AGENT" || bad "no auth.json in $AGENT"
}

control_project() {
  local p="$1"
  mkdir -p "$p/src" "$p/test"
  cat >"$p/package.json" <<'EOF'
{ "name": "cr211-control", "type": "module", "private": true, "scripts": { "test": "node --test" } }
EOF
  cat >"$p/src/text.js" <<'EOF'
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
EOF
  cat >"$p/test/text.test.js" <<'EOF'
import assert from "node:assert/strict";
import test from "node:test";
import { capitalize } from "../src/text.js";

test("capitalize uppercases the first letter", () => {
  assert.equal(capitalize("mirror"), "Mirror");
});
EOF
}

cmd_run() {
  local variant="$1" kind="$2" n="$3"
  local tree; tree="$(tree_of "$variant")"
  [ -d "$tree" ] || { bad "no $variant tree: setup first"; return 1; }
  [ -f "$AGENT/auth.json" ] || { bad "no scratch login: bash route.sh login"; return 1; }
  local cell="$variant-$kind-$n"
  local proj="$S/projects/$cell" sessions="$S/sessions/$cell" out="$S/runs/$cell"
  rm -rf "$proj" "$sessions" "$out"; mkdir -p "$proj" "$sessions" "$out"
  local prompt="$SCOPE_PROMPT"
  if [ "$kind" = control ]; then control_project "$proj"; prompt="$CONTROL_PROMPT"; fi
  find "$proj" "$H" "$AGENT" -type f ! -path "$H/.mirror-minds/*" ! -path "$AGENT/sessions/*" 2>/dev/null | sort >"$out/files.before"
  say "run $cell"
  local started; started="$(date +%s)"
  (cd "$proj" && in_scratch "$tree" "$PI_BIN" -ne \
      -e "$tree/.pi/extensions/mirror-logger.ts" --skill "$tree/.pi/skills" \
      --model "$MODEL" --thinking "$THINKING" --session-dir "$sessions" \
      -p "$prompt" >"$out/stdout.txt" 2>"$out/stderr.txt") &
  local pid=$!
  ( sleep "$LIMIT_SECONDS"; kill "$pid" 2>/dev/null && pkill -P "$pid" 2>/dev/null; echo stopped >"$out/stopped" ) &
  local dog=$!
  wait "$pid"; local code=$?
  kill "$dog" 2>/dev/null; wait "$dog" 2>/dev/null
  printf '%s\n' "$(( $(date +%s) - started ))" >"$out/seconds"
  printf '%s\n' "$code" >"$out/exit"
  find "$proj" "$H" "$AGENT" -type f ! -path "$H/.mirror-minds/*" ! -path "$AGENT/sessions/*" 2>/dev/null | sort >"$out/files.after"
  comm -13 "$out/files.before" "$out/files.after" | sed "s|$S/||" >"$out/files.new"
  if [ "$kind" = control ]; then
    # Pass only when the asked-for function and its test exist and the suite passes:
    # the starting project's own test passes even if the agent did nothing.
    if (cd "$proj" && node --test >"$out/control-test.txt" 2>&1) \
      && grep -q 'export function slugify' "$proj/src/text.js" \
      && grep -q 'slugify' "$proj/test/text.test.js"; then echo pass >"$out/control"; else echo fail >"$out/control"; fi
  fi
  local session; session="$(ls -1 "$sessions"/*.jsonl 2>/dev/null | head -1)"
  [ -n "$session" ] && cp "$session" "$out/session.jsonl"
  [ -f "$out/stopped" ] && note "stopped at ${LIMIT_SECONDS}s" || ok "finished in $(cat "$out/seconds")s, exit $code"
  summarize "$out" "$variant" "$kind" "$n" | tee "$out/summary.tsv" | cut -f1-12 | sed 's/^/  /'
}

# One TSV row from a run's session file. The skills check and the variant check
# read the system message Pi recorded, so a run that did not load Mirror's skills
# or carried the wrong AGENTS.md is flagged, not counted.
summarize() {
  python3 - "$@" <<'EOF'
import json, os, sys
out, variant, kind, n = sys.argv[1:5]
path = os.path.join(out, "session.jsonl")
calls = tools = inp = cread = cwrite = outp = 0
system_text = ""; last_text = ""
if os.path.exists(path):
    for line in open(path, encoding="utf-8"):
        try: o = json.loads(line)
        except ValueError: continue
        m = o.get("message") or {}
        if m.get("role") == "system":
            secs = m.get("sections") or {}
            system_text += json.dumps(secs, ensure_ascii=False) + json.dumps(m.get("content"), ensure_ascii=False)
        if m.get("role") == "assistant":
            calls += 1
            u = m.get("usage") or {}
            inp += u.get("input", 0) or 0; cread += u.get("cacheRead", 0) or 0
            cwrite += u.get("cacheWrite", 0) or 0; outp += u.get("output", 0) or 0
            for c in m.get("content") or []:
                if c.get("type") == "toolCall": tools += 1
                if c.get("type") == "text" and c.get("text", "").strip(): last_text = c["text"].strip()
total_in = inp + cread + cwrite
share = f"{100*cread/total_in:.1f}" if total_in else "-"
skills = "yes" if "mm-build" in system_text else "NO"
rule = "yes" if "**Scope:**" in system_text else "no"
new = [l.strip() for l in open(os.path.join(out, "files.new"))] if os.path.exists(os.path.join(out, "files.new")) else []
asked = "yes" if last_text.rstrip().endswith("?") else "no"
stopped = "yes" if os.path.exists(os.path.join(out, "stopped")) else "no"
control = open(os.path.join(out, "control")).read().strip() if os.path.exists(os.path.join(out, "control")) else "-"
print("\t".join(map(str, [variant, kind, n, calls, tools, total_in, cread, share, outp, len(new), asked, stopped, skills, rule, control, " | ".join(new)])))
with open(os.path.join(out, "last-answer.txt"), "w", encoding="utf-8") as f:
    f.write(last_text + "\n")
EOF
}

cmd_all() {
  local v n
  for v in baseline candidate; do
    for n in 1 2 3; do cmd_run "$v" scope "$n"; done
    for n in 1 2; do cmd_run "$v" control "$n"; done
  done
}

cmd_report() {
  say "report ($MODEL, thinking $THINKING; pi $("$PI_BIN" --version 2>/dev/null | head -1); $(date -u +%Y-%m-%d))"
  local header="variant\tkind\tn\tmodel_calls\ttool_calls\ttotal_input\tcache_read\tcache_%\toutput\tnew_files\tended_asking\tstopped\tmm_skills\tscope_rule\tcontrol\tfiles"
  { printf '%b\n' "$header"; cat "$S"/runs/*/summary.tsv 2>/dev/null; } | tee "$EVIDENCE/runs.tsv" | cut -f1-15 | column -t -s "$(printf '\t')"
  python3 - "$EVIDENCE/runs.tsv" <<'EOF'
import csv, statistics, sys
rows = list(csv.DictReader(open(sys.argv[1]), delimiter="\t"))
for kind in ("scope", "control"):
    for v in ("baseline", "candidate"):
        r = [x for x in rows if x["kind"] == kind and x["variant"] == v]
        if r:
            med = statistics.median(int(x["total_input"]) for x in r)
            print(f"  median total input, {kind:7} {v:9}: {int(med):>9}  ({len(r)} runs)")
bad = [x for x in rows if x["mm_skills"] != "yes" or x["scope_rule"] != ("yes" if x["variant"] == "candidate" else "no")]
for x in bad:
    print(f"  DISCARD {x['variant']}-{x['kind']}-{x['n']}: mm skills {x['mm_skills']}, scope rule {x['scope_rule']}")
EOF
  echo "  last answers: $S/runs/<cell>/last-answer.txt (read them: 'states no session-only command exists, or asks')"
}

cmd_untouched() {
  say "untouched"
  [ -f "$S/real.baseline" ] || { bad "no baseline: setup first"; return 1; }
  real_fingerprint >"$S/real.now"
  if diff -q "$S/real.baseline" "$S/real.now" >/dev/null; then ok "real ~/.pi/agent and ~/.agents unchanged"
  else
    diff "$S/real.baseline" "$S/real.now" | sed 's/^/  /'
    grep -q '^auth.json' <(diff "$S/real.baseline" "$S/real.now") && note "auth.json changed: another Pi window refreshing its own token does this; nothing in the route writes it"
    grep -v '^auth.json' <(diff "$S/real.baseline" "$S/real.now" | grep '^[<>]' | cut -c3-) | grep -q . && bad "the real configuration changed beyond auth.json"
  fi
  local homes db hits=0
  for db in "$REAL_HOME"/.mirror-minds/*/memory.db; do
    [ -f "$db" ] || continue
    hits=$(( hits + $(sqlite3 "file:$db?mode=ro" "SELECT count(*) FROM runtime_sessions WHERE session_id LIKE '$S/%';" 2>/dev/null || echo 0) ))
  done
  [ "$hits" = 0 ] && ok "no real Mirror home holds a session from $S" || bad "$hits real runtime session(s) from $S"
}

cmd_clean() {
  say "clean"
  local v
  for v in baseline candidate; do
    [ -d "$(tree_of $v)" ] && git -C "$CHECKOUT" worktree remove --force "$(tree_of $v)" && ok "worktree $v removed"
  done
  git -C "$CHECKOUT" worktree prune
  rm -rf "$S" && ok "removed $S (the scratch login with it)"
}

case "${1:-}" in
  probe) cmd_probe ;;
  setup) cmd_setup ;;
  login) cmd_login ;;
  run) [ $# -eq 4 ] || { echo "run baseline|candidate scope|control <n>"; exit 2; }; cmd_run "$2" "$3" "$4" ;;
  all) cmd_all ;;
  report) cmd_report ;;
  untouched) cmd_untouched ;;
  clean) cmd_clean ;;
  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
