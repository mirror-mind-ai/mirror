#!/usr/bin/env bash
# CV22.DS10.US3 — the install from nothing.
#
# Packs this repository, installs the tarball into a scratch npm prefix, and
# then -- with PATH holding only that prefix's bin and the tools the smoke
# itself needs, HOME pointing at a scratch directory, and no checkout in sight
# -- runs the commands a person runs first: `mirror init`, `mirror seed`,
# `mirror list personas`, `mirror runtime status`, and an open of a database
# that needs migration 017, so migrate-on-open, the bootstrap lock, and the
# pre-write snapshot all run FROM THE PACKAGE LOCATION. Nothing run inside
# this repository can stand in for it: the story's subject is an install with
# no checkout, and every one of these used to assume one.
#
# Isolation, absolute:
#   * a scratch prefix (`npm install -g --prefix`), never the real global root
#   * a scratch HOME, so `~/.config/mirror/env` and `~/.mirror-minds` are the
#     smoke's own and nothing of the Navigator's is read or written
#   * the checkout's `.env` is unreachable: the package has none, and the
#     front door locates its tree from its own entry file
#   * python/python3/uv shadowed with stubs that exit 66, so an interpreter
#     spawn FAILS the smoke rather than passing unnoticed
#   * npm shadowed the same way once the install is done (CR134), so nothing
#     after it reaches the live registry, whatever the runner's PATH holds
#
# The real npm, node, sqlite3 paths are captured BEFORE PATH is replaced
# (US2's lesson: the stubs would otherwise shadow the tools the smoke needs).
#
# Plateau 1 shipped the first half (install, init, seed, list, status, the
# migrating open). Plateau 3 adds the four runtimes' payloads against the
# INSTALLED wrappers and `mirror mcp`: the Claude plugin copied out of the
# package as Claude Code copies it, and the MCP server through the plugin's
# launcher and through `mirror mcp` directly. (The Gemini wrappers and the
# Codex wrapper, once run from under `npm root -g` -- below node_modules,
# where only the loader shim can run the TypeScript entry (D15) -- retired
# with CV21.DS8.US1 and CV21.DS4.TS5.)
#
# Usage:  scripts/smoke_npm_package.sh [workdir]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORK="${1:-/tmp/mirror-npm-package-smoke}"
PASS=0
FAIL=0

REAL_NPM="$(command -v npm)"
REAL_NODE="$(command -v node)"
REAL_SQLITE="$(command -v sqlite3 || true)"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; PASS=$((PASS + 1)); }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$3', got '$2')"; fi; }
contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1 (missing '$3')"; printf '%s\n' "$2" | sed 's/^/      | /' | head -20 ;; esac; }

cleanup() { [ "${KEEP_SMOKE_WORKDIR:-0}" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

rm -rf "$WORK"
mkdir -p "$WORK/stubs" "$WORK/prefix" "$WORK/home" "$WORK/bin"
chmod 700 "$WORK/home"

# --- the interpreter stubs, and the few real tools the smoke needs --------
for bin in python python3 uv; do
  cat > "$WORK/stubs/$bin" <<STUB
#!/bin/sh
echo "INTERPRETER SPAWNED: $bin \$*" >&2
exit 66
STUB
  chmod +x "$WORK/stubs/$bin"
done
# CR134: npm, once the install is done. The real one is captured above and
# used only by step 1; after it, every registry question meets this stub.
cat > "$WORK/stubs/npm" <<'STUB'
#!/bin/sh
echo "npm stub: the smoke does not reach the registry ($*)" >&2
exit 66
STUB
chmod +x "$WORK/stubs/npm"
ln -s "$REAL_NODE" "$WORK/bin/node"
[ -n "$REAL_SQLITE" ] && ln -s "$REAL_SQLITE" "$WORK/bin/sqlite3"

# --- 1. pack and install -----------------------------------------------------
say "1. npm pack, then install into a scratch prefix"
TARBALL="$(cd "$ROOT_DIR" && "$REAL_NPM" pack --pack-destination "$WORK" 2>/dev/null | tail -1)"
[ -f "$WORK/$TARBALL" ] && ok "packed $TARBALL" || { bad "npm pack produced nothing"; exit 1; }
# CR133: Homebrew's prefix on Apple Silicon, /opt/homebrew, is the Homebrew
# repository itself, so a package installed there sits inside a git work tree
# it does not own. The scratch prefix takes the same shape, and only the
# prefix: the smoke's cwd stays outside any repository, as before.
git init -q "$WORK/prefix"
if "$REAL_NPM" install -g --prefix "$WORK/prefix" "$WORK/$TARBALL" >"$WORK/install.log" 2>&1; then
  ok "installed into the scratch prefix"
else
  bad "install failed"; cat "$WORK/install.log"; exit 1
fi
PKG="$WORK/prefix/lib/node_modules/mirror-mind"
[ -f "$PKG/package.json" ] && ok "the package sits at <prefix>/lib/node_modules/mirror-mind" || bad "package not found at $PKG"
check "git names the prefix as the package's repository, as under Homebrew" "$(git -C "$PKG" rev-parse --show-toplevel)" "$(cd "$WORK/prefix" && pwd -P)"
[ -f "$PKG/ts/src/frontDoor/cli.ts" ] && ok "the front door has the same path as in the checkout" || bad "front door missing"
[ -d "$PKG/templates/identity" ] && ok "templates/identity shipped" || bad "templates missing"
[ ! -f "$PKG/.env" ] && ok "no .env in the package" || bad "the package carries a .env"
# CV21.DS4.US1: Codex installs the plugin from the package as a marketplace. CI has
# no codex, so the smoke reads the file the way `codex plugin marketplace add`
# would: present, JSON, one local plugin whose path resolves to the installed
# plugin manifest. The `.agents/skills/` symlinks beside it are the checkout's.
MARKETPLACE="$PKG/.agents/plugins/marketplace.json"
[ -f "$MARKETPLACE" ] && ok "the Codex marketplace shipped at .agents/plugins/marketplace.json" || bad "no Codex marketplace in the package"
MP_PLUGIN="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const p=m.plugins[0];console.log(m.name+"|"+p.name+"|"+p.source.source+"|"+p.source.path)' "$MARKETPLACE" 2>/dev/null || true)"
check "the marketplace names mirror-mind, one local plugin" "$MP_PLUGIN" "mirror-mind|mirror-mind|local|./plugins/mirror-mind"
[ -f "$PKG/plugins/mirror-mind/.claude-plugin/plugin.json" ] && ok "its path resolves to the installed plugin manifest" || bad "the marketplace points at nothing"
[ ! -e "$PKG/.agents/skills" ] && ok "the checkout's .agents/skills links are not in the package" || bad ".agents/skills shipped"
[ -z "$(find "$PKG" -name '*.py' -o -name 'pyproject.toml' -o -name 'uv.lock' | head -1)" ] && ok "no Python in the installed tree" || bad "Python found in the installed tree"

# --- from here on: no checkout, no real HOME, interpreters shadowed ---------
export PATH="$WORK/stubs:$WORK/prefix/bin:$WORK/bin:/usr/bin:/bin"
export HOME="$WORK/home"
unset MIRROR_HOME MIRROR_USER MEMORY_DIR DB_PATH MEMORY_ENV NODE_OPTIONS XDG_CONFIG_HOME OPENROUTER_API_KEY
cd "$WORK/home"

say "2. mirror is on the PATH, from the install, with nothing else set"
check "command -v mirror" "$(command -v mirror)" "$WORK/prefix/bin/mirror"
BARE="$(mirror 2>&1 || true)"
contains "bare mirror, no user yet: the orientation, not the usage dump" "$BARE" "No user configured yet."
contains "the orientation names init" "$BARE" "Run: mirror init <your-name>"
contains "the orientation names the config file" "$BARE" "Configuration will live at: $HOME/.config/mirror/env"
VERSION_OUT="$(mirror runtime version 2>"$WORK/version.err" || true)"
contains "runtime version answers" "$VERSION_OUT" "Version: "
check "runtime version writes nothing to stderr (no ExperimentalWarning, no .env needed)" "$(wc -c <"$WORK/version.err" | tr -d ' ')" "0"

say "3. mirror init from an empty home"
contains "the package carries the operating instructions (D13)" "$(head -1 "$PKG/AGENTS.md")" "Mirror Mind"
[ ! -f "$PKG/CLAUDE.md" ] && ok "and not the repository's project context" || bad "CLAUDE.md shipped"
INIT_OUT="$(mirror init smokeuser 2>"$WORK/init.err")"; INIT_CODE=$?
check "init exit code" "$INIT_CODE" "0"
contains "init created the modern home" "$INIT_OUT" "Created user home: $HOME/.mirror-minds/smokeuser"
CONFIG="$HOME/.config/mirror/env"
[ -f "$CONFIG" ] && ok "config file written at $CONFIG" || bad "no config file at $CONFIG"
check "config file holds MIRROR_USER" "$(cat "$CONFIG")" "MIRROR_USER=smokeuser"
# GNU stat first: on BSD `stat -c` fails and the `-f '%Lp'` form answers; on GNU
# `stat -f` is FILESYSTEM status, exits 0, and would answer the wrong thing.
mode_of() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }
check "config file is 0600" "$(mode_of "$CONFIG")" "600"
check "config directory is 0700" "$(mode_of "$HOME/.config/mirror")" "700"
contains "init says where the key goes" "$INIT_OUT" "OPENROUTER_API_KEY"
[ -f "$HOME/.mirror-minds/smokeuser/identity/self/soul.yaml" ] && ok "identity templates copied" || bad "identity not copied"

BARE_AFTER="$(mirror 2>&1 || true)"
contains "bare mirror, user configured: the usage" "$BARE_AFTER" "Usage: mirror <command> [args]"

say "4. mirror seed, resolving the user from the config file alone"
set +e
SEED_OUT="$(mirror seed 2>"$WORK/seed.err")"; SEED_CODE=$?
set -e
[ -f "$HOME/.mirror-minds/smokeuser/memory.db" ] && ok "memory.db created in the user's home" || bad "no memory.db"
contains "seed created the 20 template entries" "$SEED_OUT" "Result: 20 created"
# US3 F1, paid at the Debt Review (2026-10-10): until then the shipped
# `ego/constraints.yaml` template was empty, seed reported empty content as an
# error, and a stranger's first seed exited 1 on every machine. The template
# now carries one constraint, so a fresh seed is clean -- and this is the line
# that says so, the day a template goes empty again.
[[ "$SEED_OUT" != *"Errors:"* ]] && ok "seed reports no errors" || bad "seed reported errors: $(printf '%s' "$SEED_OUT" | grep -A3 'Errors:')"
check "seed exit code" "$SEED_CODE" "0"
check "seed writes nothing to stderr" "$(wc -c <"$WORK/seed.err" | tr -d ' ')" "0"
LIST_OUT="$(mirror list personas 2>"$WORK/list.err")"
PERSONAS="$(printf '%s\n' "$LIST_OUT" | grep -c '^  [a-z]' || true)"
[ "$PERSONAS" -ge 12 ] && ok "list personas shows $PERSONAS personas" || bad "list personas shows $PERSONAS personas (expected 12 or more)"
check "list personas writes nothing to stderr" "$(wc -c <"$WORK/list.err" | tr -d ' ')" "0"

say "5. mirror runtime status from the package"
STATUS_OUT="$(mirror runtime status 2>&1 || true)"
contains "status names the version" "$STATUS_OUT" "Version: "
contains "status names the home" "$STATUS_OUT" "Mirror home: $HOME/.mirror-minds/smokeuser"
contains "status sees the database" "$STATUS_OUT" "Database exists: yes"
# Plateau 4 (§E): the install, read from the layout with npm off this PATH,
# and no repository graded for a package -- the cwd was read as a git tree
# and its absence as an error, which left every package `attention needed`.
contains "status names the install (npm a stub on this PATH)" "$STATUS_OUT" "Install: package (mirror-mind@"
contains "status names the install root" "$STATUS_OUT" "Install root: $(cd "$PKG" && pwd -P)"
contains "status grades no repository for a package" "$STATUS_OUT" "Repository: none (package install)"
[ -z "$(printf '%s' "$STATUS_OUT" | grep '^Git status note:')" ] && ok "no git note for a package" || bad "a package was graded as a git tree"
# CR138: a package has no clone role, and reads none from the cwd.
contains "status names no clone role for a package" "$STATUS_OUT" "Clone role: none (package install)"
# CR133: the notes ship in the package and are read where it sits, never in
# the repository git names above it (the prefix, step 1), which has none.
NOTES_OUT="$(mirror runtime release-notes latest 2>&1 || true)"
contains "release-notes latest finds a note" "$NOTES_OUT" "Release: v"
contains "release-notes latest reads the package's own notes" "$NOTES_OUT" "Path: $(cd "$PKG" && pwd -P)/docs/releases/v"
# CR134: a package's pending notes come from the registry, and the npm stub
# answers nothing, so the answer is `unknown`, naming the stub -- never `none`,
# and never the cwd's repository.
set +e
PENDING_OUT="$(mirror runtime release-notes pending 2>&1)"; PENDING_CODE=$?
set -e
contains "release-notes pending names the package's channel as its source" "$PENDING_OUT" "Source: npm mirror-mind@stable"
contains "release-notes pending says it could not check, not none" "$PENDING_OUT" "Pending releases: unknown"
contains "and its reason is the registry read, through the npm stub" "$PENDING_OUT" "Reason: npm stub: the smoke does not reach the registry"
check "release-notes pending exits 1 when it could not check" "$PENDING_CODE" "1"
# CR148: a reader that closes without reading -- `| true`, not `| head -1`,
# whose first line arrives before the 2 KB usage leaves the pipe buffer. The
# installed bin runs through the loader shim, which is the one thing this
# lane has that the checkout's tests do not; the handler sits below it.
mirror --help 2>"$WORK/pipe.err" | true
check "mirror --help | true exits 0 (the reader asked us to stop)" "${PIPESTATUS[0]}" "0"
check "and writes nothing to stderr (no EPIPE, no stack trace)" "$(wc -c <"$WORK/pipe.err" | tr -d ' ')" "0"

say "5b. a home on disk and no configuration: the move from a clone to the package (CR185)"
# Leandro's path on PR #42: the home stayed, the configuration lived in the
# clone's .env, which a package does not read. The error names the command,
# and the command adopts the home without touching it.
identity_sums() { (cd "$HOME/.mirror-minds/smokeuser" && find identity -type f -exec cksum {} + | sort); }
IDENTITY_BEFORE="$(identity_sums)"
rm "$CONFIG"
set +e
MOVED_OUT="$(mirror runtime migrate 2>&1)"; MOVED_CODE=$?
ADOPT_OUT="$(mirror init smokeuser 2>"$WORK/adopt.err")"; ADOPT_CODE=$?
set -e
check "with no configuration, runtime migrate exits 1" "$MOVED_CODE" "1"
contains "and names the home and the command that finishes the job" "$MOVED_OUT" \
  "To use the home at $HOME/.mirror-minds/smokeuser, run: mirror init smokeuser (it writes MIRROR_USER=smokeuser to $CONFIG)."
check "init on the existing home exits 0" "$ADOPT_CODE" "0"
check "its first line says what it found" "$(printf '%s\n' "$ADOPT_OUT" | head -1)" \
  "Found user home: $HOME/.mirror-minds/smokeuser (nothing in it was changed)"
check "the configuration is back" "$(cat "$CONFIG")" "MIRROR_USER=smokeuser"
check "the config file is 0600 again" "$(mode_of "$CONFIG")" "600"
check "nothing under identity/ changed" "$(identity_sums)" "$IDENTITY_BEFORE"
[[ "$ADOPT_OUT" != *"mirror seed"* ]] && ok "no seed step for a home that has its database" || bad "init asked to seed a seeded home"
check "init writes nothing to stderr" "$(wc -c <"$WORK/adopt.err" | tr -d ' ')" "0"
# The package reads the file back: nothing else selects the home now. A clone
# cannot show this, because its own .env is read before the config file.
ADOPTED_STATUS="$(mirror runtime status 2>&1 || true)"
contains "runtime status finds the home through the config file" "$ADOPTED_STATUS" "Mirror home: $HOME/.mirror-minds/smokeuser"
set +e
AGAIN_OUT="$(mirror init smokeuser 2>&1)"; AGAIN_CODE=$?
set -e
check "init again exits 0" "$AGAIN_CODE" "0"
contains "and says the home is already selected" "$AGAIN_OUT" "Configuration: already selects this home"
check "and writes nothing" "$(cat "$CONFIG")" "MIRROR_USER=smokeuser"

say "5c. no OpenRouter key: a command that needs one refuses before it touches anything (CR187)"
# Every package install starts here: init writes MIRROR_USER and leaves the key to
# the person. Before, journal printed a stack trace, copied the database into its
# pre-write snapshot, and lost the entry.
BACKUPS="$HOME/.mirror-minds/smokeuser/backups"
mv "$BACKUPS" "$BACKUPS.before-5c"
set +e
JOURNAL_ERR="$(mirror journal "a note about the day" 2>&1 >/dev/null)"; JOURNAL_CODE=$?
set -e
check "journal with no key exits 2" "$JOURNAL_CODE" "2"
check "in one line" "$(printf '%s\n' "$JOURNAL_ERR" | wc -l | tr -d ' ')" "1"
check "that says the entry was not saved, and where the key goes" "$JOURNAL_ERR" \
  "Error: the journal entry was not saved, because OPENROUTER_API_KEY is not configured. Add OPENROUTER_API_KEY=<your key> to $CONFIG, then run the same command again."
[ ! -e "$BACKUPS" ] && ok "and took no pre-write snapshot" || bad "journal opened the database before refusing"
mv "$BACKUPS.before-5c" "$BACKUPS"
KEY_STATUS="$(mirror runtime status 2>&1 || true)"
contains "runtime status says the key is missing" "$KEY_STATUS" "OpenRouter key: not configured"
KEY_DIAGNOSE="$(mirror runtime diagnose 2>&1 || true)"
contains "runtime diagnose reports it, naming the file" "$KEY_DIAGNOSE" "Recommendation: add OPENROUTER_API_KEY=<your key> to $CONFIG"

say "6. a database that needs migration 017, opened through the installed package"
if [ -z "$REAL_SQLITE" ]; then
  printf '  \033[33m-\033[0m sqlite3 unavailable; the migrating open is skipped\n'
else
  DEMO="$WORK/demo-memory.db"
  (cd "$ROOT_DIR" && PATH="$WORK/bin:/usr/bin:/bin" "$REAL_NODE" --no-warnings ts/smoke/generate_demo_memory_db.ts --out "$DEMO" >/dev/null)
  mkdir -p "$HOME/.mirror-minds/legacy" && chmod 700 "$HOME/.mirror-minds/legacy"
  cp "$DEMO" "$HOME/.mirror-minds/legacy/memory.db"
  sqlite3 "$HOME/.mirror-minds/legacy/memory.db" \
    "DROP INDEX IF EXISTS idx_identity_parent_journey; ALTER TABLE identity DROP COLUMN parent_journey; DELETE FROM _migrations WHERE id='017_journey_parent_column';"
  check "precondition: 017 pending" "$(sqlite3 "$HOME/.mirror-minds/legacy/memory.db" "SELECT count(*) FROM _migrations WHERE id='017_journey_parent_column'")" "0"
  OPEN_OUT="$(MIRROR_USER=legacy mirror journeys 2>"$WORK/open.err")"; OPEN_CODE=$?
  check "the front door served the legacy database (exit 0)" "$OPEN_CODE" "0"
  check "017 applied on open" "$(sqlite3 "$HOME/.mirror-minds/legacy/memory.db" "SELECT count(*) FROM _migrations WHERE id='017_journey_parent_column'")" "1"
  [ -f "$HOME/.mirror-minds/legacy/backups/frontdoor-pre-migration-backup.db" ] && ok "pre-migration snapshot landed in the mirror home" || bad "no pre-migration snapshot"
  grep -q migrate_on_open "$HOME/.mirror-minds/legacy/front-door.log" 2>/dev/null && ok "front-door log records migrate_on_open" || bad "front-door log lacks migrate_on_open"
fi

# CV24.DS1: Mirror Desktop imports the core as a library, by package name,
# from its own node_modules -- where Node refuses to strip types unless the
# entry registers the loader's hook. The host project links the INSTALLED
# package, so its real path stays under node_modules, as Desktop's will.
say "7. mirror-mind/desktop, imported by a host project from the installed package"
HOST="$WORK/desktop-host"
mkdir -p "$HOST/node_modules"
ln -s "$PKG" "$HOST/node_modules/mirror-mind"
LIB_PROBE='const desktop = await import("mirror-mind/desktop");
const r = desktop.inspectMigrationState(process.argv[1]);
console.log([desktop.DESKTOP_API_VERSION, r.state, r.pending.join(",")].join("|"));'
check "a current home reads as current" \
  "$(cd "$HOST" && node --input-type=module -e "$LIB_PROBE" "$HOME/.mirror-minds/smokeuser/memory.db" 2>"$WORK/lib.err")" "1|current|"
check "and the import writes nothing to stderr" "$(grep -v ExperimentalWarning "$WORK/lib.err" | grep -cv 'node --trace-warnings' | tr -d ' ')" "0"
if [ -n "$REAL_SQLITE" ]; then
  mkdir -p "$WORK/lib-016"
  cp "$HOME/.mirror-minds/smokeuser/memory.db" "$WORK/lib-016/memory.db"
  sqlite3 "$WORK/lib-016/memory.db" "DELETE FROM _migrations WHERE id IN ('017_journey_parent_column','018_drop_hook_injected');"
  LIB_HASH="$(cksum <"$WORK/lib-016/memory.db")"
  check "a home at 016 reports 017 and 018 pending" \
    "$(cd "$HOST" && node --input-type=module -e "$LIB_PROBE" "$WORK/lib-016/memory.db" 2>/dev/null)" "1|pending|017_journey_parent_column,018_drop_hook_injected"
  check "and the report left its bytes alone" "$(cksum <"$WORK/lib-016/memory.db")" "$LIB_HASH"
  [ ! -e "$WORK/lib-016/backups" ] && ok "and took no backup" || bad "the report took a backup"
  # CV24.DS2: the four Conversation calls, on a scratch copy of a current home.
  mkdir -p "$WORK/lib-calls"
  sqlite3 "$HOME/.mirror-minds/smokeuser/memory.db" ".backup '$WORK/lib-calls/memory.db'"
  CALLS_PROBE='const d = await import("mirror-mind/desktop");
const db = process.argv[1];
const c = d.ensureConversation(db, { sessionId: "smoke-session", journeyId: "smoke-journey", title: "Smoke", interface: "smoke" });
const a = d.appendConversationMessages(db, { schemaVersion: "1.0.0", conversationId: c.conversationId, journeyId: "smoke-journey", sourceInterface: "smoke", messages: [{ id: "smoke-msg-1", role: "user", content: "hi", createdAt: "2026-10-28T12:00:00Z" }] });
const r = d.renameConversation(db, { conversationId: c.conversationId, journeyId: "smoke-journey", title: "Renamed" });
const b = d.rebindConversationJourney(db, { conversationId: c.conversationId, journeyId: "other-journey" });
let refused = "no";
try { d.ensureConversation(process.argv[2], { sessionId: "s", journeyId: "j", title: "t", interface: "smoke" }); } catch (e) { refused = e instanceof d.DatabaseNotCurrentError ? e.state : "wrong"; }
console.log([a.status, a.insertedCount, r.title, b.rebound, refused].join("|"));'
  check "the four Conversation calls run from the installed package, and a home at 016 is refused" \
    "$(cd "$HOST" && node --input-type=module -e "$CALLS_PROBE" "$WORK/lib-calls/memory.db" "$WORK/lib-016/memory.db" 2>/dev/null)" "accepted|1|Renamed|true|pending"
  check "and they landed in that home" \
    "$(sqlite3 "$WORK/lib-calls/memory.db" "SELECT title || '|' || journey FROM conversations WHERE id IN (SELECT conversation_id FROM messages WHERE id='smoke-msg-1')")" "Renamed|other-journey"
  [ ! -e "$WORK/lib-calls/backups" ] && ok "and took no snapshot" || bad "a Conversation call took a snapshot"
  check "and the refused home kept its bytes" "$(cksum <"$WORK/lib-016/memory.db")" "$LIB_HASH"
  # CV24.DS3: the three reads a sidebar is built from, on the same home.
  READS_PROBE='const d = await import("mirror-mind/desktop");
const db = process.argv[1];
const tree = d.readJourneyTree(db);
const list = d.listJourneyConversations(db, { journeyId: "other-journey", limit: 10 });
const one = d.inspectConversation(db, { conversationId: list[0].conversationId });
console.log([Array.isArray(tree.roots), tree.findings.length, list.length, one.title, one.journeyId, one.messageCount].join("|"));'
  READS_HASH="$(cksum <"$WORK/lib-calls/memory.db")"
  check "the three reads run from the installed package" \
    "$(cd "$HOST" && node --input-type=module -e "$READS_PROBE" "$WORK/lib-calls/memory.db" 2>/dev/null)" "true|0|1|Renamed|other-journey|1"
  check "and left that home's bytes alone" "$(cksum <"$WORK/lib-calls/memory.db")" "$READS_HASH"
fi
# CV24.DS4: a host creates a home from the installed package, then records a
# Conversation in it. The machine-wide config must be exactly what it was.
CONFIG_BEFORE="$(cksum <"$HOME/.config/mirror/env")"
mkdir -p "$WORK/lib-created"
CREATE_PROBE='const d = await import("mirror-mind/desktop");
const home = d.createHome({ homePath: process.argv[1], userName: "hostuser" });
const state = d.inspectMigrationState(home.dbPath).state;
const c = d.ensureConversation(home.dbPath, { sessionId: "s", journeyId: "j", title: "First", interface: "smoke" });
let again = "no";
try { d.createHome({ homePath: process.argv[1], userName: "hostuser" }); } catch (e) { again = e instanceof d.CreateHomeRejectedError ? e.reason : "wrong"; }
console.log([state, home.seeded.created >= 20, typeof c.conversationId, again].join("|"));'
check "createHome makes a current, seeded home from the installed package, and refuses to make it twice" \
  "$(cd "$HOST" && node --input-type=module -e "$CREATE_PROBE" "$WORK/lib-created/hostuser" 2>/dev/null)" "current|true|string|home_exists"
check "and left the machine-wide config alone" "$(cksum <"$HOME/.config/mirror/env")" "$CONFIG_BEFORE"
check "and left nothing beside the home" "$(ls -A "$WORK/lib-created")" "hostuser"
# CV24.DS5: a home at 016 is reported, migrated on request, then used.
if [ -n "$REAL_SQLITE" ]; then
  mkdir -p "$WORK/lib-migrate"
  cp "$WORK/lib-016/memory.db" "$WORK/lib-migrate/memory.db"
  MIGRATE_PROBE='const d = await import("mirror-mind/desktop");
const db = process.argv[1];
const shown = d.inspectMigrationState(db);
const r = d.migrateHome(db, { expectedPending: shown.pending });
const c = d.ensureConversation(db, { sessionId: "m", journeyId: "j", title: "After", interface: "smoke" });
let again = "no";
try { d.migrateHome(db, { expectedPending: shown.pending }); } catch (e) { again = e instanceof d.MigrateHomeRejectedError ? e.reason : "wrong"; }
console.log([shown.state, r.appliedIds.join(","), r.after.state, r.backup.sha256.length, typeof c.conversationId, again].join("|"));'
  check "migrateHome migrates a home at 016 on request from the installed package, then refuses a second time" \
    "$(cd "$HOST" && node --input-type=module -e "$MIGRATE_PROBE" "$WORK/lib-migrate/memory.db" 2>/dev/null)" "pending|017_journey_parent_column,018_drop_hook_injected|current|64|string|nothing_pending"
  check "and its backup reads as the 016 home it was" \
    "$(sqlite3 "$(ls "$WORK"/lib-migrate/backups/pre-migration-016_*.db)" "SELECT count(*) FROM _migrations WHERE id LIKE '017%' OR id LIKE '018%'")" "0"
fi

# --- the runtimes, against the installed package ------------------------------
# Each hook resolves the home from the config file `init` wrote (MIRROR_USER=
# smokeuser): the environment carries no Mirror variable, and the package has
# no .env to read. Every row below lands in smokeuser's memory.db.
SMOKE_DB="$HOME/.mirror-minds/smokeuser/memory.db"
HOOKS_LOG="$HOME/.mirror-minds/smokeuser/hooks.log"
rows() { [ -n "$REAL_SQLITE" ] && sqlite3 "$SMOKE_DB" "$1" || echo "n/a"; }

say "8. the Claude plugin, copied out of the package, through mirror-hook on the PATH"
CLAUDE_PLUGIN="$WORK/claude-cache/plugins/mirror-mind"
mkdir -p "$(dirname "$CLAUDE_PLUGIN")" && cp -R "$PKG/plugins/mirror-mind" "$CLAUDE_PLUGIN"
check "command -v mirror-hook" "$(command -v mirror-hook)" "$WORK/prefix/bin/mirror-hook"
bash "$CLAUDE_PLUGIN/hooks/session-start.sh" </dev/null >"$WORK/claude-start.out" 2>"$WORK/claude.err" && ok "plugin session-start exited 0" || bad "plugin session-start failed"
printf '{"session_id":"npm-claude","prompt":"Hello from the installed plugin"}' \
  | bash "$CLAUDE_PLUGIN/hooks/log-user-prompt.sh" >/dev/null 2>>"$WORK/claude.err" && ok "plugin log-user-prompt exited 0" || bad "plugin log-user-prompt failed"
printf '{"session_id":"npm-claude","prompt":"anything"}' \
  | bash "$CLAUDE_PLUGIN/hooks/mirror-inject.sh" >"$WORK/claude-inject.out" 2>>"$WORK/claude.err" && ok "plugin mirror-inject exited 0" || bad "plugin mirror-inject failed"
printf '{"session_id":"npm-claude","transcript_path":"%s"}' "$WORK/none.jsonl" \
  | bash "$CLAUDE_PLUGIN/hooks/log-session-end.sh" >/dev/null 2>>"$WORK/claude.err" && ok "plugin log-session-end exited 0" || bad "plugin log-session-end failed"
check "the plugin's hooks wrote nothing to stderr" "$(wc -c <"$WORK/claude.err" | tr -d ' ')" "0"
# D13: the session opened in a project that is not this tree, so SessionStart
# hands Claude Code the Operating Instructions from the installed package.
contains "plugin session-start delivers the Operating Instructions as context (D13)" "$(cat "$WORK/claude-start.out")" '"hookEventName":"SessionStart","additionalContext":"'
contains "and they are the package's AGENTS.md" "$(cat "$WORK/claude-start.out")" "$(head -1 "$PKG/AGENTS.md")"
[ -n "$REAL_SQLITE" ] && check "the user turn reached smokeuser's database as claude_code" \
  "$(rows "SELECT c.interface || '|' || m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.content = 'Hello from the installed plugin'")" \
  "claude_code|Hello from the installed plugin"

# Gemini CLI has no step either: its wrappers ran here from under `npm root -g`
# until CV21.DS8.US1 retired the integration (Antigravity, step 8's plugin
# with its agy layer, is the successor).
# Codex has no step of its own: it installs the plugin from the package as a
# marketplace (checked above) and runs the same Claude-family hooks step 8
# exercises. The v0.32.1 wrapper this smoke used to run around a stand-in
# codex was retired by CV21.DS4.TS5.

say "9. the MCP server, through the plugin's manifest entry and through mirror mcp"
MCP_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"npm-smoke","version":"0"}}}'
LAUNCH_REPLY="$(printf '%s\n' "$MCP_INIT" | node --no-warnings "$ROOT_DIR/ts/smoke/mcp_entry.ts" "$CLAUDE_PLUGIN" 2>"$WORK/mcp-launch.err" | head -1)"
contains "the installed plugin's manifest entry started the server" "$LAUNCH_REPLY" '"name": "mirror-mind"'
check "the entry's server wrote nothing to stderr" "$(wc -c <"$WORK/mcp-launch.err" | tr -d ' ')" "0"
DIRECT_REPLY="$(printf '%s\n' "$MCP_INIT" | mirror mcp 2>"$WORK/mcp-direct.err" | head -1)"
contains "mirror mcp answers initialize" "$DIRECT_REPLY" '"name": "mirror-mind"'
check "mirror mcp wrote nothing to stderr" "$(wc -c <"$WORK/mcp-direct.err" | tr -d ' ')" "0"

say "10. no hook recorded a failure"
if [ -f "$HOOKS_LOG" ]; then bad "hooks.log exists: $(cat "$HOOKS_LOG")"; else ok "no hooks.log in smokeuser's home"; fi

# CR148: a runtime that gives up on a hook closes its pipe. The hook must not
# answer with a stack trace and exit 1 -- the one exit code it promises never
# to return -- but with exit 0 and one line in hooks.log. After step 10 on
# purpose: this is the only failure the smoke records, and it records it
# because the hook did.
say "10b. a hook whose reader closed early exits 0 and leaves one line"
mirror-hook claude:session-start </dev/null 2>"$WORK/hook-pipe.err" | true
check "mirror-hook \| true exits 0" "${PIPESTATUS[0]}" "0"
check "and writes nothing to stderr" "$(wc -c <"$WORK/hook-pipe.err" | tr -d ' ')" "0"
contains "and hooks.log names it" "$(cat "$HOOKS_LOG" 2>/dev/null)" "claude:session-start: stdout closed early"
check "exactly one line" "$(wc -l <"$HOOKS_LOG" 2>/dev/null | tr -d ' ')" "1"

say "11. nothing reached for an interpreter"
if grep -rq "INTERPRETER SPAWNED" "$WORK"/*.err 2>/dev/null; then
  bad "an interpreter was spawned"; grep -rh "INTERPRETER SPAWNED" "$WORK"/*.err
else
  ok "no python, python3, or uv process was spawned"
fi

say "Result"
printf '  passed: %d   failed: %d\n\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
