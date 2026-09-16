-- `rows=` in the greet output counts this table, which is how the corpus
-- proves both engines reached the same database rather than merely printing
-- the same words.
CREATE TABLE IF NOT EXISTS ext_declared_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note TEXT NOT NULL
);

INSERT INTO ext_declared_notes (note) VALUES ('seeded by the migration');
