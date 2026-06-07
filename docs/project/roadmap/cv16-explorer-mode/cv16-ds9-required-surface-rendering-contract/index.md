[< CV16](../index.md)

# CV16.DS9 — Required Surface Rendering Contract

**Status:** 🟡 Planned

**Placement:** CV16 release hardening story

**User-visible outcome:** Required Explorer surfaces such as `△ STORY THICKENED` and `△ BUILDER HANDOFF PROPOSED` cannot disappear into assistant interpretation; they are rendered visibly before commentary.

---

## Why This Exists

During external validation, `explore story thicken` correctly returned the `△ STORY THICKENED` surface, but the assistant summarized the concept instead of showing the card. The failure was not state or CLI behavior. It was the presentation contract between contained command output and the final assistant response.

Explorer surfaces are product output, not internal evidence.

---

## Scope

- Mark required Mirror surfaces in CLI output with an explicit contract marker.
- Update runtime skill instructions to require verbatim first-block rendering.
- Add tests or smoke validation proving Explorer surfaces are distinguishable from ordinary command output.
- Investigate whether Pi can enforce or preserve required surface blocks automatically.

---

## Non-goals

- No broad runtime rendering framework.
- No changes to Explorer story semantics.
- No Builder handoff behavior changes beyond surface preservation.

---

## Acceptance Behavior

Given an Explorer command returns a required surface, the assistant renders that surface before commentary.

Given a required surface is present in CLI output, it is machine-identifiable by a stable marker.

Given external validation runs in Pi, `△ STORY THICKENED` appears immediately after a substantive story change.

---

## References

- [CV16 Explorer Mode](../index.md)
