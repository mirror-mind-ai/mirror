[< Story](index.md)

# Test Guide — CV22.DS7.US4

## Test Matrix

| Surface | Required evidence |
|---------|-------------------|
| `mirror load` | Explicit/reception/sticky/keyword resolution order; context section order and omission; transition/banner/detection rendering; context-only and session-bound paths |
| `mirror deactivate` | Missing-session warning/no-op; one-session-only deactivation |
| `mirror log` | Muted no-op; session resolution; assistant message insert; first-sentence title and 60-character truncation |
| `mirror journeys` | Active filtering, ordering, and exact Markdown rows |
| `mode activate` | Global and session-scoped state, normalized journey, exact stdout |
| `mode deactivate` | Global/session clearing without sticky-default mutation |
| `mode status` | Default Mirror Mode, global fallback, session precedence, exact stdout |
| Reception | Successful replay, empty query, malformed JSON, missing/wrong field types, provider failure, fail-soft fallback, metadata-only LLM logging |
| Context | identity gating, org, persona, knowledge, selected journey only, shadow provenance, attachment threshold/scope |
| Extension boundary | no-binding TS path; explicit/sticky matching binding; conservative reception-selected binding; complete Python fallback with provider output preserved |
| Front door | deterministic TS route, replay-gated TS route, live-reception Python fallback, matching-extension Python fallback, independent reversibility, payload redaction |

## Golden And Database Parity

For each command probe, compare:

- stdout exactly;
- stderr exactly after removing intentional ANSI normalization only where the existing
  parity harness already does so;
- exit status;
- affected `runtime_sessions`, `conversations`, and `messages` rows with generated IDs and
  timestamps normalized;
- unchanged unrelated rows and unchanged journey ancestry.

Fixtures must be synthetic and scrubbed. No production database, transcript, identity
content, provider authorization, or absolute personal path may be committed.

## Selected-Journey Isolation Cases

Create `root → parent → selected → child` plus an unrelated journey. Give every journey
unique context and attachments. Loading `selected` must include only `selected` journey
identity/attachments. Parent and child names may appear only where an explicitly tested
navigation surface requires them; Mirror context composition must not inherit them.

## Replay Cases

The replay fixture must cover:

1. persona and journey selected;
2. no selection with identity/shadow false;
3. identity and shadow true;
4. malformed JSON;
5. wrong field types;
6. missing `reception` replay response;
7. provider exception;
8. available extension bindings with reception-selected persona/journey.

Cases 4–7 must preserve Python's fail-soft deterministic fallback and must not trigger a
live call. Case 8 must choose the complete Python command path conservatively until TS2.

## Automated Validation

Run the exact commands recorded during implementation, including at minimum:

```bash
cd ts
npm test
```

and from the repository root:

```bash
uv run pytest <focused Python characterization tests>
uv run python scripts/check_oracle_drift.py
```

Also run the repository's required lint/type/full-test commands from the development guide.
Record exact commands and results in `validation.md`; do not replace them with a generic
“tests passed.”

## E2E Decision

**Required.** Use the TypeScript front door against a disposable Mirror home and explicit
session. Exercise:

```text
mode status
mirror load --journey <selected> --query <fixture-query> --session-id <session>
mirror log <fixture-summary> --session-id <session>
mirror deactivate --session-id <session>
mode status --session-id <session>
```

Run the equivalent Python oracle flow against an independent copy of the same fixture.
No live provider call is allowed; configure reception replay or disable reception according
to the probe. Repeat `mirror load` after installing a synthetic bound extension and prove
that the complete command falls back to Python with its extension section intact.

## Navigator Validation

Expected observation:

- Mirror Mode transition and context remain familiar;
- explicit journey/persona win over automatic routing;
- reception replay selects the expected context and malformed replay fails soft;
- only the selected journey contributes context;
- logging updates the disposable conversation;
- deactivation affects only the chosen session;
- the extension-free front-door log says `ts` without containing query, summary, identity,
  or transcript;
- a matching extension binding reports the bounded Python fallback without logging the
  binding target or provider output.

Pass condition: exact rendered/exit parity and equivalent normalized DB state for every
core branch, with selected-scope isolation, redaction, and matching-extension fallback
proven.

Fail condition: output drift, missing/reordered core context, ancestor/descendant leakage,
session leakage, dropped attachment context, any matching extension entering the TS path,
lost extension output during fallback, live provider use, unredacted payloads, or
unexplained DB differences.

## Validation Evidence

Pending implementation and Navigator validation.
