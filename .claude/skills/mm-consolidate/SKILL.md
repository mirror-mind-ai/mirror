---
name: "mm:consolidate"
description: Scans memories for recurring patterns and proposes consolidation (merge, identity update, or shadow candidate)
user-invocable: true
---

# mm-consolidate

Consolidation as integration — the operation that promotes raw extracted memories into
structural identity content (CV7.E4.S3).

Memories accumulate over time. Patterns repeat. The same insight lands in five conversations
as five isolated memories, none of which reaches the identity layer where it could actually
change how the mirror responds. Consolidation is the bridge. This skill surfaces those
clusters, proposes a structural move, and waits for explicit acknowledgment before writing
anything.

**Promotion mechanism: manual-by-acknowledgment.** The scan is automatic; the promotion is not.
Every proposal must be reviewed and accepted (or rejected) before it changes the database.
This is intentional — identity updates are meaningful acts.

---

## Usage

```
/mm:consolidate [--journey <slug>] [--layer <layer>] [--limit <n>]
/mm:consolidate apply <proposal_id>
/mm:consolidate reject <proposal_id>
/mm:consolidate list [--status pending|accepted|rejected]
```

---

## 1. Scan for proposals

```bash
uv run python -m memory consolidate scan \
  [--journey <slug>] \
  [--layer <layer>] \
  [--limit 5] \
  [--threshold 0.75]
```

This clusters semantically similar memories and calls the LLM to propose one of:
- **merge**: distill a redundant cluster into one sharper memory
- **identity_update**: encode a persistent pattern into an identity layer (ego/behavior, etc.)
- **shadow_candidate**: mark a tension/avoidance cluster for the mm-shadow pass

Each proposal is printed and stored with `status='pending'`.

**Default filters:** no journey or layer filter (all memories). Threshold 0.75. Limit 5 proposals.

---

## 2. Present each proposal to Vinícius

For each proposal, show:
- The source memories (title, type, date)
- The proposed action and target (if identity_update: which layer/key)
- The rationale
- The proposed content

Ask: **accept as-is / edit / reject?**

---

## 3. Apply or reject

**Accept as-is:**
```bash
uv run python -m memory consolidate apply <proposal_id>
```

**Accept with edited content:**
```bash
uv run python -m memory consolidate apply <proposal_id> \
  --content "User-revised version of the proposed content"
```

**Reject:**
```bash
uv run python -m memory consolidate reject <proposal_id>
```

What happens on acceptance:
- **merge**: creates a merged memory; source memories advance to `integrated`
- **identity_update**: appends to the identity layer; source memories advance to `acknowledged`
- **shadow_candidate**: source memories advance to `candidate` for the next mm-shadow pass

Rejected proposals leave source memories unchanged.

---

## 4. List consolidation history

```bash
uv run python -m memory consolidate list [--status pending|accepted|rejected] [--limit 20]
```

---

## Notes

- The skill uses the same model as extraction (Gemini Flash via OpenRouter). LLM calls are
  logged to `llm_calls` when `MEMORY_LOG_LLM_CALLS=1`.
- Proposal IDs can be abbreviated to their first 8 characters.
- Memories with `readiness_state='integrated'` are excluded from clustering.
- Run with `--threshold 0.65` to surface more (and looser) clusters; raise to `0.85` for tighter ones.
- For shadow-specific work, use `mm-shadow` (CV7.E4.S4) after candidates are established.
