[< RS004](index.md) · [Canonical status](../index.md#change-requests)

# CR104 — Journey slugs are not validated, and command hints print them raw

## Problem

### As captured (2026-09-26)

A journey slug is an identity key, and nothing constrains it.
`identity set journey 'x;touch PWNED'` creates a journey, and `journey set-path`,
`build adopt`, `build sync-cursor`, and `build pull-candidates` all accept it. This
was reproduced in an isolated home during CR002's handoff review on 2026-09-26.

The front door prints the slug unquoted inside commands it tells the reader to run:

- `ts/src/builder/methodInspection.ts:188`: `mirror build adopt --journey <slug> --method ariad`
- `ts/src/builder/commands.ts:256`: `Run: mirror build adopt --journey <slug> --method ariad`
- `ts/src/builder/commands.ts:570`: `Run: mirror build sync-cursor --journey <slug> --method ariad`
- `ts/src/builder/load.ts:304`: `Run: mirror journey set-path <slug> /path/to/project`

A reader or agent that follows one of these hints runs whatever the slug smuggles
in. CR002's `pull explicitly:` command had the same hole. It has quoted the slug
since CR002's handoff review; these four predate it.

### As characterized (2026-09-27)

Reproduced on `63dd2a73` in a scratch home with the
[validation route](#validation-route), in bash and zsh alike. Its output is under
[Evidence](#the-route-before-the-change). By the Navigator's decision this document
now carries persona ids as well ([decision P](#decision-p-persona-ids)).

**Nothing checks a key where one is created.** `identity set journey` accepted
`x;touch PWNED`, `$(touch PWNED)`, `-x`, `a b`, and `Mixed_Case`. `identity edit`
opened the editor for `Bad Slug` and created it. `seed` created `y;touch PWNED` from
a journey file's `journey_id`. Every creation passes through one place:
`upsertIdentity` (`ts/src/identity/identityStore.ts`) holds the only
`INSERT INTO identity` in `ts/src`, and `identity set`, `identity edit`, `seed`, and
the exported `createJourney` all reach it.

**The four hints print the slug raw, and following one runs it.** The hints for
`x;touch PWNED` were run as printed, with `mirror` defined as a function that does
nothing. They created three files: `PWNED`, and `--method` and `ariad`, which BSD
`touch` took for file names. CR002's `pull explicitly:` command and CR067's
`build show` command quote the slug through `shellWord`, which is private to
`scopePhrases.ts`. The sync-cursor hint captured at `commands.ts:570` now sits at
line 615.

**The product had a grammar once.** From 2026-06-02 (`adf921f5`), Python's
`JourneyService.create_journey` refused any slug outside
`[a-z0-9][a-z0-9-]{1,78}[a-z0-9]`. Only the web console and the projections probe
called it. `identity set` and `seed` never went through it, and the TypeScript port
took `create_journey`'s write without its check. When DS10 retired the console, the
grammar went with it.

**Persona ids are open the same way, with a stranger at the first step.** `seed`
takes a persona's key from the file's `persona_id`, and `ext-persona-export` exists
to write seed-compatible persona bundles for someone else's mirror. A persona file
with `persona_id: "p;touch PWNED"` was seeded, and `detect-persona` routed to it by
keyword, printing `p;touch PWNED score=1 match=keyword`. That id is what an agent
then puts into `mirror load --persona`.

**The real keys already fit a kebab-case grammar.** Read-only, on the key column
alone: the production home holds 31 journeys and 25 personas, and the dev home 21
and 24. Every one is lowercase letters, digits, and single hyphens, 3 to 20
characters long. Every template persona and journey fits too.

**Three more hints name a program that no longer exists.** `seed`'s skip line tells
the user to run `memory identity edit <layer> <key>`, with the key unquoted inside
single quotes. `memory` is the Python program TS5 deleted. TS5's decision D12 moved
every usage line and hint to `PROGRAM`, and missed these three
([decision D](#decision-d-seeds-skip-hints)).

## Expected Behavior

A journey slug is validated where it is created, against one grammar that a shell
carries as a plain word, such as lowercase letters, digits, and hyphens. Existing
journeys outside that grammar are reported, not silently rewritten. Independently of
validation, every command hint quotes the slug it interpolates, through one shared
helper. The helper exists today but is private to `ts/src/builder/scopePhrases.ts`.

## Impact

The slug travels from a database key into a shell. Agents run the commands that
create journeys, so the path from injected text to a command on the Navigator's
machine can be two steps long: a crafted slug, then a hint that prints it.

## Plan Or Decision

Pending. Captured on the Navigator's decision during CR002's handoff review. Decide
the grammar, and what happens to existing slugs outside it: report them, rename
them, or refuse to operate on them.

**2026-09-27: added to the Ariad trust floor** by the Navigator's decision after the Workbench inspection that followed the Ariad trust floor ([amendment](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3)). It is the one security-class item the inspection found: agents follow hints, so a crafted slug is two steps away from a shell command. The plan still has to decide the grammar and what happens to existing slugs outside it.

**Planned and assigned 2026-09-27.** Quality assurance drafted the plan, and the
technical panel reviewed it the same day ([record below](#panel-review-2026-09-27)).
The panel's changes are folded in. Navigator decisions, 2026-09-27:
[G1](#decision-g-the-grammar), [E1](#decision-e-keys-already-outside-the-grammar),
[P1](#decision-p-persona-ids), and [D1](#decision-d-seeds-skip-hints). P1 and D1 are
recorded as an amendment to the
[floor decision](../../decisions.md#the-cv22-release-is-gated-on-an-ariad-trust-floor-worked-before-us3).
Plan approved, with Driver `@viniciusteles` and Delivery `mirror-ts-core`.

### Objective

A new journey slug or persona id is one plain shell word, checked at the one place
every creation passes through. Every hint that prints one inside a command quotes it
through one shared helper. A key created before the grammar keeps working everywhere,
is reported by `runtime diagnose`, and is never rewritten.

### Design

1. **One grammar.** `isKebabSlug` in `ts/src/util/slug.ts`, beside `kebabSlug`, holds
   the rule: lowercase ASCII letters and digits in runs joined by single hyphens, at
   most 80 characters. Those are exactly the non-empty strings `kebabSlug` returns
   unchanged. It is also the rule `contextRuntime.ts` and `manifest.ts` already apply
   to extension and skill ids ([decision G](#decision-g-the-grammar)).
2. **One rule for identity keys.** `ts/src/identity/identityKey.ts` names the layers
   whose keys agents put into commands, `journey` and `persona`, and writes the
   refusal (panel: engineer). The refusal leads with the consequence and ends with a
   key that would work (panel: prompt-engineer):

   ```text
   Error: no journey was created: 'My Trip' is not a journey slug. Use lowercase letters, digits, and single hyphens, up to 80 characters, for example 'my-trip'.
   ```

   The rejected key is printed escaped (`pyRepr`), so a newline or a terminal escape
   inside it cannot forge output. The suggestion is `kebabSlug` of the key, left out
   when that is empty. Nothing is normalized silently: a key stored differently from
   how it was typed would miss the next command that uses the typed one.
3. **Refused where it is created.** `upsertIdentity`'s INSERT branch refuses a guarded
   key that breaks the grammar. That covers `identity set`, `identity edit`, `seed`,
   `createJourney`, and any writer added later. The UPDATE branch is untouched, so a
   key that predates the grammar stays writable
   ([decision E](#decision-e-keys-already-outside-the-grammar)). `identity set` and
   `identity edit` also check before they open the database for writing, through the
   same function (panel: devops-engineer). A refused create then costs no pre-write
   snapshot, and `identity edit` never opens the editor for a key it would refuse.
   Only a key that breaks the grammar costs that read, because only then does it
   matter whether the row already exists. Both commands print one `Error:` line and
   exit 1, with no stack trace. `seed` reports the refusal as its per-file `✗` line and
   seeds the rest.
4. **Every hint quotes through one helper.** `shellWord` moves from `scopePhrases.ts`
   to `ts/src/util/shellWord.ts`. It serves the four hints, `scopePhrases.ts`'s two,
   and `seed`'s three ([decision D](#decision-d-seeds-skip-hints)). A plain slug prints
   byte for byte as today.
5. **Keys outside the grammar are reported.** `runtime diagnose` adds
   `identity_key_outside_grammar` (attention), one finding per key. Its subject is the
   layer and its detail the escaped key. The recommendation names what quoting does
   not cover: an agent may put the key into a command it writes itself (panel:
   ai-engineer). The remedy it names is the only one that exists, recreating the
   journey or persona under a kebab-case key (panel: product-designer). Diagnose
   stays read-only.
6. **A guard for the next hint.** A test reads `ts/src` and fails when a line that
   prints a `${PROGRAM}` command interpolates a journey, slug, or persona value
   without `shellWord`.
7. **Docs.** One sentence in `mm-identity`, which is how an agent creates a journey or
   a persona, so it picks a valid key the first time. It goes in the Pi and Claude
   Code copies, and the plugin is regenerated. REFERENCE.md covers `identity set`,
   `identity edit`, `seed`, and the diagnose finding. A decision entry is written at
   close.

### Decision G: the grammar

- **G1. Kebab-case, 1 to 80 characters (chosen).** `^[a-z0-9]+(-[a-z0-9]+)*$`. Every
  real key fits, and so do the test fixtures' `j`, `s`, and `a`. A leading hyphen is
  refused, so a key can never read as an option.
- **G2. Python's former rule, verbatim.** `[a-z0-9][a-z0-9-]{1,78}[a-z0-9]`, 3 to 80
  characters, doubled hyphens allowed. Its minimum refuses `ai`, and short slugs
  appear in 8 test files.
- **G3. What `shellWord` prints unquoted.** `[A-Za-z0-9._-]+` keeps case and
  underscores, but admits a leading `-`, `..`, and two keys that differ only in case.

### Decision E: keys already outside the grammar

- **E1. Report them (chosen).** Every command keeps accepting them, every hint quotes
  them, and `runtime diagnose` lists each one. No such key exists in either of the
  Navigator's databases.
- **E2. Rename them by migration.** A journey slug is a natural key copied, with no
  foreign key, into fourteen columns across thirteen tables, two of them
  extension-owned. That is the largest write this CR could make, for rows nobody has,
  and the CR rules out a silent rewrite.
- **E3. Refuse to operate on them.** It would lock a user out of their own journey,
  and no command renames or removes one.

### Decision P: persona ids

- **P1. Persona ids join CR104 (chosen).** One more layer in the same guard. The floor
  rule says to capture what working the floor finds. The Navigator decided otherwise,
  as for CR018's Expand fix, because this is the floor's own class: the security class
  that put CR104 on the floor. Fixing the local journey case would otherwise ship the
  cross-user persona case.
- **P2. Capture them as a new CR outside the floor.**

### Decision D: seed's skip hints

- **D1. Fix the program name on the lines CR104 changes anyway (chosen).** The three
  skip hints name `PROGRAM`, quote their key through the helper, and read
  `(skipped — to update, run: mirror identity edit journey demo)`.
- **D2. Quote only,** and capture the stale program name as its own CR.

### Affected files

- `ts/src/util/slug.ts`: `isKebabSlug`.
- `ts/src/util/shellWord.ts`: new, `shellWord` moved from `ts/src/builder/scopePhrases.ts`.
- `ts/src/identity/identityKey.ts`: new. It holds the guarded layers, the refusal, and
  `InvalidIdentityKeyError`.
- `ts/src/identity/identityStore.ts`: the INSERT branch refuses.
- `ts/src/frontDoor/cli.ts`: `identity set` and `identity edit` check before the
  write seam opens.
- `ts/src/seed/seed.ts`: the skip hints.
- `ts/src/builder/methodInspection.ts`, `commands.ts`, `load.ts`, and
  `scopePhrases.ts`: the helper.
- `ts/src/runtime/diagnose.ts` and `ts/src/frontDoor/runtimeRoute.ts`: the finding.
- Tests:
  - unit tests for `isKebabSlug`, including its agreement with `kebabSlug`;
  - unit tests for `shellWord`, including a round trip through `sh` for hostile
    values;
  - unit tests for `identityKey`, and for the store;
  - the `identity set` and `identity edit` routes, `seed`, and `createJourney`;
  - each hint, with a hostile slug;
  - the diagnose finding;
  - the source guard, proven by a mutant.
- Golden: `builder-method`'s `journey_empty` surface, whose hint reads
  `--journey  --method ariad` and becomes `--journey '' --method ariad`. The edit is
  made by a script with an asserted count, and gets a README row.
- Docs: `mm-identity` (the `.pi` and `.claude` copies, with the plugin regenerated),
  REFERENCE.md, and `decisions.md`.

### Plateaus

One reason per golden diff.

1. **Every hint quotes.** Red first: each of the four hints with `x;touch PWNED`. The
   helper moves, the four hints and seed's three use it, the source guard lands, and
   the one golden is edited. This goes first because it protects every key, including
   the ones that predate the grammar, and depends on no decision.
2. **The grammar where keys are created.** Red first: route steps 1 to 3 as tests.
   Then `isKebabSlug`, `identityKey.ts`, the store, the two early checks, `seed`'s
   refusal, and `createJourney`.
3. **The report.** Red first: a database holding a key outside the grammar, and
   diagnose silent about it.
4. **Close.** The route's output after the change, Navigator validation, the handoff
   review, Debt Review, and Done.

### Acceptance criteria

1. `identity set journey` refuses `x;touch PWNED`, `$(touch PWNED)`, `-x`, `a b`,
   and `Mixed_Case`. Each gets one `Error:` line that
   leads with "no journey was created" and suggests a key where one exists, and exits
   1. No row is written and no stack trace printed. `ai` and `mixed-case` are created.
   `identity set persona` behaves the same way.
2. A refused `identity set` or `identity edit` writes no pre-write snapshot, and
   `identity edit` refuses before the editor starts.
3. `seed` refuses a journey file or a persona file whose key breaks the grammar with
   its `✗` line naming the file, seeds every other file, and exits 1.
4. `createJourney` throws `InvalidIdentityKeyError` and leaves no row.
5. A key that predates the grammar keeps working. `identity set` and `identity edit`
   update it, and `journey set-path`, `build adopt`, `build load`, and every other
   command accept it as today.
6. Each hint prints a slug as one shell word: a plain slug byte-identical to today, any
   other single-quoted. Run as printed with `mirror` stubbed out, the hints for
   `x;touch PWNED` create no file.
7. `runtime diagnose` reports each key outside the grammar once, with its layer and
   the key escaped, and reports nothing for a database without one. The Navigator's
   dev home is not reported.
8. The source guard fails when one hint loses the helper.
9. `npm test`, `npm run typecheck`, `npm run lint`, the repository checks, the smokes,
   and CI are green, and the golden edit has its README row.

### Validation route

Part A runs in a scratch home, CLI only, with no Pi session (CR106). Its output before
the change is recorded under [Evidence](#the-route-before-the-change). Run it from the
repository root as a script, with `bash <file>`, so that no interactive alias applies.
It needs `sqlite3`, which step 4 uses to plant a journey that predates the grammar.
It deletes its temporary directory:

```bash
V=$(mktemp -d) && mkdir -p "$V/home/identity/journeys" "$V/home/identity/personas" "$V/p" "$V/shell" && export MIRROR_HOME="$V/home" MIRROR_USER= NODE_OPTIONS=--no-warnings
cr104() { node ts/src/frontDoor/cli.ts "$@"; }
git -C "$V/p" init -q
echo '--- step 1: identity set, for slugs a shell would split and for two it would not'
for s in 'x;touch PWNED' '$(touch PWNED)' '-x' 'a b' 'Mixed_Case' 'ai' 'mixed-case'; do
  printf '# j\n' | cr104 identity set journey "$s" 2>&1; echo "  exit $?"
done
echo '--- step 2: identity edit, for a new journey outside the grammar'
printf '#!/bin/sh\ntouch "%s/editor-ran"\nprintf "# j\\n" > "$1"\n' "$V" > "$V/editor" && chmod +x "$V/editor"
EDITOR="$V/editor" cr104 identity edit journey 'Bad Slug' 2>&1; echo "  exit $?"
if [ -e "$V/editor-ran" ]; then echo '  the editor ran'; else echo '  the editor did not run'; fi
echo '--- step 3: seed, for a journey file and a shared persona file whose ids are outside the grammar'
printf 'journey_id: "y;touch PWNED"\nname: Y\ndescription: A journey file.\n' > "$V/home/identity/journeys/y.yaml"
printf 'persona_id: "p;touch PWNED"\nsystem_prompt: A shared persona.\nrouting_keywords: [zanzibar]\n' > "$V/home/identity/personas/p.yaml"
cr104 seed 2>&1 | grep "journey/\|persona/"
cr104 detect-persona 'zanzibar' 2>&1 | head -3
echo '--- step 4: a journey that predates the grammar still works, and every hint quotes it'
J='x;touch PWNED'
sqlite3 "$V/home/memory.db" "INSERT OR IGNORE INTO identity (id, layer, key, content, version, created_at, updated_at) VALUES ('cr104-legacy', 'journey', 'x;touch PWNED', '# legacy', '1.0.0', '2026-01-01', '2026-01-01');"
H1=$(cr104 build inspect-method --journey "$J" | grep -A1 'next action' | tail -1)
H2=$(cr104 build pull-candidates --journey "$J" --method ariad 2>&1 | sed -n 's/.*Run: //p')
H3=$(cr104 build load "$J" 2>/dev/null | sed -n 's/.*Run: \(.*\)]$/\1/p')
cr104 journey set-path "$J" "$V/p" > /dev/null 2>&1; echo "  set-path exit $?"
cr104 build adopt --journey "$J" --method ariad > /dev/null; echo "  adopt exit $?"
H4=$(cr104 build pull-item --journey "$J" --method ariad --item-code CV1 --item-title t --item-level delivery_story --why-now w 2>&1 | sed -n 's/.*Run: //p')
printf '  %s\n' "$H1" "$H2" "$H3" "$H4"
echo '--- step 5: the four hints, run as printed, with mirror stubbed out'
(cd "$V/shell" && mirror() { :; } && for h in "$H1" "$H2" "$H3" "$H4"; do eval "$h" 2>/dev/null; done; echo "  files created: [$(command ls -A | paste -sd " " -)]")
echo '--- step 6: runtime diagnose'
cr104 runtime diagnose 2>&1 | grep -A3 outside_grammar
unset MIRROR_HOME MIRROR_USER; rm -rf "$V"
```

Pass for Part A:

- Step 1: the first five each print one `Error: no journey was created: …` line, then
  `exit 1`. `ai` and `mixed-case` print `✓ journey/… created`, then `exit 0`.
- Step 2: one `Error: no journey was created: 'Bad Slug' …` line, `exit 1`, and
  `the editor did not run`.
- Step 3: `✗ persona/p: no persona was created: …` and
  `✗ journey/y: no journey was created: …`, and `detect-persona` routes nothing to
  `p;touch PWNED`.
- Step 4: `set-path exit 0` and `adopt exit 0`, then four hints that each carry
  `'x;touch PWNED'` in single quotes.
- Step 5: `files created: []`.
- Step 6: one `[attention] identity_key_outside_grammar: 'x;touch PWNED'` finding
  whose subject is `journey`.

Part B runs `runtime diagnose` on the home `.env` names, read-only, and counts the
new finding:

```bash
NODE_OPTIONS=--no-warnings node --env-file=.env ts/src/frontDoor/cli.ts runtime diagnose | grep -c outside_grammar
```

Pass for Part B: `0`.

Fail: any hostile key created, the editor running in step 2, `x;touch PWNED` unquoted
in any hint, any file in step 5, no finding in step 6, or any count above 0 in Part B.

### Conscious exclusions

- Renaming or refusing keys that predate the grammar (E2, E3), and a command to rename
  or remove a journey or a persona. None exists. Revisit when diagnose first reports a
  real key.
- The other identity layers. `self`, `ego`, `user`, and `organization` keys are fixed
  names, and a `journey_path` key follows its journey.
- `journey update` writing a `journey_path` row for a journey that does not exist. It
  creates no journey.
- `--journey` and `--persona` arguments to other commands. They name a key and create
  none.
- Surfaces that print a key as stored. A key that predates the grammar prints as it
  is; only the refusal and the diagnose finding escape it.
- `journeyInference.ts`'s `/mm-build` pattern, which recognizes existing journeys,
  some of which may predate the grammar.
- Extension-id usage lines. They echo the id just typed, and extension ids have their
  own grammar.
- The Pull command's placeholders (`<code>`, `"<title>"`), which an agent fills in.
- A database trigger ([panel review](#panel-review-2026-09-27), database-architect).
- Quoting for cmd.exe and PowerShell, which belongs to US3's Windows promotion.

### Authority boundaries

Plan approval moves CR104 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route
above and accept it. Each plateau is committed on the Delivery branch and pushed when
green, with GitHub Actions verified after every push. Merge, publication, and release
are not authorized.

Navigator decisions, 2026-09-27: Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-27)

This is the plan review before implementation, per the CV22 collaboration strategy.
The quality-assurance draft was reviewed by the engineer, database-architect,
devops-engineer, security-engineer, ai-engineer, prompt-engineer, experience-designer,
and product-designer lenses. Only dissent was recorded.

Synthesis: the plan is sound and cheap. One INSERT guards every path that creates a
key, and quoting leaves every plain slug byte-identical. The risk sits where the plan
stops: the commands an agent writes on its own from a key it has read, and keys that
predate the grammar, which only a report reaches. The plan succeeds if no new key can
be hostile, no hint can carry one, and a key that predates the grammar is visible
rather than silently trusted.

| Lens | Dissent | Resolution |
|---|---|---|
| security-engineer | Persona ids reach a mirror through bundles made to be shared: `ext-persona-export` writes them, `seed` takes the key from the file, and `detect-persona` prints it to the agent that composes `mirror load --persona`. It is the same two steps as a journey slug, with a stranger at the first | [Decision P](#decision-p-persona-ids): P1 |
| devops-engineer | The draft refused inside the write, after the pre-write snapshot. On the Navigator's install that snapshot is a 58 MB file rewritten inside a Dropbox folder, so a mistyped key would cost a snapshot and a sync | Design 3: `identity set` and `identity edit` check before the write seam opens. The store's check stays, as the guard for every other path |
| engineer | The draft put the grammar in `#journey/` and called it from `upsertIdentity`, so the identity store would import from the layer above it. Its early checks also restated the store's condition, and two copies of one condition drift | Design 1 and 2: the grammar in `#util/slug.ts`, one function in `#identity/identityKey.ts`, called by the store and by both early checks |
| ai-engineer | Quoting covers the commands Mirror prints, not the ones an agent writes. `mm-build`'s Journey Binding tells the agent to put the slug the Builder card names into every later `--journey`, and a model does not reliably quote for a shell. Only the grammar makes that safe, and only for keys created after it | Design 5: the finding says so for a key that predates the grammar. No skill instruction to quote: a conditional rule a model applies unevenly is weaker than the grammar, and no such key is known |
| prompt-engineer | The draft's refusal led with the rule. An agent reading it needs first that nothing was created, then the one key that would work | Design 2's wording, and one sentence in `mm-identity` so the agent picks a valid key the first time (design 7) |
| database-architect | The invariant lives in application code, so a writer that bypasses `upsertIdentity` bypasses the grammar | Accepted as a boundary. Every identity INSERT in `ts/src` is in `upsertIdentity`. A trigger would be a second copy of the grammar, in GLOB, plus a migration and a bootstrap object, for writers that do not exist. Revisit when something outside the package writes identity rows |
| product-designer | A finding nobody can resolve: no command renames or removes a journey, and diagnose exits 1 while any finding stands | Design 5 names the only remedy that exists. A rename command is excluded, with a revisit trigger |

The experience-designer lens raised no objection. Every plain slug prints exactly as
it does today, and only a hostile key looks different, which is the point.

## Evidence

In an isolated home on 2026-09-26, `identity set journey 'x;touch PWNED'` printed
`✓ journey/x;touch PWNED created`, and `journey set-path`, `build adopt`, and
`build sync-cursor` succeeded. Before CR002 quoted it, the `pull explicitly:` line
read `--journey x;touch PWNED --method ariad …`. The four hint sites above were
found by searching `ts/src` for a `PROGRAM` command that interpolates a journey or
slug.

### Characterization (2026-09-27)

Every finding under [As characterized](#as-characterized-2026-09-27) was produced as
follows:

- The creation paths, the hints, and the persona case: the
  [validation route](#validation-route), Part A, on `63dd2a73`, with bash and zsh
  printing identical output.
- The one INSERT: a search of `ts/src` for `INTO identity`, and of the callers of
  `upsertIdentity`, `setIdentity`, `applyIdentitySet`, and `createJourney`.
- The former grammar: `src/memory/services/journey.py` at `a6d28b62^`, the commit
  before TS5 deleted the Python core, and the callers of `create_journey` in the
  history.
- The real keys: `sqlite3` opened read-only on each home's `memory.db`, counting
  `journey` and `persona` keys outside `[a-z0-9-]`, with a leading or trailing
  hyphen, or with a doubled one, and their lengths. No row content was read.
- The tables that copy a slug: the schema of the dev home's database, every column
  whose name holds `journey`, and `identity.key`.

### The route before the change

Part A of the [validation route](#validation-route), run on `63dd2a73`:

```text
--- step 1: identity set, for slugs a shell would split and for two it would not
✓ journey/x;touch PWNED created
  exit 0
✓ journey/$(touch PWNED) created
  exit 0
✓ journey/-x created
  exit 0
✓ journey/a b created
  exit 0
✓ journey/Mixed_Case created
  exit 0
✓ journey/ai created
  exit 0
✓ journey/mixed-case created
  exit 0
--- step 2: identity edit, for a new journey outside the grammar
✓ journey/Bad Slug created
  exit 0
  the editor ran
--- step 3: seed, for a journey file and a shared persona file whose ids are outside the grammar
  ✓ persona/p;touch PWNED
  ✓ journey/y;touch PWNED
query: zanzibar
  p;touch PWNED score=1 match=keyword
--- step 4: a journey that predates the grammar still works, and every hint quotes it
  set-path exit 0
  adopt exit 0
  mirror build adopt --journey x;touch PWNED --method ariad
  mirror build adopt --journey x;touch PWNED --method ariad
  mirror journey set-path x;touch PWNED /path/to/project
  mirror build sync-cursor --journey x;touch PWNED --method ariad
--- step 5: the four hints, run as printed, with mirror stubbed out
  files created: [--method ariad PWNED]
--- step 6: runtime diagnose
```

Every step fails as characterized. In step 4 the journey already exists, because step
1 created it, so the planted row is ignored. After the change, step 1 refuses it and
the planted row is what step 4 works with.

### Plateau 1 handoff (2026-09-27)

Now true: every command Mirror prints for its reader to run carries each value it
interpolates as one shell word. `shellWord` lives in `ts/src/util/shellWord.ts`. The
four Builder hints use it: inspect-method's next action, the not-adopted and no-cursor
refusals, and `build load`'s set-path trailer. So do CR002's Pull command, CR067's
`build show` command, and `seed`'s three skip hints, which now name `mirror` and read
`(skipped — to update, run: mirror identity edit journey demo)`. A plain slug prints
byte for byte as before.

Evidence:

- Five hostile slugs went through each of the four hints, pasted into `sh` with a
  `mirror` that echoes its arguments. Red first: each paste ran `touch` or failed to
  parse. Each now runs nothing and delivers the slug as one argument.
- The same paste covers `seed`'s journey hint, over a key planted from before the
  grammar. Red first, on the old wording.
- `shellWord`'s round trip through `sh` covers fifteen values, among them a newline, a
  lone quote, a backslash, and the empty string.
- The source guard reads every line of `ts/src` that prints a `${PROGRAM}` command,
  and fails on a raw interpolation not listed with its reason. A mutant that drops the
  helper from `methodInspection.ts` fails it. One that drops it from `load.ts` fails
  both it and the paste test.
- One golden edit, by script with an asserted count and a README row:
  `builder-method`'s `journey_empty`. No other golden moved.
- The full suite passes (2,792 tests), along with typecheck, lint, the repository
  checks, and the Builder lifecycle smoke.

Remaining: the grammar and the report. Next: plateau 2.

## Outcome

Pending.
