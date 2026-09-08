[< Parent](../index.md)

# CV22.DS7.US6 — Soul Mode

**Status:** 🟡 Planned — Plan authored, pending Navigator approval
**Type:** User Story

---

## User Story

As someone who uses Soul Mode as a lived ritual,
I want the `soul` command answered by the TypeScript core with byte-exact
surface parity,
So that the ritual is unchanged while the Python core loses another command —
and so the verbatim-surface and identity-write discipline US8 needs exists
before the Builder/Ariad tree is ported.

## Outcome

`soul` — 10 subcommands, 17 leaves — answers from TS by default behind
`MIRROR_TS_SOUL`, with `harvest save` routed only under the DS5 embedding
replay configuration. All three `mm-soul` skill copies enter the front door, so
a flipped route reaches a live Soul Mode session. Ops-independent; the DS7
command denominator moves by one.

## Acceptance Behavior

```text
Given a live Pi Soul Mode session after the flip
When the ritual runs load → listen → rite → fruit → harvest → close
Then every surface renders byte-identically to Python's
And front-door.log shows `soul ts` with no fell_back marker
And MIRROR_TS_SOUL=0 returns the whole family to Python with no data migration
```

Full acceptance set: [plan.md](plan.md#acceptance-behavior).

## Scope

- The eight Soul renderers and the Soul mode-transition surface
- Session-scoped fruit/harvest state on `runtime_sessions.metadata`
- The three voice prompt templates and Self-identity injection
- `soul apply` — `identity_integrations` row plus the identity document append,
  behind the US3 identity-write allowlist
- `soul harvest save` behind the DS5 embedding replay transport
- Front-door dispatch, by-name subcommand allowlist, gate, goldens, probes,
  ritual smoke, the flip, and the three skill copies

## Out Of Scope

- Any change to Soul ritual behavior, including its error strings
- The live embedding call (DS8)
- The orphaned `journal` / `week plan` / `week save` leaves (denominator
  defect, recommended as a CR under RS009)
- Identity re-synthesis from integration rows
- Explorer Mode (US7) and the Builder/Ariad tree (US8)

## Validation

Navigator-visible ritual validation in a real Pi session, plus four golden
corpora in the determinism gate, three real-DB-copy write probes, routing and
negative-path tests, and the whole-ritual lifecycle smoke through both engines.
E2E is **required**. See [test-guide.md](test-guide.md).
