[< Story](index.md)

# Test Guide — CV9.DS9.TS1

## Automated Validation

Written before the code they cover:

| Behavior | Where |
|---|---|
| `readExtractionReasoning`: unset and empty send nothing; each effort (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) is accepted, regardless of case and whitespace; `off` comes back as invalid and nothing throws | `ts/test/providers/config.test.ts` |
| Unset sends today's body: the key-set test at line 114 stays green unchanged | `ts/test/providers/llmLive.test.ts` |
| At `none`, `reasoning: { effort: "none" }` is in the body for `extraction` and `reception`, and absent for `consult`; at `off`, no field and no throw | `ts/test/providers/llmLive.test.ts` |
| The role table covers every `LlmRole`; a missing role fails the typecheck | `npm run typecheck` |
| The status models line: unset, byte for byte today's, with the frozen golden unedited and no row added to the goldens README; `reasoning=none` when set; `reasoning=invalid (off)` when invalid | `ts/test/runtime/status.test.ts`, `ts/test/goldens/runtime-status.golden.json` |
| `extraction_reasoning_invalid` appears only for an invalid value; the frozen golden passes unedited | the `runtime diagnose` tests, `ts/test/goldens/runtime-diagnose.golden.json` |
| The eval record carries `reasoning` for a model-backed eval and null for a prompt-free one, recorded through the runner's io, at `schema_version` 4 | `ts/test/evals/runner.test.ts` |
| A v3 line still parses | `ts/test/evals/persistence.test.ts` |
| `--history` prints `reasoning=` and labels a flip across a model or reasoning change | `ts/test/evals/runner.test.ts` |

Commands, all green:

```bash
npm test
npm run typecheck
npm run lint
node ts/scripts/checkDocLinks.ts
git add <story files> && node ts/scripts/checkRetiredSurfaces.ts   # the sweep reads git ls-files
```

## E2E Decision

required. The re-measurement runs `eval --all` against the live provider through the
product's transport: Flash Lite as it ships (the control), and Luna and Haiku at
`MEMORY_EXTRACTION_REASONING=none`, seven runs each. Its evidence is in
`evidence/<date>-reasoning-off/`, which names the commit the runs ran at. The kit
records no request headers.

Pass criteria, from the plan:

1. Each candidate passes all six blocking probes in 7 of 7 clean runs. A pass whose
   call ended at `finish=length` is vacuous and does not count.
2. No candidate call ends at `finish=length`, or each one that does is named with its
   probe.
3. The four probes Flash Lite has always failed are reported per candidate, against
   the reasoning-on baseline.
4. Flash Lite passes and fails the same probes as in its baseline. A probe moving by
   more than one run in seven means the run is repeated.

## Navigator Validation

1. Check the status line three ways:

   ```bash
   mirror runtime status | grep Models
   MEMORY_EXTRACTION_REASONING=none mirror runtime status | grep Models
   MEMORY_EXTRACTION_REASONING=off mirror runtime status | grep Models
   ```

   - **Expected:** today's line, then `reasoning=none`, then `reasoning=invalid (off)`.
2. Run diagnose with an invalid value:

   ```bash
   MEMORY_EXTRACTION_REASONING=off mirror runtime diagnose
   ```

   - **Expected:** an `extraction_reasoning_invalid` finding naming the accepted
     efforts.
3. Run one module on a candidate in a scratch home, so the production eval history
   stays clean:

   ```bash
   export MIRROR_HOME="$(mktemp -d)/vinicius-dev"
   MEMORY_EXTRACTION_MODEL=anthropic/claude-haiku-5.5 MEMORY_EXTRACTION_REASONING=none \
     npm run eval -- title_tags
   npm run eval -- title_tags --history 1
   unset MIRROR_HOME
   ```

   - **Expected:** 7/7 passed, `title-injection-resisted` with a real title in its
     notes, and a history line with `model=anthropic/claude-haiku-5.5 reasoning=none`.
4. Read `evidence/<date>-reasoning-off/README.md`.
   - **Expected:** the four pass criteria answered, with latency per surface, its
     outliers by provider, and cost.

- **Pass:** steps 1 to 3 as expected, and the comparison meets the four criteria.
- **Fail:** any of these:
  - reasoning still spent at `none`;
  - a candidate rejecting the field;
  - a blocking probe failing, or passing only vacuously;
  - a title cut off and not named;
  - an unset setting changing a request body or the status line;
  - an invalid value making a call fail.

## Validation Evidence

Pending implementation and validation.
