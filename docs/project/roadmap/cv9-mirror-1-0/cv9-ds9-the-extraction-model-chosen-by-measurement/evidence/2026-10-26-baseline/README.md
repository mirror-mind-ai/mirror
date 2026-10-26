[< CV9.DS9](../../index.md)

# Baseline measurement — 2026-10-26

The measurement CV9.DS9 was opened on: the extraction pin,
`google/gemini-2.5-flash-lite`, against `openai/gpt-6-luna` and
`anthropic/claude-haiku-5.5`, on the request the transport sends today (no
`reasoning` field, `temperature` and `max_tokens` as each caller sets them). The
results are summarized in the [Delivery Story](../../index.md#the-baseline-measured-2026-10-26).

## How it ran

1. **Request shape** (`shape.mjs`): two direct calls per model with the body
   `LiveLlmProvider.complete()` sends, to see whether each model accepts it, whether
   it reasons by default, and how it tokenizes the same text.
2. **The suite** (`run_model.sh`, `run_after.sh`): `eval --all` seven times per model,
   the three models in parallel, each run as
   `node --env-file-if-exists=.env --import shim.mjs ts/evals/harness/cli.ts --all`
   with:
   - `MEMORY_EXTRACTION_MODEL` set to the model;
   - `MIRROR_HOME` set to a scratch directory per model, so each model's eval history
     is its own and the production history is untouched;
   - `DB_PATH` set to the production database, which reception's eval reads
     read-only for the persona and journey catalogue;
   - `MM_TRACE` naming the trace file the preload writes.
3. **The trace** (`shim.mjs`): a preload that wraps `fetch` and appends one line per
   chat-completions attempt: model, status, tokens, reasoning tokens, finish reason,
   cost, the first 120 characters of the prompt, and the answer. It forwards the
   request untouched and reads a clone of the response.
4. **The analysis** (`analyze.mjs <runs-dir> [-v]`): joins each module's eval record
   (by its start and end time) with the calls made inside it. A module run is
   *dirty* when a request in its window failed after retries or was cut off at
   `max_tokens`; quality is counted on clean runs only. Writes `report.json`.

## What to know before reading the numbers

- **Latency is end to end only from run 6 on.** OpenRouter sends response headers
  before the completion exists, so the preload's first version timed the headers
  (`ms`). Runs 6 and 7 carry `ms_total`, timed when the body has arrived; the
  analysis reports latency from `ms_total` alone.
- **Flash Lite's dirty runs are rate limits**, HTTP 429 from Google AI Studio, not
  model failures. They are counted as operational failures and kept out of quality.
- **Some candidate passes are empty answers.** The title probes that expect an empty
  title, or no injected title, pass when reasoning spends the 40-token budget and the
  title comes back empty. The Delivery Story maps those per probe.
- `analyze.mjs` is the Node port of the script the analysis first ran with (Python
  is retired from this repository). It writes the same `report.json`; printed values
  that end in exactly .5 ms round up where the original rounded half to even.
- The traces themselves (1.4 MB) are not kept. `report.json` holds what was derived
  from them, and `eval-history/` holds every eval record of the 21 runs.

## Files

| File | What it is |
|---|---|
| `shape.mjs` | The request-shape check |
| `shim.mjs` | The fetch-tracing preload |
| `run_model.sh` | Runs `eval --all` for one model, runs N to M |
| `run_after.sh` | Waits for runs 1–5, then runs 6–7 with the corrected preload |
| `analyze.mjs` | Quality and operations analysis |
| `report.json` | The analysis output for the 21 runs |
| `prod30.json` | Production extraction-family calls in the 30 days before 2026-10-26, per role: count, mean prompt and completion tokens, cost |
| `eval-history/<model>/` | Every eval record of the seven runs per model |

The scripts carry the paths they ran with (`/tmp/mm-model-eval`, the author's
checkout); a re-run names its own.
