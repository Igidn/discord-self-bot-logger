CREATE TABLE IF NOT EXISTS latest_presences (
  guild_id        TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  status          TEXT,
  client_status   TEXT,
  activities_json TEXT,
  updated_at      INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (guild_id, user_id)
);
