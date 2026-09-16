-- First migration for the fixture extension.
-- The splitter must survive everything below.
CREATE TABLE IF NOT EXISTS ext_beta_notes (
    id    TEXT PRIMARY KEY,
    body  TEXT NOT NULL
);

/* A block comment containing a decoy:
   CREATE TABLE memories (id TEXT);
   DROP TABLE conversations;
   Neither line may reach the database, and neither may trip the prefix guard. */
INSERT INTO ext_beta_notes (id, body) VALUES ('alpha', 'a semicolon; inside a string literal');
INSERT INTO ext_beta_notes (id, body) VALUES ('quote', 'it''s escaped, and it holds; a semicolon too');
CREATE INDEX IF NOT EXISTS idx_ext_beta_notes_body ON ext_beta_notes(body);
