# User Experience and Conversational Learning

## Experience principle

The user speaks about the work. Mirror translates the request into a working profile. The user only encounters contract mechanics when teaching, inspecting, correcting, or resolving ambiguity.

The normal experience should feel like continuity, not configuration.

## Ordinary resolution

Journey activation may show one compact line:

```text
How we work: 4 profiles available. Usual profile: strategy.
```

A turn may resolve silently when confidence is high:

```text
User: Rewrite this passage.
Resolution: authoring profile, writer persona, voice guide and rubric.
```

The response should not narrate routing unless explanation is useful or requested. The resolution remains inspectable.

## Explanation surface

When the user asks "Why are you using this persona?" or "What context did you load?", Mirror should answer from a deterministic resolution DTO rather than reconstructing a reason conversationally.

Suggested surface:

```text
CONTEXT RESOLUTION

Journey: O Sentido do Ser
Contract revision: 3
Working profile: Authoring
Persona: escritora-ensaista
Reason: the request matched the profile's rewrite examples
Required references loaded:
  docs/obra/voz.md
  docs/obra/rubrica-de-revisao.md
Warnings: none
```

## One-turn instruction

A transient instruction applies to the current turn and does not create a proposal.

Examples:

```text
Use a more direct tone this time.
For this chapter, do not include philosophical references.
Ask the editor to rewrite this one paragraph.
```

The resolver may treat an explicit one-turn persona or profile choice as the highest-precedence route, but it must not change the contract.

## Durable teaching signals

The learning classifier may propose a contract change when the user expresses durable scope. Strong signals include:

```text
Always...
From now on...
In this journey...
Whenever we work on this project...
Remember that...
Do not do this again in this book...
This should be the rule...
```

A direct command such as "save this as a journey rule" is unambiguous. A repeated correction is weaker. Repetition may trigger a suggestion, never an automatic write.

## Proposal surface

The proposal must show meaning and scope before internal JSON.

```text
PROPOSED JOURNEY RULE

Journey: O Sentido do Ser
Applies when: writing or rewriting book prose
Use: escritora-ensaista
Required references:
  Voice guide
  Editorial rubric
Behavior: preserve journey voice over generic persona cadence

This changes future turns in this journey only.

Confirm, edit, or reject?
```

Advanced inspection may reveal the normalized patch, but ordinary users should not need it.

## Confirmation lifecycle

A proposal has one of these states:

```text
pending
accepted
rejected
expired
superseded
```

Only an explicit confirmation transitions `pending` to `accepted` and activates a new contract revision. "Yes", "confirm", or an equivalent response is valid only when there is one unambiguous pending proposal in the active session and journey. Otherwise Mirror asks which proposal the user means.

Editing a proposal produces a revised pending proposal. It does not mutate the active contract until the revised proposal is confirmed.

## Ambiguity behavior

If two profiles are close, Mirror should not guess invisibly. It can ask a short question:

```text
Do you want authorial rewriting or editorial diagnosis?
```

The answer resolves the turn. Mirror may then ask separately whether this distinction should become a durable journey rule. Execution clarification and contract learning remain separate interactions.

## Repeated correction

Mirror may count semantically similar corrections inside one journey. When a threshold is reached, it can offer:

```text
You have corrected this distinction several times: editorial diagnosis should not rewrite the text. Would you like to save that as a rule for this journey?
```

Recommended initial posture:

- do not build automatic repetition detection in the first delivery slice;
- support explicit durable language and direct teaching first;
- add repetition-based proposals only after user testing demonstrates value;
- never store raw sensitive excerpts merely to count repetition.

## Journey settings surface

The web journey detail should eventually include a section titled "How we work in this journey" with:

- active contract revision;
- usual profile;
- profile cards;
- persona or ego-only choice;
- applicable modes;
- required and optional references;
- proposal history;
- edit, disable, restore revision, and explain actions.

The initial release may provide CLI and conversational surfaces before web editing, but the persisted model must not be CLI-shaped.

## Suggested commands

```bash
uv run python -m memory context contract show <journey>
uv run python -m memory context contract history <journey>
uv run python -m memory context resolve <journey> --query "..." --mode "Mirror Mode"
uv run python -m memory context explain [--session-id <id>]
uv run python -m memory context proposal show <proposal-id>
uv run python -m memory context proposal accept <proposal-id>
uv run python -m memory context proposal reject <proposal-id>
```

A manual authoring command may be added for contributors and tests, but it is not the primary user experience.

## User control

The user can:

- disable the contract without deleting history;
- choose no usual profile;
- override persona or profile for one turn;
- inspect the source of every loaded reference;
- reject or expire proposals;
- restore a previous revision through an explicit confirmation flow;
- ask Mirror to forget a working rule without deleting the journey.

## Language boundary

The model may translate natural language into a typed proposal. It must not write SQL, edit a configuration file, or directly persist model output. The application validates a strict proposal model, renders it, receives confirmation, and only then calls a service method that creates the next revision transactionally.
