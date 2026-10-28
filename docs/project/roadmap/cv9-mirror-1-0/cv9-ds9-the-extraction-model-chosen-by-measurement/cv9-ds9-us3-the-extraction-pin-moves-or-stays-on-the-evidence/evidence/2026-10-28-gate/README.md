[< CV9.DS9.US3](../../index.md)

# The release gate — 2026-10-28

The model upgrade playbook's steps 1 and 3 for the swap to `anthropic/claude-haiku-5.5`
at reasoning `none`: a fresh `eval --all` on the current pin before it changed, and
`eval --all` on the new pin after, both in the development home's own eval history
(`~/.mirror-minds/vinicius-dev/eval-history`). The records stay there; this folder
holds a summary of each, numbers and probe ids only.

## What ran

- **The code:** the baseline on `889e27be` (the plan commit, pin still Flash Lite);
  the swap on the working tree of the migration commit that follows this README.
- **The baseline** (`baseline-flash-lite.md`, suite `e5f63110`): one run, 60 s, no
  HTTP error in any module, so every window was clean and one run was enough
  (plan step 13). 9 of 9 modules pass. The probes Flash Lite has always failed
  failed again: `extraction/two-pass-dedup`, `extraction/conversation-summary`,
  `reception/open-existential-no-persona`, `title_tags/title-trivial-empty`, plus
  `reception/shadow-touch-vague-discomfort`, which TS1 recorded as unstable.
- **The swap** (`swap-haiku-none.md`, suite `39b9c9d7`): one run, 77 s, no HTTP
  error. 9 of 9 modules pass. One probe failed in the whole suite,
  `extraction/conversation-summary`, the one TS1 expected at `none` (4 of 14), so
  by the rule the plan fixed in step 14 it is known noise, not a regression, and
  the extraction module stands at 10 of 11. Every other standing failure is fixed:
  reception 12/12, title_tags 7/7.
- **The comparison:** every module's `prompt_hash` is equal across the two runs.
  `eval extraction --history` labels the flip `(model and reasoning changed)` and
  reports `two-pass-dedup` recovered: the playbook's configuration-attributable
  signal, in the direction of the swap.

## Green, by the plan's rule

Every blocking probe passed; every module cleared its threshold in the single
smoke run; no module needed the n≥5 re-run. The gate is met.

`summarize.mjs` produces each summary from the history records for a suite run id.
