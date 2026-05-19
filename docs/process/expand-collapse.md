[< Process](../index.md)

# Expand and Collapse

Expand and collapse describe the operating rhythm behind the Mirror Mind development process.

- **Expand** differentiates. It names parts, separates concerns, reduces ambiguity, and creates explicit boundaries.
- **Collapse** integrates. It relates parts, names the whole, surfaces the value that emerged, and restores coherence.

Neither movement is better. A project needs both. Expand without collapse becomes fragmentation. Collapse without expand becomes vague unity.

The practical rule is simple:

> Expand increases the system's capacity to be acted upon. Collapse increases the system's capacity to act as a whole.

---

## Expand

Expand is the right movement when work is blocked by ambiguity.

Signals:

- The next step is unclear.
- Several concerns are mixed together.
- A story feels too large to verify.
- A decision is being argued without named alternatives.
- A document describes a whole but not its parts.

Good expand work names:

- the unit being differentiated,
- the parts that emerge,
- the boundary between those parts,
- the tension that made the distinction necessary.

Expand is not decomposition for its own sake. It makes latent possibility actionable through distinction. It changes the system's disposition by making it more intelligible, optional, diagnosable, assignable, testable, implementable, or navigable.

Examples:

| Expand movement | What becomes possible |
|---|---|
| Intention into options | Optionality |
| Ambiguity into concepts | Intelligibility |
| Problem into causes | Diagnosability |
| Decision into trade-offs | Evaluability |
| Story into tasks | Executability |
| Behavior into cases | Testability |
| System into components | Modifiability |
| Change into risks | Prudence |
| Document into sections | Navigability |

Examples in Mirror Mind:

- Splitting the docs into README, Getting Started, REFERENCE, Architecture, and API docs.
- Separating runtime skill wrappers from core Python skill logic.
- Dividing a CV into epics and stories.
- Extracting a storage component from a broad store facade.

---

## Collapse

Collapse is the right movement when work is lost in fragments.

Signals:

- Many files changed but the value is hard to name.
- Several stories are done but the epic status is unclear.
- The worklog, roadmap, and code all tell slightly different stories.
- A version exists but has no narrative release note.
- A refactor fixed parts but did not explain the new whole.

Good collapse work names:

- which parts are being gathered,
- why they belong together,
- the new whole,
- the property or quality that emerges from the whole.

Collapse is not aggregation. It changes a property of the system. In that sense, collapse makes the system more valuable by changing its state or disposition: more decidable, more validatable, more trustworthy, more transmissible, more coherent, more releasable.

Every collapse should answer:

> What did the whole gain that the parts did not have alone?

Examples:

| Collapse movement | Emergent property |
|---|---|
| Plan collapses options | Decidability |
| Manual validation route collapses implementation details | Validatability |
| Tests collapse cases | Trustworthiness |
| Documentation collapses facts | Transmissibility |
| Review collapses changes | Discernment |
| Coherence check collapses artifacts | Coherence |
| Status collapses completed work | Recognition |
| Release note collapses changes | Public narrativity |
| Version collapses delivery | Milestone |

Examples in Mirror Mind:

- Marking an epic done after all its stories are verified.
- Writing a release note for a closed arc of work.
- Updating the journey context after roadmap status changes.
- Recording a decision that resolves several planning threads.

---

## Making the Movement Visible

Expand/collapse should not remain hidden inside the Driver's interpretation. The Driver names the movement when it helps the Navigator understand what kind of attention is needed.

Use short narration at transitions and checkpoints:

- "I am expanding this ambiguity into options."
- "I am collapsing these findings into a plan."
- "I am expanding the story into tasks and risks."
- "I am collapsing the implementation into a validation route."
- "Before closing, I am collapsing the artifacts through a coherence check."

Do not narrate every micro-step. The goal is orientation, not self-commentary.

---

## Where the Rhythm Appears

### Roadmap hierarchy

A CV expands into epics. An epic expands into stories. A story expands into tasks. The reverse direction is collapse: completed tasks close a story, completed stories close an epic, completed epics close a CV.

### Process, project, product

The [triad](triad.md) is an expand of the word "work" into three legitimate dimensions. The coherence check in the [Development Guide](development-guide.md) is the corresponding collapse: it asks whether those dimensions still form one coherent project.

### Story lifecycle

The lifecycle alternates between the two movements:

| Step | Movement | Description |
|---|---|---|
| Plan | Expand | Alternatives, boundaries, and decisions become explicit. |
| Implementation | Expand | The plan becomes concrete parts. |
| Test and validation route | Collapse | Parts become something the Navigator can verify. |
| Documentation | Collapse | Facts become transmissible narrative. |
| Review ritual | Expand | Changed parts are re-opened with their rationale. |
| Coherence check | Collapse | Artifacts are tested as one whole. |
| Status | Collapse | Completed work becomes recognized project state. |
| Commit, push, release | Collapse | Value receives a durable public name. |

---

## Opening Question

At the beginning of a work session, ask:

- Am I blocked by ambiguity? Expand.
- Am I lost in fragments? Collapse.
- Is the work flowing? Do not force a movement. Continue the current lifecycle step.

The mistake is not choosing one movement or the other. The mistake is choosing the wrong movement for the moment.
