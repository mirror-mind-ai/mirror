[< Story](index.md)

# Plan — CV16.DS8 Persistence and Visibility

## Boundary

DS8 closes the first Explorer release by making Exploratory Stories durable and making Builder handoff packages trustworthy as editorial transfer artifacts. It should not introduce multiple active stories per journey. Historical stories may exist, but only one can be active for a journey at a time.

## Durable Story Model

Introduce durable Exploratory Story storage, likely a new table or equivalent service-backed persistence model:

```text
exploratory_stories
- id
- journey
- title
- status: active | archived | promoted
- current_story
- narrative_summary
- last_story_card
- attractors_json
- experiment_proposal_json
- builder_handoff_json
- source_conversations_json
- artifact_dir
- created_at
- updated_at
- promoted_at
- archived_at
```

Rule:

```text
At most one active Exploratory Story per journey.
```

When a new active story is opened for a journey that already has one, Mirror should ask whether to continue, archive, or replace. For the first release, prefer continuing the active story unless the user explicitly archives it.

## Resume Behavior

`/mm-explore <journey>` should:

- activate Explorer Mode;
- load the active durable Exploratory Story if one exists;
- render `△ EXPLORATORY STORY RESUMED` when resuming;
- otherwise start with the normal Explorer transition surface.

## Editorial Handoff Workflow

DS7 handoff generation should be treated as a draft unless the editorial workflow has collected enough evidence.

Before final handoff, Explorer should:

- identify source conversations already attached to the story;
- search or ask for earlier relevant conversations when the exploration has a longer origin;
- include source conversation ids, titles, and role in `index.md`;
- include `full-conversation.md` when the user confirms raw source material should be preserved;
- keep `index.md` as the editorial synthesis and reading guide.

The default handoff package becomes:

```text
index.md
exploratory-story.md
handoff-info.md
product-design-proposal.md
full-conversation.md        # only when user confirms source evidence inclusion
```

## Handoff Completeness Checklist

Before marking a handoff ready for Builder, Explorer should verify whether the documents contain:

- continuous exploratory thickening, not only final state;
- source evidence list;
- surfaces;
- phases;
- examples or simulations;
- product decisions;
- user conversation flows;
- transition rules;
- risks;
- boundaries;
- open questions;
- what Builder should preserve;
- what Builder should not assume.

If missing, Explorer should say what is missing and ask whether to complete the handoff before promotion.

## Privacy and Obfuscation for full-conversation.md

Before writing `full-conversation.md`, Mirror must run a privacy review and obfuscation pass.

Sensitive material to detect and obfuscate includes:

- personal details about the Navigator or third parties that are not needed for Builder;
- home directories and local filesystem paths;
- API keys, tokens, credentials, secrets, and environment values;
- financial or health details unrelated to the product handoff;
- private preferences or biographical material not relevant to the exploration;
- email addresses, phone numbers, addresses, document numbers, account identifiers;
- names of private people when they are not needed as product evidence.

Suggested replacements:

```text
/Users/alissonvale/...        -> [LOCAL_PATH]
API key or token              -> [SECRET]
personal financial detail     -> [PRIVATE_FINANCIAL_DETAIL]
private biographical detail   -> [PRIVATE_PERSONAL_DETAIL]
third-party private name      -> [PRIVATE_PERSON]
```

The obfuscation pass should be conservative. If uncertain, ask the user whether the raw excerpt should be included, obfuscated, summarized, or omitted.

The generated `full-conversation.md` should include a header:

```text
This document is source evidence for a Builder handoff. Sensitive personal or local details may have been obfuscated before writing.
```

## Visibility

Minimal visibility for the first release:

- `explore load` shows resumed active story;
- `explore story snapshot` reads durable story state;
- a CLI command can list stories for a journey;
- handoff artifacts link back to the durable story id.

Web visibility can wait unless it is cheap and follows existing Workspace patterns.

## User Validation in Pi

The Navigator validates as a user, without internal commands:

```text
/mm-explore soul-mode
```

Expected: if an active story exists, Mirror renders `△ EXPLORATORY STORY RESUMED`.

Then:

```text
me mostra as explorações dessa jornada
```

Expected: Mirror shows active and historical Exploratory Stories.

Then:

```text
prepare o handoff incluindo as conversas fonte, mas obfusque informações pessoais e caminhos locais
```

Expected:

- Mirror asks for or confirms source conversations;
- `full-conversation.md` is generated only after confirmation;
- sensitive details are obfuscated;
- `index.md` lists source evidence;
- handoff completeness checklist is satisfied or missing items are named.

## Risks

### Raw source evidence leaks private data

Do not write raw recalled conversations without privacy review. Obfuscation and confirmation are required.

### Persistence overcomplicates first release

Keep the active-story rule simple. Historical records are allowed; simultaneous active exploration is not.

### Handoff becomes too heavy

The handoff package should be rich enough for Builder, but not every exploration needs full raw conversation evidence. Ask when source evidence is needed.
