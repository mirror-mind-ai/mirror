"""Single version authority for the stable Extension API.

Frozen at ``1.1`` by decision D-018 (CV22.DS10.TS2, 2026-09-21).

CV22.DS10.TS1 removed the ``journey_projections`` facade that ``1.1`` added,
and TS2 owns this number. It is deliberately NOT bumped, for two reasons that
point the same way:

* ``1.1``'s only addition never reached a user. Advertising its removal with a
  new number would date a change nobody can observe.
* More decisively, the in-process API this constant versions is not evolving --
  it is RETIRING. CV22.DS10.TS2 deleted the compatibility host that called
  ``register(api)`` on the core's behalf, so the contract an extension codes
  against is now the manifest runtime protocols (``mirror-cli-v1`` and
  ``mirror-context-v1``), which carry their own names and their own
  compatibility story. A version bump here would announce a future this API
  does not have.

The constant survives only until CV22.DS10.TS5 deletes the Python core with it.
"""

VERSION = "1.1"
