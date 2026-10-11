# Review — CV22.DS10.TS3

## Status

Reviewed

## Debt Findings

- Two findings, both named during the work rather than discovered at closure. (1) THE HARNESS RECORDS NO SPEND: the approved Plan promised actually-spent in validation.md, but eval probes call the provider without a ledger hook, so the full live suite wrote zero rows to llm_calls (verified by query). Inherited from the Python harness, which recorded eval spend nowhere either. The provider response already carries what the ledger hook consumes, so a per-run spend total is small and contained. (2) RECEPTION'S CATALOGUE LOADER MIRRORS THE PYTHON EVAL, NOT TS PRODUCTION: it reads content[:200] plus routing_keywords, while resolveMirrorDefaults prefers a generated descriptor when one exists. Deliberate at plateau 4, because matching the eval is what kept the 70/70 plateau-5 diff meaningful, but it means this module measures something production does not quite do. Debt PAID by this story: D-017, the averaged injection score, is fixed — six probes are now blocking and an obeyed injection fails its module at any score. Debt whose SUBJECT was retired: D-005, the stale routing fixtures, retired with the module, with the absence of a successor gate named in the engineering principles rather than assumed covered.

## Debt Decision

defer

## Defer Reason

Neither finding affects what the gate now proves. Behavior parity is established at 70/70 probe verdicts and the D-017 fence hole is closed, which was the story's purpose. Paying either now reopens a complete story for work that is better done where it belongs: the spend ledger is a harness feature with its own small design (which response fields, which sink, how the suite reports a total), and changing reception's loader immediately after establishing parity would move the numbers for a reason unrelated to the port.

## Revisit Trigger

Finding 1: the first time a run's cost is questioned, or before any model-pin migration, where cost per run is part of the decision. Finding 2: the next story that touches reception routing or descriptor generation.

## Missing Decision

- none

## Durable Ledger Entries

The debt-review contract asks whether a durable ledger entry is required. It
is: a deferral that lives only in a closed story's `review.md` is a deferral
nobody will find. Both findings are recorded in
[the debt ledger](../../../../debt.md) with their revisit triggers.

| finding | ledger | status |
|---|---|---|
| The harness records no spend | **D-020** | Carried |
| `reception`'s loader diverges from production; routing quality has no gate | **D-021** | Carried |

Two existing entries were resolved by this story rather than left to drift:

- **D-017** (injection probes averaged into a module score) → **Paid**. Its
  closure condition was "an obeyed injection probe fails its module and the
  suite regardless of the aggregate score, in whichever harness owns the
  release gate, with a test proving the failure path." All three parts hold.
- **D-005** (stale `routing` fixtures) → **Dropped**. Its revisit trigger
  explicitly handed the disposition to this story, which retired the module.
  The retirement is not a fix, so the successor gap is carried as D-021 rather
  than allowed to close silently.

## Handoff Review — narrowed security-engineer pass (2026-09-22)

The [collaboration strategy](../../collaboration-strategy.md) requires a second
panel checkpoint after Validation, and the Plan committed to it. The Navigator
chose a **narrowed pass** over the full panel: security-engineer alone, on the
two things the Plan review's five personas had not examined — the blocking
semantics and the `assertedInOwnVoice` port — since that is the one lens with a
genuine claim on a change to a security gate that had never looked at it. The
narrowing is a recorded decision, not a default.

**Checked and found correct:** the heuristic is verbatim and golden-pinned per
marker; every one of the six call sites uses the bucket Python used
(zero-tolerance for title and tags, distancing-aware for summary, the
consolidation proposal, and the shadow rationale+proposal pair) with sentinel
order preserved; `blocking` is hard-coded in source and never read from the
fixture at runtime, so a tampered fixture cannot un-block a probe; a throwing
probe is recorded as failed, which is fail-closed on the blocking path; and the
OpenRouter client redacts the key before any error propagates, so
`probe raised: <message>` cannot carry it into the history log.

**Findings, classified:**

| finding | class | disposition |
|---|---|---|
| Every blocking probe reads "resisted" when the provider is unreachable — all six fenced functions fail soft to `""`/`[]`/`null`, none of which contain a sentinel | non-blocking debt, **medium** | **D-022**, deferred |
| Nothing structurally guarantees a blocking probe's captured fixture still contains the attack its sentinels search for | non-blocking debt, low | folded into **D-022** |
| The heuristic can be fooled by a distancing marker in an unrelated clause | accepted boundary | D-010, inherited, out of scope for a port |
| The harness reads the real mirror home and real key | accepted boundary | same posture as every runtime path; DS8 redaction and the home resolver's guards apply |
| Probe notes carry model output into the history log | accepted boundary | inherited; personal-machine scope; no new exposure |
| Once `inconclusive` exists, does it block, warn, or pass? | question for a later plateau | belongs with D-022's fix |

**Verdict:** no blockers. The delivered gate is strictly stronger than the one
it replaced and the 70/70 parity evidence stands. D-022 is the strongest
finding and is still not a blocker — but it is the one that changes what a
green gate is allowed to mean, and it is recorded before Done, not after.

## Third Deferral — D-022

Navigator decision 2026-09-22: **defer**, revisit trigger *the first blocked or
inconclusive suite run, or before any story that treats a green gate as
injection-resistance evidence*. Verification when paid:
`OPENROUTER_API_KEY=invalid npm run eval -- title_tags` must not pass; today it
does.

**A runtime limit found on the way.** `build review-item` refused to record
this third deferral: a closed Debt Review cannot be re-entered, which the skill
does not document. The refusal was rendered as an `IMPLEMENTATION_GUARD` whose
surface drew the flow at `◉ Implement` and claimed "Debt Review requires passed
Validation" — both false; the cursor was intact at `review_complete`. The
decision is therefore recorded here and in the ledger, which are the durable
authority. The misleading surface belongs with RS001's runtime-trust findings.
