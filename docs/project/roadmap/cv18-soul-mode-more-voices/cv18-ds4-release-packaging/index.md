[< CV18](../index.md)

# CV18.DS4 — Release Packaging

**Status:** 🟡 Planned

**Placement:** Final packaging story for `v0.25.0 — Soul Mode More Voices`

**User-visible outcome:** The release is documented, validated, tagged, and published.

---

## Why This Exists

Wisdom Voice and Beauty Voice should ship as a coherent public release, not as undocumented runtime drift. Packaging closes the CV18 loop with release notes, version alignment, validation, CI, tag, and stable promotion.

---

## Scope

- Finalize CV18 documentation and statuses.
- Add release notes for `v0.25.0 — Soul Mode More Voices`.
- Bump package/version metadata.
- Run final automated validation.
- Verify GitHub Actions after push.
- Promote/tag the release if validation is green.

---

## Non-goals

- No new voice behavior during packaging unless required to fix a release blocker.
- No broad docs rewrite unrelated to CV18.
- No post-release integration work.

---

## Acceptance Behavior

Given DS1–DS3 are complete, release notes accurately describe the user-visible changes and non-goals.

Given local validation passes, changes are committed and pushed.

Given CI is green, `v0.25.0` is tagged and stable is promoted according to the release process.

---

## References

- [CV18 — Soul Mode More Voices](../index.md)
- [Release notes index](../../../releases/index.md)
- [Development guide](../../../process/development-guide.md)
