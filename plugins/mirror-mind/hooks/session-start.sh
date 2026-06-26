#!/bin/bash
# Mirror Mind plugin — SessionStart.
# Ensure conversation logging is active when a Claude session starts.
#
# Plugin contract (CV21): `memory` is installed and importable in the
# environment, so `python3 -m memory` resolves without a repo cwd.
python3 -m memory conversation-logger session-start >/dev/null 2>&1 || true
exit 0
