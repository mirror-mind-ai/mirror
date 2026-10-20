[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR149 — `bind` checks nothing it binds: a missing extension, an undeclared capability, or a persona that does not exist all report `bound`

## Problem

`mirror ext hello bind backend --persona engine` answered
`bound hello/backend -> persona/engine`. There is no persona `engine`; the Navigator
had dropped two letters from `engineer`. `runBind` (`ts/src/extensions/bindings.ts`)
inserts the `_ext_bindings` row with the target as typed and looks nothing up — a
faithful port of Python's `_cmd_bind`, which did the same.

The binding then does nothing, silently: a load for `engineer` finds no binding, a
load for `engine` never happens, and `ext hello bindings` lists the row as if it
were live. The person learns of the typo when the context they expected never
appears, which is the slowest possible feedback for a one-word mistake.

## Expected Behavior

`bind` checks that the target exists before writing the row — a persona in the
personas table, a journey by slug — and refuses with one line naming the target
when it does not: `no persona 'engine'`. `--global` has nothing to check. `unbind`
stays as it is: removing a row that points at nothing is the repair, not the
mistake. `bindings` could flag a row whose target has since disappeared, but that
is a second step and may be its own CR.

## Impact

Low severity, real friction: the mistake is easy, the symptom is far from the
cause, and the fix is one query at the write. Deliberate divergence from the Python
oracle; the oracle is retired and the golden for `bind` pins the success line, not
the absence of a check.

## Plan Or Decision

Captured, unassigned, 2026-10-20, from CR145's validation (the second run, step 11),
at the Navigator's direction. Current Focus unchanged.

Selected as Current Focus 2026-10-20. Measured before planning, in a scratch home:
`bind` checks **nothing** it binds. `mirror ext ghost bind x --persona engineer`
answers `bound ghost/x -> persona/engineer` for an extension that is not installed;
`mirror ext notes bind nonsense --persona engineer` answers `bound` for a capability
the manifest does not declare; and the persona case the CR was captured for. Three
holes of one shape at one write.

Reviewed 2026-10-20 through four lenses — engineering, quality assurance, product,
security — and nine amendments folded in at the Navigator's direction, who also
chose the full three-check scope and the retitle: a check zero on the id grammar;
the validator before the tolerant reader; the checks inside `runBind` as
`runMigrate` holds its own; the golden world enriched and proven green before any
check lands; the edge tests and the dead-row tests; refusals that name the fix; the
route's journey and `--global` cases; one follow-up captured. Plan approved
2026-10-20 → `planned`. Started the same day: Driver @viniciusteles, Delivery `main`
→ `in_progress`. Implemented and committed the same day (`c5a414c4`). Navigator
validation route run by @viniciusteles on 2026-10-20, every step observed as stated
→ `validated`.
Debt reviewed and accepted by the Navigator the same day → `done`.

### Plan (approved 2026-10-20)

**Objective.** `bind` checks what it binds before writing the row, and refuses
with one line when the id is not an extension id, the extension is not installed,
the capability is not declared, or the target does not exist. No row is written on
a refusal.

**Behavior.**

0. *An extension id.* The id against `SKILL_ID_RE` — the manifest's grammar,
   which `install` enforces and CR145's settings reader adopted — refusing in the
   dispatcher's own words: `'<id>' is not a valid extension id`. Before anything
   else, so no path-shaped id (`../x`) ever reaches `_ext_bindings`, from which the
   context runtime later builds a path. `installedExtensionDir` does not normalize
   (Python's bytes), so the existence check alone would let `../x` through when
   `<home>/x/skill.yaml` exists; the grammar is the control.
1. *Installed.* `existsSync(installedExtensionDir(home, id))`, else the family's
   existing refusal, byte-identical to `migrate`'s and the dispatcher's:
   `extension not installed: <path>`, exit 1.
2. *Declared.* First the validator, `loadExtensionManifest`, as `install` runs it:
   an `ExtensionValidationError` is printed as its own message (already the
   user-facing one — `invalid mirror context capability id 'x' in <path>`), exit 1.
   Then the context runtime's reader, exported as
   `readDeclaredCapabilityIds(extensionRoot): string[]`, for the ids. Not among
   them: `extension/<id> declares no capability '<cap>' (declared: context,
   briefing)`, or `(declares none)` for a manifest with no providers — a
   prompt-skill, for one. Two reads of one small file, the two `install` makes.
3. *Exists.* `--persona <id>` must match `identity WHERE layer = 'persona' AND
   key = ?`; `--journey <slug>` likewise with `layer = 'journey'` and nothing else
   (not `journey_path`) — the same rows the context runtime's
   `selectExtensionBindings` is later matched against, so what `bind` accepts is
   what a load can find. Exact match: identity keys are exact, `Engineer` is not
   `engineer`. Otherwise `no persona '<id>' (mirror list personas shows this
   home's)` / `no journey '<slug>' (mirror journeys shows this home's)` — the fix
   in the line, as `missing target: pass --persona <id>, …` already does.
   `--global` has nothing to check. No "did you mean": the declared list and the
   pointer cover it, and a suggestion is the start of a feature.
4. *Channel.* One line on stdout, exit 1, no stderr — the family's other refusals
   are shaped so, and a person reading `bound` on stdout reads the refusal in the
   same place.
5. *Order.* Id, installed, declared, exists — outside in, so a mistyped extension
   id is named before its capability is judged against a manifest that does not
   exist, and the capability before the target, so `--global` on an undeclared
   capability still refuses.
6. *Where.* Inside `runBind(db, home, …)`, as `runMigrate(db, home, …)` holds its
   own installed check: one place to read for "what does bind refuse".
7. *Untouched.* `unbind` (removing a row that points at nothing is the repair);
   `bindings` (flagging rows whose target has since disappeared is a second step,
   its own CR if wanted); CR099's `--global` non-idempotence; the Python-era
   success line `bound <ext>/<cap> -> <kind>/<id>`.
8. *The oracle.* A deliberate divergence from `_cmd_bind`, which checked nothing.
   The bindings golden pins success bytes and the parse refusals, not the absence
   of a check: its world gains what the checks need — a `skill.yaml` for `beta`
   declaring `context` and `briefing`, and identity rows for persona `engineer`
   and journey `mirror-ts-core` — and the golden JSON itself is untouched. **Order
   of work:** enrich the world first, run the golden with no other change, see it
   pass byte for byte; only then land the checks. If a recorded byte changes at
   either step, the plan was wrong and the change stops there.

**Affected files.**

- `ts/src/extensions/bindings.ts` — `runBind` gains `mirrorHome` and the four
  checks; `targetExists(db, kind, id)`.
- `ts/src/extensions/contextRuntime.ts` — exports `readDeclaredCapabilityIds`.
- `ts/src/extensions/catalogCommands.ts` — passes `home` to `runBind`.
- `ts/test/extensions/bindings.test.ts` — the world enriched (manifest, identity
  rows), proven green first; then direct tests, each refusal asserting the line,
  exit 1, and `stateOf(world).bindings` unchanged: an id outside the grammar, not
  installed, an undeclared capability, a validator-rejected manifest, `--persona
  engine`, `--persona Engineer`, `--persona ""`, `--journey nope`, a slug that
  exists only as a `journey_path` row, `--global` on an undeclared capability.
  Successes: `--global` on a declared capability still binds. The dead-row repair:
  a row inserted directly, its persona absent — `bindings` still lists it,
  `unbind` still removes it.
- `ts/test/fixtures/ext-bindings.golden.json` — untouched.
- `docs/product/extensions/binding-model.md` — under *Bindings*: what `bind`
  checks and refuses, and that keys are exact.
- A follow-up captured, not done: `install` marks the `suggested_personas` this
  home does not have.

**Acceptance.**

1. `bind <cap> --persona engine` with no such persona → `no persona 'engine' (…)`,
   exit 1, no row. `--journey nope` likewise.
2. `bind nonsense --persona engineer` → the refusal naming the declared
   capabilities, no row. `--global` on it, the same.
3. `bind` on an extension that is not installed → `extension not installed:
   <path>`, no row. On `../x` → `'../x' is not a valid extension id`, no row.
4. The bindings golden passes unchanged against the enriched world — before the
   checks land and after; every success line byte-identical.
5. `--global` on a declared capability still binds; `bindings` still lists and
   `unbind` still removes a row whose target no longer exists.

**Validation route (Navigator).** Checkout binary by path (`Install: clone`),
scratch home, the `hello` extension from CR145's route (it declares `backend`):

1. `"$M" ext hello bind backend --persona engine; echo "exit=$?"` →
   `no persona 'engine' (mirror list personas shows this home's)`, `exit=1`.
2. `"$M" ext hello bind backend --journey nope; echo "exit=$?"` →
   `no journey 'nope' (mirror journeys shows this home's)`, `exit=1`.
3. `"$M" ext hello bindings` → `no bindings for extension/hello`.
4. `printf 'I am the engineer.\n' | "$M" identity set persona engineer -stdin`,
   then `"$M" ext hello bind backend --persona engineer; echo "exit=$?"` →
   `bound hello/backend -> persona/engineer`, `exit=0`.
5. `"$M" ext hello bind backend --global; echo "exit=$?"` →
   `bound hello/backend -> global`, `exit=0`.
6. `"$M" ext hello bind nonsense --persona engineer; echo "exit=$?"` →
   `extension/hello declares no capability 'nonsense' (declared: backend)`, `exit=1`.
7. `"$M" ext ghost bind x --persona engineer; echo "exit=$?"` →
   `extension not installed: …/extensions/ghost`, `exit=1`.
8. `"$M" ext hello bindings` → exactly two rows: `backend -> global/(global)` and
   `backend -> persona/engineer`.

Pass: every line and exit code as stated, two rows at the end. Fail: any `bound`
for a missing extension, capability, or target, or a third row.

**Exclusions.** `unbind` validation. A `bindings` listing that flags dead rows.
`--global` idempotence (CR099). "Did you mean" suggestions. Marking missing
`suggested_personas` at install (captured separately). The MCP `bind` path, if any
— none exists.

**Authority boundaries.** Approval → `planned`; Driver and Delivery at start; no
commit, push, or release from this document.

## Evidence

The Navigator's transcript, 2026-10-20, against the checkout: the `bound` line above
for a persona that does not exist, followed by a `mirror load --persona engineer`
that rendered no section and no diagnostic. `runBind`, `ts/src/extensions/bindings.ts:57–65`.

### Implementation evidence (2026-10-20, Driver)

**Order of work, as the plan required.** The bindings golden's world was enriched
first — a `skill.yaml` for `beta` declaring `context` and `briefing`, identity rows
for persona `engineer` and journey `mirror-ts-core` — and the golden run with no
other change: 4 of 4, byte for byte. Then the four checks landed in `runBind`: the
golden again 4 of 4, the JSON untouched. Six direct tests followed, ten refusal
cases among them, each asserting the line, exit 1, empty stderr, and
`stateOf(world).bindings` unchanged; `--global` on a declared capability binds; a
dead row inserted directly is listed by `bindings` and removed by `unbind`.

**One guard spoke on the way.** CR104's `shellWord` test refuses a printed command
that interpolates a value raw; the persona refusal had `${PROGRAM}` and the typed
id on one line. The command now stands alone (`${PROGRAM} list personas`) and the
sentence interpolates the result. The guard read the line it exists for.

**Checks.** `npm run typecheck` clean; `biome check .` clean (672 files);
`npm test` 3392 tests, 3389 pass, 0 fail, 3 skipped (pre-existing); doc links
clean.

**Smoke through the real binary**, scratch home, the `hello` extension declaring
`backend`, exactly the Navigator's route plus one step:

1. `bind backend --persona engine` → `no persona 'engine' (mirror list personas
   shows this home's)`, exit 1.
2. `bind backend --journey nope` → `no journey 'nope' (mirror journeys shows this
   home's)`, exit 1.
3. `bindings` → `no bindings for extension/hello`.
4. `identity set persona engineer -stdin`, then `bind backend --persona engineer`
   → `bound hello/backend -> persona/engineer`, exit 0.
5. `bind backend --global` → `bound hello/backend -> global`, exit 0.
6. `bind nonsense --persona engineer` → `extension/hello declares no capability
   'nonsense' (declared: backend)`, exit 1.
7. `ext ghost bind x --persona engineer` → `extension not installed:
   …/extensions/ghost`, exit 1; and `ext ../x bind x --persona engineer` →
   `'../x' is not a valid extension id`, exit 1.
8. `bindings` → two rows, `backend -> global/(global)` and
   `backend -> persona/engineer`.

CR150 captured from the review's product lens.

### Navigator validation (2026-10-20, @viniciusteles)

The route, run once, against the checkout's binary by path (`Install: clone`) in a
scratch home with the `hello` extension declaring `backend`:

1. `--persona engine` → `no persona 'engine' (mirror list personas shows this
   home's)`, `exit=1`.
2. `--journey nope` → `no journey 'nope' (mirror journeys shows this home's)`,
   `exit=1`.
3. `bindings` → `no bindings for extension/hello`.
4. `identity set persona engineer`, then `--persona engineer` → `bound
   hello/backend -> persona/engineer`, `exit=0`.
5. `--global` → `bound hello/backend -> global`, `exit=0`.
6. `bind nonsense` → `extension/hello declares no capability 'nonsense'
   (declared: backend)`, `exit=1`.
7. `ext ghost bind` → `extension not installed: /tmp/cr149.jSH1/cr149/extensions/ghost`,
   `exit=1`; `ext ../x bind` → `'../x' is not a valid extension id`, `exit=1`.
8. `bindings` → `backend -> global/(global)`, `backend -> persona/engineer`, and
   nothing else.

Accepted: ten of ten, no stderr text anywhere.

### Debt review (2026-10-20)

**Proportionality.** Five source and test files, one doc, one capture. The
`runBind` port grew four checks and a helper; nothing else moved. The golden's JSON
is byte-identical; its world gained a manifest and two identity rows. Proportionate.

**Debt left on purpose, captured:**

- [CR150](cr150-install-prints-suggested-personas-this-home-does-not-have.md) —
  `install` shows `suggested_personas` the home does not have.
- CR099's `--global` non-idempotence, untouched by design and already captured.

**Recorded, not owed:** `bindings` still lists a row whose target has since
disappeared, and `unbind` still removes it — the repair path, kept on purpose. A
listing that *flags* such rows would be a small CR if the Navigator wants one; it
was offered in the plan and not asked for.

**Small debt in the change itself:** `bind` now reads `skill.yaml` twice — the
validator, then the context reader — the pair `install` already makes. One reader
that both validates and yields the ids would be better; it would mean giving
`ExtensionManifest` a `capabilities` field the validator currently checks but does
not expose, which is a manifest-shape change beyond this CR.

**Nothing found during validation.** Both oracle-divergence risks the plan named —
a recorded byte changing at either step — did not occur.

## Outcome

Done 2026-10-20. Shipped on `main` in `c5a414c4` (the checks, the tests, the doc,
CR150's capture) and `2d4f369f` (the validation record). A deliberate divergence
from the Python oracle, recorded; nothing owed beyond CR150.

**Found after Done, 2026-10-20:** CI's extension catalog smoke
(`ts/smoke/extension_catalog_smoke.ts`), which is not part of `npm test`, ran
`bind greeting --persona engineer` against a fixture that declares no `greeting`
and a home with no `engineer` — the fiction this CR refuses — and went red on the
`CR149 done` push. The debt review should have listed the CI smokes; it listed only
the goldens. Fixed in the v0.36.0 re-cut: the smoke seeds the persona and declares
the capability in its own copy of the fixture, and the sequence it grades is now
one a user could run.
