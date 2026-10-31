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
#   * no configuration from the machine (CR137). The repository's .env,
#     which holds a provider key, is not in the clone. Every variable that
#     chooses a Mirror home, user, or database is unset before anything runs.
#     The Mirror commands run with a scratch HOME and no XDG_CONFIG_HOME, so
#     the OS user's ~/.config/mirror/env, which can hold a user and a provider
#     key, is never loaded. The smoke's OWN tools, git and npm, still run with
#     the machine's HOME and read its configuration, ~/.npmrc included.
#   * python/python3/uv shadowed on PATH with stubs that exit 66, so any
#     interpreter spawn FAILS THE SMOKE rather than passing unnoticed
#
# The real git, npm, and node paths are captured BEFORE the shadowing, because
# the stubs would otherwise shadow the tools the smoke itself needs. The PATH
# the clone runs under is built from scratch (stubs, a node symlink, the
# system directories), so what `mirror` resolves to is the smoke's decision
# and not the machine's: the clone seam (section 3) is graded both ways.
#
# Section 6 (CV22.DS10.US3 plateau 4) is the package lane end to end: a
# tarball installed into a scratch prefix, an `npm` shim ahead on the PATH
# that answers `root -g` with that prefix, `view … dist-tags` from a file the
# smoke writes, and `install -g <name>@<version>` by installing a second
# tarball packed at a bumped version -- and records every call, so a `publish`
# or anything unscripted fails the smoke. The registry is never reached.
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
REAL_NODE="$(command -v node)"
REAL_SQLITE="$(command -v sqlite3 || true)"

# CR137: nothing from the machine chooses a Mirror home, user, or database.
# These are the variables `DbPathEnv` reads, unset before anything runs, so
# a maintainer's exported MIRROR_USER cannot collide with a scratch home. It
# is the list smoke_npm_package.sh unsets; NODE_OPTIONS goes too, since a
# developer's --require or --inspect is not the smoke's.
unset MEMORY_ENV DB_PATH MEMORY_PROD_DIR MEMORY_DIR MIRROR_HOME MIRROR_USER NODE_OPTIONS

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$3', got '$2')"; fi; }

cleanup() { [ "${KEEP_SMOKE_WORKDIR:-0}" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

rm -rf "$WORK"
mkdir -p "$WORK/stubs" "$WORK/bin" "$WORK/withmirror"
ln -s "$REAL_NODE" "$WORK/bin/node"
# A `mirror` that exists, for the PATH that has one (section 3b).
printf '#!/bin/sh\nexit 0\n' > "$WORK/withmirror/mirror"; chmod +x "$WORK/withmirror/mirror"

# --- the interpreter stubs -------------------------------------------------
for bin in python python3 uv; do
  cat > "$WORK/stubs/$bin" <<STUB
#!/bin/sh
echo "INTERPRETER SPAWNED: $bin \$*" >&2
exit 66
STUB
  chmod +x "$WORK/stubs/$bin"
done

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
cp -R "$ROOT_DIR/node_modules" "$WORK/clone/node_modules"

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
# The clone's PATH holds the stubs, node, and the system directories (git
# lives there on both CI runners), and NOT the machine's own `mirror`.
CLONE_PATH="$WORK/stubs:$WORK/bin:/usr/bin:/bin"
# The clone lane's OS home (CR137): a scratch HOME and no XDG_CONFIG_HOME, as
# the package lane has, so the front door never fills a variable from the OS
# user's ~/.config/mirror/env. Unsetting MIRROR_USER above is not enough on
# its own, because the front door fills any unset variable from that file.
CLONE_OS_HOME="$WORK/clone-os-home"
mkdir -p "$CLONE_OS_HOME"
# The clone's front door, run from a directory of the caller's choosing. Its
# path is resolved: the entry runs only when argv[1] names the file its own
# URL does, and on macOS /tmp is a symlink to /private/tmp.
CLONE_CLI="$(cd "$WORK/clone" && pwd -P)/$CLI"
run_cli_from() {
  local dir="$1"
  shift
  (
    cd "$dir"
    unset XDG_CONFIG_HOME
    PATH="${CLI_PATH:-$CLONE_PATH}" \
    HOME="$CLONE_OS_HOME" \
    MIRROR_HOME="$HOME_DIR" \
    NODE_OPTIONS=--no-warnings \
    node "$CLONE_CLI" "$@"
  )
}
run_cli() { run_cli_from "$WORK/clone" "$@"; }
ledger() { "$REAL_SQLITE" "$HOME_DIR/memory.db" "select count(*) from _migrations;"; }
integrity() { "$REAL_SQLITE" "$HOME_DIR/memory.db" "PRAGMA integrity_check;"; }
head_of() { (cd "$WORK/clone" && "$REAL_GIT" rev-parse --short HEAD); }

# --- 0. the clone lane sees only the smoke's home ---------------------------
say "0. runtime status in the clone lane, without --mirror-home, finds the scratch home"
# CR137: the clone lane loaded the OS user's ~/.config/mirror/env, and the
# MIRROR_USER there collided with the scratch MIRROR_HOME. That user can be
# the owner's production user, and the conflict was all that kept such a
# command off the production home. This step runs one command WITHOUT
# --mirror-home, which finds the scratch home only if no user reaches the
# lane from anywhere: the shell, a config file, or XDG_CONFIG_HOME.
OUT="$(run_cli runtime status 2>&1 || true)"
case "$OUT" in
  *"Mirror home: $HOME_DIR"*) ok "the clone lane resolves the scratch home" ;;
  *) bad "the clone lane resolved '$(printf '%s\n' "$OUT" | sed -n 's/^Mirror home: //p' | head -1)'" ;;
esac
case "$OUT" in
  *"conflicts with MIRROR_USER"*) bad "a MIRROR_USER reached the clone lane" ;;
  *) ok "no MIRROR_USER reached the clone lane" ;;
esac

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

# --- 2b. a fetch slower than the local git budget ---------------------------
say "2b. runtime update --dry-run fetches through a transport that takes 3 s"
# CR132: the clone updater's fetch ran on git's 2-second LOCAL budget, so a
# fetch still in flight was killed and the update reported it failed. This
# stand-in ssh sleeps 3 s and then serves the scratch origin, so the fetch
# outlives that budget. On the network budget it completes.
cat > "$WORK/slow-ssh" <<'STANDIN'
#!/bin/sh
sleep 3
shift
exec sh -c "$1"
STANDIN
chmod +x "$WORK/slow-ssh"
"$REAL_GIT" -C "$WORK/clone" remote set-url origin "ssh://smoke$WORK/origin"
BEFORE_HEAD="$(head_of)"
set +e
OUT="$(GIT_SSH_COMMAND="$WORK/slow-ssh" GIT_SSH_VARIANT=simple \
  run_cli runtime update --dry-run --mirror-home "$HOME_DIR" 2>&1)"; CODE=$?
set -e
"$REAL_GIT" -C "$WORK/clone" remote set-url origin "$WORK/origin"
echo "$OUT" | sed 's/^/    /'
check "exit code" "$CODE" "0"
case "$OUT" in
  *"[✓] fetch: origin main"*) ok "the fetch outlived the 2-second local budget" ;;
  *) bad "the fetch did not complete through the slow transport" ;;
esac
check "HEAD unchanged" "$(head_of)" "$BEFORE_HEAD"

# --- 2c. the welcome card answers for the clone, not the cwd ----------------
say "2c. the welcome card, from a directory outside any repository, reads the clone"
# CR135: the card read the channel and the "commits behind" line from the
# repository holding the cwd. From a directory that is no repository it said
# `channel stable`, the default, and nothing about the clone one commit
# behind its `origin/main`.
mkdir -p "$WORK/outside"
OUT="$(run_cli_from "$WORK/outside" welcome --mirror-home "$HOME_DIR" 2>&1 || true)"
case "$OUT" in *"channel main"*) ok "the card reads the clone's channel" ;; *) bad "the card's channel is not the clone's: $(echo "$OUT" | sed -n 2p)" ;; esac
case "$OUT" in
  *"New Version Available: 1 commit behind origin/main"*) ok "the card counts the clone's commits behind" ;;
  *) bad "the card does not count the clone: $OUT" ;;
esac

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
# The clone seam (CV22.DS10.US3 plateau 4): every skill says `mirror`, and
# this clone provides it only after `npm link`. The PATH above has none.
case "$OUT" in
  *'`mirror` is not on the PATH: run `npm link` once in '*) ok "ends by naming npm link at the repository root" ;;
  *) bad "no npm link line for a PATH without mirror" ;;
esac
check "the line is printed once" "$(printf '%s\n' "$OUT" | grep -c 'npm link')" "1"

# --- 3b. the same clone, with a mirror on the PATH ---------------------------
say "3b. an up-to-date clone with mirror on the PATH hears nothing about npm link"
set +e
OUT="$(CLI_PATH="$WORK/withmirror:$CLONE_PATH" run_cli runtime update --no-fetch --mirror-home "$HOME_DIR" 2>&1)"; CODE=$?
set -e
check "exit code" "$CODE" "0"
case "$OUT" in *"already up to date"*) ok "nothing to pull" ;; *) bad "expected already up to date" ;; esac
case "$OUT" in *"npm link"*) bad "npm link named although mirror resolves" ;; *) ok "no npm link line" ;; esac

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

# --- 6. the package lane, against a packed tarball ---------------------------
say "6. the package lane: install, check, channel, dry run, update, and a refused downgrade"
if [ -z "$REAL_NPM" ]; then
  printf '  \033[33m-\033[0m npm unavailable; package lane skipped\n'
else
  PREFIX="$WORK/npm-prefix"
  PKG_HOME="$WORK/pkg-home"
  PKG_MIRROR_HOME="$WORK/pkg-mirror-home"
  mkdir -p "$PREFIX" "$PKG_HOME" "$PKG_MIRROR_HOME" "$WORK/npmshim"
  chmod 700 "$PKG_HOME"

  # Two tarballs from the WORKING tree (not the scratch origin, which holds
  # HEAD: a fix made for this lane must be the code the lane runs): the tree
  # as it is, and a copy of it at the next patch version. The copy is every
  # tracked and untracked-unignored file, so no node_modules and no tmp/.
  VERSION_A="$(node -p 'require(process.argv[1]).version' "$ROOT_DIR/package.json")"
  TARBALL_A="$(cd "$ROOT_DIR" && "$REAL_NPM" pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
  mkdir -p "$WORK/pkgsrc"
  (cd "$ROOT_DIR" && "$REAL_GIT" ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - 2>/dev/null) | tar -C "$WORK/pkgsrc" -xf -
  VERSION_B="$(cd "$WORK/pkgsrc" && "$REAL_NPM" version patch --no-git-tag-version 2>/dev/null | tr -d v)"
  TARBALL_B="$(cd "$WORK/pkgsrc" && "$REAL_NPM" pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
  if [ -f "$WORK/$TARBALL_A" ] && [ -f "$WORK/$TARBALL_B" ]; then
    ok "packed $TARBALL_A and $TARBALL_B"
  else
    bad "npm pack produced nothing"
  fi

  # The npm shim: answers the updater's three questions from the scratch
  # prefix and the smoke's own files, records every call, and fails on
  # anything else -- a `publish` above all.
  cat > "$WORK/dist-tags.json" <<TAGS
{"stable": "$VERSION_B", "main": "$VERSION_B"}
TAGS
  # CR135: the shim also records the directory each call ran in. npm reads the
  # project config of that directory, so every call must run in the install's
  # own tree -- its root, or for the apply the parent of node_modules -- never
  # in the person's project.
  cat > "$WORK/npmshim/npm" <<SHIM
#!/bin/sh
echo "\$*" >> "$WORK/npm-calls.log"
pwd -P >> "$WORK/npm-cwds.log"
case "\$*" in
  "root -g") echo "$PREFIX/lib/node_modules" ;;
  "view mirror-mind dist-tags --json") cat "$WORK/dist-tags.json" ;;
  "view mirror-mind dist-tags --json --fetch-retries=0") cat "$WORK/dist-tags.json" ;;
  "install -g mirror-mind@$VERSION_A") exec "$REAL_NPM" install -g --prefix "$PREFIX" "$WORK/$TARBALL_A" ;;
  "install -g mirror-mind@$VERSION_B") exec "$REAL_NPM" install -g --prefix "$PREFIX" "$WORK/$TARBALL_B" ;;
  *) echo "unscripted npm call: \$*" >> "$WORK/npm-unexpected.log"; exit 1 ;;
esac
SHIM
  chmod +x "$WORK/npmshim/npm"

  "$REAL_NPM" install -g --prefix "$PREFIX" "$WORK/$TARBALL_A" >"$WORK/install.log" 2>&1 \
    && ok "version $VERSION_A installed into the scratch prefix" \
    || bad "install failed: $(tail -3 "$WORK/install.log")"

  # A current database first (status is graded on it), regressed to need 017
  # before the update, as the clone lane's was.
  (cd "$ROOT_DIR" && node --no-warnings ts/smoke/generate_demo_memory_db.ts --out "$PKG_MIRROR_HOME/memory.db" >/dev/null)
  pkg_ledger() { "$REAL_SQLITE" "$PKG_MIRROR_HOME/memory.db" "select count(*) from _migrations;"; }
  # The prefix as the filesystem resolves it: on macOS /tmp is a symlink, and
  # the install root a package reports is the resolved path.
  PREFIX_REAL="$(cd "$PREFIX" && pwd -P)"

  # From here on: the installed bin, the shim, no checkout, a scratch HOME.
  # XDG_CONFIG_HOME is unset, not blanked (an empty value is not "unset" to
  # the core): the GitHub runner sets it to the runner's own ~/.config, and a
  # channel written there is written outside the smoke.
  run_pkg_from() {
    local dir="$1"
    shift
    (
      cd "$dir"
      unset XDG_CONFIG_HOME
      PATH="$WORK/npmshim:$WORK/stubs:$PREFIX/bin:$WORK/bin:/usr/bin:/bin" \
      HOME="$PKG_HOME" \
      MIRROR_HOME="$PKG_MIRROR_HOME" \
      mirror "$@"
    )
  }
  run_pkg() { run_pkg_from "$PKG_HOME" "$@"; }
  check "mirror resolves from the prefix" "$(cd "$PKG_HOME" && PATH="$PREFIX/bin:/usr/bin:/bin" command -v mirror)" "$PREFIX/bin/mirror"

  # status: the install, without asking npm
  : > "$WORK/npm-calls.log"
  OUT="$(run_pkg runtime status 2>&1 || true)"
  case "$OUT" in *"Install: package (mirror-mind@$VERSION_A)"*) ok "status names the package and its version" ;; *) bad "status lacks the install line: $(echo "$OUT" | head -5)" ;; esac
  case "$OUT" in *"Install root: $PREFIX_REAL/lib/node_modules/mirror-mind"*) ok "status names the install root" ;; *) bad "status lacks the install root" ;; esac
  case "$OUT" in *"Repository: none (package install)"*) ok "status grades no repository for a package" ;; *) bad "status graded the cwd as a repository" ;; esac
  case "$OUT" in *"Status: ready"*) ok "status is ready on a current database, from a directory that is no repository" ;; *) bad "status not ready: $(echo "$OUT" | tail -3)" ;; esac
  check "status asked npm nothing" "$(wc -l < "$WORK/npm-calls.log" | tr -d ' ')" "0"

  # welcome: the registry's answer for this install, from any directory (CR135)
  # Someone else's project: its origin/stable is one commit ahead, tagged
  # v9.9.9, and fetched, and its .npmrc names a closed port. The card used to
  # announce that tag, and a package outside any repository heard nothing.
  UNRELATED="$WORK/unrelated"
  "$REAL_GIT" init -q --bare "$WORK/unrelated-remote.git"
  "$REAL_GIT" init -q --initial-branch=stable "$UNRELATED"
  (
    cd "$UNRELATED"
    printf 'registry=http://127.0.0.1:9/\n' > .npmrc
    echo a > A && "$REAL_GIT" add -A
    "$REAL_GIT" -c user.email=smoke@example.invalid -c user.name=Smoke commit -q -m A
    "$REAL_GIT" remote add origin "$WORK/unrelated-remote.git"
    "$REAL_GIT" push -q origin stable
    echo b > B && "$REAL_GIT" add -A
    "$REAL_GIT" -c user.email=smoke@example.invalid -c user.name=Smoke commit -q -m B
    "$REAL_GIT" tag v9.9.9
    "$REAL_GIT" push -q origin stable v9.9.9
    "$REAL_GIT" reset -q --hard HEAD~1
    "$REAL_GIT" fetch -q origin
  )
  for DIR in "$PKG_HOME" "$UNRELATED"; do
    OUT="$(run_pkg_from "$DIR" welcome 2>&1 || true)"
    case "$OUT" in *"Version $VERSION_A · channel stable"*) ok "the card names the package and its channel, from $(basename "$DIR")" ;; *) bad "the card's version line, from $(basename "$DIR"): $(echo "$OUT" | sed -n 2p)" ;; esac
    case "$OUT" in *"✨ New Version Available: v$VERSION_B"*) ok "the card announces the channel's v$VERSION_B, from $(basename "$DIR")" ;; *) bad "the card missed the registry's version, from $(basename "$DIR"): $OUT" ;; esac
    case "$OUT" in *"v9.9.9"*|*"commit behind"*) bad "the card answered for the cwd's repository" ;; *) ok "nothing from the cwd's repository, from $(basename "$DIR")" ;; esac
  done
  LINE="$(run_pkg_from "$UNRELATED" welcome --status-line 2>&1 || true)"
  case "$LINE" in *"⬆ v$VERSION_B") ok "the status line carries the package's verdict" ;; *) bad "status line: $LINE" ;; esac

  # Now the database needs 017, so the update has a migration to apply.
  node --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1]);
    db.exec(process.argv[2]);
    db.close();' "$PKG_MIRROR_HOME/memory.db" "$REGRESS_017"

  # channel: default, set, read back
  OUT="$(run_pkg runtime channel 2>&1 || true)"
  case "$OUT" in *"Update channel: stable"*"Source: default"*) ok "channel defaults to stable from nowhere" ;; *) bad "unexpected channel render: $OUT" ;; esac
  OUT="$(run_pkg runtime channel main 2>&1)"; CODE=$?
  check "channel main exit code" "$CODE" "0"
  case "$OUT" in *"Update channel: main (was stable)"*) ok "channel set to main, says what it was" ;; *) bad "unexpected set render: $OUT" ;; esac
  check "the channel file holds main" "$(cat "$PKG_HOME/.config/mirror/update-channel")" "main"
  mode_of() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
  check "the config directory it created is 0700" "$(mode_of "$PKG_HOME/.config/mirror")" "700"
  set +e
  run_pkg runtime channel beta >/dev/null 2>"$WORK/channel.err"; CODE=$?
  set -e
  check "an unknown channel is refused with exit 2" "$CODE" "2"
  check "and nothing was written" "$(cat "$PKG_HOME/.config/mirror/update-channel")" "main"

  # check: the registry's answer, through the shim
  OUT="$(run_pkg runtime update --check 2>&1 || true)"
  case "$OUT" in *"Availability: update_available"*) ok "--check reports update_available" ;; *) bad "--check: $OUT" ;; esac
  case "$OUT" in *"Channel version: $VERSION_B"*) ok "--check names the channel's version" ;; *) bad "--check lacks the channel version" ;; esac
  case "$OUT" in *"Update channel: main"*) ok "--check reads the channel it was set to" ;; *) bad "--check read the wrong channel" ;; esac

  # dry run: nothing moves
  BEFORE_LEDGER="$(pkg_ledger)"
  OUT="$(run_pkg runtime update --dry-run 2>&1 || true)"
  case "$OUT" in *"[✓] capture: mirror-mind@$VERSION_A"*) ok "dry run captures the installed version" ;; *) bad "dry run capture: $OUT" ;; esac
  case "$OUT" in *"[✓] plan: $VERSION_A -> $VERSION_B"*) ok "dry run plans A -> B" ;; *) bad "dry run plan missing" ;; esac
  case "$OUT" in *"[-] apply: would install mirror-mind@$VERSION_B"*) ok "dry run names the install it would make" ;; *) bad "dry run apply line missing" ;; esac
  check "dry run installed nothing" "$(run_pkg runtime version 2>/dev/null | sed -n 's/^Version: //p')" "$VERSION_A"
  check "dry run migrated nothing" "$(pkg_ledger)" "$BEFORE_LEDGER"

  # the real update, with interpreters shadowed
  set +e
  OUT="$(run_pkg runtime update 2>&1)"; CODE=$?
  set -e
  echo "$OUT" | sed 's/^/    /'
  check "update exit code" "$CODE" "0"
  case "$OUT" in *"INTERPRETER SPAWNED"*) bad "an interpreter was spawned" ;; *) ok "no interpreter was spawned" ;; esac
  for stage in "status gate" "capture: mirror-mind@$VERSION_A" "plan: $VERSION_A -> $VERSION_B" "backup" "verify backup" "apply: mirror-mind@$VERSION_B" "migrate" "post-update status"; do
    case "$OUT" in *"[✓] $stage"*) ok "stage passed: $stage" ;; *) bad "stage missing or failed: $stage" ;; esac
  done
  check "the installed version moved to B" "$(run_pkg runtime version 2>/dev/null | sed -n 's/^Version: //p')" "$VERSION_B"
  if [ "$(pkg_ledger)" -gt "$BEFORE_LEDGER" ]; then ok "the migration applied in a fresh process ($BEFORE_LEDGER -> $(pkg_ledger))"; else bad "ledger did not move"; fi
  ARCHIVE="$(printf '%s\n' "$OUT" | sed -n 's/^Backup: //p' | head -1)"
  [ -n "$ARCHIVE" ] && [ -f "$ARCHIVE" ] && ok "an archive was written before apply" || bad "no archive"
  grep -q "update install=package channel=main $VERSION_A->$VERSION_B" "$PKG_MIRROR_HOME/front-door.log" 2>/dev/null \
    && ok "the run is recorded in front-door.log with both versions" || bad "no package update line in front-door.log"
  case "$OUT" in *"npm link"*) bad "a package was told to npm link" ;; *) ok "no npm link line for a package" ;; esac

  # The update said what it installed: the status line stops announcing it (CR135).
  LINE="$(run_pkg welcome --status-line 2>&1 || true)"
  case "$LINE" in *" · ✓") ok "after the update, the status line reads ✓" ;; *) bad "after the update, status line: $LINE" ;; esac
  OUT="$(run_pkg welcome 2>&1 || true)"
  case "$OUT" in *"New Version Available"*) bad "after the update, the card still announces one: $OUT" ;; *) ok "after the update, the card announces nothing" ;; esac

  # up to date now
  OUT="$(run_pkg runtime update --check 2>&1 || true)"
  case "$OUT" in *"Availability: up_to_date"*) ok "--check now reports up_to_date" ;; *) bad "--check after update: $OUT" ;; esac

  # the refused downgrade: stable falls behind the install
  cat > "$WORK/dist-tags.json" <<TAGS
{"stable": "$VERSION_A", "main": "$VERSION_B"}
TAGS
  run_pkg runtime channel stable >/dev/null 2>&1
  OUT="$(run_pkg runtime update --check 2>&1 || true)"
  case "$OUT" in *"Availability: channel_behind"*) ok "--check reports the channel behind the install" ;; *) bad "--check downgrade: $OUT" ;; esac
  case "$OUT" in *"Next: runtime channel main"*) ok "--check names the channel that carries the install" ;; *) bad "--check lacks the carrier" ;; esac
  BEFORE_LEDGER="$(pkg_ledger)"
  set +e
  OUT="$(run_pkg runtime update 2>&1)"; CODE=$?
  set -e
  check "a downgrade is refused with exit 1" "$CODE" "1"
  case "$OUT" in *"[✗] plan: 'stable' is behind the installed version ($VERSION_A < $VERSION_B)"*) ok "refused at plan, naming both versions" ;; *) bad "wrong refusal: $(echo "$OUT" | grep plan)" ;; esac
  case "$OUT" in *"migrations do not run backwards"*) ok "says why" ;; *) bad "no reason" ;; esac
  case "$OUT" in *"[✓] backup"*) bad "a backup was taken for a refused plan" ;; *) ok "no backup for a refused plan" ;; esac
  check "nothing was installed" "$(run_pkg runtime version 2>/dev/null | sed -n 's/^Version: //p')" "$VERSION_B"
  check "nothing was migrated" "$(pkg_ledger)" "$BEFORE_LEDGER"

  # what npm was asked, in total
  if [ -f "$WORK/npm-unexpected.log" ]; then bad "npm was asked something unscripted: $(cat "$WORK/npm-unexpected.log")"; else ok "npm was asked nothing unscripted"; fi
  if grep -q "^publish" "$WORK/npm-calls.log"; then bad "npm publish was called"; else ok "npm publish was never called"; fi
  check "the one install npm made is the exact version" "$(grep -c "^install -g mirror-mind@$VERSION_B\$" "$WORK/npm-calls.log")" "1"
  # CR135: root -g and view run in the install's root; install -g runs in the
  # parent of node_modules -- still the install's own tree, never the person's
  # project. (npm renames the package directory aside before installing, and a
  # Windows process holds its cwd against that rename: from inside the package
  # the apply failed with EBUSY on every update.) Whatever directory the
  # command itself was run in, neither is it.
  INSTALL_ROOT="$PREFIX_REAL/lib/node_modules/mirror-mind"
  APPLY_CWD="$PREFIX_REAL/lib"
  if [ -s "$WORK/npm-cwds.log" ] && ! grep -vxF "$INSTALL_ROOT" "$WORK/npm-cwds.log" | grep -qvxF "$APPLY_CWD"; then
    ok "every npm call ran in the install's own tree ($(wc -l < "$WORK/npm-cwds.log" | tr -d ' ') calls)"
  else
    bad "an npm call ran elsewhere: $(sort -u "$WORK/npm-cwds.log" | grep -vxF "$INSTALL_ROOT" | grep -vxF "$APPLY_CWD" | head -3)"
  fi
  # and the apply did leave the package directory, which is the point
  if paste -d' ' "$WORK/npm-calls.log" "$WORK/npm-cwds.log" | grep -q "^install -g mirror-mind@$VERSION_B $APPLY_CWD$"; then
    ok "the apply ran from the parent of node_modules"
  else
    bad "the apply did not run from the parent of node_modules: $(paste -d' ' "$WORK/npm-calls.log" "$WORK/npm-cwds.log" | grep '^install' | head -2)"
  fi
fi

say "Result"
printf '  passed: %d   failed: %d\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
