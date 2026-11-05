[< RS010](index.md) · [Canonical status](../index.md#change-requests)

# CR199 · `deliverMirrorContext` takes three to seven seconds before every Desktop turn, and the embedding explains one or two of them

## Problem

Nautilus for Mirror asks the Core for a turn's context (`deliverMirrorContext`, the
terminal's doorman as a host call) before it starts Pi, and the turn cannot start until
the call answers. Nautilus now times every turn's start (its CR194), and in production,
on the Navigator's home, the call is the largest step left:

| Turn (2026-11-05, UTC) | Journey | `mirror_context` | Embedding call (`llm_calls`) |
|------------------------|---------|-----------------:|-----------------------------:|
| 03:36:23 | `alissonvale-com` | 5.2 s | 0.95 s |
| 03:40:09 | `mirror-desktop` | 6.7 s | 1.52 s |
| 03:42:49 | `mirror-desktop` | 2.7 s | 1.07 s |
| 03:44:53 | `alissonvale-com` | 5.3 s | 1.77 s |
| 03:45:38 | `mirror-desktop` | 5.1 s | 1.43 s |

Earlier production turns measured 2.7 to 6.2 s; in development, on a small home, 5.6 and
6.0 s. The embedding (`openai/text-embedding-3-small`, the only `llm_calls` row each turn
writes) explains 1 to 1.8 s. Where the other 2 to 5 s go is not known: the host is a
long-lived process, so it is not Node's start.

## Expected Behavior

- Each step of `deliverMirrorContext` (identity and persona resolution, the delta against
  the session's last context, the embedding, the memory search, rendering) is timed, and
  the times are readable for a given call.
- The step that dominates is named from those times, and is made fast enough that the
  call takes about as long as its embedding, or a stated reason says why not.

## Impact

Every Mirror-mediated turn on the Desktop waits for this call: 3 to 7 s of an 8 to 13 s
start, now that Nautilus's 30 s from a Pi extension are gone. The terminal's doorman runs
the same path, so the cost is probably there too, unmeasured.

## Plan Or Decision

Captured, unassigned, 2026-11-05, at the Navigator's direction, from Nautilus's CR194.

Not planned. Measure before fixing: the first step is timing the call's phases, not
guessing at the memory search.

## Evidence

- Nautilus for Mirror, `docs/project/refinement/rs026-after-the-0-3-cutover/cr194-the-message-takes-tens-of-seconds-to-reach-pi.md`:
  the per-phase `turn_start` records, their production and development tables.
- `llm_calls` on a copy of the production database: one `embedding` row per turn, with
  the latencies above.
- On clones, measured in CR194's investigation: `deliverMirrorContext` against a copy of
  the production database took 4.5 to 6.5 s.
- `ts/src/mirror/deliverContext.ts`, `ts/src/mirror/doorman.ts` (`runDelta`,
  `embedOnce`, `searchMemoriesWithStatus`): the path the call takes. The production home
  holds 3,645 memories.

## Outcome

Pending: captured, not planned.
