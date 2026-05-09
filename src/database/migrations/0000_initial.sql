-- Guilds the user has chosen to log
CREATE TABLE IF NOT EXISTS guilds (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  icon_url      TEXT,
  owner_id      TEXT,
  joined_at     INTEGER,
  configured_at INTEGER DEFAULT (unixepoch())
);

-- Channels (populated lazily)
CREATE TABLE IF NOT EXISTS channels (
  id        TEXT PRIMARY KEY,
  guild_id  TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  name      TEXT,
  type      INTEGER,
  topic     TEXT,
  nsfw      INTEGER DEFAULT 0,
  parent_id TEXT
);

-- Users (global cache)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT,
  discriminator TEXT,
  avatar_url    TEXT,
  bot           INTEGER DEFAULT 0,
  first_seen_at INTEGER DEFAULT (unixepoch())
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  guild_id        TEXT REFERENCES guilds(id),
  channel_id      TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  content         TEXT,
  created_at      INTEGER NOT NULL,
  edited_at       INTEGER,
  deleted_at      INTEGER,
  is_dm           INTEGER DEFAULT 0,
  reply_to_id     TEXT,
  sticker_ids     TEXT,
  sticker_links   TEXT,
  embeds_json     TEXT,
  components_json TEXT,
  flags           INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_guild_time ON messages(guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_search ON messages(content);

-- Message Edits (audit trail)
CREATE TABLE IF NOT EXISTS message_edits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT NOT NULL REFERENCES messages(id),
  old_content TEXT,
  new_content TEXT,
  edited_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edits_message ON message_edits(message_id);

-- Message Deletes
CREATE TABLE IF NOT EXISTS message_deletes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id       TEXT NOT NULL,
  guild_id         TEXT,
  channel_id       TEXT NOT NULL,
  author_id        TEXT,
  content_snapshot TEXT,
  deleted_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deletes_guild_time ON message_deletes(guild_id, deleted_at);

-- Reactions
CREATE TABLE IF NOT EXISTS reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  guild_id   TEXT,
  channel_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emoji_id   TEXT,
  emoji_name TEXT,
  added      INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);

-- Attachments (image/* only — non-image files are skipped)
CREATE TABLE IF NOT EXISTS attachments (
  id                    TEXT PRIMARY KEY,
  message_id            TEXT NOT NULL,
  file_name             TEXT,
  original_url          TEXT NOT NULL,
  original_size_bytes   INTEGER,
  content_type          TEXT,
  local_path            TEXT,
  compressed_size_bytes INTEGER,
  width                 INTEGER,
  height                INTEGER,
  created_at            INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

-- Member events (join/leave/ban/unban/update)
CREATE TABLE IF NOT EXISTS member_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  roles_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_member_events_guild ON member_events(guild_id, created_at);

-- Presence updates
CREATE TABLE IF NOT EXISTS presence_updates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id        TEXT,
  user_id         TEXT NOT NULL,
  status          TEXT,
  client_status   TEXT,
  activities_json TEXT,
  updated_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_presence_user ON presence_updates(user_id, updated_at);

-- Voice state changes
CREATE TABLE IF NOT EXISTS voice_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  channel_id  TEXT,
  event_type  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_voice_guild ON voice_events(guild_id, created_at);

-- Guild audit events (role/channel changes, name changes, etc.)
CREATE TABLE IF NOT EXISTS guild_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  target_id    TEXT,
  target_type  TEXT,
  user_id      TEXT,
  changes_json TEXT,
  reason       TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_guild ON guild_audit(guild_id, created_at);

-- Full-Text Search (FTS5) for message content
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

-- Keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
