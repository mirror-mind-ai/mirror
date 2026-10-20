CREATE TABLE ext_hello_pings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_ext_hello_pings_created
  ON ext_hello_pings(created_at);
