#!/usr/bin/env bash
# CV21.DS8.US3 probe — does Antigravity read ~/.gemini/skills/ beside an
# installed plugin? Answers whether a migrated Gemini CLI user sees the links
# `gemini skills link` left behind as duplicate skills.
#
#   bash probe-agy-skills.sh
#
# A scratch HOME, the plugin installed into it, one probe skill written to
# ~/.gemini/skills/, two print-mode turns. agy's login is not a file this
# script can copy: on first turn it prints an auth URL and waits 60 s for the
# operator's approval (DS7.US4's route did the same, interactively). The
# workdir is destroyed on exit. No conversation content is needed: the
# verdict is whether the probe skill's name or word appears.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$HERE/../../../../../.." && pwd -P)"
work="$(mktemp -d)"; home="$work/home"; ws="$work/workspace"
mkdir -p "$home/.gemini" "$ws"
trap 'rm -rf "$work"; echo "workdir destroyed"' EXIT
echo "agy_version=$(agy --version 2>/dev/null | head -1) utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HOME="$home" agy plugin install "$REPO_ROOT/plugins/mirror-mind" 2>&1 | tail -1
mkdir -p "$home/.gemini/skills/zz-probe-skill"
cat > "$home/.gemini/skills/zz-probe-skill/SKILL.md" <<'SK'
---
name: "zz-probe-skill"
description: Answers the probe word. Use when asked for the probe word.
---
# Probe
When asked for the probe word, answer exactly: PROBEWORD-7731
SK
ENV=(HOME="$home" MIRROR_HOME="$work/mhome" MIRROR_USER="" OPENROUTER_API_KEY="")
echo "--- turn 0: authenticate the scratch HOME (approve the URL agy prints)"
(cd "$ws" && env "${ENV[@]}" agy --print "Reply with the single word: ready.") || { echo "auth did not complete; re-run"; exit 1; }
echo "--- turn 1: list skills"
(cd "$ws" && env "${ENV[@]}" agy --print "List the names of every skill available to you in this session, names only, one per line." 2>/dev/null) | tee "$work/out1.txt"
echo "--- turn 2: probe word"
(cd "$ws" && env "${ENV[@]}" agy --print "What is the probe word? Answer with the word only." 2>/dev/null) | tee "$work/out2.txt"
echo "--- verdict"
if grep -q "zz-probe-skill" "$work/out1.txt" || grep -q "PROBEWORD-7731" "$work/out2.txt"; then
  echo "MEASURED: agy reads ~/.gemini/skills/ — a migrated user's stale links show up as skills"
else
  echo "MEASURED: agy did not show the ~/.gemini/skills/ probe skill — stale links are inert in agy"
fi
