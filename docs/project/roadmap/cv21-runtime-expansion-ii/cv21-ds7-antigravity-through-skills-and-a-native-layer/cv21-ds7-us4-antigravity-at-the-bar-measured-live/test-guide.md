[< Story](index.md)

# Test Guide — CV21.DS7.US4

## Automated Validation (pre-walk)

Proof the shipped TS1–TS3 mechanisms are intact before the live walk, so a
red bar line is the session's finding and not drift:

- `node --test` — the full suite green.
- `npx biome check .` — clean.
- `bash scripts/generate_hook_wrappers.sh --check` — the agy wrappers in sync.
- `node ts/scripts/buildClaudePlugin.ts` — the plugin, marketplace, and
  layer in sync.

## E2E Decision

The live walk is the E2E: the whole story is one live measurement on the
installed agy (1.4.2, `route.sh verify` pins it), Mirror from the shipped
package, the Navigator's real key. CI has no agy.

## Navigator Validation

One session, `bash route.sh live`, at least three Mirror-active turns, each
bar item carrying a **PASS / PASS-WITH-NOTE / FAIL** verdict with its capture
method, recorded with version, binary, and date:

1. **skills** — the 25 `mm` skills reachable; a skill invocation answers.
   Capture: the staged tree listing plus the invocation's answer.
2. **instructions** — the Operating Instructions at session start. Capture:
   the staged-only rules marker quoted by the model (TS2's method).
3. **injection** — Mirror Mode context injected once per user turn. Capture:
   the count of `EPHEMERAL_MESSAGE`/`SYSTEM_SDK` steps across turns and the
   `invocationNum` reset seen at least twice (not inferred from one turn).
4. **logging + close** — the turns logged as `antigravity`, paired, the
   conversation closed by the returning-session stale-orphan path. Capture:
   the scratch Mirror DB row counts/labels and the closed state.
5. **install** — one documented step, within Gemini CLI's two.
6. **MCP (recorded, not gated)** — whether agy reaches the plugin's MCP
   server and lists its tools.

**Negative probes (falsifiable, must hold live):** a turn with Mirror Mode
OFF injects nothing; a `/mirror-mind:mm:*` turn is not logged as conversation.

**Carried for DS8:** the close-timing delta — Gemini CLI closed at session
end; Antigravity closes ~30 min later by the stale-orphan path; memories
still extract.

**Environment recorded as data:** agy version, binary path, UTC time, account
tier, model, interactive-or-`--print`, scratch-HOME-clean.

Pass: all five bar items PASS (notes allowed) on the installed agy, the
negative probes hold, recorded with version/binary/date; Navigator accepted.
Fail: a bar item FAIL for a Mirror reason not accepted as agy's limit or not
fixed under a named scope change.

Evidence is sanitized and the workdir destroyed on exit: observations,
readings, and counts — never conversation content; the scratch credential
verified absent at route end.

## Validation Evidence

Pending the live walk.
