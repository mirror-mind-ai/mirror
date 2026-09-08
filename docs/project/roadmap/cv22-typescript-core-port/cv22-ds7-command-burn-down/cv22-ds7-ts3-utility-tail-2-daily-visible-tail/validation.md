# Validation — CV22.DS7.TS3

## Status

Passed

## Automated Checks

- 1296 TS tests; typecheck+lint; five goldens regenerate as a no-op and byte-identical under Python 3.10/3.12; oracle-drift clean with cli/runtime.py, cli/welcome.py, extensions/migrations.py registered; real-DB-copy welcome_stats_line/welcome_status_line probes green; lifecycle smoke 110 checks both engines; CI green on all five jobs (run 34233070764)

Checks status: passed

## E2E

Decision: required

Evidence: Live Pi session after the flip. front-door.log: 14 welcome entries before the flip all route python; 8 after, 7 route ts (the single python is a deliberate MIRROR_TS_WELCOME=0 comparison at 13:25:39). Zero fell_back markers, zero non-zero welcome exits. Four welcome -> conversation-logger pairs within 2s confirm the per-turn status-line path, not only session-start cards. On the real home: welcome card and runtime release-notes latest byte-identical across engines; runtime diagnose reports Findings: 0 exit 0 on TS while Python reports core_migration_unknown 017_journey_parent_column exit 1.

## Navigator Validation

Route: 1) welcome through the front door vs Python; 2) runtime diagnose through the front door vs Python; 3) runtime release-notes latest across engines; 4) a new Pi session: status line renders as before, post-turn refresh no slower than the pre-CR059 baseline, front-door.log shows welcome ts

Navigator accepted: yes

Expected observation: Items 1 and 3 identical across engines; item 2 differs only by the absent 017_journey_parent_column false alarm; item 4 feels like before with welcome ts logged

Pass condition: 1 and 3 identical; 2 differs only by the absent false alarm; 4 unchanged in feel with welcome ts in the log

Fail condition: Any other difference between the engines, a slower per-turn refresh, or a welcome entry routing to python without a gate set

## Missing Evidence

- none
