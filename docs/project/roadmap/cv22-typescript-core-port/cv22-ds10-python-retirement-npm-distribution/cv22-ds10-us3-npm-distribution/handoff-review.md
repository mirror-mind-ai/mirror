[< Story](index.md)

# Handoff Review — CV22.DS10.US3

**Date:** 2026-10-09, plateau 6, before Validation.
**Panel:** engineer, quality-assurance, devops-engineer, security-engineer,
database-architect — the first plan review's panel, as the [plan](plan.md#review)
committed. The second pass's four lenses (prompt-engineer, ai-engineer,
product-designer, experience-designer) reviewed the plan, not the delivery; their six
findings are each closed below by name.
**Method:** the [collaboration strategy](../../collaboration-strategy.md): with no second
human, this review is the review. Each persona read the delivered code, tests, smokes,
records, and the Navigator's four walks; findings are classified as blockers, pay-now,
non-blocking debt, questions, or accepted boundaries. Synthesis first, dissent after.

---

## Verdict

**The story delivers what it set out to: Mirror Mind installs with one command and no
checkout, every runtime wires to it by a counted step, the shipped artifact holds no
Python by a guard rather than by reading, and the thirteen inherited items are each
closed or recorded.** The Navigator has walked routes 1–3 and accepted them; route 4 is
run and awaits his hand. Nothing was published, tagged, or promoted.

**No blocker to Validation.** One finding is pay-now before the *release*, not before this
story's Done: a fresh install's first `seed` exits 1 (P1). The rest is debt and questions
for the release gate, each with an owner.

The shape of the risk changed during the story, and the review follows it. The plan's
risk sat at three seams — the clone user after the release, Pi loading the extension
twice, the tarball trusted rather than checked. All three are closed (the post-update
line and "Upgrading from a clone"; the walk showed Pi loads a local-path package once;
the pack guard grades paths and content in CI). What the delivery exposed instead is
**the first run of a stranger**: `seed` fails on an empty template (P1), the first
maintenance run imports the person's whole Pi history (CR121, a release precondition),
and `npm install -g mirror-mind` names a package that does not exist yet (D1 below).
None of these is a packaging defect. They are what packaging makes visible.

---

## Pay now (before the release)

### P1 — a fresh install's first `seed` exits 1 (quality-assurance, engineer)

`templates/identity/ego/constraints.yaml` ships `constraints: |` with nothing under it;
`seed` calls empty content an error and exits 1. Named at plateau 1 (F1), seen by the
Navigator on route 2a, left open. Getting started now says "`mirror seed` completes
without errors" in its checklist, and the package smoke has to *expect* exit 1. A stranger
meets a red first command.

Two fixes, both small: ship one real constraint in the template (the editorial choice —
what the mirror must never do), or let `seed` treat an empty optional layer as `skipped`
rather than `error`. The second is a behavior change to `seed`; the first is content.
**Recommendation: the template, with one line, decided by the Navigator** — it is his
identity's constraint layer. Owner: the Navigator; release gate.

### P2 — the published name does not exist yet (security-engineer, devops-engineer)

Every page now says `npm install -g mirror-mind`. The name is free on the registry
(2026-09-30), and a free name is a name anyone can take. Until publication, a reader of
`main` who follows getting started gets a 404 or, worse, someone else's package. The plan
kept publication a separate gate, correctly; the exposure is the window between this
story's merge and the release. **Recommendation:** publish promptly at the release, with
`--provenance` and a granular token (plateau 4's note), and consider publishing a
placeholder `0.0.0` under the name *before* merging the docs that advertise it. Owner: the
release gate.

---

## Non-blocking debt

### N1 — the capture normalizer's word-boundary masks are inert on macOS (engineer)

`scripts/capture_family_outputs.sh` masks `<TIME>`, `<AGO>`, `<UUID>`, and `<VERSION>` with
`\b`, which BSD `sed -E` does not support. Both captures were taken on the same machine at
the same version, so the diff was true; the day a version bump separates two captures,
every family that prints the version diffs. Route 4 records it. A one-line change
(`[[:<:]]`/`[[:>:]]` on BSD, or a portable rewrite) and a self-test under both seds.
Candidate CR, RS010.

### N2 — `smoke_claude_plugin.sh`'s "mirror-hook gone" case cannot fail-safe on a linked machine (devops-engineer)

Known since plateau 4: the plugin wrapper's global-bin fallback finds the linked
`mirror-hook`, so the case that proves the fail-safe passes only where no global link
exists (CI). The smoke should isolate the global bin directories. Candidate CR, RS010; the
story index already names it.

### N3 — two `hookBin` tests skip while a global `mirror`/`mirror-hook` exists (engineer)

By design, and CI runs them; on the Navigator's machine, which is linked, they never run.
The same isolation as N2 would let them run everywhere.

### N4 — the release notes in the tarball still tell old versions' users to run Python (security-engineer, accepted with the reason)

`docs/releases/v0.10.*.md` and others carry `uv run python -m memory …` as that version's
instruction; `runtime release-notes <version>` shows them as written. The pack guard allows
`docs/releases/` by name, as the retired-surface guard treats it as history. Accepted: a
record that is rewritten is not a record. Noted so nobody reads the guard's exemption as a
gap.

### N5 — the Pi local-path package follows one Node prefix (devops-engineer)

`pi install "$(npm root -g)/mirror-mind"` records an absolute path under one prefix; an
install under another Node (nvm) leaves Pi pointing at the old one. Documented in the new
troubleshooting entry; not engineered around, per the first plan review.

---

## Questions for the release gate

### Q1 — CR121: a new home's first maintenance imports the whole Pi history (database-architect)

Reproduced at plateau 3: 430 conversations, 26,036 messages, into a fresh home, before
CR120 stopped it; with a key, extraction would then spend on them. For a clone user that
history is already tracked; for an npm user who used Pi before Mirror, it is a silent
first-run import with a bill. A product decision — keep, ask first, or import only sessions
newer than the home — recorded as a CV22 release precondition on 2026-10-09. **This review
reaffirms it as the one data-shape decision the release cannot ship without.**

### Q2 — the Python-era updater's last hop on the production clone (devops-engineer, D12)

A clone on `v0.31.14` that runs `runtime update` lands on the CV22 tree and fails its
post-update status, because that status runs the Python engine. "Upgrading from a clone"
says so and gives the four lines. F20's closing check — the production clone takes the
release and `build load` against it refuses or recovers as documented — is the release
gate's, with the Navigator's own clone as the subject.

### Q3 — the Frame's three downloaders (product lens, carried by quality-assurance)

Nobody known; three downloads. The cutoff speaks to them without naming anyone. If one
appears, the answer exists (`v0.31.14`, do not update from inside the Frame, the home is
portable). No action unless a request arrives.

---

## The second pass's six findings, closed

1. **The operating instructions did not ship (D13).** `AGENTS.md` is a real file in `files`;
   Pi appends it from the extension's tree, Claude Code and Gemini CLI receive it as
   `additionalContext` from the session-start hook, Codex through `~/.codex/AGENTS.md`.
   Proven twice by the Navigator: `◇ financial` on a pricing question in `/tmp` under Pi
   (route 2b) and under Claude Code (route 3 step 4), and a Builder load that stopped at the
   Activation Boundary with no other source of that rule.
2. **The agent with no `mirror` had no sanctioned move.** The extension says at session start
   when `mirror` does not resolve, naming `npm link`. Measured first (route 1b): the agent
   improvised onto `node bin/mirror.js`, the sanctioned entry, never the forbidden form.
3. **Hook degradation was too graceful.** `runtime diagnose` reports `hooks.log` failures by
   count (it already did: TS5 N1); plateau 3 asserts it in the plugin smoke, and the plugin's
   wrapper now names its own fix in the log line.
4. **D4 named no user.** Three downloads, none since August, nobody known; recorded in D4,
   the cutoff, and the decision entry. No Windows story is promised.
5. **"One step per runtime" was untested beyond Pi.** Counted honestly at plateau 3 against
   each runtime: Pi 1, Claude Code 1, Gemini CLI 2, Codex 2; `init` prints them, with paths.
6. **The first seconds were a usage dump.** Bare `mirror` with no user prints three lines;
   `init` ends with the next line to run; the README names `mirror-mind` and `mirror` once
   together.

---

## Accepted boundaries, reaffirmed

- No publication, dist-tag, tag, stable promotion, GitHub Release, or version bump in this
  story; `release:promote` prints the publication step and never runs it.
- No Windows support for the core, and no Windows product; the cutoff and the decision
  entry say why and to whom.
- The `automation` and `extensions/*` repositories are not edited; the substitution is
  recorded in CR093 with today's counts.
- No `mirror runtime install <runtime>`; printing is not automating.
- Mirror Desktop stays outside the migration.

---

## What the Debt Review owes

- Decide P1 (the template line) — before the release, not before Done.
- Capture N1 and N2 as CRs in RS010, or decline them with a reason.
- Carry P2, Q1, Q2 to the release gate's checklist by name.
- Nothing from this story is `pay_now` *within* the story: the one pay-now item is a
  template the Navigator authors.

---

## Dispositions

| Finding | Class | Owner | Where it lives |
|---|---|---|---|
| P1 empty constraints template | **paid 2026-10-10** at the Debt Review (one language rule, prompt-engineer's choice; the smoke now expects a clean seed) | Navigator | `62de848c` |
| P2 unpublished name | **deferred** to the release gate's publish step | release gate | this review; plateau 4's `--provenance` note |
| N1 BSD `sed` masks | captured as [CR122](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr122-the-capture-normalizer-s-word-boundary-masks-are-inert-under-bsd-sed.md) | RS010 | route 4 |
| N2 plugin smoke isolation | captured as [CR123](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr123-the-plugin-smoke-s-missing-bin-case-cannot-run-on-a-machine-with-a-global-link.md) | RS010 | story index |
| N3 skipped `hookBin` tests | with CR123 | RS010 | story index |
| N4 old release notes name Python | accepted | — | pack guard's `allowedIn` |
| N5 Pi path per prefix | documented | — | troubleshooting |
| Q1 CR121 | release precondition | Navigator | decisions |
| Q2 last Python hop | release gate | Navigator's clone | "Upgrading from a clone"; D12 |
| Q3 Frame downloaders | none | — | cutoff |
