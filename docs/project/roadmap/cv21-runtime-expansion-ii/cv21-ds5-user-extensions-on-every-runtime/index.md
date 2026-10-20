[< CV21](../index.md)

# CV21.DS5 — User Extensions On Every Runtime

**Status:** 🟢 In Progress — TS1, US2, and US3 done; TS4 remains
**Type:** Delivery Story
**Renamed from:** CV21.E5, in the CV21 Ariad taxonomy migration (2026-10-13). The
[code map](../index.md#code-map) resolves the old code.
**User-visible outcome:** A user's installed extensions, `prompt-skill` and
`command-skill` alike, are discoverable and invocable on Claude Code, Codex,
Antigravity, and Grok Build as they are on Pi, through one exposure design chosen by
measurement, in steps Mirror prints and `runtime diagnose` understands. `review-copy`
runs on each, recorded with version, binary, and date.

---

## What This Is

An extension belongs to one Mirror home. It is installed into
`~/.mirror-minds/<user>/extensions/<id>/`, its `skill.yaml` declares the runtimes it
serves and the skill each one gets, and `mirror extensions install` writes that skill
and an `extensions.json` catalog under `runtime/skills/<runtime>/` for each declared
runtime ([the contract](../../../../product/specs/runtime-interface/index.md#external-skill-runtime-surface-contract)).
Two runtimes consume the result. Pi's extension reads the `pi` catalog at session
start. Claude Code sees an extension only where `mirror extensions expose-claude
--target-root <dir>` projected it, into `<dir>/.claude/skills/`.

[DS12.TS5](../cv21-ds12-runtime-re-baseline/cv21-ds12-ts5-extension-surface-re-grounding/index.md)
measured where that leaves the reference extension `review-copy`, on 2026-10-13 with
v0.32.1, codex 0.162.1, and grok 1.0.52, and from agy 1.3.4's embedded guide:

- It reaches Claude Code through `expose-claude`, Pi through its catalog, and Grok by
  accident: Grok's Claude compatibility reads `~/.claude/skills/`, so an extension
  projected there reaches Grok with no Grok step.
- It does not reach Codex or Antigravity.
- `~/.agents/skills/` is read by both Codex and Grok at user level. agy's user-level
  root is `~/.gemini/config/skills/`, and agy reads neither of the other two.
- CV21's plan to bundle extensions into the canonical plugin no longer fits. The
  plugin ships inside the npm package, built once and shared by every home, while an
  extension belongs to one home.

TS5 left the gap as a choice among three shapes, and decided none:

- **(a) Two exposure targets.** `~/.agents/skills/` for Codex and Grok, and
  `~/.gemini/config/skills/` for agy. Each needs a runtime block in `skill.yaml`, or a
  decision that one block serves all of them.
- **(b) A per-home generated plugin.** Each Mirror home generates a small
  Claude-format "extensions" plugin, and every runtime that takes the canonical plugin
  installs it the same way.
- **(c) MCP prompts.** `mirror mcp` serves extensions as MCP prompts. Prompts are
  pull-based, and in October agy did not take the plugin's MCP server.

Four facts under that choice have moved since:

- agy now reaches the plugin's MCP server, 7 tools on agy 1.4.2
  ([DS7.US4](../cv21-ds7-antigravity-through-skills-and-a-native-layer/cv21-ds7-us4-antigravity-at-the-bar-measured-live/index.md),
  2026-10-18). TS5's objection to (c) is gone, if agy offers MCP prompts at all.
- Grok attaches the server, with its tools behind `search_tool`/`use_tool`
  ([DS10.TS2](../cv21-ds10-grok-build-through-the-canonical-plugin/cv21-ds10-ts2-the-mcp-server-attaches-on-grok-or-the-reason-is-recorded/index.md),
  grok 1.0.62). Whether it offers MCP prompts is unmeasured.
- Codex gets its skills from the plugin now, not from the skills link v0.32.1
  installed, which DS4.TS5 removed, and it keeps a plugin's MCP tools behind
  `tool_search` ([DS4](../cv21-ds4-codex-through-the-canonical-plugin/index.md)). TS5
  read `~/.agents/skills/` on codex 0.162.1.
- Grok is at 1.0.62 and agy at 1.4.2. TS5 measured grok 1.0.52 and read agy's root
  from its guide; nobody has observed agy load a skill from it.

What DS5 owns is the distance between that evidence and a shipped product:

- **No design is chosen, and each shape leaves questions TS5 did not ask.**
  - Which runtimes offer MCP prompts to the user at all, how a user invokes one, and
    whether the model can still find an extension the way it finds a skill (c).
  - What refreshing costs. Codex and Grok install a plugin as a copy, and `grok plugin
    update` does nothing for a local copy
    ([DS10.US1](../cv21-ds10-grok-build-through-the-canonical-plugin/cv21-ds10-us1-grok-installs-mirror-in-the-steps-mirror-init-prints/index.md)),
    so (b) could need a reinstall each time an extension changes. (a) and (c) would
    read the home as it is.
  - What two Mirror homes on one machine do to each shape. The user-level roots in
    (a) are shared by every home, a generated plugin in (b) needs a name per home, and
    `mirror mcp` in (c) answers for the home it resolves.
  - Whether Grok, which reads both `~/.claude/skills/` and `~/.agents/skills/`, shows
    a skill found in both twice.
- **The installed extensions declare only `claude` and `pi`.** The manifest enforces a
  command-name convention for those two runtimes alone (`ext:` and `ext-`). On the
  maintainer's home, all thirteen installed extensions, nine `command-skill` and four
  `prompt-skill`, declare no runtime beyond those two. A design that needs every
  manifest rewritten strands them until each author rewrites it.
- **Nothing knows the wiring.** `mirror init` prints nothing about extensions.
  `runtime status` grades an installed extension by its manifest and, for a
  `command-skill`, its migrations. Nothing checks whether an extension reaches a
  runtime.
- **The CV's own words are behind.** CV21's Product Outcome says extensions ride "the
  same plugin/MCP package", and its Done Condition says "via the shared package". TS5
  showed the shared plugin cannot carry them.
- **`review-copy` has never run on Codex, Antigravity, or Grok**, and CV21's Done
  Condition asks it of all three.

## Outcome

One exposure design is chosen by measurement on the installed Claude Code, Codex,
agy, and Grok, and recorded in decisions.md. A home's installed extensions reach all
four through steps Mirror prints or performs, the extensions already installed among
them without their manifests rewritten, and `runtime diagnose` says when they do not.
`review-copy` is invoked live on each, with version, binary, and date. The runtime
interface contract, the extension docs, Getting Started, and REFERENCE say how a
user's extensions reach each runtime.

## Candidate Stories

Ordered so the design is measured and chosen (TS1) before anything is built (US2),
the build is in place before the live proof the Navigator runs (US3), and the proof
gives the docs (TS4) their version, binary, and date.

| Code | Story | Type | Outcome | Status |
|------|-------|------|---------|--------|
| [CV21.DS5.TS1](cv21-ds5-ts1-one-exposure-for-user-extensions-chosen-from-three-shapes-measured-on-today-s-ru/index.md) | One exposure for user extensions, chosen from three shapes measured on today's runtimes | Technical Story | In scratch `HOME`s on the installed Claude Code, Codex, agy, and Grok, each with version, binary, and date, three shapes are measured. (a) The user-level skill roots: which runtime lists a skill from `~/.claude/skills/`, `~/.agents/skills/`, and `~/.gemini/config/skills/`, and whether Grok shows a skill found in two roots twice. (b) A generated per-home plugin, installed the way each runtime takes the canonical one, and what refreshing it costs where the install is a copy. (c) MCP prompts from `mirror mcp`: which runtimes offer them, how a user invokes one, and whether the model can find one as it finds a skill. Each shape is also judged against two homes on one machine and against the manifests already installed. The decision and its reasons go to decisions.md, and CV21's Product Outcome and Done Condition stop saying that the shared package carries extensions Done 2026-10-19 on claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62: **(b), the per-home generated plugin**. Listed and found on all four (agy by its `/mirror-ext-<user>:ext-review-copy` form); a changed extension is live on Claude Code in place and on Codex, agy, and Grok after one reinstall each, measured; a plugin per home installs beside another's. (c) attached on all four and reached no model; (a) reached no runtime from a single root. Decision in decisions.md; the CV21 index reworded; CR144 captured (the DS7 routes' agy credential location) | ✅ Done |
| [CV21.DS5.US2](cv21-ds5-us2-a-home-s-installed-extensions-reach-every-runtime/index.md) | A home's installed extensions reach every runtime | User Story | Gated on TS1. A user who installs an extension finds its skill on Claude Code, Codex, Antigravity, and Grok in the shape TS1 chose, through steps `mirror init` prints or `mirror extensions install` performs, and uninstalling removes it from everywhere it was exposed. This holds for `prompt-skill` and `command-skill` extensions alike, and for the extensions already installed, with no manifest rewritten. `runtime diagnose` and `runtime update` know the new wiring the way DS4.TS6 and DS10.US1 taught them the plugin's: an exposure behind its home, a dangling one, and a duplicated one are reported, and absence is not drift. Pi keeps its catalog path Done 2026-10-19 on claude 2.1.296, codex 0.163.0, agy 1.4.2, grok 1.0.62: `install`, `uninstall`, and `sync` regenerate `runtime/plugin/mirror-ext-<user>/` (version `0.1.<generation>`, skills only, atomic) and print the step a runtime still needs, the reinstall for a stale copy, 'still has' after an uninstall, and the extensions not carried; `diagnose` raises five `ext_plugin_*` findings, stale as not-equal; `status` prints the plugin line. Each runtime lists the skill after its printed step; added, changed, removed each one generation with the reinstalls bringing every copy level; two homes beside each other; 136 bytes per extension in Codex's prompt. Grok refuses any install without `--trust`. Paid: the canonical Claude Code step's `mkdir -p`. Carried to DS11: the canonical plugin's agy finding | ✅ Done |
| [CV21.DS5.US3](cv21-ds5-us3-review-copy-runs-on-every-runtime-measured-live/index.md) | `review-copy` runs on every runtime, measured live | User Story | Gated on US2. Isolated live sessions on the installed Claude Code, Codex, agy, and Grok, with Mirror and `review-copy` installed from the shipped package in US2's steps only and a provider key set. On each runtime `review-copy` is listed, invoked in that runtime's spelling, and runs its `mirror consult` calls, and one `command-skill` extension reaches `mirror ext` the same way. Each result is recorded with version, binary, and date, and the route is the isolated smoke test CV21's Done Condition asks for on Codex, Antigravity, and Grok Done 2026-10-20 on claude 2.1.304, codex 0.163.0, agy 1.4.3, grok 1.0.62, from the registry's 0.36.0 through the printed steps alone: both skills listed on all four; `review-copy`'s `consult` in the ledger and its report, `hello`'s ping with each cell's canary; the interface logged on Claude Code, Grok (TUI), and Antigravity, the prompt only on headless Codex (CR152). Found on the way: CR151, CR152, CR153 | ✅ Done |
| CV21.DS5.TS4 | How extensions reach each runtime is written where a user reads it | Technical Story | Gated on US3. The runtime interface contract's external skill section gains every runtime's path beside Pi's and Claude Code's. The extension docs, `review-copy`'s own `SKILL.md` header, Getting Started, and REFERENCE say how an installed extension reaches each runtime and what a user runs, and CV21's superseded extension assessment points to the decision. DS11 folds the parity matrix; TS4 writes only what DS5 measured | 🟡 Planned |

## Non-Goals

- Bundling user extensions into the shared canonical plugin. DS12.TS5 ruled it out:
  the plugin is built once into the npm package, and an extension belongs to one home.
- Changing how Pi consumes extensions. Its catalog path works and stays.
- The extension contract itself. `mirror-cli-v1`, `mirror-context-v1`, migrations,
  bindings, and Mirror Mode context providers are unchanged. DS5 is about where an
  extension's skill appears, not what an extension can do.
- Extensions in users' own repositories. DS5 edits the reference extension
  `review-copy` and no other.
- Sharing or distributing extensions between users.
- The parity matrix across every doc, with every runtime's version, binary, and date
  side by side. That is DS11.
- Antigravity's IDE. `agy` CLI only, as everywhere in CV21.

## Done Condition

DS5 is done when:
- TS1's decision is recorded in decisions.md, with version, binary, and date for
  every runtime it measured.
- A home's installed extensions, including those installed before DS5, reach Claude
  Code, Codex, Antigravity, and Grok in that design, through steps Mirror prints or
  performs and `runtime diagnose` understands.
- `review-copy` has run live on each runtime, recorded with version, binary, and
  date in an isolated route that can be re-run.
- The contract, the extension docs, Getting Started, and REFERENCE say how.

That meets CV21's Done Condition items for `review-copy` on Codex, Antigravity, and
Grok, and for external extensions on every runtime.
