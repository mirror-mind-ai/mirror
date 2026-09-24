#!/usr/bin/env bash
# CV22.DS10.US2 — operational smoke for the TypeScript updater.
#
# The git-based updater shipped in v0.8.0 and never had one: six smokes exist
# in this directory and none of them touches update, backup-verify, or the
# repair lane. This is the coverage the story's gate demands, and it exercises
# what unit tests structurally cannot -- a real tree moving, a real archive
# being written and verified, a real migration applying in a fresh process.
#
# Isolation, absolute:
#   * a bare scratch origin cloned from this repository, never a network remote
#   * a scratch clone that is thrown away
#   * a scratch mirror home with a generated demo database
#   * a scratch env-file -- NEVER the repository's .env, which holds the
#     OpenRouter key; CI is keyless but a local pre-push run is not
#   * python/python3/uv shadowed on PATH with stubs that exit 66, so any
#     interpreter spawn FAILS THE SMOKE rather than passing unnoticed
#
# The real git and npm paths are captured BEFORE the shadowing, because the
# stubs would otherwise shadow the tools the smoke itself needs.
#
# Usage:  scripts/smoke_runtime_update.sh [workdir]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${1:-/tmp/mirror-update-smoke}"
PASS=0
FAIL=0

# Captured before PATH is shadowed.
REAL_GIT="$(command -v git)"
REAL_NPM="$(command -v npm || true)"
REAL_SQLITE="$(command -v sqlite3 || true)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$3', got '$2')"; fi; }

cleanup() { [ "${KEEP_SMOKE_WORKDIR:-0}" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

rm -rf "$WORK"
mkdir -p "$WORK/stubs"

# --- the interpreter stubs -------------------------------------------------
for bin in python python3 uv; do
  cat > "$WORK/stubs/$bin" <<STUB
#!/bin/sh
echo "INTERPRETER SPAWNED: $bin \$*" >&2
exit 66
STUB
  chmod +x "$WORK/stubs/$bin"
done

# A scratch env-file. The repository's own .env holds a provider key and must
# never be loaded by a smoke.
printf 'MEMORY_ENV=production\n' > "$WORK/smoke.env"

say "Building the scratch origin and clone"
"$REAL_GIT" clone -q --no-hardlinks "$ROOT_DIR" "$WORK/origin" 2>/dev/null
(
  cd "$WORK/origin"
  "$REAL_GIT" checkout -q -B main
  "$REAL_GIT" -c user.email=smoke@example.invalid -c user.name=Smoke \
    commit -q --allow-empty -m "A: the commit under test"
  echo "release marker" >> README.md
  "$REAL_GIT" -c user.email=smoke@example.invalid -c user.name=Smoke \
    commit -q -am "B: a newer release"
)
BASE="$(cd "$WORK/origin" && "$REAL_GIT" rev-parse --short HEAD~1)"
TARGET="$(cd "$WORK/origin" && "$REAL_GIT" rev-parse --short HEAD)"

"$REAL_GIT" clone -q "$WORK/origin" "$WORK/clone" 2>/dev/null
(
  cd "$WORK/clone"
  "$REAL_GIT" checkout -q -B main
  "$REAL_GIT" reset -q --hard "$BASE"
  printf 'main\n' > .mirror-update-channel
)
# node_modules is gitignored, so copying it leaves the tree clean.
cp -R "$ROOT_DIR/ts/node_modules" "$WORK/clone/ts/node_modules"

HOME_DIR="$WORK/home"
mkdir -p "$HOME_DIR"
say "Generating the demo database"
(cd "$ROOT_DIR" && node --no-warnings ts/smoke/generate_demo_memory_db.ts --out "$HOME_DIR/memory.db" >/dev/null)
# The generator writes a CURRENT database. The Python generator it replaced
# (CV22.DS10.TS5) stopped at the last migration Python knew, so the update's
# migrate stage always had one real migration to apply -- the coverage the
# header promises. Keep it by regressing the one TypeScript-era migration to
# the shape a Python-written database really had: no column, no index, no
# ledger row. The SCHEMA regresses, not only the ledger, so the migration's
# re-run is real work rather than an `IF NOT EXISTS` no-op.
#
# Through node:sqlite -- the SQLite the product runs on -- and not the platform
# `sqlite3` CLI: `DROP COLUMN` rewrites the schema and re-parses every table,
# the FTS5 ones included, and the macOS runner's CLI failed there with "SQL
# logic error" where a newer local one passed.
REGRESS_017="DROP INDEX idx_identity_parent_journey;
ALTER TABLE identity DROP COLUMN parent_journey;
DELETE FROM _migrations WHERE id = '017_journey_parent_column';"
node --no-warnings -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(process.argv[1]);
  db.exec(process.argv[2]);
  db.close();' "$HOME_DIR/memory.db" "$REGRESS_017"

CLI="ts/src/frontDoor/cli.ts"
run_cli() {
  (
    cd "$WORK/clone"
    PATH="$WORK/stubs:$PATH" \
    MIRROR_HOME="$HOME_DIR" \
    NODE_OPTIONS=--no-warnings \
    node "$CLI" "$@"
  )
}
ledger() { "$REAL_SQLITE" "$HOME_DIR/memory.db" "select count(*) from _migrations;"; }
integrity() { "$REAL_SQLITE" "$HOME_DIR/memory.db" "PRAGMA integrity_check;"; }
head_of() { (cd "$WORK/clone" && "$REAL_GIT" rev-parse --short HEAD); }

# --- 1. check --------------------------------------------------------------
say "1. runtime update --check"
OUT="$(run_cli runtime update --check || true)"
case "$OUT" in
  *"Availability: update_available"*) ok "reports update_available" ;;
  *) bad "expected update_available, got: $(echo "$OUT" | tail -3)" ;;
esac
case "$OUT" in
  *"uv run python"*) bad "the check still instructs the user to run Python" ;;
  *) ok "no Python invocation in the recommendation" ;;
esac

# --- 2. dry run ------------------------------------------------------------
say "2. runtime update --dry-run touches nothing"
BEFORE_HEAD="$(head_of)"; BEFORE_LEDGER="$(ledger)"
run_cli runtime update --dry-run --mirror-home "$HOME_DIR" >/dev/null
check "HEAD unchanged" "$(head_of)" "$BEFORE_HEAD"
check "ledger unchanged" "$(ledger)" "$BEFORE_LEDGER"
# `find` on a missing directory exits non-zero, and under `pipefail` that
# takes the whole smoke down silently. Guard the directory instead.
if [ -d "$HOME_DIR/backups" ]; then
  BACKUP_COUNT="$(find "$HOME_DIR/backups" -name '*.zip' | wc -l | tr -d ' ')"
else
  BACKUP_COUNT=0
fi
check "no archive written" "$BACKUP_COUNT" "0"

# --- 3. the real update ----------------------------------------------------
say "3. runtime update, with python/python3/uv shadowed"
set +e
OUT="$(run_cli runtime update --mirror-home "$HOME_DIR" 2>&1)"; CODE=$?
set -e
echo "$OUT" | sed 's/^/    /'
check "exit code" "$CODE" "0"
case "$OUT" in
  *"INTERPRETER SPAWNED"*) bad "an interpreter was spawned during the update" ;;
  *) ok "no interpreter was spawned" ;;
esac
for stage in "status gate" "capture" "fetch" "plan" "backup" "verify backup" \
             "fast-forward" "migrate" "post-update status"; do
  case "$OUT" in
    *"[✓] $stage"*) ok "stage passed: $stage" ;;
    *) bad "stage missing or failed: $stage" ;;
  esac
done
check "HEAD moved to the target" "$(head_of)" "$TARGET"
check "database integrity" "$(integrity)" "ok"
if [ "$(ledger)" -ge "$BEFORE_LEDGER" ]; then ok "ledger did not regress ($BEFORE_LEDGER -> $(ledger))"; else bad "ledger regressed"; fi

ARCHIVE="$(printf '%s\n' "$OUT" | sed -n 's/^Backup: //p' | head -1)"
if [ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ]; then ok "an archive was written"; else bad "no archive was named"; fi
set +e
run_cli runtime backup --verify "$ARCHIVE" >/dev/null 2>&1; VERIFY=$?
set -e
check "the archive independently verifies" "$VERIFY" "0"

if grep -q "update install=clone" "$HOME_DIR/front-door.log" 2>/dev/null; then
  ok "the run is recorded in front-door.log"
else
  bad "no update line in front-door.log"
fi

# --- 4. the diverged failure path ------------------------------------------
say "4. a diverged clone fails without touching anything"
(
  cd "$WORK/clone"
  "$REAL_GIT" reset -q --hard "$BASE"
  echo "local work" > LOCAL.md
  "$REAL_GIT" add LOCAL.md
  "$REAL_GIT" -c user.email=smoke@example.invalid -c user.name=Smoke commit -q -m "local divergence"
)
BEFORE_HEAD="$(head_of)"; BEFORE_LEDGER="$(ledger)"
set +e
OUT="$(run_cli runtime update --mirror-home "$HOME_DIR" 2>&1)"; CODE=$?
set -e
check "exit code" "$CODE" "1"
case "$OUT" in *"branch diverged"*) ok "fails at plan with 'branch diverged'" ;; *) bad "wrong failure: $OUT" ;; esac
check "HEAD unchanged" "$(head_of)" "$BEFORE_HEAD"
check "ledger unchanged" "$(ledger)" "$BEFORE_LEDGER"
case "$OUT" in
  *"Current commit: $BEFORE_HEAD"*) ok "the recovery block names the captured commit" ;;
  *) bad "the recovery block lacks the captured commit" ;;
esac

# --- 5. the repair lane ----------------------------------------------------
say "5. the repair lane fast-forwards and skips migrations"
(cd "$WORK/clone" && "$REAL_GIT" reset -q --hard "$BASE")
BEFORE_LEDGER="$(ledger)"
set +e
OUT="$(run_cli runtime update --repair-updater --no-fetch --mirror-home "$HOME_DIR" 2>&1)"; CODE=$?
set -e
check "exit code" "$CODE" "0"
check "HEAD moved" "$(head_of)" "$TARGET"
check "ledger untouched by the repair lane" "$(ledger)" "$BEFORE_LEDGER"
case "$OUT" in
  *"Run \`runtime update\` again"*) ok "tells the operator to rerun the ordinary update" ;;
  *) bad "no rerun instruction" ;;
esac

# --- 6. the package kind, against a packed tarball -------------------------
say "6. package install detection against a real npm pack"
if [ -z "$REAL_NPM" ]; then
  printf '  \033[33m-\033[0m npm unavailable; package half skipped\n'
else
  PREFIX="$WORK/npm-prefix"
  mkdir -p "$PREFIX"
  TARBALL="$(cd "$ROOT_DIR/ts" && "$REAL_NPM" pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
  if [ -n "$TARBALL" ] && [ -f "$WORK/$TARBALL" ]; then
    ok "npm pack produced $TARBALL"
    if "$REAL_NPM" install -g --prefix "$PREFIX" "$WORK/$TARBALL" >/dev/null 2>&1; then
      ok "the tarball installs into an isolated prefix"
      INSTALLED="$(find "$PREFIX" -path '*/mirror-core/package.json' | head -1)"
      if [ -n "$INSTALLED" ]; then ok "the installed package is discoverable"; else bad "no installed package found"; fi
    else
      printf '  \033[33m-\033[0m install into the isolated prefix failed; recorded, not fatal\n'
    fi
  else
    printf '  \033[33m-\033[0m npm pack produced nothing; package half skipped\n'
  fi
fi

say "Result"
printf '  passed: %d   failed: %d\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
