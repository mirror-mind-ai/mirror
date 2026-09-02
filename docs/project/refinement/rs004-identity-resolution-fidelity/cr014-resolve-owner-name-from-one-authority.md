[< RS004](index.md) · [Canonical status](../index.md#change-requests)

# CR014 — Resolve The Owner's Name From One Authority

## Problem

Three sites derive the owner's name from `user/identity` independently, with three
different heuristics and three different fallbacks. Verified against `origin/main`
@ `688271f` and the live production identity on 2026-08-14:

| Site | Heuristic | Result against the live identity |
|---|---|---|
| `src/memory/services/conversation.py:780` | regex: `You are talking to` / `Você está falando com` | **no match → falls back to the literal `"User"`** |
| `src/memory/cli/shadow_cmd.py:44` | regex: `speaking with (\w+)` | `"Vinícius"` |
| `src/memory/cli/consolidate_cmd.py:57–58` | **`if "Vinícius" in entry.content: return "Vinícius"`** | `"Vinícius"` |

The seeded identity opens with *"You are speaking with …"* — the phrasing the
project's own `templates/identity/user/identity.yaml` produces. The primary path
matches only *"talking to"*, so it never matches, and the failure is silent.

The three fallbacks also disagree: `"User"` vs `"the user"` vs `"the user"`.

## Expected Behavior

One resolver owns the lookup. It tolerates the phrasings the shipped templates
actually produce, returns a consistent fallback, carries no personal name in
framework source, and fails visibly (log line or surfaced warning) rather than
silently substituting a placeholder. All three call sites use it.

## Impact

`conversation.py` is the hot path: it feeds `user_name` into memory extraction,
summary, and shadow prompts for **every logged conversation**. Since the identity
was seeded with the current phrasing, every extraction has addressed the owner as
the literal string `"User"` — degrading the personalization of every memory the
mirror has written, invisibly.

The hardcoded name is a distribution defect: for any user other than the original
developer, `consolidate_cmd.py`'s first branch is dead code that documents the
framework testing for one specific person. It also undermines the project's own
privacy posture — tooling exists to redact the owner's name from exported
personas while the framework source itself embeds it.

Silent degradation is the aggravator: nothing errors, nothing warns. The defect
was found only because an external tool (the automation repo's persona-export
extension) needed the owner's name and its author read the core's resolver for
reference.

## Plan Or Decision

Pending. Capture does not authorize implementation. Decisions to make at
planning time:

- whether the resolver scrapes prose (tolerant multi-phrasing regex) or the
  name becomes a structural field written at `memory init` — the template
  already knows `{{user_name}}` at init time;
- where the resolver lives (`services`, `storage`, or `utils`);
- what the single fallback is, and how failure is surfaced;
- whether historical memories extracted under `"User"` deserve any repair
  (likely out of scope, but decide explicitly).

## Evidence

Discovered 2026-08-14 during persona-export work in the automation journey: the
export needed the owner's name for redaction, and reading the core's resolver
for reference revealed it returns `"User"` against the live identity. All three
sites and their outputs were then verified by executing each heuristic against
the production database's `user/identity` content.

A compensating workaround now exists outside the framework: the automation
repo's `mirror-extensions/persona-export/extension.py` implements its own
triple-pattern lookup (`speaking with` / `talking to` / `falando com` / explicit
`first name:` line). It can be retired to the shared resolver when this CR lands.

## Outcome

Pending.
