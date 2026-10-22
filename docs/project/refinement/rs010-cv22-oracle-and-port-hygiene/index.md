[< Refinement Workbench](../index.md)

# RS010 — CV22 Oracle And Port Hygiene

## Framing

Porting the Python core one command at a time keeps finding things that are
not the port's to fix: a TypeScript fidelity gap under an already-validated
golden, a Python product defect the oracle has always had, a test that
behaves differently on a developer machine than in CI. A parity story is the
wrong place for any of them — the moving-target rule says the authority
changes first and the port follows, and a story graded by byte-equality
cannot change either side silently without breaking its own evidence.

Until now these findings lived as debt observations in story plans, which is
where they get forgotten. This story is their durable home.

## Outcome

Each finding surfaced by CV22 that is neither in-scope parity work nor a
DS8 live-cutover input has a Change Request that fixes one core first and
reconciles the other, with the golden or test that pins it, so the port's
evidence stays honest as both cores move.

## Boundaries

- Never fixed inside a parity story; each CR is its own bounded change with
  the moving-target rule applied (authority first, port second, oracle
  baseline advanced in the same commit).
- Not for DS8 inputs (spend bounds, pricing, re-close cost): those are
  planning inputs for the live cutover, recorded in US10's Debt Review.
- Not for routing correctness: that is RS009.

## Change Requests

- [CR056 — Measure title length by code point in titleNeedsImprovement](cr056-measure-title-length-by-code-point.md)
- [CR057 — Stop paying for the discarded summary in the close tail](cr057-stop-paying-for-the-discarded-summary-in-the-close-tail.md)
- [CR058 — Wait for completion, not a wall-clock budget, in the runtime-diagnose web test](cr058-wait-for-completion-in-the-runtime-diagnose-web-test.md)
- [CR060 — Fail loudly when a silent backup fails](cr060-fail-loudly-when-a-silent-backup-fails.md)
- [CR061 — Snapshot the live database consistently before zipping](cr061-snapshot-the-live-database-consistently-before-zipping.md)
- [CR062 — Write backup archives owner-only](cr062-write-backup-archives-owner-only.md)
- [CR063 — Keep journey slugs consistent across tables in repair-encoding](cr063-keep-journey-slugs-consistent-across-tables-in-repair-encoding.md)
- [CR065 — Make parity fixture generators hermetic by construction](cr065-make-parity-fixture-generators-hermetic-by-construction.md)
- [CR066 — Skip a naive timestamp instead of crashing the diagnosis](cr066-skip-a-naive-timestamp-instead-of-crashing-the-diagnosis.md)
- [CR069 — Fail cleanly when `soul apply` is given an unknown id](cr069-fail-cleanly-when-soul-apply-is-given-an-unknown-id.md)
- [CR070 — Render or remove the inert `--listening-for` argument](cr070-render-or-remove-the-inert-listening-for-argument.md)
- [CR071 — Collapse the triplicated skill command references](cr071-collapse-the-triplicated-skill-command-references.md)
- [CR073 — Refuse a mistyped stdin sentinel in `journey update`](cr073-refuse-a-mistyped-stdin-sentinel-in-journey-update.md)
- [CR074 — Harden the `week plan` pending file](cr074-harden-the-week-plan-pending-file.md)
- [CR075 — Route the journal embedding through the safety wrapper](cr075-route-the-journal-embedding-through-the-safety-wrapper.md)
- [CR076 — Collapse the three close-tail metadata calls into one](cr076-collapse-the-three-close-tail-metadata-calls.md)
- [CR078 — Stop spending thirteen seconds polling for a `consult` cost](cr078-stop-spending-thirteen-seconds-polling-for-a-consult-cost.md)
- [CR080 — Give the consolidation prompt an identity context it can act on](cr080-give-the-consolidation-prompt-an-identity-context-it-can-act-on.md)
- [CR081 — Typecheck the parity tools](cr081-typecheck-the-parity-tools.md)
- [CR083 — Path-normalization assumptions in the ported tree are untested, and one shipped wrong for two plateaus](cr083-path-normalization-assumptions-are-untested-in-the-port.md)
- [CR084 — The bootstrap lock is not exclusive during the window between creating it and writing it](cr084-the-bootstrap-lock-is-not-exclusive-while-it-is-being-written.md)
- [CR086 — A baseline advance must name the oracle change it absorbs](cr086-baseline-advance-must-name-the-oracle-change.md)
- [CR091 — `operation_runs` outlived its only consumer](cr091-operation-runs-outlived-its-only-consumer.md)
- [CR097 — New record ids are 32 bits because the oracle's were, and `messages` already collides](cr097-new-ids-are-32-bits-because-the-oracle-s-were.md)
- [CR098 — The Pi extension logs the first 80 characters of every prompt](cr098-the-pi-extension-logs-the-start-of-every-prompt.md)
- [CR099 — A `--global` capability binding is not idempotent](cr099-a-global-capability-binding-is-not-idempotent.md)
- [CR100 — The session resolver guesses "the session" from a table that holds three kinds of row](cr100-the-session-resolver-guesses-from-a-table-of-three-row-kinds.md)
- [CR101 — Explorer and Soul activation stamp their mode onto a guessed session](cr101-explorer-and-soul-activation-stamp-a-guessed-session.md)
- [CR102 — The Claude Code `mm-build` skill carries no activation boundary, journey binding, or Ariad section](cr102-the-claude-code-mm-build-skill-lacks-the-builder-and-ariad-sections.md)
- [CR106 — A Pi session started against a scratch Mirror home copies the whole Pi history into it](cr106-a-pi-session-in-a-scratch-mirror-home-copies-the-whole-pi-history-into-it.md)
- [CR108 — The Claude Code copies of other skills drift from Pi in behavior, and no guard compares them](cr108-the-claude-code-copies-of-other-skills-drift-from-pi-in-behavior.md)
- [CR110 — The doc-link checker reads a link inside inline code as a real link](cr110-the-doc-link-checker-reads-a-link-inside-inline-code-as-a-real-link.md)
- [CR120 — A failed Pi session import aborts the rest of session maintenance](cr120-a-failed-pi-session-import-aborts-the-rest-of-session-maintenance.md)
- [CR121 — A new home's first maintenance run imports the person's whole Pi history](cr121-a-new-home-s-first-maintenance-imports-the-whole-pi-history.md)
- [CR122 — The capture normalizer's word-boundary masks are inert under BSD `sed`](cr122-the-capture-normalizer-s-word-boundary-masks-are-inert-under-bsd-sed.md)
- [CR123 — The plugin smoke's missing-bin case cannot run on a machine with a global link](cr123-the-plugin-smoke-s-missing-bin-case-cannot-run-on-a-machine-with-a-global-link.md)
- [CR128 — The smokes' production guard checks no database in CI, and the plugin smoke never reaches it on a linked machine](cr128-the-smokes-production-guard-checks-no-database-in-ci.md)
- [CR129 — `mirror mcp` with no Mirror home prints a Node stack trace where every other failure is one line](cr129-mirror-mcp-with-no-home-prints-a-stack-trace.md)
- [CR130 — Double-encoded em dashes in the configuration reference, and nothing that catches them](cr130-double-encoded-em-dashes-in-the-configuration-reference.md)
- [CR131 — `runtime diagnose` does not say what the plugin's MCP entry would find](cr131-runtime-diagnose-does-not-run-the-mcp-locator.md)
- [CR132 — `release:promote` pushes with the two-second local git timeout, and stops half-promoted](cr132-release-promote-pushes-with-the-local-two-second-timeout.md)
- [CR133 — `runtime release-notes` reads the git repository above the package, so a Homebrew install finds no notes](cr133-release-notes-reads-the-git-repository-above-the-package.md)
- [CR134 — `release-notes pending` reads the cwd's git repository, so it answers for whatever project the person is in](cr134-release-notes-pending-reads-the-cwd-s-git-repository.md)
- [CR135 — The welcome card's update check asks the cwd's repository, not the install, and the status line keeps a stale verdict](cr135-the-welcome-card-s-update-check-asks-the-cwd-s-repository.md)
- [CR136 — The `release` environment takes a dispatch from any ref, so a branch's own copy of `publish.yml` can stage](cr136-the-release-environment-takes-a-dispatch-from-any-ref.md)
- [CR137 — The updater smoke's package lane fails on a machine that exports `MIRROR_USER`](cr137-the-updater-smoke-fails-on-a-machine-that-exports-mirror-user.md)
- [CR138 — `runtime status`, `version`, and `diagnose` read a clone's repository and channel from the cwd, so a healthy clone is `attention needed` outside its checkout](cr138-runtime-status-and-version-read-a-clone-s-repository-and-channel-from-the-cwd.md)
- [CR139 — A verdict that exits 1 is logged as a front-door `ERROR`, and `diagnose` counts it as a failure](cr139-a-verdict-that-exits-1-is-logged-as-a-front-door-error.md)
- [CR140 — The install's own path is read from `URL.pathname`, so a Mirror under a path with a space or an accent is `unknown`, and the updater refuses it](cr140-the-install-s-own-path-is-read-from-url-pathname.md)
- [CR141 — `init` takes any string as a user name, so `init ../escaped` creates a home outside `.mirror-minds`](cr141-init-takes-any-string-as-a-user-name.md)
- [CR142 — The plugin smoke's negative probe fails on a machine with a global `mirror-hook`](cr142-the-plugin-smoke-s-negative-probe-fails-on-a-machine-with-a-global-mirror-hook.md)
- [CR143 — The inject hook loads Mirror context on Grok, which discards it](cr143-the-inject-hook-loads-context-grok-discards.md)
- [CR144 — The DS7 routes remove agy's credential where 1.3.x kept it, and 1.4.2 keeps it elsewhere](cr144-the-ds7-routes-remove-agy-s-credential-where-1-3-x-kept-it.md)
- [CR147 — Three copies of the extension-id grammar, and two of them disagree](cr147-three-copies-of-the-extension-id-grammar-and-two-of-them-disagree.md)
- [CR148 — The front door dies with a stack trace when its stdout closes early](cr148-the-front-door-dies-with-a-stack-trace-when-its-stdout-closes-early.md)
- [CR149 — `bind` checks nothing it binds: a missing extension, an undeclared capability, or a persona that does not exist all report `bound`](cr149-bind-accepts-a-persona-or-journey-that-does-not-exist.md)
- [CR150 — `install` prints `suggested_personas` this home does not have, as if it did](cr150-install-prints-suggested-personas-this-home-does-not-have.md)
- [CR151 — The transcript backfill writes a session's replies into other sessions' conversations](cr151-the-transcript-backfill-writes-a-session-s-replies-into-other-sessions-conversations.md)
- [CR152 — Under `codex exec`, the plugin's Stop and SessionEnd hooks never reach Mirror](cr152-under-codex-exec-the-plugin-s-stop-and-session-end-hooks-never-reach-mirror.md)
- [CR153 — A home's Pi backfill imports another home's sessions](cr153-a-home-s-pi-backfill-imports-another-home-s-sessions.md)
- [CR154 — A home cannot list or remove the Pi conversations it imported rather than logged](cr154-a-home-cannot-list-or-remove-the-pi-conversations-it-imported.md)
- [CR155 — `runtime diagnose` does not read the Pi extension's error lines, so a session that never reached the core goes unreported](cr155-runtime-diagnose-does-not-read-the-pi-extension-s-error-lines.md)
- [CR156 — A home made by copying another's database is the same home twice, and the docs do not say so](cr156-a-home-made-by-copying-another-s-database-is-the-same-home-twice.md)
- [CR157 — `REFERENCE.md` lists `DB_BACKUP_PATH`, `EXPORT_DIR`, and `TRANSCRIPT_EXPORT_DIR` as settings, though nothing has read them since the Python core was deleted](cr157-reference-lists-path-settings-nothing-reads.md)
- [CR158 — A Pi catalog whose skill files are gone loads no extension, while the status line still counts them and nothing reports it](cr158-a-pi-catalog-whose-skill-files-are-gone-loads-no-extension-and-nothing-reports-it.md)
- [CR159 — The docs spell Pi's skills `/mm-<skill>`, which Pi registers as `/skill:<name>`, and the authoring guide's step 7a has lost two dashes](cr159-pi-skills-are-spelled-by-their-bare-name-and-step-7a-lost-two-dashes.md)
- [CR160 — A Pi skill invoked as `/skill:<name>` is logged as the skill's body, as if the person had said it](cr160-a-pi-skill-invoked-as-skill-is-logged-as-its-body.md)
