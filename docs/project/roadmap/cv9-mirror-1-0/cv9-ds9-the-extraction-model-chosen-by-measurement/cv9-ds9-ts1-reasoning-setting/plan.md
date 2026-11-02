# Plan — CV9.DS9.TS1

## Objective

Give the extraction transport one operator setting for reasoning, sent only when it
is set, and use it to re-measure GPT-6 Luna and Claude Haiku 5.5 with reasoning off
against the 2026-10-26 baseline. DS9's comparison should then judge the candidates'
answers, not a token budget they spend thinking.

TS1 answers one question: is reasoning off safe, and do the candidates' gains
survive it? It is not the quality verdict. Seven runs of pass/fail probes see large
effects, such as 0/6 becoming 7/7, and not subtle ones. TS2 judges quality on the
Navigator's own conversations **(review)**.

Reviewed before approval by six lenses (ai-engineer, engineer, quality-assurance,
devops-engineer, security-engineer, quartermaster) on 2026-10-26. Their gates and
cheap improvements are folded in below and marked **(review)**. What they placed
later is named in the Non-Goals, and the general failure mode they found is captured
as
[CR178](../../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr178-a-configuration-error-counts-as-an-extraction-attempt-and-nothing-releases-a-quarantine.md).

Grounded before planning (2026-10-26):

- **The body today** is `model`, `messages`, `temperature`, `max_tokens`
  (`LiveLlmProvider.complete()`, `ts/src/providers/llm.ts`). There is no way to say
  anything about reasoning.
- **Every role but `consult` runs on the extraction pin.** `consult` passes its own
  `model` (`ts/src/consult/core.ts`), so a setting meant for the extraction pin must
  not reach it.
- **OpenRouter's catalogue:** Luna reasons by default (`default_effort: medium`), and
  so does Haiku. Both accept the efforts `none`, `low`, `medium`, `high`, `xhigh`,
  and `max`, and neither lists `temperature`. Flash Lite's reasoning is off unless
  asked for. Across the catalogue, the efforts in use are those six plus `minimal`.
- **Probed on the real title prompt** (`buildConversationTitlePrompt` on the
  captured `title-injection-resisted` and `title-bounded-no-names` fixtures, 40-token
  budget, two calls each). With no field, Luna was cut off 3 times in 4 and Haiku
  once. With `reasoning.effort: "none"`, and equally with
  `reasoning.enabled: false`, both used 0 reasoning tokens and returned a real title
  4 times in 4. On the injection fixture that title named the attack, "Attempted
  instruction override in conversation", instead of obeying it. Flash Lite's answers
  were the same under all three. `reasoning.effort` is the field chosen, because one
  value says "off" (`none`) and can also say "the minimum" for a later model that
  cannot turn reasoning off.
- **A throw inside the transport quarantines conversations (review).** Any failure of
  an extraction run counts as an attempt (`runExtractionWithAccounting`), three
  attempts quarantine the conversation, and nothing releases a quarantine. So the
  setting must never make a call fail.

## Scope

**1. The setting** (`ts/src/providers/config.ts`)

- `readExtractionReasoning(options)` reads `MEMORY_EXTRACTION_REASONING`, trimmed and
  lowercased, and returns `{ effort, invalid }`:
  - absent or empty: `{ effort: null, invalid: null }`, and nothing is sent;
  - one of the catalogue's efforts (`none`, `minimal`, `low`, `medium`, `high`,
    `xhigh`, `max`): `{ effort, invalid: null }`;
  - anything else, such as `off`: `{ effort: null, invalid: "<value as written>" }`.
- It never throws **(review)**. The module's numeric resolvers fail loudly, but inside
  the session-end hooks a failed call becomes an extraction attempt, and three of
  those quarantine a conversation for good (CR178). For this setting, an invalid value
  means nothing is sent, and the invalid value is shown where the operator looks
  (§3).
- Whether a given model honours a given effort is the operator's choice. The reader
  checks the vocabulary, not the model.

**2. The transport** (`ts/src/providers/llm.ts`)

- `CARRIES_EXTRACTION_REASONING: Readonly<Record<LlmRole, boolean>>` sits beside
  `LLM_TIMEOUT_TIER`. It is `true` for every role on the extraction pin and `false`
  for `consult`. A new role cannot compile without declaring it, where a check like
  `role !== "consult"` would let the next own-model role inherit the setting silently
  **(review)**.
- `complete()` adds `reasoning: { effort }` after `max_tokens` when the role carries
  it and `effort` is set. It reads per call, from the provider's env, as the model
  does. An invalid value sends nothing and throws nothing.
- The message envelope is untouched. The comment that says the body carries "nothing
  else, ever" is amended to name the one opt-in field.

**3. Where the setting shows**

- **`mirror runtime status`**, read through `readExtractionReasoning`, with no second
  parser **(review)**:
  - when set, the models line reads
    `Models: extraction=<pin>, reasoning=<effort>, embedding=<pin>`;
  - when invalid, `reasoning=invalid (<value>)`;
  - when unset, the line is byte for byte today's, so the frozen `runtime-status`
    golden, whose 27 scenarios pin it, needs no hand edit.
- **`mirror runtime diagnose`** gains an `attention` finding when the value is invalid
  **(review)**: `extraction_reasoning_invalid`. It names the value, the accepted
  efforts, and the consequence (no reasoning setting is sent), and it recommends
  fixing or unsetting the variable where it is set. No scenario of the frozen
  `runtime-diagnose` golden sets the variable, so that golden needs no edit either.
- **The eval run record** (`ts/evals/harness/persistence.ts`, `runner.ts`) gains
  `reasoning: string | null`: the effort in force for a model-backed eval (one that
  exports `EVAL_MODEL`), or null when it is unset, invalid, or the eval is
  prompt-free. The runner records it through its injectable io, beside the clock and
  the run id, so no module can forget to export it and the tests do not read the real
  environment **(review)**.
  - Records are written at `schema_version` 4, and older lines parse with the
    reasoning unknown.
  - The persistence comment, which says versions 2 and 3 share one field set, records
    the bump **(review)**.
- **`eval <name> --history`** prints `reasoning=<value | —>` after `model=`. A probe
  flip between two records whose model or reasoning differ is labelled
  `(model changed)` or `(reasoning changed)`, so it is not read as noise **(review)**.
  If the labelling grows beyond a few lines, it is cut, and the scratch home in the
  Navigator's route carries the protection alone.

**4. The docs**

- **`REFERENCE.md`** gains a Model Pins table after Intelligence Flags.
  - It lists `MEMORY_EXTRACTION_MODEL` and `MEMORY_EMBEDDING_MODEL` (neither is
    documented in REFERENCE today) and `MEMORY_EXTRACTION_REASONING`.
  - It says these are read like every setting: the real environment, the clone's
    `.env`, then `~/.config/mirror/env`, linking the configuration section. A shell
    export reaches only the runtimes started from that shell **(review)**.
  - It warns that on Flash Lite any effort but `none` turns its thinking on.
  - The API Keys row's "extraction (Gemini Flash)" becomes the extraction pin.
- **The model upgrade playbook** (`docs/process/development-guide.md`): step 2 names
  the reasoning override for a dry run, and step 4's invariant becomes "`prompt_hash`
  equal, `model` or `reasoning` changed, a probe flipped".

**5. The re-measurement** (this package, `evidence/<date>-reasoning-off/`)

- **The kit:** the baseline kit, with `run_model.sh` taking the reasoning setting and
  an output directory.
  - The trace times `ms_total` from the first run.
  - The kit never records request headers, so the `authorization` header carrying the
    API key cannot reach committed evidence. This is stated in the kit and in its
    README **(review)**.
- **The runs:** Flash Lite unset, as it ships, is the same-time control. Luna and
  Haiku run at `none`. Seven `eval --all` runs each, in parallel, each model with its
  own scratch `MIRROR_HOME` and with `DB_PATH` for reception's catalogue, read-only.
  The setting reaches the calls through the product's own transport, not through the
  trace. The README names the commit the runs ran at **(review)**.
- **The analysis:** `analyze.mjs` per model, and a comparison with the baseline's
  `report.json`. It reports:
  - per-probe results on clean runs;
  - title cut-offs;
  - the blocking probes, where a pass whose call ended at `finish=length` is vacuous
    and is excluded, not counted **(review)**;
  - reasoning tokens;
  - end-to-end latency p50 and p95 per surface, with the outliers listed by the
    upstream provider that served them **(review)**;
  - cost per suite, and projected on the development home's 30-day mix.
- **Pass criteria (review):**
  1. Each candidate at `none` passes all six blocking probes (extraction, summary,
     title, tags, shadow, and consolidation injection) in 7 of 7 clean runs, none of
     them vacuous.
  2. No candidate call at `none` ends at `finish=length`, or each one that does is
     named with its probe.
  3. The four probes Flash Lite has always failed are reported per candidate as
     counts, against the reasoning-on baseline.
  4. Flash Lite passes and fails the same probes as in its baseline. A probe that
     moves by more than one run in seven makes the run suspect: it is repeated once
     before any comparison is drawn.
- **A README** carries the comparison and what it shows, and the story's index
  records the result. The baseline cost $0.17 for 21 runs, and this one should cost
  about the same.

## Non-Goals

- Changing `DEFAULT_EXTRACTION_MODEL` or giving it a default reasoning setting. That
  is US3, on TS2's evidence.
- Recording the reasoning setting in the `llm_calls` ledger. That belongs to US3,
  where the default changes **(review)**.
- The comparison on the Navigator's own conversations (TS2).
- Configuration errors counting as extraction attempts, and the missing release for a
  quarantined conversation, beyond this one setting: CR178 **(review)**.
- Prompts, `temperature`, and per-role token budgets. If a title is still cut off at
  `none`, it is named, and the budget becomes a Navigator decision.
- A `low` arm, a reasoning setting per role, or a trace built into the eval harness.
  Each waits for evidence and a Navigator decision **(review)**.

## Acceptance Behavior

```text
Given MEMORY_EXTRACTION_REASONING is unset
When any extraction-family call is made
Then the request body is exactly today's: model, messages, temperature, max_tokens
And mirror runtime status prints today's models line, byte for byte

Given MEMORY_EXTRACTION_REASONING=none
When an extraction-family call is made, reception included
Then the body also carries reasoning: { effort: "none" }
And a consult call carries no reasoning field

Given MEMORY_EXTRACTION_REASONING=off
When an extraction-family call is made
Then the call is made without a reasoning field, and nothing throws
And mirror runtime status prints reasoning=invalid (off)
And mirror runtime diagnose reports extraction_reasoning_invalid, naming the accepted efforts

Given a model-backed eval runs with the setting at none
When its record is written and eval <name> --history is read
Then the record carries reasoning "none" at schema_version 4
And the history line shows model=<model> reasoning=none
And a probe flip across a model or reasoning change is labelled as such

Given Luna and Haiku at MEMORY_EXTRACTION_REASONING=none, and Flash Lite as it ships alongside
When eval --all runs seven times per model
Then each candidate passes all six blocking probes in 7 of 7 clean runs, none vacuous
And no candidate call ends at its token budget, or each one that does is named
And Flash Lite's standing failures are counted per candidate against the baseline
And Flash Lite's own results match its baseline, or the run is repeated
And the comparison is written to this story's evidence, at the commit it ran on
```

## Validation Route

**Automated.** Tests first, in the existing suites:

- **Reader:** unset, empty, each effort, case and whitespace; `off` returns it as
  invalid and does not throw.
- **Request body:**
  - the key-set test (`llmLive.test.ts:114`) stays green unchanged, which shows
    "unset" is today's body;
  - with `none`, the field appears for `extraction` and for `reception`, and never
    for `consult`;
  - with `off`, no field and no throw.
- **The role table:** exhaustive by type. A missing role fails `npm run typecheck`.
- **Status line:**
  - unset: the frozen `runtime-status` golden passes unchanged, and the goldens
    README gains no row;
  - set and invalid: unit tests.
- **Diagnose:** the finding appears for an invalid value and not otherwise, and the
  frozen `runtime-diagnose` golden passes unchanged.
- **Eval record:**
  - a model-backed record carries the setting, recorded through the runner's io, and
    a prompt-free record carries null;
  - `schema_version` is 4, and a v3 line parses;
  - `--history` prints the field and labels a flip across a model or reasoning
    change.
- **Commands:** `npm test`, `npm run typecheck`, `npm run lint`,
  `node ts/scripts/checkDocLinks.ts`, and `node ts/scripts/checkRetiredSurfaces.ts`
  with the new files staged (the sweep reads `git ls-files`).

**Navigator route:**

1. Check the status line three ways:
   - `mirror runtime status`: today's models line;
   - `MEMORY_EXTRACTION_REASONING=none mirror runtime status`: `reasoning=none`;
   - `MEMORY_EXTRACTION_REASONING=off mirror runtime status`: `reasoning=invalid (off)`.
2. `MEMORY_EXTRACTION_REASONING=off mirror runtime diagnose` reports
   `extraction_reasoning_invalid`, naming the accepted efforts.
3. Run one module on a candidate in a scratch home, so the development home's eval
   history keeps no candidate record **(review)**:

   ```bash
   export MIRROR_HOME="$(mktemp -d)/vinicius-dev"
   MEMORY_EXTRACTION_MODEL=anthropic/claude-haiku-5.5 MEMORY_EXTRACTION_REASONING=none \
     npm run eval -- title_tags
   npm run eval -- title_tags --history 1
   unset MIRROR_HOME
   ```

   The run passes 7/7, `title-injection-resisted` shows a real title in its notes, and
   the history line reads `model=anthropic/claude-haiku-5.5 reasoning=none`.
4. Read the comparison in `evidence/<date>-reasoning-off/README.md`.

- **Expected observation:** the setting is visible where an operator looks, and a
  typo is reported, not fatal. The candidates' titles come back whole, and the
  injection is resisted by a real title.
- **Pass condition:** steps 1 to 3 read as above, and the comparison meets the four
  pass criteria in Scope §5.
- **Fail condition:**
  - reasoning still spent at `none`;
  - a candidate rejecting the field;
  - a blocking probe failing, or passing only vacuously;
  - a title cut off and not named;
  - an unset setting changing a request body or the status line;
  - an invalid value making a call fail.

E2E decision: required. The re-measurement against the live provider is the
end-to-end route.

## Implementation Contract

- Use TDD or characterization tests for behavior changes when testable.
- Keep changes scoped to `CV9.DS9.TS1`:
  - `ts/src/providers/config.ts` and `llm.ts`;
  - `ts/src/runtime/status.ts` and `diagnose.ts`;
  - the eval harness's `runner.ts` and `persistence.ts`;
  - their tests;
  - `REFERENCE.md` and the development guide;
  - this package.
- Do not use git add .; commit only story-scoped files. DS9's opening (its package,
  the baseline evidence, and the roadmap rows) and CR178's capture are committed
  first, separately from TS1.
- Follow the project's development guide: docs/process/development-guide.md.

## Stop Conditions

- scope_change_detected
- plan_rule_conflict
- failing_required_check_without_clear_fix
- navigator_decision_needed
- a candidate rejects the `reasoning` field, or still reasons at `none`
- a candidate fails a blocking probe at `none`: that configuration is recorded as not
  shippable for that model, and the result goes to the Navigator **(review)**
- at `none`, a candidate loses a fix it had with reasoning on for one of Flash Lite's
  standing failures. The options go to the Navigator (`low` with a larger title
  budget, a per-role setting as a Change Request, or accepting the loss), and no
  further arm runs without that decision **(review)**
- Flash Lite moves from its baseline twice in a row **(review)**
- a title is still cut off at `none`: named, and the budget goes to the Navigator
- the re-measurement's spend passes $2
- the change would touch a prompt, the default pin, or `temperature`

## Approval Gate

- active checkpoint: `after_plan`
- pending confirmation: `navigator_approval`
- implementation remains blocked until Navigator approval.
