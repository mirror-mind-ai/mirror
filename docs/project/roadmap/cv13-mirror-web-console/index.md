[< Roadmap](../index.md)

# CV13 — Mirror Web Experience

**Status:** 🟡 Planned
**Goal:** Evolve Mirror's local web surface from 1.0 read-only visibility into a coherent local experience for inspecting Mirrors, refining workspace/identity views, managing preferences and configuration, improving conversation data, and preparing safe streamed operations.

---

## What This Is

CV13 is the post-1.0 web arc for Mirror Mind. CV9.E6 proved that a local read-only web surface can make Identity and Workspace visible without forcing the user into SQLite or CLI commands. CV13 turns that foundation into a fuller product experience.

The scope is intentionally staged. The early releases refine the read-only surface. Later releases introduce user preferences, multi-Mirror selection, configuration surfaces, conversation intelligence, and a controlled operations runner. The agentic web console remains the major-release horizon, not the first implementation slice.

The product direction is **Mirror Web Experience**: a local-first place where a user can see, understand, and eventually operate their Mirror with clear boundaries, evidence, and approval.

---

## Release Path

The next major web release should be reached through minor releases that each stand on their own:

| Target | Theme | Outcome |
|--------|-------|---------|
| v1.1 | Read-only Web Refinement | The existing web app becomes cleaner, Workspace-first, and more useful for browsing identity, journeys, memories, search results, and conversation summaries. |
| v1.2 | Multi-Mirror and Preferences | The web app can choose among local Mirrors under `~/.mirror-minds` and persist user-facing preferences such as avatar and color mode. |
| v1.3 | Configuration Console | Mirror and journey configuration become inspectable and, where safe services exist, editable through guarded web flows. |
| v1.4 | Conversation Intelligence | Conversation transcripts are readable, titles become meaningful, and retitle operations exist for individual and legacy conversations. |
| v1.5 | Web Operations Runner | The web app can run an allowlisted set of maintenance operations with parameters, dry-run where applicable, streaming output, and audit evidence. |
| v2.0 | Agentic Web Console | The web app can prepare and launch controlled background agent runs with streamed events, approvals, cancellation, history, and evidence. |

Version numbers are planning labels, not release commitments. They express the intended order and risk gradient.

---

## Branch and Cadence Policy

CV13 work should use a development branch per minor-release slice, not a branch per story:

```text
cv13/v1.1-read-only-web-refinement
cv13/v1.2-multi-mirror-preferences
cv13/v1.3-configuration-console
cv13/v1.4-conversation-intelligence
cv13/v1.5-web-operations-runner
cv13/v2-agentic-web-console
```

`main` remains the clean integration branch. `stable` remains the user-facing release channel. `hotfix/*` may be used for urgent production fixes.

For CV13, the Navigator cadence is compressed: the Driver does not stop for approval at every intermediate Ariad checkpoint. The Navigator validates the implemented story and authorizes the next story. After a story is accepted, the Driver commits automatically on the current development branch. When a new story starts, the Driver pushes the previous accepted story's commit automatically.

This policy depends on small stories, explicit validation evidence, and coherent story-close checkpoints.

---

## Epics

| Code | Epic | User-visible outcome | Status |
|------|------|----------------------|--------|
| [CV13.E1](cv13-e1-read-only-web-refinement/index.md) | Read-only Web Refinement | Workspace opens first, the shell is calmer, Identity and journey views expose better chips, totals, memory/search pages, and conversation cards without task noise | 🟢 In Progress |
| CV13.E2 | Multi-Mirror and Preferences | The user can choose another local Mirror database and manage profile preferences such as avatar and dark/light/automatic mode | 🟡 Planned |
| CV13.E3 | Configuration Console | The web app can inspect Mirror configuration currently held in environment variables and manage journey metadata through safe service boundaries | 🟡 Planned |
| CV13.E4 | Conversation Intelligence | The user can read stored message exchanges and generate useful conversation titles individually or in batch for legacy data | 🟡 Planned |
| CV13.E5 | Web Operations Runner | The user can execute allowlisted maintenance operations from the web app and receive streamed progress and results | 🟡 Planned |
| CV13.E6 | Agentic Web Console | The web app is ready to launch controlled Pi or agent-background work with event streaming, approval, history, and evidence | ⚪ Future |

---

## Backlog Notes from Product Review

### Read-only web refinement

- Make Workspace the default page and Identity the second perspective.
- Redesign the main page header.
- Remove the perspective badge from the top right.
- Use three-letter persona icons instead of two-letter icons.
- Add a Memories page.
- Add a Search Results page.
- Add links or pages for the chips shown on Identity cards.
- Show chips with totals for conversations, messages, memories, and decisions.
- Remove tasks from journey visualization.
- Improve conversation cards in the journey tab.

### Multi-Mirror and preferences

- View another user's Mirror by choosing another database under `~/.mirror-minds`.
- Add a user profile/preferences page.
- Support avatar selection.
- Support dark mode, light mode, and automatic mode.

### Configuration

- Add a Mirror settings page for configuration that currently lives in `.env`.
- Add a journey configuration page for colors, icons, briefing updates, and other metadata.

### Conversation intelligence

- Show message exchanges recorded in the database.
- Replace first-user-input conversation titles with useful generated titles.
- Design a retitle operation that Mirror can run systematically.
- Support legacy conversation retitle for a whole user.
- Support individual retitle for a selected conversation.

### Web operations

- Allow selected maintenance operations, such as null-journey repair or conversation retitle, to run from the web app.
- Stream operation output to the browser.
- Prepare the UI and job model for future Pi background agent runs.

---

## Non-goals for the first minor release

CV13.E1 should not introduce writes, background agent execution, arbitrary script execution, remote serving, or authentication. It should stay inside the read-only surface and make the current web app feel like a product rather than a diagnostic dashboard.

---

## Done Condition

CV13 is done when:

- Workspace and Identity are coherent, polished, and useful as the default web entry points.
- Memories, search results, conversations, and journey details are inspectable from the browser.
- A local user can choose among Mirrors under `~/.mirror-minds` without confusing source-of-truth boundaries.
- User profile preferences are persisted safely in the user home.
- Mirror and journey configuration surfaces respect existing service boundaries and avoid raw database or `.env` mutation from UI code.
- Conversation retitle exists as a safe, repeatable operation with individual and batch paths.
- Web operations are allowlisted, streamed, auditable, and cancellable where possible.
- The agentic console architecture is ready for controlled background agent runs with approval and evidence.
- The local-first privacy boundary remains intact.

---

## Relationship to earlier web work

CV9.E6 remains the completed 1.0 visibility foundation. Its perspective shell, surface read models, Identity page, object detail, Source Context, and Workspace slice are the substrate for this CV.

The earlier planned `CV13.E1 Docs Browser` story was effectively absorbed by the web foundation work and is no longer the front door for CV13. The old story files remain as historical planning notes until a later documentation cleanup.

The exploratory [Agentic Web Console](../../../product/envisioning/agentic-web-console.md) note has graduated into this CV as the v2.0 horizon, with implementation deferred until the safer read-only, preference, configuration, conversation, and operations layers exist.

---

## See also

- [CV9.E6 Web Visibility](../cv9-mirror-1-0/cv9-e6-web-visibility/index.md)
- [Mirror Web Perspectives](../../../product/envisioning/web-perspectives.md)
- [Agentic Web Console](../../../product/envisioning/agentic-web-console.md)
