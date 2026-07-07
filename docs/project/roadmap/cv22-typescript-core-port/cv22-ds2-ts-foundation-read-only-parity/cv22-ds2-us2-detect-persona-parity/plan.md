[< Story](index.md)

# Plan — CV22.DS2.US2 `detect-persona` Parity

## Pull

Pulled at User Story level as the first slice of Baton 2 (Vinícius) in the
[CV22 collaboration strategy](../../collaboration-strategy.md). Baton 1 (Alisson)
closed `search` parity (US1) and left a reusable, redacted real-DB-copy harness
(TS3). This story applies the same standard to `detect-persona`.

## Prepare

The DS2 machinery is mature: a Python-driven synthetic golden generator plus a TS
verifier (TS2), a durable ranker pattern (US1), and a redacted real-DB-copy
harness portable through a synthetic demo DB (TS3).

`detect-persona` is a clean next slice because the router is **pure and
deterministic**: `IdentityService.detect_persona` reads only DB-backed routing
metadata — no clock, no embeddings. So the golden contract is simpler than
`search` (nothing to freeze), and the parity metric is exact behavioral equality
(persona keys, hit-count scores, match type), not the ordered-id-with-drift
metric the ranker needs.

The Python oracle behavior to reproduce:

1. normalize the query (lowercase; `-`/`_` → space; strip non-alphanumeric to
   space; collapse whitespace; trim);
2. empty normalized query → `[]`;
3. for each persona row (`layer='persona'`, parsed `metadata.routing_keywords`):
   a single-word keyword matches a whole query token (set membership); a
   multi-word keyword — including one that becomes multi-word after normalization,
   e.g. `savings-plan` → `savings plan` — matches as a raw substring;
4. keep personas with `hit_count >= threshold` (default `1.0`), scored `float(hit_count)`;
5. sort by score descending, then persona key ascending.

## Scope

- Add `ts/src/persona/detectPersona.ts` (`normalizeRoutingText`, `detectPersona`),
  exported from `ts/src/index.ts`.
- Add `ts/parity/generate_persona_golden.py`: seed synthetic persona rows into a
  temp DB, run the real oracle over branch-covering probes, commit
  `ts/test/goldens/detect-persona.golden.json`.
- Add `ts/test/persona/detectPersona.test.ts`: golden parity + focused unit tests.
- Extend the reusable harness:
  - `ts/src/parity/realDbCopyParity.ts` gains `PersonaProbe`, optional
    `persona_rows`/`persona_threshold`/`persona_probes`, and `evaluatePersonaProbes`;
  - `ts/parity/real_db_copy_verify.ts` renders a `== detect-persona ==` section;
  - `ts/parity/real_db_copy_parity.py` reads persona rows from the copied DB and
    derives probes from each persona's own keywords (guaranteed real hits) plus a
    no-match probe;
  - `ts/parity/generate_demo_memory_db.py` seeds synthetic persona rows.
- Add the persona golden to the CI determinism gate in `.github/workflows/tests.yml`.

## Non-Goals

- Do not route `detect-persona` or any CLI/runtime call to TS yet (CV22.DS3).
- Do not port journeys or memory listing (CV22.DS2.US3).
- Do not change normalization, matching, scoring, or sort semantics.
- Do not commit or mutate a real production `memory.db`.

## Implementation Approach

1. Read Python `IdentityService.detect_persona` and `_normalize_routing_text`;
   port them faithfully, preserving the substring-vs-token distinction and the
   `(-score, key)` tie-break.
2. Write the persona golden generator using the real oracle over a temp DB seeded
   with synthetic personas; design probe queries so the oracle exercises every
   branch (multi-hit, hyphenated-keyword substring, punctuation normalization,
   ties, single-hit threshold boundary, no match, empty-after-normalization).
3. Add golden parity + unit tests; verify parity is exact.
4. Extend the harness and demo DB; keep evidence redacted by default and hash the
   ordered persona-key result the same way `search` hashes ids.
5. Run the full validation route, including the portable end-to-end.

## Test Strategy

```bash
cd ts
npm run typecheck
npm run lint
npm test

cd ..
uv run python ts/parity/generate_golden.py
uv run python ts/parity/generate_persona_golden.py
git diff --exit-code ts/test/goldens/

rg 'node:sqlite' ts/src   # only the DB seam

# portable end-to-end (search + detect-persona), redacted by default
uv run python ts/parity/generate_demo_memory_db.py --out tmp/parity/demo-memory.db
uv run python ts/parity/real_db_copy_parity.py --source-db tmp/parity/demo-memory.db
```

## E2E Decision

E2E through a runtime is **not required**: no runtime route changes. Validation is
command-core parity over synthetic fixtures plus the portable real-DB-copy route.
Runtime dogfooding starts in CV22.DS3.

## Risks And Controls

- **Substring vs token drift.** Python `in` is a raw substring for multi-word
  keywords but token membership for single-word ones. Control: unit tests assert
  `codebase` does not hit the single-word keyword `code`, and multi-word keywords
  match as substrings.
- **Normalization divergence.** Hyphens, underscores, punctuation, and casing must
  normalize identically. Control: a normalization unit test plus a hyphenated
  keyword (`savings-plan`) in the golden.
- **Tie-break divergence.** Control: a tie probe asserts ascending-key ordering.
- **Data leak in realism evidence.** Control: redacted-by-default hashes; raw
  fixtures only under ignored `tmp/`; portable demo personas are synthetic.

## Validation Route

Pass condition: automated checks green, both goldens regenerate deterministically,
`node:sqlite` stays seam-only, and the portable real-DB-copy route shows identical
ordered persona keys (and identical search ids) with redacted evidence.

Fail condition: any behavioral mismatch on the synthetic corpus, non-deterministic
regeneration, a new direct `node:sqlite` import outside the seam, or any need to
change routing semantics rather than port them.

## Checkpoint

Plan approved by the Navigator in session ("Proceed with this plan"). Implementation
followed this plan; evidence is recorded in [test-guide.md](test-guide.md).
