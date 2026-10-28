[< Story](index.md)

# Test Guide — CV9.DS9.US3

## Automated Validation

Move branch:

- `npm test`: the resolver's rule (the effective model's table entry: Haiku carries
  `none` whether defaulted or named explicitly; Flash Lite and any model not in the
  table carry nothing; an explicit effort wins on any model; an invalid value reads
  as unset, so the default pin still sends `none` and the value is reported), the
  live envelope (`reasoning: { effort: "none" }` on the default pin for every role
  but `consult`; no reasoning field with Flash Lite named), `computeCost` on the new
  pin and on Flash Lite, the `runtime status` models line, and every golden that
  names the pin.
- `npm run check`: lint and types.
- The gate, in the development home: `npm run eval -- --all` on the current pin
  before the swap (fresh baseline, re-run until every module has a window no 429
  touched; not expected to be green, since Flash Lite fails one of reception's three
  probes in every recorded run), then on the new pin after it. Green, by the rule the
  plan fixes before the run: every blocking probe passes and every module clears its
  threshold, or clears it in the majority of an n≥5 re-run; `conversation-summary`
  and `reception/open-existential-no-persona` are known noise at `none`, any other
  flip is a candidate regression. `npm run eval -- extraction --history` shows the
  flip labeled as a model and reasoning change. Both summaries are kept in this
  package's `evidence/`, numbers and probe names only.

Stay branch: no code changes; `npm test` stays green as a check that nothing moved.

## E2E Decision

Required on the move branch: one real conversation ends in a Pi session on the
development home and its extraction-family calls go through the real transport on
the new pin. Not applicable on the stay branch.

## Navigator Validation

Move branch:

1. `mirror runtime status` in the development home, no override.
   Expected: the models line names `anthropic/claude-haiku-5.5` and
   `reasoning=none (model default)`. Pass: both. Fail: either missing, or Flash Lite.
2. End one conversation with at least one substantive exchange in a Pi session on
   the development home, then read its `llm_calls` rows.
   Expected: rows name `anthropic/claude-haiku-5.5` with non-null `cost_usd`; the
   conversation has a title, tags, and a summary. Fail: a null cost, a Flash Lite
   row, or an untitled conversation; an empty title is a fail, not a retry.
3. `MEMORY_EXTRACTION_MODEL=google/gemini-2.5-flash-lite mirror runtime status`.
   Expected: Flash Lite, no reasoning clause. Fail: a reasoning clause.
4. Read the decision entry in `docs/project/decisions.md` and `release-note.md` in
   this package: they say what the Navigator decided and why, and the rollback
   names the env line, the file, and the status check.

Stay branch: read the decision entry and the two Change Requests (D2, D3) in RS010.

## Validation Evidence

Pending implementation and validation.
