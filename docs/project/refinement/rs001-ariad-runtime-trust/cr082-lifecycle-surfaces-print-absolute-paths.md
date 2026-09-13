[< RS001](index.md) · [Canonical status](../index.md#change-requests)

# CR082 — Plan and Expand surfaces print absolute filesystem paths where their artifact surface prints project-relative ones

**Status:** captured
**RS:** RS001
**Driver:** —
**Delivery:** —

## Problem

Three Ariad lifecycle surfaces print filesystem paths exactly as the runtime
resolved them, which is absolute:

| Surface | What it prints absolute |
|---|---|
| `plan_checkpoint` | the `story package` row, the three `artifacts` rows, and the four `story_package_path=` / `index_artifact_path=` / `plan_artifact_path=` / `test_guide_artifact_path=` trailer lines |
| `expand_decision` | every row of the `materialized` block |
| `expand_blocked` | the `why blocked` reason, which embeds the resolved package directory through the exception text |

`render_artifacts_materialized_surface` does the opposite: it routes every path
through `artifact_surfaces._display_path`, which relativizes against the
journey's project root.

Both run in the same invocation, so one command shows the same file twice in two
forms. From `build plan-item`:

```text
│ story package                                          │
│ /Users/<name>/dev/workspace/<project>/docs/project/roa │
│ dmap/cv1-first/cv1-ds1-delivery/cv1-ds1-us1-story      │
…
│ ✓ created plan                                         │
│ docs/project/roadmap/cv1-first/cv1-ds1-delivery/cv1-ds │
│ 1-us1-story/plan.md                                    │
```

The absolute path is correct *internally* and should stay that way:
`story_paths` resolves the roadmap root deliberately, because
`create_story_directory`'s confinement guard is
`target.is_relative_to(roadmap_root)`, which is only sound on absolutes. The
defect is not the resolution, it is that the resolved value is what the surface
renders.

Two costs follow, neither of them correctness — the files are written to the
right places:

1. **Surfaces travel.** Ariad surfaces are transported verbatim into
   conversations, session exports, and pasted handoffs, so they carry the
   owner's home directory and account name into shared artifacts. Every sibling
   surface in the same output already avoids this.
2. **Truncation makes the rows ungradable.** `_card_text` cuts at 54 code points
   and `_card_wrapped` / `_card_prefixed` wrap at 54 and 52, so an absolute
   prefix decides where every chunk boundary falls. A golden recorded on one
   machine cannot match another: the CV22.DS7.US8 corpus recorded
   `│ /private/var/folders/5k/q6bjkgn95gzd_qss7_5flyzw0000gp │`, a truncated
   prefix of a temp root that no substitution can repair. Grading those rows
   byte for byte is impossible while the surface prints an absolute path.

## Expected Behavior

Within one invocation, one path form.

- The human-facing card rows render the path project-relative, the way
  `artifacts_materialized` already does, including its fallback for a path that
  legitimately lies outside the project.
- `expand_blocked` names the package the same way, whether the path arrives as a
  field or inside an exception message.
- The `*_path=` trailer lines are a separate decision (below) because they have a
  machine consumer, not a human one.

Once the rows are project-relative they become byte-comparable across machines,
so the parity corpus can grade them whole instead of collapsing them.

## Impact

Medium-low, and it is the consistency kind. Nothing is corrupted and no file
lands in the wrong place. What it costs:

- a Navigator reading one output sees two conventions and has to notice which is
  which;
- shared surfaces leak a local account name and directory layout, which the
  other surfaces in the same block do not;
- the port pays permanently: while the rows are absolute, that region of three
  surfaces can only be graded structurally, so a future rendering change there
  cannot be caught by the golden. The compensating controls and their limits are
  recorded in `ts/parity/builder_surface_paths.py`.

## Plan Or Decision

Not planned. Three decisions belong to whoever takes it:

1. **What the trailer lines should be.** They are machine-read — the `mm-build`
   skill instructs the agent to surface the plan artifact path from the command
   output. Project-relative is unambiguous for a consumer already working inside
   `project_path`; absolute is unambiguous for a consumer that is not. The card
   rows are not in question; only these four lines are.
2. **Which engine, and when.** Not inside CV22.DS7.US8. Changing Python's
   surface text mid-port re-baselines the oracle the port is graded against,
   which is precisely the moving-target risk the CV22 collaboration strategy
   keeps bounded. After US8's flip, `build` is TypeScript-owned and the change
   lands there with Python compatibility-only, per the 2026-08-13 and 2026-09-02
   decisions. **Revisit trigger: US8's flip lands.**
3. **Where `expand_blocked` is relativized** — at the raise site, which would
   change `ExpandBlockedError`'s message contract, or at the render site, which
   keeps the exception intact and localizes the presentation rule.

## Evidence

- `src/memory/builder/lifecycle.py` — `render_plan_checkpoint`,
  `render_expand_report`, `render_expand_blocked`, against
  `src/memory/builder/artifact_surfaces.py`'s `_display_path`.
- `ts/parity/builder_surface_paths.py` — the compensating rule written for the
  US8 plateau-3 corpus: collapse a wrapped absolute run to one token row,
  substitute untruncated trailer lines and refusal messages. Its module
  docstring records what stays graded and why that is currently enough.
- `ts/test/goldens/builder-command.golden.json`, case `plan_item_after_prepare`
  — the two forms side by side in one recorded invocation.
- The US8 story plan's Debt / CRs section carries the same finding as the
  plateau-3 entry.

## Outcome

_Pending._

## Provenance

Found on 2026-09-13 while building the CV22.DS7.US8 plateau-3 oracle, by trying
to record those surfaces in a machine-independent golden and discovering that
token redaction cannot survive a truncating renderer. Captured at the
Navigator's request during the same plateau, deliberately without fixing it:
reproducing the behavior is parity work, changing it is a Navigator-facing
product change that belongs after the flip.
