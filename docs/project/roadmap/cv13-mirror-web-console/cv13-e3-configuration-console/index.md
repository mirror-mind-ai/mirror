[< CV13](../index.md)

# CV13.E3 — Configuration Console

**Status:** 🟢 In Progress
**Release target:** v0.13.0 — Configuration Console
**User-visible outcome:** The local web app can inspect Mirror configuration and, where safe service boundaries exist, adjust selected configuration without exposing secrets or mutating raw files directly.

---

## Scope

This epic turns configuration from hidden local files/environment into guarded local web visibility. It starts read-only and only adds editing where Mirror already has a safe service boundary. Secrets must be masked or excluded.

---

## Stories

| Code | Story | User-visible outcome | Status |
|------|-------|----------------------|--------|
| [CV13.E3.S1](cv13-e3-s1-configuration-overview/index.md) | Configuration overview | The web app shows a read-only overview of non-sensitive local Mirror configuration | ✅ Done |
| [CV13.E3.S2](cv13-e3-s2-environment-boundary-and-secrets-masking/index.md) | Environment boundary and secrets masking | Environment-derived configuration is inspectable with sensitive values masked or omitted | ✅ Done |
| [CV13.E3.S3](cv13-e3-s3-journey-settings-placement/index.md) | Journey settings placement | Journey settings are inspectable from the selected Workspace journey instead of duplicated in global Configuration | ✅ Done |
| [CV13.E3.S4](cv13-e3-s4-safe-journey-metadata-edit/index.md) | Safe journey metadata edit | Selected journey metadata can be edited through safe service boundaries | ✅ Done |
| CV13.E3.S5 | Configuration coherence and validation | The configuration console is validated and prepared as v0.13.0 | 🟢 In Progress |

---

## Non-goals

- No arbitrary `.env` editing.
- No secret disclosure.
- No raw database/YAML mutation from UI code.
- No remote configuration management.
- No operation runner.
- No conversation retitle.

---

## Done Condition

CV13.E3 is done when configuration is visible through safe local web surfaces, secrets are protected, journey metadata is inspectable and safely editable where scoped, and the release is validated as a coherent configuration console slice.
