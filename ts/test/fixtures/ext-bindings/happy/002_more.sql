ALTER TABLE ext_beta_notes ADD COLUMN created_at TEXT;
-- A trailing statement with no terminating semicolon
UPDATE ext_beta_notes SET created_at = '2026-01-01T00:00:00+00:00'
