# Discord Selfbot Logger — Design Document

> Version: 1.0.0  
> Date: 2026-05-09  
> Status: Draft

---

## 1. Overview

A personal Discord logger that operates on a **user account** (selfbot) using [`discord.js-selfbot-v13`](https://github.com/Igidn/discord.js-selfbot-v13.git). It captures every event visible to the user, stores it in a local database, and exposes a web dashboard for querying, searching, and exporting logs.

Before logging begins, the user **must explicitly select which guilds (servers)** to monitor. No data is collected from unselected guilds or DMs unless explicitly opted in.

---

## 2. Goals & Non-Goals

### Goals
- Log every Discord event visible to the user account in selected guilds.
- Persistent, searchable local storage with automatic rotation.
- Zero-config web dashboard for browsing logs.
- Explicit guild opt-in before any logging starts.
- Single-file / single-directory deployment (portable).

### Non-Goals
- Multi-user / SaaS deployment.
- Logging voice audio streams (out of scope for v1).
- Voice audio recording (metadata only).
- Violating Discord ToS mitigation (user assumes responsibility).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Account                           │
│              (discord.js-selfbot-v13)                       │
└──────────────┬──────────────────────────────────────────────┘
               │ Gateway events
               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Event Router                             │
│  • Guild filter (opt-in whitelist)                          │
│  • Rate-limit buffering                                     │
│  • Enrichment (resolve IDs → names, cache)                  │
└──────────────┬──────────────────────────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐  ┌──────────────┐
│  SQLite DB  │  │  Attachments│
│  (wal mode) │  │  (local FS)  │
└──────┬──────┘  └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard Server (Express + Socket.IO)     │
│  • REST API for log queries / search / export               │
│  • Socket.IO for real-time events (messages, activity)      │
│  • Static SPA (React/Vite)                                  │
│  • Auth via pre-shared token or localhost-only              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack

| Layer        | Choice                                   | Reasoning                           |
|--------------|------------------------------------------|-------------------------------------|
| Runtime      | Node.js 20+ (LTS)                        | Required by discord.js ecosystem    |
| Language     | TypeScript 5.x                           | Type safety, maintainability        |
| Selfbot SDK  | `discord.js-selfbot-v13` (fork)          | User-token support, rich events     |
| Database     | SQLite 3 (`better-sqlite3`)              | Zero setup, single-file, fast reads |
| ORM / Query  | `drizzle-orm` + `drizzle-kit`            | Lightweight, TypeScript-native      |
| Dashboard BE | `express` 4.x + `socket.io`              | Minimal, stable, real-time capable  |
| Dashboard FE | React 18 + Vite + TailwindCSS + Socket.IO Client | Fast build, real-time UI    |
| Config       | `zod` for validation + `yaml` file       | Human-readable, strict parsing      |
| Build        | `tsup` or `tsx` for dev, `tsc` for prod  | Fast DX, simple distribution        |

---

## 5. Configuration & Guild Selection

### 5.1 First-Run Flow

1. **Start** → bot logs in with user token.
2. **Discovery** → bot emits a list of all guilds the user is a member of.
3. **Selection** → user picks guilds via dashboard or CLI prompt.
4. **Activation** → selected guild IDs are written to `config.yaml`.
5. **Logging** → only events from those guild IDs are persisted.

### 5.2 Config Schema (`config.yaml`)

```yaml
# Discord user token (keep secret)
token: "YOUR_USER_TOKEN"

# Logging settings
logging:
  # Guild IDs to monitor (empty = discovery mode, no logging)
  guilds: []
  
  # Opt-in to DM logging (default false for privacy)
  logDirectMessages: false
  
  # Event categories to capture
  events:
    messages: true
    messageEdits: true
    messageDeletes: true
    reactions: true
    members: true
    presence: true
    voice: true
    guildChanges: true
    channelChanges: true
    roleChanges: true
    threads: true
    invites: true
    attachments: true
  
  # Retention
  retentionDays: 365
  
  # Attachment download & compression (image/* only)
  attachments:
    enabled: true
    maxSizeMb: 25
    path: "./storage/attachments"
    compression:
      enabled: true
      quality: 80           # JPEG/WebP quality (0-100)
      maxWidth: 1920        # Max dimension in px; larger images are downscaled
      maxHeight: 1080
      format: "webp"        # Output format: webp | jpeg | png (png = lossless)
      stripMetadata: true   # Remove EXIF data

# Dashboard settings
dashboard:
  host: "127.0.0.1"
  port: 3333
  authToken: "generate-random-string"
  
# Database
database:
  path: "./storage/logs.db"
  wal: true
```

---

## 6. Data Model

### 6.1 Core Tables (SQLite)

```sql
-- Guilds the user has chosen to log
CREATE TABLE guilds (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  icon_url      TEXT,
  owner_id      TEXT,
  joined_at     INTEGER,
  configured_at INTEGER DEFAULT (unixepoch())
);

-- Channels (populated lazily)
CREATE TABLE channels (
  id        TEXT PRIMARY KEY,
  guild_id  TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  name      TEXT,
  type      INTEGER, -- Discord channel type enum
  topic     TEXT,
  nsfw      INTEGER DEFAULT 0,
  parent_id TEXT
);

-- Users (global cache)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT,
  discriminator TEXT,
  avatar_url    TEXT,
  bot           INTEGER DEFAULT 0,
  first_seen_at INTEGER DEFAULT (unixepoch())
);

-- Messages
CREATE TABLE messages (
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
  sticker_ids     TEXT, -- JSON array
  sticker_links   TEXT, -- JSON array of markdown hyperlinks: ["[name](url)"]
  embeds_json     TEXT, -- JSON
  components_json TEXT, -- JSON
  flags           INTEGER DEFAULT 0
);
CREATE INDEX idx_messages_guild_time ON messages(guild_id, created_at);
CREATE INDEX idx_messages_channel_time ON messages(channel_id, created_at);
CREATE INDEX idx_messages_author ON messages(author_id, created_at);
CREATE INDEX idx_messages_search ON messages(content); -- FTS preferred, see below

-- Message Edits (audit trail)
CREATE TABLE message_edits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id  TEXT NOT NULL REFERENCES messages(id),
  old_content TEXT,
  new_content TEXT,
  edited_at   INTEGER NOT NULL
);
CREATE INDEX idx_edits_message ON message_edits(message_id);

-- Message Deletes
CREATE TABLE message_deletes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  guild_id   TEXT,
  channel_id TEXT NOT NULL,
  author_id  TEXT,
  content_snapshot TEXT,
  deleted_at INTEGER NOT NULL
);
CREATE INDEX idx_deletes_guild_time ON message_deletes(guild_id, deleted_at);

-- Reactions
CREATE TABLE reactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  guild_id   TEXT,
  channel_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emoji_id   TEXT,
  emoji_name TEXT,
  added      INTEGER DEFAULT 1, -- 0 = removed
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_reactions_message ON reactions(message_id);

-- Attachments (image/* only — non-image files are skipped)
CREATE TABLE attachments (
  id                    TEXT PRIMARY KEY,
  message_id            TEXT NOT NULL,
  file_name             TEXT,
  original_url          TEXT NOT NULL,
  original_size_bytes   INTEGER,
  content_type          TEXT,         -- e.g. image/png, image/jpeg
  local_path            TEXT,         -- Path to compressed image
  compressed_size_bytes INTEGER,
  width                 INTEGER,
  height                INTEGER,
  created_at            INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_attachments_message ON attachments(message_id);

-- Member events (join/leave/ban/unban/update)
CREATE TABLE member_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  event_type TEXT NOT NULL, -- JOIN, LEAVE, BAN, UNBAN, UPDATE, NICK_CHANGE
  old_value  TEXT,
  new_value  TEXT,
  roles_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_member_events_guild ON member_events(guild_id, created_at);

-- Presence updates
CREATE TABLE presence_updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT,
  user_id     TEXT NOT NULL,
  status      TEXT, -- online, idle, dnd, offline
  client_status TEXT, -- JSON {desktop, mobile, web}
  activities_json TEXT, -- JSON array
  updated_at  INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_presence_user ON presence_updates(user_id, updated_at);

-- Voice state changes
CREATE TABLE voice_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  channel_id   TEXT,
  event_type   TEXT NOT NULL, -- JOIN, LEAVE, MOVE, MUTE, DEAF, STREAM, VIDEO
  old_value    TEXT,
  new_value    TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_voice_guild ON voice_events(guild_id, created_at);

-- Guild audit events (role/channel changes, name changes, etc.)
CREATE TABLE guild_audit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL,
  action_type  TEXT NOT NULL, -- CHANNEL_CREATE, ROLE_DELETE, GUILD_UPDATE, etc.
  target_id    TEXT,
  target_type  TEXT,
  user_id      TEXT, -- who performed the action
  changes_json TEXT, -- JSON diff
  reason       TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_guild ON guild_audit(guild_id, created_at);

-- Full-Text Search (FTS5) for message content
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);
```

### 6.2 FTS Trigger (auto-sync)

```sql
-- Keep FTS index in sync
CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
```

---

## 7. Event Coverage

| Event | Discord.js Event | Persistence | Notes |
|-------|------------------|-------------|-------|
| Message received | `messageCreate` | `messages` | Core |
| Message edited | `messageUpdate` | `messages` + `message_edits` | Audit trail |
| Message deleted | `messageDelete` / `messageDeleteBulk` | `message_deletes` | Snapshot if cached |
| Reaction add | `messageReactionAdd` | `reactions` | |
| Reaction remove | `messageReactionRemove` / `RemoveAll` / `RemoveEmoji` | `reactions` | `added=0` |
| Member join | `guildMemberAdd` | `member_events` | |
| Member leave | `guildMemberRemove` | `member_events` | |
| Member ban | `guildBanAdd` | `member_events` | |
| Member unban | `guildBanRemove` | `member_events` | |
| Member update | `guildMemberUpdate` | `member_events` | Nick/role diff |
| Presence update | `presenceUpdate` | `presence_updates` | Throttle: 1 per user per 30s |
| Typing start | `typingStart` | — | Optional, high volume; skip v1 |
| Voice join/move/leave | `voiceStateUpdate` | `voice_events` | |
| Channel created | `channelCreate` | `guild_audit` + `channels` | |
| Channel updated | `channelUpdate` | `guild_audit` + `channels` | |
| Channel deleted | `channelDelete` | `guild_audit` | Soft-delete in `channels` |
| Role changes | `roleCreate` / `roleUpdate` / `roleDelete` | `guild_audit` | |
| Guild update | `guildUpdate` | `guild_audit` | Name/icon/owner/etc. |
| Thread events | `threadCreate` / `threadUpdate` / `threadDelete` / `threadMembersUpdate` | `guild_audit` | |
| Invite create/delete | `inviteCreate` / `inviteDelete` | `guild_audit` | |
| DM received | `messageCreate` (DM) | `messages` (`is_dm=1`) | Only if `logDirectMessages: true` |
| Attachment | `messageCreate` (attachment array) | `attachments` | Image/* only; compressed & stored async |
| Sticker | `messageCreate` (sticker array) | `messages.sticker_links` | Saved as markdown hyperlinks, not downloaded |

---

## 8. Dashboard Design

### 8.1 REST API Endpoints (Express)

All endpoints prefixed with `/api/v1`. Authentication via `Authorization: Bearer <token>` header.

```
GET  /health                       → { status, uptime, guildsCount, messagesCount }
GET  /config                      → { logging, dashboard } (token redacted)
POST /config/guilds               → { guildIds: string[] }  -- update whitelist
GET  /guilds                     → [ { id, name, icon, messageCount, memberCount } ]
GET  /guilds/:id/channels        → [ { id, name, type, messageCount } ]

GET  /messages                   → ?guild= &channel= &author= &before= &after= &search= &limit= &cursor=
                                 → { data: Message[], nextCursor: string | null }
GET  /messages/:id               → Message with edits + attachments + sticker links + reactions

GET  /messages/:id/edits         → [ MessageEdit ]
GET  /messages/:id/reactions     → [ Reaction ]

GET  /search                     → ?q= &filters=<json>&limit= &cursor=
                                 → FTS results with highlights + applied filters
GET  /search/filters             → { availableFilters, operators, enumValues }
GET  /search/suggest             → ?field=author|channel|guild&prefix= &limit=
                                 → [ { id, label, count } ]

GET  /activity/member-events     → ?guild= &user= &type= &limit=
GET  /activity/voice             → ?guild= &user= &limit=
GET  /activity/presence          → ?guild= &user= &limit=
GET  /activity/audit             → ?guild= &action= &user= &limit=

GET  /users/:id                  → User profile + stats
GET  /users/:id/messages         → Messages by user (paginated)

GET  /stats/overview             → Daily message counts, top channels, top users (last 7/30/90d)
GET  /stats/guild/:id            → Guild-specific stats

POST /export/messages            → ?format=jsonl|csv|html  -- async export job
GET  /export/:jobId              → Check status / download

DELETE /purge                    → ?guild= &olderThan= -- admin only
```

### 8.2 Socket.IO Real-Time Events

The Socket.IO server shares the same port as Express. Auth is performed via `auth: { token: string }` in the client connection handshake.

#### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `Message` | New message received |
| `message:edit` | `{ messageId, newContent, editedAt }` | Message edited |
| `message:delete` | `{ messageId, channelId, guildId, deletedAt }` | Message deleted |
| `reaction:add` | `Reaction` | Reaction added |
| `reaction:remove` | `Reaction` | Reaction removed |
| `member:event` | `MemberEvent` | Join/leave/ban/etc. |
| `presence:update` | `PresenceUpdate` | Presence changed (throttled) |
| `voice:event` | `VoiceEvent` | Voice state change |
| `guild:audit` | `GuildAuditEvent` | Role/channel/guild change |
| `typing:start` | `{ channelId, userId, guildId }` | User started typing |
| `stats:tick` | `{ guildId?, metrics }` | Periodic stats push (30s) |

#### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:channel` | `{ channelId }` | Join room `channel:<id>` for live message tail |
| `unsubscribe:channel` | `{ channelId }` | Leave room |
| `subscribe:guild` | `{ guildId }` | Join room `guild:<id>` for guild-wide activity |
| `unsubscribe:guild` | `{ guildId }` | Leave room |
| `subscribe:search` | `{ q, filters }` | Request server to push new matches for a search + filter set |
| `request:stats` | `{ guildId?, range }` | Ask server to compute and push stats immediately |

#### Room Strategy

- `channel:<channelId>` — clients listening to a specific channel message feed
- `guild:<guildId>` — clients on a guild overview / activity page
- `global` — admin-level live tail subscribers (all events, rate-limited)

### 8.3 Search & Filter System

Search is not just a text box. It supports a **structured filter grammar** that works identically across REST API, Socket.IO live search, and export jobs.

#### Filter Grammar (Shared TypeScript Schema)

```ts
type FilterOperator =
  | 'eq' | 'neq'           -- equality
  | 'gt' | 'gte' | 'lt' | 'lte'  -- comparisons (timestamps, sizes)
  | 'contains' | 'startsWith' | 'endsWith'  -- text matching
  | 'in' | 'nin'           -- set membership
  | 'between'              -- range (inclusive)
  | 'isNull' | 'isNotNull' -- null checks
  -- Boolean flags (value is ignored or boolean)
  | 'hasAttachment' | 'hasEmbed' | 'hasReaction'
  | 'isDeleted' | 'isEdited' | 'isDm';

interface FilterClause {
  field: string;
  op: FilterOperator;
  value?: unknown;  -- optional for unary operators
}

interface FilterGroup {
  combinator: 'and' | 'or';
  filters: (FilterClause | FilterGroup)[];
}

type Filter = FilterClause | FilterGroup;
```

#### Searchable Fields

| Field | Type | Operators | Source |
|-------|------|-----------|--------|
| `guildId` | string | `eq`, `in`, `nin` | Logged guilds whitelist |
| `channelId` | string | `eq`, `in`, `nin` | Channels within selected guilds |
| `authorId` | string | `eq`, `in`, `nin`, `contains` | Known users from messages |
| `content` | string | `contains`, `startsWith`, `endsWith`, `eq` | FTS5 + LIKE fallback |
| `createdAt` | timestamp | `gt`, `gte`, `lt`, `lte`, `between` | Message timestamp |
| `hasAttachment` | boolean | `eq` | `attachments` table existence (image/* only) |
| `hasEmbed` | boolean | `eq` | `embeds_json IS NOT NULL` |
| `hasReaction` | boolean | `eq` | `reactions` table existence |
| `isDeleted` | boolean | `eq` | `messages.deleted_at IS NOT NULL` |
| `isEdited` | boolean | `eq` | `messages.edited_at IS NOT NULL` |
| `isDm` | boolean | `eq` | `messages.is_dm = 1` |
| `messageType` | string | `eq`, `in` | reply, pin, system, default |

#### Query Execution Flow

1. **Parse** → Zod-validates the `filters` JSON payload.
2. **Optimize** → Flatten nested single-item groups; reject filters on unlogged guilds.
3. **FTS First** → If `content` + `contains` exists, run `messages_fts` to get candidate `rowid`s.
4. **Apply Filters** → JOIN `messages` with `users`, `channels`, `attachments`, `reactions` as needed. Build parameterized Drizzle query.
5. **Sort / Paginate** → `ORDER BY created_at DESC` with cursor-based pagination (`cursor = lastCreatedAt:lastId`).
6. **Return** → Enriched message rows + total count (approximate for FTS, exact for filter-only).

#### Suggest API

The `/search/suggest` endpoint powers autocomplete for user/channel/guild pickers:
- `?field=authorId&prefix=foo&limit=10` → users whose username starts with "foo"
- `?field=channelId&prefix=general&guildId=xxx` → channels in guild matching "general"
- Results include `{ id, label, avatarUrl?, count }` where `count` is message frequency.

#### Live Filtered Search (Socket.IO)

When a client emits `subscribe:search` with `{ q, filters }`, the server:
1. Stores the filter set in a server-side session map.
2. On every incoming `message:new`, tests the message against the filter.
3. Emits `search:match` to the client only if the message satisfies all filters.
4. Auto-unsubscribes on disconnect or when `unsubscribe:search` is sent.

#### Filter Persistence in Export

Export jobs (`POST /export/messages`) accept the same `filters` JSON. The exporter streams rows matching the filter set directly to disk without loading everything into memory.

---

### 8.4 Frontend Pages (React Router)

| Route | Purpose |
|-------|---------|
| `/` | Setup wizard if no guilds selected; otherwise Overview dashboard |
| `/setup` | Guild selector grid (cards with toggle) |
| `/guilds/:id` | Guild overview + channel list |
| `/guilds/:id/channels/:channelId` | Message feed (infinite scroll) |
| `/search` | Global search with filters |
| `/messages/:id` | Message detail (content + history + reactions) |
| `/users/:id` | User profile + activity timeline |
| `/activity` | Audit log explorer (tabs: members, voice, presence, guild) |
| `/stats` | Analytics charts (Recharts) |
| `/settings` | Config editor, retention, export, purge |

### 8.4 Frontend Real-Time Architecture

- **SocketContext**: React context wrapping a single `socket.io-client` instance. Reconnects with exponential backoff.
- **useChannelSocket(channelId)**: Hook that auto-joins `channel:<id>` room, buffers incoming messages, and prepends them to the feed.
- **useGuildSocket(guildId)**: Hook for guild overview — listens to `member:event`, `voice:event`, `presence:update`, and `stats:tick`.
- **LiveBadge**: UI indicator showing Socket.IO connection status (connected / reconnecting / disconnected).
- **Optimistic Updates**: When a message is edited or deleted via socket, the local React Query cache is updated immediately before the next REST fetch.
- **Rate-Limit Display**: Presence and typing events are high-volume; the UI throttles re-renders (e.g., typing indicators expire after 10s automatically).

### 8.5 UI Components

- **MessageCard**: Avatar, username, timestamp, content, attachments, sticker links, reply indicator, edit badge. Animated entrance for live messages.
- **Timeline**: Vertical timeline for user activity.
- **SearchBar**: FTS query input + structured filter chips. Supports "live search" via Socket.IO.
- **FilterBar**: Horizontal row of active filter chips with quick-remove buttons.
- **FilterBuilder**: Modal/sheet for constructing complex filters (field picker + operator picker + value input).
- **SuggestInput**: Autocomplete input powered by `/search/suggest` for users, channels, and guilds.
- **DateRangePicker**: Quick presets (Today, Last 7d, Last 30d) + custom range for `createdAt` filters.
- **GuildPicker**: Grid of guild cards with toggle + stats preview.
- **CodeBlock**: Syntax highlighting for code in messages.
- **AttachmentPreview**: Compressed image thumbnail with lightbox zoom, dimensions, original vs compressed size badge. Non-image attachments are ignored.
- **StickerLink**: Renders sticker as a clickable markdown hyperlink `[name](url)` that opens the Discord CDN URL.
- **TypingIndicator**: Pulsing dots when `typing:start` is received in the subscribed channel.

---

## 9. Project Structure

```
discord-selfbot-logger/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── config.yaml                 # User configuration (gitignored)
├── .env.example                # TOKEN, etc.
│
├── src/
│   ├── main.ts                 # Entry point: starts bot + dashboard
│   │
│   ├── bot/
│   │   ├── client.ts           # Selfbot client init
│   │   ├── events/             # Event handlers
│   │   │   ├── messageCreate.ts
│   │   │   ├── messageUpdate.ts
│   │   │   ├── messageDelete.ts
│   │   │   ├── reactions.ts
│   │   │   ├── members.ts
│   │   │   ├── presence.ts
│   │   │   ├── voice.ts
│   │   │   ├── guildAudit.ts
│   │   │   └── index.ts        # Register all handlers
│   │   └── guildFilter.ts      # Whitelist middleware
│   │
│   ├── database/
│   │   ├── index.ts            # Drizzle client + connection
│   │   ├── schema.ts           # All table definitions
│   │   ├── migrations/         # Drizzle migration files
│   │   └── queries.ts          # Complex queries / aggregations
│   │
│   ├── dashboard/
│   │   ├── server.ts           # Express + Socket.IO server setup
│   │   ├── middleware/
│   │   │   ├── auth.ts         # Shared REST + Socket.IO auth
│   │   │   └── errorHandler.ts
│   │   ├── routes/
│   │   │   ├── health.ts
│   │   │   ├── config.ts
│   │   │   ├── messages.ts
│   │   │   ├── search.ts
│   │   │   ├── activity.ts
│   │   │   ├── users.ts
│   │   │   ├── stats.ts
│   │   │   └── export.ts
│   │   └── socket/
│   │       ├── index.ts        # Socket.IO init, auth, middleware
│   │       ├── rooms.ts        # Room join/leave helpers
│   │       ├── broadcaster.ts  # Emit events from bot → sockets
│   │       └── handlers.ts     # Client → Server event handlers
│   │
│   ├── shared/
│   │   └── filters.ts          # Shared Filter types + Zod schema (used by BE & FE)
│   │
│   ├── config/
│   │   ├── loader.ts           # YAML + env loading with Zod
│   │   └── schema.ts           # Zod schema for config.yaml
│   │
│   ├── services/
│   │   ├── attachmentDownloader.ts  # Image fetch + compression pipeline
│   │   ├── exporter.ts         # CSV/JSONL/HTML export jobs
│   │   ├── retentionPurger.ts  # Cron-like cleanup
│   │   └── enricher.ts         # ID resolution, cache warming
│   │
│   └── utils/
│       ├── logger.ts           # Pino console logger
│       ├── snowflake.ts        # Discord snowflake → timestamp
│       └── paths.ts            # Storage path helpers
│
├── dashboard-ui/               # Vite React app
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts       # Axios/fetch wrapper
│   │   ├── socket/
│   │   │   ├── client.ts       # Socket.IO client instance
│   │   │   ├── context.tsx     # SocketContext provider
│   │   │   └── hooks.ts        # useSocket, useChannelSocket, useGuildSocket
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── types/
│   └── public/
│
├── storage/                    # Runtime data (gitignored)
│   ├── logs.db
│   ├── logs.db-wal
│   └── attachments/            # Compressed images (non-image files skipped)
│
└── scripts/
    ├── build.sh
    └── dev.sh
```

---

## 10. Key Implementation Details

### 10.1 Guild Whitelist Middleware

Every event handler is wrapped:

```ts
function requireGuild(handler: EventHandler): EventHandler {
  return (client, ...args) => {
    const guildId = extractGuildId(args);
    if (!guildId) return; // DMs not allowed unless opted in
    if (!config.logging.guilds.includes(guildId)) return;
    return handler(client, ...args);
  };
}
```

If `config.logging.guilds` is empty, the bot enters **discovery mode**: it connects, fetches guild list, and exposes them via `/setup` but writes nothing to the database.

### 10.2 Message Delete Handling

Discord does not send message content on delete. If the message is in cache (discord.js cache), snapshot content before delete. Otherwise, store `content_snapshot: null`. The `messages` table row gets `deleted_at` set; `message_deletes` gets an audit row.

### 10.3 Attachment Download & Compression Pipeline (Images Only)

1. **Filter** — On `messageCreate`, inspect `message.attachments`. Only process items where `contentType.startsWith('image/')`. Skip videos, PDFs, archives, audio, etc.
2. **Queue** — Fire-and-forget async queue (`p-queue` or custom). Max concurrency: 3.
3. **Size Check** — HEAD request to verify `content-length`. Skip if > `attachments.maxSizeMb`.
4. **Download** — Stream download to a temp path.
5. **Compress** — Using `sharp`:
   - Resize to fit within `maxWidth` × `maxHeight` (preserve aspect ratio).
   - Convert to configured `format` (`webp`, `jpeg`, or `png`).
   - Apply quality setting (ignored for `png`).
   - Strip EXIF/metadata if `stripMetadata: true`.
6. **Store** — Save to `storage/attachments/:guildId/:channelId/:messageId/:attachmentId.:ext`.
7. **Record** — Insert `attachments` row with original & compressed metadata.
8. **Stickers** — If `message.stickers` is present, do **not** download. Instead, build a markdown hyperlink for each sticker:
   - URL pattern: `https://media.discordapp.net/stickers/{sticker.id}.{ext}?size=300`
   - Format: `[{sticker.name}](url)`
   - Store as JSON array in `messages.sticker_links`.
   - Lottie stickers (format_type 3) use `.json` extension in URL; others use `.png`/`.gif`.
9. **Retry** — Failed downloads/compressions retried 2×, then `local_path = null` but keep `original_url` for manual viewing.
10. **Cleanup** — Orphaned attachments detected and removed during retention purge.

### 10.4 Retention & Purge

- Daily cron (via `node-cron` or simple `setInterval`) checks `messages.created_at < now - retentionDays`.
- Deletes old rows; SQLite `VACUUM` runs weekly.
- Orphaned attachments detected and removed from disk.

### 10.5 Socket.IO Broadcasting

- After a Discord event is persisted to SQLite, the **Event Router** calls `broadcaster.emit(eventType, payload)`.
- The broadcaster:
  - Emits to `channel:<channelId>` for message/reaction events.
  - Emits to `guild:<guildId>` for member/voice/presence/audit events.
  - Emits to `global` for admin-level live tail (optional, gated by config).
- Payloads are **enriched** (user/channel names resolved) before emission so the frontend does not need to refetch.
- Connection auth: Socket.IO middleware validates `auth.token` against `dashboard.authToken`. Rejects unauthorized connections immediately.

### 10.6 Rate Limiting & Backpressure

- Database writes batched where possible (e.g., bulk message delete).
- `better-sqlite3` runs synchronously; use a single writer queue to avoid WAL contention.
- Presence updates throttled per-user (30s bucket) to prevent DB spam.
- Socket.IO presence broadcasts further throttled: max 1 emit per room per 5s to protect slow clients.

---

## 11. Security & Privacy

| Concern | Mitigation |
|---------|------------|
| Token exposure | Config file is `.gitignore`d; dashboard never exposes it. |
| Unauthorized dashboard access | Bearer token required; bind to `127.0.0.1` by default. |
| Data leakage | No cloud sync. All data stays local. |
| Discord ToS | Selfbots violate ToS. This tool is for **personal data archival only**. User assumes all risk. Document this in README. |
| DM privacy | `logDirectMessages` defaults to `false`. Must be explicitly enabled. |
| Sensitive attachments | Stored locally, compressed, and stripped of metadata. Dashboard auth-gated. |

---

## 12. Build & Run

### Development

```bash
# 1. Install deps
npm install

# 2. Configure
cp .env.example .env
# Edit .env + config.yaml

# 3. Run migrations
npm run db:migrate

# 4. Start bot + dashboard dev
npm run dev
```

### Production / Distribution

```bash
npm run build        # Compiles TS + builds dashboard SPA
npm start            # Runs compiled output
```

### Docker (Optional Future)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY dashboard-ui/dist/ ./dashboard-ui/dist/
VOLUME ["/app/storage"]
CMD ["node", "dist/main.js"]
```

---

## 13. Milestones / Roadmap

| Phase | Features | ETA |
|-------|----------|-----|
| **MVP** | Bot login, guild selector, message create/edit/delete logging, dashboard with live Socket.IO message feed | Week 1 |
| **v0.2** | Reactions, members, presence, voice events; Socket.IO activity rooms; search + stats | Week 2 |
| **v0.3** | Image attachment download + compression + preview; sticker hyperlinks; export (JSONL/CSV); retention purge | Week 3 |
| **v0.4** | Guild audit log (roles, channels, threads); DM opt-in; live search; polish | Week 4 |
| **v1.0** | Advanced analytics; Docker image; docs; performance tuning | Week 6 |

---

## 14. Open Questions

1. Should we support **message bulk-delete** (`messageDeleteBulk`) as a single audit entry or unpack into many rows?
2. Should **typing indicators** be broadcast via Socket.IO, or are they too noisy for v1?
3. Should image attachments be **deduplicated by perceptual hash** to save disk space (stickers are often reused)?
4. Is **voice audio recording** ever in scope, or strictly text/metadata?
5. Should the dashboard support **multiple user accounts** (switcher), or single-instance only?

---

*End of Design Document*
