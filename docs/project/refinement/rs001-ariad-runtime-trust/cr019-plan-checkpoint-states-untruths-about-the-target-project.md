[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR019 — The Plan checkpoint states things that are not true for the target project

## Problem

### As captured (2026-09-07)

Two content defects in `PLAN_CHECKPOINT` (and the `plan.md` scaffold it
materializes), both observed on every Technical Story of `kia-desktop`
CV8.DS4 on 2026-09-07:

1. **The parent is listed as a sibling.** The non-goals section reads
   `Do not implement sibling roadmap item: Higiene de dead code: o que não
   roda sai do repositório` — that is the active story's **own Delivery
   Story**. It appeared alongside the genuine siblings (the other TSs of the
   DS, by their truncated titles per CR018) and alongside the next Delivery
   Story (`CV8.DS5`). A story cannot have its parent as a non-goal; the line
   is noise a reader has to explain away.

2. **Mirror's own development rules leak into another project's contract.**
   The Implementation Contract section carries
   `Use uv run for Python commands and tests.` — the Mirror Mind repository's
   convention, injected into the plan of a Tauri/React project whose gates are
   `npm`, `cargo` and `python3 scripts/…`. The consuming project's
   `CLAUDE.md` says nothing about `uv`; the line is false there, and the Driver
   has to delete it from every generated plan.

Both make the Navigator's approval decision rest on a document that is partly
wrong on its face, and both are deterministic — they recur on every plan.

### As characterized (2026-09-26, TypeScript runtime)

Both defects reproduce, and the first is wider than captured.

1. **Non-goals list every pullable item in the Capability Value.**
   `roadmapPlanContext` (`ts/src/builder/commands.ts`) keeps every candidate inside
   the active item's CV except the active item itself. For `CV1.DS1.TS1` that is its
   two real siblings, plus its **parent** `CV1.DS1`, a **cousin** `CV1.DS2.US1`, and
   the next Delivery Story `CV1.DS2`. The port kept this on purpose; a comment there
   names it as CR019's defect. The golden fixture pins it exactly: the only
   "sibling" `plan_item_*` lists for `CV1.DS1.US1` is `A delivery story`, which is
   `CV1.DS1` itself.
2. **Two Mirror lines remain in every project's contract.** TS5 removed the `uv run`
   line. `MIRROR_LOCAL_IMPLEMENTATION_RULES` still injects
   `Do not use git add .; commit only story-scoped files.` and
   `Use descriptive English commit messages explaining why.` into every plan, marked
   as if the project had declared them. A project's own development guide is
   ignored: Prepare reports `docs/process/development-guide.md: present`, yet none
   of its rules reach the plan.

The Delivery Story Plan scaffold is not affected; its contract carries method rules
only.

## Expected Behavior

- The non-goals list names sibling work items only: children of the same
  parent that are not the active item, and (optionally) the next item at the
  parent's level. The active item's ancestors never appear as non-goals.
- The Implementation Contract carries method-level rules (TDD/characterization,
  scope to the active story, no `git add .`, descriptive English commits) and
  **project-level** rules only when the project declares them — read from the
  local development guide the Prepare step already looks for
  (`docs/process/development-guide.md` was reported `missing` for this
  project, so the correct behavior was to emit none). Mirror's `uv run` rule
  belongs to Mirror's own guide, not to the default.

Which of the remaining lines are method-level is reopened below: the trust-floor
decision of 2026-09-25 calls both of them Mirror-only.

## Impact

Small per occurrence, systematic across projects: every Ariad-adopted project
that is not Mirror Mind inherits a false contract line, and every child story
inherits its parent as a forbidden sibling. The trust cost is the same shape
as CR009's — a surface that is *almost* right trains the reader to skim it,
and the checkpoint is the one surface that should be read closely.

## Plan Or Decision

Drafted by quality assurance on 2026-09-26 and reviewed by the technical panel the same
day ([record below](#panel-review-2026-09-26)). The panel's two changes are folded into
the sections that follow. Navigator decisions, 2026-09-26: option C for
[the two remaining contract lines](#decision-the-two-remaining-contract-lines), and the
plan approved as it stands.

### Objective

A Plan checkpoint and its `plan.md` state only what is true for the target project.
The non-goals name the active story's actual siblings. The Implementation Contract
carries Ariad's method rules, plus only the rules the project itself declares.

### Decision: the two remaining contract lines

- **A. Method rules.** Both stay in every plan, rendered as method lines instead of
  project rules.
- **B. Project rules.** Both leave the default; a project gets them only through its
  own development guide.
- **C. Split (recommended).** Staging only story-scoped files follows from the
  method's own "Keep changes scoped to the active story" and holds in any Git
  project, so it becomes a method line. The language and style of commit messages is
  a project convention, so it comes from the project's guide. Mirror loses nothing:
  its development guide already says "Descriptive English message. Explain why, not
  just what."

The Navigator chose C.

### Design

1. **Siblings.** `roadmapScope.ts`, which already owns roadmap membership, gains two
   pure functions beside `cvCodeOf` and `isInsideCv`. `parentCodeOf(code)` returns
   everything before the last `.`, or `null` for a CV code.
   `siblingsOf(candidates, activeItem)` keeps the candidates whose parent equals the
   active item's parent, minus the active item, in roadmap order.
   `roadmapPlanContext` only calls it. Ancestors, cousins, and other Delivery Stories
   drop out by construction. Exact code comparison keeps `CV1.DS1` from matching
   `CV1.DS10`'s children. With no siblings, the existing fallback line stands.
2. **Project rules.** `MIRROR_LOCAL_IMPLEMENTATION_RULES` is deleted. `prepare.ts`
   exports `DEVELOPMENT_GUIDE_PATH`, the path Prepare already reports, and its
   local-docs list uses it. When that file exists in the project, `localRules` is one
   pointer line; otherwise it is empty. The guide is pointed to, never parsed.
3. **Method rules (under C).** The staging line joins the fixed method lines of the
   card (`plan.ts`) and the scaffold (`planArtifacts.ts`). It is written once, as a
   single exported constant both renderers use. The existing method lines already
   word the same rules differently in those two renderers; that drift is left alone
   here, but it gains no new copy.

### Surface strings

The goldens will pin these, so they are fixed here.

Card, `implementation contract` (the `✓` line only when the guide exists):

```text
TDD/characterization tests when behavior is testable.
Keep changes scoped to the active story.
Do not use git add .; commit only story-scoped files.
✓ Follow the project's development guide: docs/process/development-guide.md.
```

`plan.md`, `## Implementation Contract` (the last line only when the guide exists):

```text
- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV1.DS1.TS1`.
- Do not use git add .; commit only story-scoped files.
- Follow the project's development guide: docs/process/development-guide.md.
```

When the guide is absent, neither surface adds a project line, as CR019 asks: emit none.
Today's bare `- None declared.` goes too. A missing file does not mean the project has
no rules; it may keep them where its agents already read them, such as `CLAUDE.md`.

### Affected files

- `ts/src/builder/roadmapScope.ts`: `parentCodeOf` and `siblingsOf`.
- `ts/src/builder/commands.ts`: `roadmapPlanContext` calls `siblingsOf`;
  `MIRROR_LOCAL_IMPLEMENTATION_RULES` deleted; `localRules` from the guide's presence.
- `ts/src/builder/prepare.ts`: exports `DEVELOPMENT_GUIDE_PATH`.
- `ts/src/builder/plan.ts` and `ts/src/builder/artifacts/planArtifacts.ts`: the
  method line from its one constant, and no fallback line in the scaffold.
- `ts/test/builder/`: unit tests for `parentCodeOf` and `siblingsOf`, and an
  end-to-end `plan-item` test on a tree with real siblings, the parent, a cousin,
  another Delivery Story, and a second CV, with and without a guide.
- `ts/test/goldens/builder-command.golden.json`: `plan_item_after_prepare`,
  `plan_item_with_objective`, and `plan_item_preauthorized`, in `stdout` and
  `project_files`. Their parent-as-sibling line becomes the fallback line, and the
  contract changes as designed. One row in `ts/test/goldens/README.md`.

### Plateaus

1. **Siblings:** `parentCodeOf`, the sibling rule, unit and end-to-end tests, and the
   non-goal golden edits.
2. **Contract:** the guide pointer, the method line, tests, the contract golden edits,
   and the README row.
3. **Close:** a runnable validation route, Navigator validation, and the handoff
   review.

### Acceptance criteria

1. For an active story, non-goals list exactly the other pullable children of its
   parent, in roadmap order.
2. Never listed: the parent or any other ancestor, a child of another Delivery Story,
   another Delivery Story, or anything outside the CV.
3. `CV1.DS1` never matches `CV1.DS10`'s children.
4. No siblings: the one line `Do not silently absorb adjacent roadmap work.`
5. Active item absent from the candidates, for example already Done: the same
   fallback, and no error.
6. In every project, the contract carries the three method lines and never
   `Use descriptive English commit messages explaining why.`
7. Guide present: one pointer line with the same text in the card and in `plan.md`.
   Guide absent: no project line in either, and no `None declared.`
8. The Delivery Story Plan scaffold is unchanged.
9. An authored `plan.md` still survives `plan-item` byte for byte (CR079).
10. `npm test`, `npm run typecheck`, `npm run lint`, and CI are green; each golden
    edit has its README row.

### Validation route

CLI only, with an isolated home (`MIRROR_HOME=/tmp/…`, no `.env`). No Pi session:
one in a scratch home copies the whole Pi history into it (CR106). The roadmap is
the characterization's: Delivery Stories `CV1.DS1` (Technical Stories 1 to 3) and
`CV1.DS2` (one User Story), a second CV outside, and the active item `CV1.DS1.TS1`.

1. Without a development guide, `plan-item`: non-goals are exactly `Second slice` and
   `Third slice`. The contract shows the three method lines and nothing else, in the
   card and in `plan.md`.
2. Same roadmap with `docs/process/development-guide.md`: the contract adds the
   pointer line, in the card and in `plan.md`.

Pass: exactly those outcomes. Fail: `Alpha delivery`, `Beta story`, `Beta delivery`,
or the English-commit line appears anywhere. Plateau 3 turns this into a pasteable
script.

### Conscious exclusions

- CR018: the same function cuts titles at the last `/`; untouched here.
- The next item at the parent's level as a non-goal, which CR019 made optional. It is
  left out so the rule stays one sentence.
- Parsing the guide into individual rules, or a per-project method configuration.
- The Plan's other default prose: objective, scope, and acceptance templates.
- Generated plans under `docs/project/roadmap/` that quote the old lines: they are
  records.

### Authority boundaries

Plan approval moves CR019 to `planned`. A human Driver and a Delivery reference are
required before `in_progress`. `validated` requires the Navigator to walk the route
above and accept it. Each plateau is committed on the Delivery branch and pushed when
green, with GitHub Actions verified after every push. Merge, publication, and release
are not authorized.

Navigator decisions, 2026-09-26: Driver `@viniciusteles`, Delivery `mirror-ts-core`.

### Panel review (2026-09-26)

Plan review before implementation, per the CV22 collaboration strategy: the
quality-assurance draft reviewed by engineer, database-architect, devops-engineer,
security-engineer, ai-engineer, prompt-engineer, experience-designer, and
product-designer. Only dissent was recorded.

Synthesis: sound and small. Both fixes are deterministic, the characterization pins the
defect exactly, and the validation route stays off Pi. Risk concentrates in the strings,
which the goldens freeze and agents read, and in where the new rules live. The plan
succeeds if every contract line is true for the project it lands in, including any line
that reports what was not found.

| Lens | Dissent | Resolution |
|---|---|---|
| engineer | The sibling rule is domain logic, but the draft left it as a filter inside a command module, while CR002 had just given roadmap membership one owner. The staging line would also have been written twice, beside method lines whose wording already drifts between the two renderers | `siblingsOf` in `roadmapScope.ts`, pure and tested directly; the staging line as one constant both renderers use ([Design](#design)) |
| prompt-engineer | "No project rules declared" claims more than is known. kia-desktop, which reported CR019, keeps its rules in `CLAUDE.md`, so the line would have swapped one false contract line for another | No absent-guide line in either surface, and `None declared.` removed, as CR019 asked: emit none ([Surface strings](#surface-strings)) |

The database-architect, devops-engineer, security-engineer, ai-engineer,
experience-designer, and product-designer lenses raised no objection. Pointing to the
guide instead of parsing it keeps project-controlled text out of the checkpoint. It also
sends the Driver to the one file agents do not already load, since runtimes read
`CLAUDE.md` and `AGENTS.md` on their own.

## Evidence

### As captured (2026-09-07)

`PLAN_CHECKPOINT` surfaces for `CV8.DS4.TS1`, `TS2` and `TS3` (session of
2026-09-07, journey `kia-desktop`); the generated `plan.md` scaffolds for the
same stories, whose `## Non-Goals` and `## Implementation Contract` sections
the Driver rewrote before each approval. The Prepare surface for each story
reported `○ docs/process/development-guide.md: missing`.

### Characterization (2026-09-26, TypeScript runtime, isolated home)

The real front door at `4eef1a8a` ran against an isolated `MIRROR_HOME`, with no `.env`
and no Pi session. The scratch project had CV1 with `CV1.DS1` (Technical Stories 1 to
3, titled First, Second, and Third slice) and `CV1.DS2` (User Story `Beta story`), and
a second CV. The steps were `adopt`, `sync-cursor`, `set-cadence --profile checkpoint`,
`pull-item CV1.DS1.TS1 --item-level technical_story`, `prepare-item`, and `plan-item`,
run once without and once with a development guide declaring
``Run `npm test` and `cargo test` before every commit.``

Identical in both runs, card and `plan.md` alike:

- Non-goals: `Second slice`, `Third slice`, `Alpha delivery` (the parent),
  `Beta story` (a cousin), and `Beta delivery` (the next Delivery Story). CV2 was
  excluded.
- Contract: the two method lines, then `✓ Do not use git add .; commit only
  story-scoped files.` and `✓ Use descriptive English commit messages explaining why.`

With the guide present, Prepare reported it `present`, and none of its rules reached the
plan.

### Plateau 1 handoff (2026-09-26)

Now true: a story's Plan non-goals list only the other children of its own parent.
`siblingsOf` and `parentCodeOf` sit in `roadmapScope.ts` beside the membership rules,
and `roadmapPlanContext` only calls `siblingsOf`. The parent, other ancestors, cousins,
the parent's own siblings, and anything in another CV no longer appear, and `CV1.DS1` no
longer claims `CV1.DS10`'s children. An only child gets the fallback line.

Evidence: the end-to-end test was red first, listing the parent, both `CV1.DS10` items,
the cousin, and the other Delivery Story after the two true siblings. It is green now. A
mutant of `siblingsOf` that compares by prefix fails both the unit and the end-to-end
test. The three `plan_item_*` goldens trade the parent line for the fallback line, with
a README row. The full suite passes (2,710 tests), along with typecheck, lint, the three
repository checks, and the Builder lifecycle smoke (54/54).

Remaining: the contract lines. Next: plateau 2.

### Plateau 2 handoff (2026-09-26)

Now true: every story Plan's contract carries Ariad's three method lines. They are TDD or
characterization tests, changes scoped to the active story, and, by decision C,
`Do not use git add .; commit only story-scoped files.`, which the card and the scaffold
print from one constant. The English-commit rule is gone from the default. A project's
own rules reach the Plan only as one pointer to `docs/process/development-guide.md`, when
that file exists. `projectContractRules` builds it in `prepare.ts`, beside the path
Prepare already reports. Without a guide neither surface adds a line: `plan.md` loses
`- None declared.`, and the card no longer shows the list's usual `none`.

Evidence: the end-to-end contract test was red first on the English line. It then went
red on the card's `none`, which no earlier Plan could show, since the Mirror lines never
left the list empty. Both are green. Unit tests cover `projectContractRules` with the
guide present, missing, and with no project path. The golden edits are `builder-command`
(the three `plan_item_*` cases) and `builder-lifecycle` (15 card renders, two `plan.md`
files), with a README row. The full suite passes (2,713 tests), along with typecheck,
lint, the repository checks, and the smoke (54/54). CI was green on plateau 1.

Remaining: plateau 3, meaning the runnable validation route, Navigator validation, and
the handoff review.

## Outcome

Pending.
