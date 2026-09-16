-- The only table `ext-tools` owns. The `write` handler inserts here, which is
-- how the golden proves the handler reached the SAME database the dispatcher
-- resolved rather than a second file of its own.
CREATE TABLE IF NOT EXISTS ext_tools_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note TEXT NOT NULL
);
