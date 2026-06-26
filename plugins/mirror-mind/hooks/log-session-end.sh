#!/bin/bash
# Mirror Mind plugin — SessionEnd.
# Close the conversation record (immediate extraction from the transcript on
# stdin) and run a silent backup.
#
# Plugin contract (CV21): `memory` is installed and importable, so `python3 -m
# memory` resolves without a repo cwd.
python3 -m memory conversation-logger session-end >/dev/null 2>&1
python3 -m memory backup --silent >/dev/null 2>&1
exit 0
