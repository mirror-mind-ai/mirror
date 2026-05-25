[< Story](index.md)

# Plan — CV13.E3.S2 Environment boundary and secrets masking

## Implementation plan

1. Define a small allowlist of environment-derived settings relevant to Mirror runtime.
2. Add masking for sensitive names containing key/token/secret/password.
3. Add configured/missing status without exposing full secret values.
4. Render the environment section in Configuration.
5. Add tests that prove secrets are masked and full values do not serialize.

## Design boundaries

- No full `os.environ` dump.
- No raw secret values.
- No editing.
