CREATE TABLE IF NOT EXISTS ext_beta_ok (id TEXT PRIMARY KEY);
-- The second statement escapes the extension's namespace and must be refused
-- before anything is applied.
CREATE TABLE IF NOT EXISTS memories_shadow (id TEXT PRIMARY KEY);
