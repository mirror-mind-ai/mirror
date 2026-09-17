# Review — CV22.DS9.US1

## Status

Reviewed

## Debt Findings

- Two findings, both Python-side and outside US1's scope (US1 touched no file under src/memory/). (1) MIRROR_HOME/MIRROR_USER conflict is reported as 'Mirror home is not configured': resolve_mirror_home raises a precise ValueError naming the conflict, but memory/config.py swallows it at import (except ValueError: _RESOLVED_MIRROR_HOME = None), so the operator sees the wrong diagnosis. Found while wiring the golden generator; an MCP client launching the server with a partial environment hits exactly this. (2) Python's serve() still has no framing test of its own — US1's harness records its behavior at golden-generation time only, so a future Python-side change to the loop would be caught by the oracle-drift tripwire (now covering server.py) but not by a Python test. Neither blocks US2, TS1, or TS2.

## Debt Decision

defer

## Defer Reason

Both are maintenance of the Python core, which CV22 keeps as compatibility-only for ported surfaces; fixing them inside a port story would mix oracle maintenance into parity work and re-baseline the oracle mid-story. Neither affects the TS surface US1 delivered: the conflict defect is in config resolution that TS resolves independently, and the missing Python test is covered for CV22's purposes by the drift tripwire plus the harness.

## Revisit Trigger

Capture both as Change Requests against RS007 (port reconciliation) at the next Refinement pass; the config-conflict message is re-raised by TS2 if the manifest flip surfaces a misleading startup failure to a real client, and the serve() test question dies with DS10's deletion of src/memory/mcp/.

## Missing Decision

- none
