suite_run_id: e5f63110-0c83-4860-abab-8f8e417f85a0
model: google/gemini-2.5-flash-lite  reasoning: —  schema: 4
started: 2026-10-28T22:10:02.668Z

| Module | prompt_hash | Probes passed | Score / threshold | Result | Failed probes |
|---|---|---|---|---|---|
| consolidate | 12b16965ac6c | 5/5 | 1.00 / 0.8 | pass | — |
| conversation_summary | 5964c3971639 | 1/1 | 1.00 / 0.8 | pass | — |
| extraction | 98196244a3f9 | 9/11 | 0.82 / 0.8 | pass | two-pass-dedup, conversation-summary |
| journal | 8dba00e772ee | 5/5 | 1.00 / 0.8 | pass | — |
| proportionality | a3301ec56e93 | 5/5 | 1.00 / 0.8 | pass | — |
| reception | 730efb306370 | 10/12 | 0.83 / 0.8 | pass | open-existential-no-persona, shadow-touch-vague-discomfort |
| retrieval_relevance | — | 19/19 | 1.00 / 0.95 | pass | — |
| shadow | 94c1229465b6 | 5/5 | 1.00 / 0.8 | pass | — |
| title_tags | 6d4df0e1ce76 | 6/7 | 0.86 / 0.8 | pass | title-trivial-empty |

suite: 9/9 modules passed — PASS
