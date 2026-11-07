[< CR203](cr203-route-a-turns-persona-by-its-subject-and-let-it-have-none.md)

# Persona-routing eval, 2026-11-07

Run by the Nautilus for Mirror agent for the Navigator, against copies of the maintainer's
production data, read only. Nothing in the Core changed. No prompt from the sample appears
in this document: the turns are private, and this repository is public.

## Question

Can a fast decision model choose a turn's persona better than the keyword router, and can it
say that no persona fits? The Navigator's criterion orders the measures: a wrong persona is
much worse than no persona.

## What Was Compared

| Candidate | How it decides |
|---|---|
| Production router | What production delivered: `detectPersona`, and the session's persona when nothing scores |
| Keywords alone | `detectPersona` re-run on the prompt, no inheritance; nothing scores means none |
| Embedding similarity | Cosine between the prompt and each persona's description, `openai/text-embedding-3-small`, with a similarity and a margin threshold |
| `typesafe/jev-1.14` | Decisions API: one Choice among the 28 personas and one Noul, "does the subject clearly belong to one listed specialist", in one request |
| `liquid/d1-ultra` | The same request |
| `liquid/d1` | The same request |

A model candidate takes the Choice when the Noul is at or above a threshold, and gives no
persona otherwise. A grid also tried a minimum Choice confidence and keeping the previous
persona when the Choice gave it some probability; neither improved on the Noul alone.

The request's `state` was `{ journey, request }`, the request cut to 2,000 characters. Each
Choice option was the persona's key and its description from `identity.metadata`, cut to
280 characters. The Noul listed the same personas in short form. The model saw the turn's
request only, not the conversation.

An OpenRouter detail found on the way: the decision models are not in `GET /api/v1/models`,
the chat catalogue. `typesafe/jev-router` is listed there, but it is a chat-model router, not
a decision model. The decision models have their own pages (`typesafe/jev-1.14`,
`typesafe/jev-1.13`, `~typesafe/jev-latest`, `liquid/d1-ultra`, `liquid/d1`) and are reached
only through `POST /api/alpha/decisions`, with the same OpenRouter key.

## Sample

- Source: Nautilus for Mirror's Pi sessions, every user turn from 2026-11-03 that received a
  Mirror context delivery: 555 turns.
- Eligible: 497, after leaving out requests under 8 or over 2,500 characters and slash
  commands.
- Drawn: 100, shuffled with a fixed seed, at most 30 per Journey. Nine Journeys:
  `mirror-desktop` 30, `livro-lideranca-soberana` 28, `alissonvale-com` 21,
  `vida-economica` 7, `89-livros` 5, `venda-de-livros` 5, `nautilus-agentic-method` 2,
  `estudos-filosoficos` 1, `suporte-softwarezen` 1.
- Labels: each turn has the set of acceptable answers, which may hold several personas,
  `none`, and `keep` (keeping the previous persona is right). Labelled by the agent alone,
  given to the Navigator for review.

The labelling itself is a finding: **32 of the 100 turns ask for a persona.** The other 68
are continuations with no subject of their own: an approval, "it worked", "next batch", a
confirmation, a pasted result.

## Measures

- **Wrong**: a persona was chosen, and it is not in the turn's set. The main measure.
- **Right**: on the 32 turns that ask for a persona, the persona chosen is in the set.
- **Switch**: a persona was chosen and differs from the previous turn's.

## Results

All 100 turns, every candidate at the threshold the Navigator's criterion favours:

| Candidate | Wrong | Right (of 32) | Switches | No persona | Latency p50 / p95 | Cost per turn |
|---|---:|---:|---:|---:|---|---:|
| Production router | 35 | 17 | 33 | 0 | in-process | 0 |
| Keywords alone | 26 | n/a | 31 | 64 | in-process | 0 |
| Embedding, similarity ≥ 0.5, margin ≥ 0.02 | 1 | 3 | 3 | 97 | one embedding, already paid | 0 |
| `typesafe/jev-1.14`, Noul ≥ 0.6 | 2 | 19 | 17 | 76 | 0.49 / 0.64 s | US$ 0.000117 |
| **`liquid/d1-ultra`, Noul ≥ 0.6** | **2** | **28** | 28 | 65 | 0.56 / 1.12 s | US$ 0.000092 |
| `liquid/d1`, Noul ≥ 0.6 | 4 | 20 | 21 | 76 | 0.56 / 0.86 s | US$ 0.000044 |

The Choice alone, always taken, is worse than the production router: `jev-1.14` 59 wrong,
`d1-ultra` 51, `d1` 55. **The gain comes from being able to answer none**, more than from
the model.

The threshold, model by model:

| Noul threshold | `jev-1.14` wrong / right | `d1-ultra` wrong / right | `d1` wrong / right |
|---:|---:|---:|---:|
| 0.5 | 10 / 24 | 4 / 29 | 9 / 22 |
| 0.6 | 2 / 19 | 2 / 28 | 4 / 20 |
| 0.7 | 0 / 15 | 2 / 26 | 4 / 19 |
| 0.8 | 0 / 8 | 0 / 19 | 4 / 16 |

Held out: the threshold was chosen on a random half of the sample and measured on the other
half, 200 times. Per 50 turns, on average:

| Model | Wrong | Right, of about 16 that ask |
|---|---:|---:|
| `liquid/d1-ultra` | 1.5 | 13.3 (83%) |
| `typesafe/jev-1.14` | 0.6 | 7.9 (about 50%) |
| `liquid/d1` | 2.0 | 9.5 |

`jev-1.14` is the most cautious: fewer wrong personas, but it leaves half the turns that ask
for one without it. `d1-ultra` keeps the wrong count near zero and finds most of them.

### What `d1-ultra` got wrong and missed, at 0.6

- Wrong, 2: two continuations on the book Journey ("apply it, but change one word"; a
  numbered list of approvals), given the Journey's writing persona. Harmless in practice,
  since that persona is the Journey's own.
- Missed, 4: a request to sort bank statements, two layout requests about a web page, and a
  request to verify a claim about a model API. Each Choice was right; the Noul was under the
  threshold (0.27 to 0.52).

### Embedding similarity

At any threshold that keeps it from being wrong, it almost never chooses a persona. Short
persona descriptions and short requests do not separate in that space. Not a candidate.

## Tokens And Cost

- Mean input per request: 2,782 tokens on `jev-1.14`, 2,201 on the Liquid models. Output is
  free on all three.
- The 300 decisions and the embedding run cost US$ 0.025 in total.
- At about 100 turns a day, `d1-ultra` costs under one cent a day.

## Limits

- One labeller, the agent; the Navigator's review may move the numbers.
- 100 turns, from one person's use, in Portuguese.
- The model saw the request alone. A continuation is judged without the conversation, which
  is also why "none" is the right answer for most of them.
- The 100 requests were sent through OpenRouter to TypeSafe, Liquid AI and OpenAI.
- The Decisions API is `alpha`; its shape may change.
- Liquid's and TypeSafe's published benchmark claims were not checked; only this sample was.

## Conclusions

1. The persona problem is in orchestration, not in the model: a router with no way to say
   none, and a session persona that every unrelated turn inherits.
2. Letting a turn have no persona removes most wrong personas on its own; the eval measured
   35 wrong in production against 2.
3. A Decisions model with a Noul gate is the way to decide it. `liquid/d1-ultra` at 0.6 is
   the best balance found: 2 wrong, 28 of 32 right, half a second, under a ten-thousandth of
   a dollar per turn.
4. Model and threshold must be configuration, measured again on a labelled set before they
   change.
5. A Journey default persona is worth testing next: it would have turned the two wrong
   picks into right ones.

## Reproducing

The harness was a short script outside both repositories: read the persona rows and the
delivered context lines from copies, draw the sample, call the Decisions API with the
request above, score against the labels. It is not committed, because its inputs are
private. CR203's synthetic regression set is the public counterpart.
