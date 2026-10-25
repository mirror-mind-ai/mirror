[< CV9 Mirror Mind 1.0](../index.md)

# CV9.DS8 — One Doorman: Mirror's Context Before the Model on Every Runtime

**Status:** 🟡 Planned
**Type:** Delivery Story
**Source:** [CR165](../../../refinement/rs010-cv22-oracle-and-port-hygiene/cr165-pi-puts-no-mirror-context-before-the-model.md),
promoted on 2026-10-24 after its measurement and the Navigator's three decisions.
**User-visible outcome:** On every runtime that can carry it, Mirror's context reaches
the model before it answers, put there by the runtime and not fetched by the model: the
full folder on an explicit Mirror turn, loaded once; and on each ordinary turn while
Mirror Mode is on, the persona the question newly calls for and the memories relevant
to that question. The mirror keeps its voice and its persona signature across a
conversation, and re-routes when the topic moves. Pi reaches L4, measured.

---

## What This Is

Mirror Mode is the product: `mirror mirror load` builds a folder from the database —
the identity layers, a persona routed from the question, the journey, the shadow
patterns, and the memories and attachments relevant to the question — and the model
answers as the mirror with that folder open. What is at stake is always whether the
folder reaches the model, and when.

CV21.DS11 wrote the parity matrix and made the L3/L4 line explicit: at L4 the runtime
hands the folder to the model through a hook; at L3 the model loads it through the
`/mm-mirror` skill. By that line Pi, the harness Getting Started recommends, is L3.
CR165's measurement on Pi 1.4.0 (2026-10-24) showed what that means in a conversation:
the model loads the folder once, on the turn that invokes the skill — or by itself, on
an unprompted personal question — and every follow-up is answered from that one load:
no reload, no persona re-routing when the topic changes domain, no signature after the
first reply.

Today there are three doormen with three policies: the Claude-family inject hook (the
explicit form, then once on the next ordinary turn, then never), Antigravity's
`PreInvocation` (every turn from session start, with no prompt to route on), and Pi
(none). On every runtime with a doorman the `mm-mirror` skill's hard constraint
("never answer without loading first") makes the explicit turn load twice. Copying the
hook to Pi would buy one folder on one turn for that double load: the expedient fix the
Navigator declined.

This Delivery Story builds one doorman: one decision in the core, one policy, called by
every runtime's hook and by the Pi extension, trusted by the skill, with one signature
rule. The decisions, taken 2026-10-24 ([decision](../../../decisions.md#one-doorman-puts-mirrors-context-before-the-model-on-every-runtime)):

1. **Memories are refreshed on every ordinary turn** while Mirror Mode is on: a
   relevance search keyed to that turn's question, one embedding call per turn, its
   cost in the ledger. Persona routing is a keyword score and costs nothing.
2. **The signature is `◇ persona-name`**, the rule `AGENTS.md` already states; the
   skill's copies and the core's banner follow it, and a guard holds them.
3. **The work is this Delivery Story under CV9**, Mirror Mind 1.0.

## The Policy

The doorman, given the prompt and the session's state, answers *nothing*, *the full
folder*, or *a delta*:

1. **The explicit Mirror form** in the prompt: the full folder, routed from the query,
   before the first token; the session is marked active by its own id.
2. **Mirror Mode active, an ordinary turn:** the prompt is routed with `detectPersona`;
   a persona that newly scores above threshold has its section injected and becomes
   the session's persona; the memories and attachments relevant to this prompt are
   injected when any score above the threshold. The identity layers are not repeated.
3. **Mirror Mode not active, an ordinary turn:** nothing. The model's own routing may
   invoke the skill; the session learns that the load ran, and the doorman takes over
   from the next turn. How it learns, measured by TS1 (2026-10-24): the load names its
   session from the environment — `CLAUDE_CODE_SESSION_ID` on Claude Code 2.1.310,
   `CODEX_SESSION_ID` on Codex 0.164.0 (both in the model's shell and in the hooks'
   own, both undocumented), and `MIRROR_SESSION_ID`, which Pi's extension sets at
   `session_start` — read by the front door as its environment session id and honored
   by `writeMirrorState`, which today takes the explicit option alone. A session learns
   from the harness, never from the model's reply.

Every injected block carries one line the model can read: the runtime delivered
Mirror's context for this turn. The skill's constraint becomes *load first, unless it
was delivered*; the transition surface is rendered from the delivered block.

## Candidate Stories

Ordered so the one open mechanism is settled first, the core before any runtime, the
skill before any live measurement (so an explicit turn loads once where it is
measured), and the docs last, from what was measured.

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV9.DS8.TS1](cv9-ds8-ts1-the-session-learns-a-load-the-model-ran-itself-measured/index.md) | The session learns a load the model ran itself, measured | Technical Story | Measured, not designed: whether the agent's shell on Claude Code carries `CLAUDE_CODE_SESSION_ID` (CR100's lead) so the skill's `mirror mirror load` can name its session, and whether Pi's extension can see the load as a tool call and mark the session. One mechanism per runtime decided and recorded, with version, binary, and date Done 2026-10-24: Claude Code hands the Bash tool and the hooks `CLAUDE_CODE_SESSION_ID`, Codex `CODEX_SESSION_ID` (exec and TUI), both equal to the hooks' session row; on Pi the extension's `MIRROR_SESSION_ID` arrives and binds, and `writeMirrorState` must learn the environment id; the tool_call rewrite works and is not chosen | ✅ Done |
| [CV9.DS8.TS2](cv9-ds8-ts2-the-doorman-one-decision-in-the-core-with-its-command/index.md) | The doorman: one decision in the core, with its command | Technical Story | `ts/src/mirror/doorman.ts` decides nothing, the full folder, or a delta from the prompt and the session's state, by the policy above; renders a delta (the persona's section, the relevant memories and attachments) and the "delivered for this turn" line; writes the session's state by its id; reached in-process by the hooks and as one front-door command by the Pi extension. Tests first, including the ledger row the per-turn search writes Done 2026-10-24: `doorman.ts` decides and renders by the policy; every active turn opens with `=== mirror context delivered by the runtime for this turn: …` carrying the persona and `sign ◇ <persona>`; one embedding per delta turn in `llm_calls`, no reinforcement, scores logged for US5 to set the threshold; `mirror mirror doorman` reads before it writes; the session reader covers `CLAUDE_CODE_SESSION_ID` and `CODEX_SESSION_ID` and `writeMirrorState` honors it | ✅ Done |
| [CV9.DS8.TS3](cv9-ds8-ts3-the-skill-trusts-delivered-context-and-one-signature-rule/index.md) | The skill trusts delivered context, and one signature rule | Technical Story | The `mm-mirror` skill, in every runtime's copy, loads first unless the runtime delivered the context for this turn, and renders the transition from the delivered block; the signature is `◇ persona-name` in `AGENTS.md`, the skill's copies, and the core's banner, held by a guard test Done 2026-10-24: both bodies read the prefix `doorman.ts` exports and exclude a tool result from "delivered"; `✦ Persona:` is gone from the skill and the banner; `mirrorSkillContract.test.ts` holds the five surfaces; a fresh Pi session's explicit turn still loads first until US5 | ✅ Done |
| [CV9.DS8.US4](cv9-ds8-us4-claude-code-and-codex-through-the-one-doorman/index.md) | Claude Code and Codex through the one doorman | User Story | The Claude-family inject hook calls the doorman. Measured live on the installed Claude Code and Codex: an explicit turn loads once; a follow-up in another domain re-routes and signs; an unprompted personal question is followed by doorman turns; no regression in logging or MCP Done 2026-10-25: `claudeInject` hands the turn to `mirror doorman`; the doorman treats a session as in Mirror Mode only while its operating mode says so, and `mirror load` plus the Builder/Explorer/Soul routes stamp the session the harness named (`CLAUDE_CODE_SESSION_ID` / `CODEX_SESSION_ID`); 16/16 live on Claude Code 2.1.310 and Codex 0.164.0; `hook_injected` and the checkout-plus-plugin double hook carried as debt | ✅ Done |
| [CV9.DS8.US5](cv9-ds8-us5-pi-through-the-one-doorman-at-l4/index.md) | Pi through the one doorman, at L4 | User Story | The extension's `before_agent_start` calls the doorman's command for the turns the policy names and carries the block as a message, awaiting only the turns that inject; outside Mirror Mode a turn costs nothing, as today. Measured live on the installed Pi with CR165's route: the explicit turn loads once, the domain change re-routes and signs, the unprompted question is followed by doorman turns. Pi's matrix row moves to L4 with version, binary, and date Done 2026-10-25: the extension names its session (`MIRROR_SESSION_ID`) and carries the doorman's block as a `mirror-context` message; the memory threshold is 0.4 on the semantic score the ranker now reports; three live walks on Pi 1.4.0, every row passed; found and fixed on the way: the registration guard that left the checkout's Pi without handlers, the first-prompt logger erasing the persona, CR008 option B; debts paid in-story: skill-command turns get nothing, `mm-new` ends Mirror Mode, memories delivered once stay delivered, compaction re-delivers the folder, `hook_injected` dropped (migration 018) | ✅ Done |
| [CV9.DS8.TS6](cv9-ds8-ts6-antigravity-through-the-one-doorman/index.md) | Antigravity through the one doorman | Technical Story | `PreInvocation` calls the doorman with the turn's prompt and answers its block as a persistent `systemMessage` step. Planned to read the prompt from the transcript, since agy 1.4.2's payload carried none (DS12.TS3 L7); TS6's probe found agy 1.4.7 carrying it in the payload as `lastUserInput`, so no transcript is read, and a payload without it keeps today's injection. Measured live on the installed agy for no regression Done 2026-10-25: at invocation 0 the hook hands `lastUserInput` to `mirror doorman` in process and answers one persistent `systemMessage` step; `SessionStart` stamps the conversation's own mode Mirror Mode and sets the refresh; agy before 1.4.7 keeps the ephemeral injection; walked live on agy 1.4.7 with real providers, every verdict passed, the model signed every delta, 0.23–1.02 s per turn against a 15 s budget; the matrix row at agy 1.4.7; CR169–CR173 carried | ✅ Done |
| [CV9.DS8.TS7](cv9-ds8-ts7-written-where-a-user-reads-it/index.md) | Written where a user reads it | Technical Story | The contract's injection section and "Mirror Mode injection models" table describe the one doorman and its policy per runtime; the parity matrix, Getting Started's table, and the architecture carry Pi's new row; the decisions log and REFERENCE say what a turn costs and where it is counted. Done 2026-10-25: the contract's injection section, models table, CLI Reference, and four reference tables read the doorman; the matrix's Claude Code and Codex rows at US4's walk (2.1.310, 0.164.0), every cell not re-measured annotated with its own version and story; Getting Started says what Mirror Mode does in one plain sentence, claiming only what all four walks measured; the architecture drops `hook_injected`; the decisions log carries the measured cost, no price; REFERENCE matches the code | ✅ Done |

## Non-goals

- Grok Build: it discards hook context (DS12.TS4 L2/L3; CR143), so its doorman stays
  inert and its row stays L3.
- A change to what the folder contains, how personas are scored, or how memories are
  ranked: the doorman decides *when* and *what part*, not the content.
- A model call in the doorman. Routing is a keyword score; the one network call per
  turn is the embedding for the memory search, decision 1.
- The guess of "the session" (CR100) beyond what TS1 measures for the skill's own load.

## Done Condition

DS8 is done when:

- one module in the core makes the doorman's decision, and the Claude-family hooks,
  Antigravity's hook, and the Pi extension call it;
- an explicit Mirror turn loads the folder once on Claude Code, Codex, and Pi,
  measured live;
- on each of those runtimes, a follow-up in another domain re-routes its persona and
  signs it `◇ persona-name`, and an unprompted personal question is followed by doorman
  turns, measured live;
- Antigravity runs the doorman with no regression, measured live;
- the parity matrix records Pi at L4 with version, binary, and date, and every doc the
  guard holds agrees;
- CR165 reads `promoted` with this Delivery Story as its target.
