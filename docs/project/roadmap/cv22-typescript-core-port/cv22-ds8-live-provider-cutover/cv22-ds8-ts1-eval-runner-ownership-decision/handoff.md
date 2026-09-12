[< Story](index.md)

# Handoff — CV22.DS8.TS1

**Date:** 2026-09-13 · written for the next session and the Mirror that loads
the journey next.

## What is now true

The `eval` harness has an owner and a deadline. DS10's index carries an **Eval
Harness Deletion Gate**: `evals/` and the `python -m memory eval` entry point
may not be deleted until a `ts/evals/` harness carries the same contract
(`PROBES` + `THRESHOLD` per module, `--all` discovery by capability, JSONL
history, threshold-driven exit) against the live transport DS8 built, with
fixture data in engine-neutral JSON, a recorded disposition per module, and
injection probes made individually blocking. Before this story DS10 did not
mention `eval` at all, so retirement would have removed the model-behavior
release gate without a decision.

The decision itself is in
[`decisions.md`](../../../../decisions.md#the-eval-harness-transfers-to-typescript-as-a-ds10-gate-not-a-ds8-port)
with the measurements it rested on. Its reframe is the part worth carrying: the
question was never "port 3,691 lines or delete them" — the instrument's subject
moved. Every live eval module imports a Python pipeline function, and
TypeScript has answered eight of those nine surfaces since DS8.

Until the transfer lands the Python harness is the gate, and it works: the
validation run was 11/12 with `routing` the only failing module, matching D-005's
recorded score exactly, and it wrote this home's first `eval-history/` — sixteen
records across twelve modules, the baseline the TS harness diffs against.

The documentation stopped overclaiming. The development guide now says what the
gate measures (Python's pipeline), why it is still valid for prompt behavior
(byte-identical, digest-pinned prompts), what it cannot see (TypeScript parsing,
coercion, orchestration), and that 11/12 with `routing` failing is expected
under the standing D-005 waiver.

## What remains intentionally undone

- **No harness code.** The TS port is the DS10 story this gate authorizes; it
  gets a code when DS10 is pulled and expanded.
- **[D-017](../../../../debt.md#d-017--injection-resistance-probes-are-averaged-into-a-module-score)**
  — injection probes averaged into a module score, so `scene` reported PASS with
  its injection probe obeyed. Carried deliberately: the fix is a harness-contract
  change, and the contract is being rewritten by the transfer. It is item 4 of
  the gate as well as a debt entry.
- **D-005** — `routing`'s stale fixtures. Unchanged; the DS10 story decides
  whether to pay or retire (retirement is the likely answer: TypeScript has
  deterministic `detect-persona` goldens from DS2).
- **`scene`'s AI-22 residual** — 1 obeyed in 6 today, confirmed not a
  regression at n=5 with the pin unchanged. S21's model-pin revisit trigger
  stands.
- **CR080** — still captured, still unplanned; it now names which harness its
  probe runs on and that a prompt change re-arms the release gate.

## What the next plateau is

**DS8 is complete, and closing it is the Navigator's decision, not this
story's.** All five DS8 done-condition bullets are now true in writing: the
sixteen replay-gated leaves are live (TS2 emptied the table), the live transport
enforces its taxonomy, keys stay in env/config, each live surface has a
Navigator-run smoke contract, every family keeps a single-variable revert, and
the `eval` ownership decision is recorded. Two decisions belong to the Navigator
at this boundary:

1. **DS8 parent collapse** — mark the Delivery Story done (5/5) in the CV22
   index and the roadmap.
2. **DS8 release intent** — the live-provider cutover is the most user-visible
   thing CV22 has shipped: an unconfigured install now answers every
   LLM-crossing command from TypeScript against a real provider. Whether that
   is a release boundary is a Navigator call
   (`build release-intent --intent planned|none|undecided`).

After that, the sequence continues to **DS7.US8** (the Builder/Ariad tree, 27
leaves, the only self-hosting story), then TS4, DS9, US9, and DS10 with TS5
first.

## Which evidence supports it

[Validation](validation.md) — three automated checks, the `eval --all` run with
its per-module reading, the `scene` n=5 confirmation, and the Navigator's
acceptance. [Debt Review](review.md) — D-017 registered and deferred with
triggers, plus two Driver process findings with their correctives.
[Coherence](coherence.md) — process, project, product.
