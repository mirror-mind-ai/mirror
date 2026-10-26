[< CV9 Mirror Mind 1.0](../index.md)

# CV9.DS9 — The Extraction Model, Chosen by Measurement

**Status:** 🟢 In Progress
**Type:** Delivery Story
**Source:** the Navigator's request in a Builder session on 2026-10-26, after a
baseline measurement of the current pin against two candidates
([evidence](evidence/2026-10-26-baseline/README.md)).
**User-visible outcome:** The model behind memory extraction, titles, summaries, tags,
reception, journal classification, shadow, and consolidation is the one that measured
best, on the eval suite and on the Navigator's own conversations, and its reasoning
can be turned off or down. If the pin moves, the release notes say what a user sees
and how the environment override rolls it back.

---

## What This Is

One pin serves every extraction-family call: `DEFAULT_EXTRACTION_MODEL` in
`ts/src/providers/config.ts`, `google/gemini-2.5-flash-lite`, overridable with
`MEMORY_EXTRACTION_MODEL`. Flash Lite dates from mid-2025. Two newer models cost
about the same on OpenRouter: `openai/gpt-6-luna` and `anthropic/claude-haiku-5.5`,
both $0.10/M input and $0.50/M output, against Flash Lite's $0.10 and $0.40. The
question is whether either produces better results, and at what cost in latency,
reliability, and money. The
[model upgrade playbook](../../../../process/development-guide.md#model-upgrade-playbook)
treats a pin as a versioned dependency and a swap as a migration. This Delivery
Story is that migration, measured before it is decided.

### The baseline, measured 2026-10-26

Seven full `eval --all` runs per model, the three models in parallel. Each model had
its own eval history (a scratch `MIRROR_HOME`, with reception reading the development home's
persona catalogue read-only through `DB_PATH`), and a preload traced every call:
status, tokens, reasoning tokens, finish reason, and latency. The repository and the
development home's eval history were untouched. The measurement cost $0.17.

Probes whose results differed, counting only runs that no rate limit or truncation
touched:

| Probe | Flash Lite | Luna | Haiku |
|---|---|---|---|
| extraction/two-pass-dedup | 0/6 | 2/7 | 7/7 |
| extraction/conversation-summary | 0/6 | 7/7 | 6/7 |
| reception/open-existential-no-persona | 0/6 | 5/7 | 6/7 |
| title_tags/title-trivial-empty | 0/7 | 7/7 | 7/7 |
| extraction/descriptor-quality | 6/6 | 7/7 | 6/7 |

Every other probe passed on every model in every clean run, including the blocking
injection probes of extraction and tags.

| | Flash Lite | Luna | Haiku |
|---|---|---|---|
| HTTP errors | 65 of 406 attempts, all 429 from Google AI Studio; 16 requests failed after retries | none in 357 | none in 357 |
| Calls that reasoned | 0% | 95% | 59% |
| Title calls cut off at the 40-token budget | 0 of 28 | 8 of 28 | 5 of 28 |
| Input tokens for the same text | 1.00× | 0.98× | 1.53× |
| Reception latency, p50 / p95 | 0.64 / 0.96 s | 2.6 / 4.5 s | 1.5 / 3.0 s |
| Extraction latency, p50 / p95 | 0.58 / 1.7 s | 2.2 / 4.8 s | 1.3 / 4.0 s |
| The development home's last 30 days of calls, priced | $0.61 (actual) | $0.59–0.61 | $0.91–0.97 |

What it showed:

1. **Both candidates fix most of the four probes Flash Lite has failed in every
   recorded run,** and Haiku fixes all four.
2. **Both candidates reason by default, and the transport cannot say otherwise.**
   `LiveLlmProvider` sends `model`, `messages`, `temperature`, and `max_tokens`, and
   nothing else. Reasoning spends the title call's 40-token budget. A title cut off
   empty reads as a trivial conversation, so the conversation is silently left
   untitled. It also means the blocking `title-injection-resisted` probe passed
   without a real answer in most candidate runs: Luna 4 of 7 and Haiku 5 of 7 were
   truncated to empty.
3. **Neither candidate accepts `temperature`.** OpenRouter's catalogue lists no
   `temperature` parameter for either, so the 0.2 and 0.7 the pipeline sends are
   dropped. Both accept `reasoning.effort`, with `none` among the efforts.
4. **Flash Lite is rate-limited upstream.** 16% of its attempts drew HTTP 429 from
   Google AI Studio, and the development home (`vinicius-dev`) logged a reception
   `transport_failed kind=rate_limit` on 2026-10-25. The production home's log
   (`vinicius`) shows none.
5. **Cost is immaterial at this volume.** Haiku's tokenizer counts 1.53× the input
   tokens Flash Lite does for the same text, so it costs about half again as much.

Limits: the suite is about fifty synthetic probes built to catch regressions. It says
"no regression, standing failures fixed", not "better memories". Latency was measured
end to end only in runs 6 and 7, on short eval inputs, while real prompts run from 2k to
21k tokens (the development home's ledger).

## Candidate Stories

Ordered so the measurement the decision rests on is clean before it is extended:
reasoning off first, so the candidates are not judged on a budget they spend
thinking; the Navigator's own conversations second; the decision last.

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| CV9.DS9.TS1 | Extraction calls carry a reasoning setting, and the candidates are re-measured with reasoning off | Technical Story | `MEMORY_EXTRACTION_REASONING` sends OpenRouter's `reasoning.effort` on every extraction-family call, and leaving it unset sends today's request unchanged; the eval history records the setting with the model; `eval --all` seven times per candidate with reasoning off, or at the lowest effort a model accepts: titles no longer cut off, the blocking title-injection probe answered by a real title, and quality, latency, and cost compared with the reasoning-on runs and Flash Lite's baseline Done 2026-10-26: `MEMORY_EXTRACTION_REASONING` sends `reasoning.effort` on every call on the extraction pin, never on `consult`; unset leaves every request as it was, and a value that is not an effort is ignored and shown by `runtime status` and `runtime diagnose` (CR178); eval records carry it at schema 4. At `none`, both candidates pass all six blocking probes 14/14 with real answers and none of 1,428 calls is cut off; Luna keeps every fix and improves two; Haiku loses `conversation-summary` (6/7 → 4/14), accepted as measured. Both go to TS2 at `none` | ✅ Done |
| CV9.DS9.TS2 | The candidates judged on the Navigator's own conversations | Technical Story | With the Navigator's consent (any production-home conversation, sent to OpenAI, Anthropic, Google, and Moonshot AI), 24 ended conversations replayed through the product's own memories, tasks, title, summary, and tags: Flash Lite as it ships, Luna and Haiku at `none`, one process per model; ranked blind by Kimi K3.1 Pro, a model from a fourth family, and calibrated by the Navigator on six; per-call latency, reliability, and cost; a recommendation by a rule fixed in the plan, with evidence that holds no content | 🟢 In Progress |
| CV9.DS9.US3 | The extraction pin moves, or stays, on the evidence | User Story | The decision and its evidence in the decisions log. If the pin moves, `DEFAULT_EXTRACTION_MODEL`, its reasoning default, and `MODEL_PRICES` change together, `eval --all` is green on the new pin as the release gate requires, and the release notes say what a user sees and how to roll back. If it stays, Flash Lite's rate-limit exposure is captured as a Change Request | 🟡 Planned |

## Non-goals

- A model per surface. One pin serves every extraction-family call. If the evidence
  favors different models for different surfaces, that is raised as a Change Request,
  not built here.
- Prompt changes. The prompts stay fixed so every difference is attributable to the
  model and its reasoning setting, the playbook's `prompt_hash` invariant.
- The embedding model and `consult`'s catalogue.
- Provider routing or fallback for Flash Lite's rate limits, unless US3 keeps Flash
  Lite.
- Making the measurement kit an eval-harness feature. It stays evidence in this
  package; a trace built into the harness is a candidate for later.

## Done Condition

DS9 is done when:

- every extraction-family call can carry a reasoning setting, and leaving it unset
  sends today's request;
- both candidates are measured with reasoning off on the full suite, seven runs each,
  and on the Navigator's own conversations, judged blind;
- the pin decision is in the decisions log with its evidence, and if the pin moved,
  the pin, its reasoning default, and the price table changed together behind a green
  `eval --all`, with release notes.
