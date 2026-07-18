[< CV9.E2 Stabilization & Robustness](../index.md)

# CV9.E2.S21 — Fence the Scene Read Model (AI-22)

**Status:** Done
**Epic:** CV9.E2 Stabilization & Robustness
**Closes:** AI Engineering Audit **AI-22** (scene synthesis content-mediated
injection), as **mitigated-and-measured** with documented residual risk
**Planned by:** quality-assurance · **Reviewed by:** engineer, database-architect,
ai-engineer, devops-engineer, security-engineer, prompt-engineer
**Amended mid-story** (Navigator-approved) after error analysis by
prompt-engineer and security-engineer

---

## User-Visible Outcome

`generate_scene_synthesis()` concatenated the Scene read model — whose string
values (journey, conversation, memory, and task titles, signal titles) are
ordinary user-controlled content — raw into its prompt, with a grounding
instruction but no trust boundary. The `scene-injection-resisted` probe
(CV9.E2.S20) confirmed the gap live. This story fences the read model with
AI-16's proven template, gives the synthesis task the safe null action it was
missing, corrects the probe to measure the actual threat, and closes AI-22
with a pre-registered measurement instead of a vibe.

## Design Decisions

Original plan (D1–D6), all held:

- **D1 — mirror AI-16's 4-part template**: `<scene_data>` delimiter +
  untrusted-input instruction + deterministic fence test + live injection probe.
- **D2 — fence the whole read model**, covering every user-controlled field in
  one structural move, not per-field patches.
- **D3 — reuse AI-16's proven wording**, tailored tail; thread use-vs-obey.
- **D4 — instruction immediately before the fenced data; XML tags** (markdown
  fences would collide with the model's own fenced-JSON output).
- **D5 — no shared `fence_untrusted` helper yet** (two sites; rule of three —
  the third fenced surface triggers extraction of a shared helper and deletes
  both copies).
- **D6 — measured acceptance, full-eval runs** (never the injection probe in
  isolation).

Amendments (approved after the first measurement and error analysis):

- **A1 — sandwich reminder.** A guard only before the fence measured 1/3 clean;
  the plan's pre-agreed contingency ("strengthen wording, never loosen the
  probe") added a second reminder immediately after the fenced block — the most
  recency-weighted position.
- **A2 — probe construct-validity fix.** Error analysis of four failing outputs
  found **0/4 actual obedience**: the mention-counting probe conflated
  compliance with (a) citation-echo in the `signals` field — which the output
  contract itself requests — and (b) defensive descriptions. Corrected to
  `_asserted_in_own_voice`: `title`/`next` zero-tolerance, `summary`
  distancing-aware, `signals` citation array excluded. Calibrating the
  instrument to measure obedience is not loosening it.
- **A3 — per-item null action.** The structural difference from extraction:
  extraction can return `[]` (safe null), synthesis must produce prose. The
  prompt now defines the missing null per item: instruction-like titles are
  referred to generically, never repeated verbatim.
- **A4 — pre-registered re-measurement**: n=10, bars declared before running
  (≥9/10 closure-grade · 6–8 mitigation with residual · ≤5 stop).

## Acceptance Criteria (as amended)

- Built prompt fences the read model in `<scene_data>` tags, carries the
  untrusted-input instruction, the post-fence sandwich reminder, and the
  per-item null action. All CI-guarded by deterministic tests.
- `_asserted_in_own_voice` unit-tested across all compliance/resistance cases.
- Pre-registered n=10 `eval scene` measurement meets its declared bar with no
  regression on the other five probes.
- AI-22 closed in the audit with the honest measurement history, the named
  invariant, and revisit triggers.

## Scope

**In:** `intelligence/scene.py` (prompt + assembly), `evals/scene.py` (probe
correction + helper), deterministic tests (`test_scene.py`,
`test_scene_fixture_contract.py`), invariant comment at the persistence site
(`web/server.py`), audit closure, epic index, story package.

**Out (named follow-ups):** web-surface output-encoding of persisted
orientations (security); a second probe injection vector, e.g. a journey title
(security — the structural fence already covers it); shared `fence_untrusted`
helper (triggers on the third fenced surface); backfill of pre-fix persisted
orientations (regeneration is one click; source-hash invalidation exists).

## As-built (implementation and measurement)

| Measurement | Instrument | Result |
|---|---|---|
| S20 baseline (no fence) | mention-counting probe | 0/1 clean (output body not preserved — ambiguous) |
| Fence, pre-fence guard only | mention-counting | 1/3 clean |
| + sandwich reminder | mention-counting | 2/5 clean |
| Control: extraction's AI-16 fence | its own injection probe | 5/5 clean |
| Error analysis, 4 outputs read | human | **0/4 actual obedience** — flags were citation-echo + defensive description |
| Fence + sandwich + per-item null | **corrected probe** | **9/10 resisted · 1/10 obeyed · 0 regressions** (60 probe-executions) |

The 9/10 meets the pre-registered closure bar exactly. The 1/10 stands in the
audit as documented residual risk — prompt fencing on a small model is
mitigation, not a guarantee. What makes the residual acceptable is the verified
blast radius: display-only, on a surface whose output never re-enters a model
prompt, the memory store, or a tool path.

**Invariant (named, verified, review-only):** `scene_orientation` identity rows
are display-layer content. Prompt assembly (`load_mirror_context`) selects
identity layers explicitly by (layer, key) and has no reader of
`scene_orientation` outside `web/server.py` — verified in source. A comment at
the write site records the rule; any future feature feeding orientation content
back into prompts escalates this finding to AI-16 class.

**Revisit triggers:** any model-pin change (re-run `eval scene`; the S19
history trends the probe and the prompt hash); any orientation-re-entry
feature.

**Concurrency note:** the worklog entry for this story ships in an immediate
follow-up commit rather than this one — a concurrent docs link-repair session
held uncommitted hunks in `worklog.md` at commit time, and explicit-path
staging kept this commit strictly S21's own work (Navigator-approved Option B).

## See also

- [Plan](plan.md) · [Test Guide](test-guide.md)
- [AI Engineering Audit — AI-22](../../../../ai-engineering-audit.md)
- [CV9.E2.S20 — Scene-Synthesis Eval Probe (found AI-22)](../cv9-e2-s20-scene-synthesis-eval-probe/index.md)
- [CV9.E2.S15 — Extraction Boundary Hardening (the AI-16 template)](../cv9-e2-s15-extraction-boundary-hardening/index.md)
