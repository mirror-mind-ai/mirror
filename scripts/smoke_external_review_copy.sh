#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR_HOME="${1:-/tmp/mirror-review-copy-smoke-home}"
PROJECT_ROOT="${2:-/tmp/mirror-review-copy-smoke-project}"

rm -rf "$MIRROR_HOME" "$PROJECT_ROOT"
mkdir -p "$PROJECT_ROOT"

cd "$ROOT_DIR"

echo "== Install review-copy into mirror home =="
python -m memory extensions install \
  review-copy \
  --extensions-root examples/extensions \
  --mirror-home "$MIRROR_HOME"

echo
echo "== Inspect runtime catalogs =="
python -m memory inspect runtime-catalog pi --mirror-home "$MIRROR_HOME"
python -m memory inspect runtime-catalog claude --mirror-home "$MIRROR_HOME"

echo
echo "== Expose Claude runtime skills into project =="
python -m memory extensions expose-claude \
  --mirror-home "$MIRROR_HOME" \
  --target-root "$PROJECT_ROOT"

echo
echo "== Verify expected artifacts =="
test -f "$MIRROR_HOME/extensions/review-copy/skill.yaml"
test -f "$MIRROR_HOME/runtime/skills/pi/ext-review-copy/SKILL.md"
test -f "$MIRROR_HOME/runtime/skills/pi/extensions.json"
test -f "$MIRROR_HOME/runtime/skills/claude/ext-review-copy/SKILL.md"
test -f "$MIRROR_HOME/runtime/skills/claude/extensions.json"
test -f "$PROJECT_ROOT/.claude/skills/ext-review-copy/SKILL.md"
test -f "$PROJECT_ROOT/.claude/skills/extensions.external.json"

echo
echo "== Clean Claude project exposure =="
python -m memory extensions clean-claude \
  --target-root "$PROJECT_ROOT"

test ! -f "$PROJECT_ROOT/.claude/skills/ext-review-copy/SKILL.md"
test ! -f "$PROJECT_ROOT/.claude/skills/extensions.external.json"

echo
echo "Smoke test passed."
echo "Mirror home:   $MIRROR_HOME"
echo "Claude project: $PROJECT_ROOT"
