CREATE TABLE IF NOT EXISTS ext_beta_rollback_me (id TEXT PRIMARY KEY);
INSERT INTO ext_beta_rollback_me (id) VALUES ('one');
-- The third statement is invalid SQL: the whole file must roll back, table
-- included, and no bookkeeping row may survive.
INSERT INTO ext_beta_rollback_me (nope) VALUES ('two');
