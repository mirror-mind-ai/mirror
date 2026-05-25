[< S2 index](index.md)

# CV9.E4.S2 — Plan: Getting Started Consolidation

---

## Emotional Contract

The reader arriving at Getting Started has just read the README and decided to
try Mirror Mind. The contract is precise: follow these steps and you will have
a working mirror at the end. That means the document must be linear, direct,
and free of anything that doesn't apply to a new user completing setup for the
first time. No persuasion — the reader is already sold. No architecture
explanations — those belong in the architecture doc. Every section should feel
like a step being crossed off a list.

---

## Document Structure

```
1. What you'll need
2. Install
3. Configure
4. Initialize
5. What ships in your identity
6. Seed
7. Start your first session
8. Verify
9. What's next
```

---

## Section 1 — What You'll Need

This is the most important section to get right. It is where the reader
decides whether to continue. Be direct and complete — a user who discovers a
required subscription after cloning the repo feels tricked. A user who sees
the full picture before they start and proceeds is a committed user.

### 1a — Subscription (the main cost decision)

Mirror Mind requires one AI runtime subscription. This is the most significant
expenditure. Present it as a decision table, not a flat list.

| Subscription | Harnesses unlocked | Pi | Recommended |
|---|---|---|---|
| [Codex Plus](https://openai.com/codex/) | Codex + Pi | ✅ Full | ✅ Best path |
| [Claude Code Pro](https://code.claude.com/docs) | Claude Code + Pi* | ⚠️ API cost | If you already have it |
| [Gemini AI Pro](https://geminicli.com/) | Gemini CLI | ❌ | Last resort |

*Pi with Claude charges Anthropic API rates, not the subscription.

Closing line: **If you don't have any of these yet, start with Codex Plus.**

**Why this order:**
- Codex Plus is the best path: it fully unlocks Pi (the preferred harness) at
  no extra cost beyond the subscription.
- Claude Code Pro technically allows Pi but charges Anthropic API rates when
  used through Pi, not the subscription. A workaround exists but it is fragile.
  Acceptable if already subscribed; not recommended as a first choice.
- Gemini AI Pro only unlocks the Gemini CLI harness. Pi is not an option. The
  Gemini CLI experience is inferior to Pi. Only recommend if already subscribed
  and not ready to change.

**Harness vs subscription distinction:** a harness is the interface you use to
talk to Mirror Mind (Pi, Codex, Claude Code, Gemini CLI). A subscription is
what you pay for; it unlocks one or more harnesses. These are separate concepts
and must be clearly distinguished in the text.

### 1b — OpenRouter

Always required, regardless of subscription choice. Pay-as-you-go — not a
subscription. The $5 minimum credit is a hard requirement: a free account
without credits will not work.

> Create an account at [openrouter.ai](https://openrouter.ai), **add at least
> $5 in credits**, and generate an API key. This is required — a free account
> without credits will not work. OpenRouter handles the memory infrastructure:
> generating embeddings, extracting memories from conversations, and powering
> `/mm-consult`. Cost is pay-as-you-go; a few cents per session. $5 will
> likely last months.

### 1c — uv

Explicit install commands. Mac/Linux inline; Windows as a link to the
installation page. Python 3.10+ is handled by uv automatically — do not list
Python as a separate prerequisite.

```bash
# macOS and Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Windows: [https://docs.astral.sh/uv/getting-started/installation/](https://docs.astral.sh/uv/getting-started/installation/)

### 1d — Pi (the recommended harness)

Explicit install command for Pi. Present this for users who have Codex Plus or
Claude Code Pro — they should install Pi as their primary harness.

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Full documentation: [Pi quick start](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start)

### 1e — Other harnesses (links only)

No install instructions — links only. For users who are not using Pi as their
primary harness:

- [Codex](https://openai.com/codex/)
- [Claude Code](https://code.claude.com/docs)
- [Gemini CLI](https://geminicli.com/)

---

## Section 2 — Install

Clone and `uv sync`. No changes from current. Keep it two commands.

```bash
git clone https://github.com/viniciusteles/mirror.git
cd mirror
uv sync
```

---

## Section 3 — Configure

`.env` setup. Minimal: `MIRROR_USER` and `OPENROUTER_API_KEY`. Pointer to
`.env.example.advanced` for the full variable reference. No change from
current content; just confirm it's tight and doesn't over-explain.

---

## Section 4 — Initialize

`memory init your-name`. One command, one paragraph explaining what it does.
No change from current content.

---

## Section 5 — What Ships in Your Identity

Keep the 12-persona table — it reinforces the "team of specialists" frame from
the README and shows immediately what the system can do. Keep the starter
journey mention. Remove any prose around the table beyond one introductory
sentence. The table is enough.

---

## Section 6 — Seed

`memory seed`. One command. One sentence. No change from current.

---

## Section 7 — Start Your First Session

Pi gets a full subsection — it is the preferred harness and should be treated
as primary. The other three harnesses get a compact treatment.

**Pi (primary):** full subsection with commands and what to expect.

**Other harnesses (compact):** one subsection listing the three alternatives
with the minimal command to start each one and a note on what's different
(e.g., Gemini CLI injects context automatically; Codex uses the wrapper script;
Claude Code uses `/mm:` prefix instead of `/mm-`).

---

## Section 8 — Verify

Copy-paste commands with expected output. No change from current content —
the verification checklist is already well-designed. Confirm it covers:
- `list personas --verbose`
- `list journeys`
- `detect-persona` for a few sample queries
- `inspect persona writer`

---

## Section 9 — What's Next

Three pointers, nothing more:

- **Commands:** `REFERENCE.md` — full command reference with arguments
- **Architecture:** `docs/product/architecture.md` — how the system works (note: this
  file is created in S3; update the pointer when S3 runs)
- **Extensions:** `docs/product/extensions/` — Mirror Mind can be extended
  with user-specific capabilities. See the extension docs to learn more.

One sentence of framing before the pointers:

> Your first session will use a generic identity — that is expected and
> correct. The mirror sharpens through use.

---

## What Does Not Belong in Getting Started After S2

- Legacy migration workflow → `REFERENCE.md` (flagged as removal candidate)
- Extension install/expose/clean cycle → `docs/product/extensions/`
- Full commands table → `REFERENCE.md`
- Python 3.10+ as a standalone prerequisite → dropped (uv handles it)
- Architecture explanation → `docs/product/architecture.md`

---

## See also

- [S2 index](index.md)
- [S1 — README Reduction](../cv9-e4-s1-readme-reduction/index.md)
- [S3 — REFERENCE Split](../cv9-e4-s3-reference-split/index.md)
