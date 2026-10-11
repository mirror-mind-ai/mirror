[< Story](index.md)

# Test Guide — CV22.DS7.US7 — Explorer Mode

Two audiences. The automated section is what CI runs and what a resuming session
replays. The Navigator section is the route a human runs before the gate flips,
because a lived mode's regressions are only visible in a lived session.

---

## Automated (CI, and reproducible locally)

```bash
# 1. The three golden corpora, regenerated from Python and byte-compared.
uv run python ts/parity/generate_explorer_surface_golden.py
uv run python ts/parity/generate_explorer_story_golden.py
uv run python ts/parity/generate_explorer_handoff_golden.py
git diff --exit-code ts/test/goldens/

# 2. The TS suite (surfaces, story state, handoff, redaction, routing, seam).
cd ts && npm run typecheck && npx biome check . && npm test && cd ..

# 3. The Python side, including the new journey-projection refresh entry point.
uv run python -m pytest tests/unit/ tests/integration/ -m "not live" -q

# 4. Write parity on a real-database copy — the story's dual store, and the
#    handoff's FILESYSTEM state on a scratch project.
uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db \
  --probe explorer_story --work-dir tmp/parity/write-explorer_story
uv run python ts/parity/write_parity.py --source-db tmp/parity/demo-memory.db \
  --probe explorer_handoff --work-dir tmp/parity/write-explorer_handoff

# 5. The whole exploration through the front door on a disposable home.
NODE_OPTIONS=--no-warnings node ts/parity/conversation_lifecycle_smoke.ts

# 6. The oracle-drift tripwire.
uv run python scripts/check_oracle_drift.py
```

If `uv run pytest` reports `ModuleNotFoundError: memory`, it resolved a global
interpreter's pytest. Use `uv sync --extra dev` then `uv run python -m pytest`.

---

## Navigator route (real home, before the flip)

**Why by hand.** The smoke proves the sequence on a disposable home. What it
cannot prove is that a real exploration, with a real journey and real story
text, renders the way it did yesterday.

**Shell note.** Every command below is plain POSIX and works in `zsh` and
`bash`. This matters: US6's first validation sheet used a `read -ra` loop, which
is bash-only, and under `zsh` it silently compared two identical *failures* and
printed five passes while measuring nothing. Copy the commands as written and
read the output rather than trusting an exit code.

Set once:

```sh
CLI="ts/src/frontDoor/cli.ts"
J="<a-real-journey-slug>"     # one you can look at afterwards
export NODE_OPTIONS=--no-warnings
```

### 1. Read-only surfaces, both engines

Explorer's read surfaces do not write, so these are safe on the real home.

```sh
for action in show list snapshot; do
  MIRROR_TS_EXPLORE=1 node --env-file=.env "$CLI" explore story "$action" "$J" > /tmp/ts-$action.txt 2>&1
  MIRROR_TS_EXPLORE=0 node --env-file=.env "$CLI" explore story "$action" "$J" > /tmp/py-$action.txt 2>&1
  if diff -q /tmp/ts-$action.txt /tmp/py-$action.txt > /dev/null; then
    echo "PASS  explore story $action: identical"
  else
    echo "FAIL  explore story $action"
    diff /tmp/ts-$action.txt /tmp/py-$action.txt
  fi
done
```

**Expected:** three `PASS` lines. **Fail:** any diff at all — these are
`transport=verbatim` cards, so a one-space change is a failure.

Confirm the comparison actually ran something: `cat /tmp/ts-show.txt` should
show a real surface, not an error. Two identical errors also diff clean.

### 2. The revert control

```sh
MIRROR_TS_EXPLORE=0 node --env-file=.env "$CLI" explore story list "$J" | head -3
tail -2 "$MIRROR_HOME/front-door.log"
```

**Expected:** the same card, and `explore` on `python` in the log.

### 3. `story promote` stays on Python

```sh
MIRROR_TS_EXPLORE=1 node --env-file=.env "$CLI" explore story promote "$J" 2>&1 | head -5
tail -1 "$MIRROR_HOME/front-door.log"
```

**Expected:** Python's normal behavior (it will enter Builder for that journey,
so use a journey where that is harmless — or skip this step and read the routing
test instead), and `explore` on `python` in the log. **Fail:** the log says `ts`.

### 4. The handoff — on a copy, never the real project

`story handoff` writes five documents into the journey's project directory.
Prove it on a scratch project first.

```sh
mkdir -p /tmp/explore-check/proj
cp "$MIRROR_HOME/memory.db" /tmp/explore-check/copy.db
```

Then point a disposable journey at `/tmp/explore-check/proj`, run the handoff
against the copy, and read the generated `full-conversation.md`.

**Expected:** five documents, and no unredacted path, key, or email address in
the transcript. **Fail:** any real secret in the output.

A handoff against a real project directory happens only after you have seen this
diff and asked for it explicitly.

### 5. A live Pi Explorer session (after the flip)

`/mm-explore <journey>`, thicken the story, surface an attractor, deactivate.

**Expected:** the exploration feels unchanged, and `front-door.log` shows
`explore` on `ts` with no `fell_back` marker.

```sh
grep explore "$MIRROR_HOME/front-door.log" | tail -10
```

### 6. The projection actually refreshed

This is the check the automated suite cannot make on your real project.

```sh
ls -la "<your-project>/.mirror/projections/ariad/operational.json"
```

**Expected:** the modification time moved when you thickened the story.
**Fail:** an unchanged timestamp — the delegated refresh is best-effort and
silent, so a broken seam looks exactly like a working one from the command's
output.

---

## Pass condition

Steps 1–4 clean on the real home and on copies; step 5 unchanged with `explore
ts` in the log; step 6 shows a moved timestamp.

## Fail condition

Any surface difference, any write divergence, any `fell_back` marker, any
unredacted secret, or a projection that did not move.
