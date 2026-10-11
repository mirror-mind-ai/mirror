[< Story](index.md)

# Test Guide — CV22.DS7.US6 — Soul Mode

## Automated Validation

Golden corpora, all generated from Python before the TS implementation exists,
all in the determinism gate under 3.10 and 3.12, TZ=UTC, offline:

| Corpus | Covers |
|--------|--------|
| `generate_soul_surface_golden.py` | every renderer × absent optionals, multi-paragraph blocks, CJK, astral emoji, combining marks, a 200-char unbroken token |
| `generate_soul_state_golden.py` | fruit/harvest set, show, clear, decline; session-id precedence; the `NULL`-vs-`{}` empty-metadata rule |
| `generate_soul_apply_golden.py` | identity append across 4 layers × (no heading, existing heading, heading followed by another section) |
| `generate_soul_harvest_journal_golden.py` | title-from-first-sentence, Markdown body, metadata JSON bytes (insertion-ordered) |

Unit and contract tests:

- session-id precedence: explicit → operating-mode session → `MIRROR_SESSION_ID`
  → `__global_soul_mode__`
- code-point (not UTF-16) iteration in the wrapping helpers
- routing: every allowlisted leaf → TS; a non-allowlisted `soul` subcommand →
  Python **by name**; `MIRROR_TS_SOUL=0` → Python for every leaf
- negative paths: `apply` without `--confirm APPLY`; `propose persona` without
  `--key`; `harvest show`/`save` with nothing harvested; unsupported layer —
  each with Python's exact message and exit code
- a test that fails if `harvest save` ever reaches the journal classifier
- identity write goes through the US3 allowlist; `prompt self` uses a literal
  placeholder replacement, not a regex substitution
- prompt template resolution stays inside the package directory

Real-DB-copy write probes (`ts/parity/real_db_copy_parity.py`): `soul_state`,
`soul_apply`, `soul_harvest_save` — hashes compared against Python on the same
copy.

Ritual lifecycle smoke (`ts/parity/conversation_lifecycle_smoke.ts`, extended):
`load → listen → rite → fruit set → fruit show → harvest set → close → review`
in one session, both engines, disposable home, with the gate absent (proving
the shipped default) and with `MIRROR_TS_SOUL=0` (proving the revert).

Oracle drift tripwire additions: `cli/soul.py`, `services/soul.py`,
`services/soul_journal.py`, `services/soul_prompt.py`, `surfaces/soul.py`,
`prompts/soul_self_voice.md`, `prompts/soul_wisdom_voice.md`,
`prompts/soul_beauty_voice.md`.

## E2E Decision

**Required.** Soul Mode is a lived ritual whose surfaces are
`transport=verbatim`; a wrapping or padding regression is only observable in a
real session. Fixture-level validation alone is not accepted for this story.

## Navigator Validation

1. Read-only surfaces through both engines — `soul listen`, `rite`, `close`,
   `review`, `propose`.
   **Expected:** byte-identical output.
2. `soul prompt self` through both engines.
   **Expected:** identical, with the real Self identity injected.
3. A real Pi Soul Mode session after the flip: `soul load`, a listen surface on
   living matter, `fruit set`/`show`, `harvest set`, `close`.
   **Expected:** the ritual is unchanged; `front-door.log` shows `soul ts` with
   no `fell_back` marker.
4. `soul apply` **on a database copy**, diffed against Python's result on the
   same copy.
   **Expected:** identical identity document and integration row. A real-home
   apply happens only on explicit Navigator instruction after this diff.
5. `MIRROR_TS_SOUL=0` on one surface.
   **Expected:** identical output, `python` in the log.

**Pass:** 1, 2, 5 identical; 3 unchanged with `soul ts` logged; 4 diff-clean.
**Fail:** any surface difference, any write divergence, any `fell_back` marker,
or any live embedding call observed outside the replay configuration.

## Validation Evidence

Recorded at Validation: test counts, the four golden hashes under both Python
versions, the three probe results, the smoke check count with and without the
gate, and the Navigator's observations for routes 1–5.
