<h1 align="Center">Discord Self-Bot Logger</h1>

A powerful Discord self-bot that logs messages, events, and server activity to a local SQLite database, paired with a real-time web dashboard for searching, browsing, and analyzing your Discord data.

> **Warning:** Self-bots violate Discord's Terms of Service. Using a user token may result in account termination. This tool is intended for educational purposes and personal data archival only. Use at your own risk.

> [!Some feature are still unfinished]


---

## Features

### Event Logging
- **Messages** — Log all guild and (opt-in) DM messages with full metadata
- **Message Edits** — Track every edit with before/after snapshots
- **Message Deletes** — Preserve deleted message content
- **Reactions** — Log emoji reactions added and removed
- **Member Events** — Joins, leaves, bans, unbans, nickname changes, role updates
- **Presence** — Status changes and activity updates
- **Voice Activity** — Channel joins/leaves, mute, deafen, stream, video events
- **Guild Audit** — Channel, role, thread, and invite changes
- **Attachments** — Download and compress images with configurable quality

### Web Dashboard
- **Real-time updates** — Live message feed via WebSockets
- **Full-text search** — Search across all logged messages with FTS5
- **Guild browser** — Explore servers, channels, and user profiles
- **Message viewer** — Threaded conversation view with attachments and reactions
- **Analytics** — Activity charts and server statistics via Recharts
- **Export** — Export data for backup or analysis
- **Responsive UI** — Built with shadcn/ui, Tailwind CSS, and React

### Data Management
- **SQLite database** — Fast local storage with Drizzle ORM and WAL mode
- **Data retention** — Automatic purging of records older than a configurable threshold
- **Attachment compression** — Resize, reformat, and strip metadata from images
- **Privacy-first** — DM logging is opt-in; granular guild filtering

---
### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/discord-self-bot-logger.git
cd discord-self-bot-logger

# Install dependencies
npm install

# Copy example configuration
cp config.example.yaml config.yaml

# Edit config.yaml with your token and preferences
# See Configuration section below for details
```

### Database Setup

```bash
# Run migrations to initialize the SQLite schema
npm run db:migrate
```

### Running

```bash
# Development mode (backend + dashboard UI with hot reload)
npm run dev

# Production build
npm run build
npm start
```

The dashboard will be available at `http://127.0.0.1:3333` (or your configured host/port).

---

## Configuration

All settings are managed through `config.yaml`:

```yaml
# Required
 token: YOUR_DISCORD_USER_TOKEN

# Optional
logLevel: info

logging:
  guilds: []                    # Guild IDs to monitor (empty = none)
  logDirectMessages: false      # Opt-in to DM logging

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

  retentionDays: 365

  attachments:
    enabled: true
    maxSizeMb: 25
    path: ./storage/attachments
    compression:
      enabled: true
      quality: 80
      maxWidth: 1920
      maxHeight: 1080
      format: webp
      stripMetadata: true

dashboard:
  host: 127.0.0.1
  port: 3333

database:
  path: ./storage/logs.db
  wal: true
```

> **Security Note:** Keep your `config.yaml` secure and never commit it. The bot requires a user token, which grants full account access.

---

## Project Structure

```
.
├── src/
│   ├── bot/               # Discord self-bot client & event handlers
│   ├── config/            # YAML config loader & Zod schema
│   ├── dashboard/         # Express API, Socket.IO, routes
│   ├── database/          # Drizzle schema, queries, migrations
│   ├── services/          # Retention purger, attachment downloader, exporter
│   └── utils/             # Logger, paths, snowflake utilities
├── dashboard-ui/          # React SPA (Vite + Tailwind + shadcn/ui)
├── scripts/               # Dev & build shell scripts
├── storage/               # SQLite DB & downloaded attachments
├── config.example.yaml    # Example configuration
└── package.json
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend and dashboard UI in development mode |
| `npm run build` | Build backend and frontend for production |
| `npm start` | Run the compiled production build |
| `npm run db:migrate` | Run Drizzle database migrations |
| `npm run db:generate` | Generate new migration files from schema changes |

---

## Database Schema

The SQLite database uses Drizzle ORM and includes tables for:

- `guilds`, `channels`, `users`
- `messages` (with FTS5 search index)
- `message_edits`, `message_deletes`
- `reactions`, `attachments`
- `member_events`, `presence_updates`, `voice_events`, `guild_audit`

Migrations are located in `src/database/migrations/`.

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| **Overview** | Recent activity, stats, and live feed |
| **Search** | Full-text message search with filters |
| **Guilds** | Browse monitored servers |
| **Channel Feed** | Real-time message stream per channel |
| **Message Detail** | View message with edits, reactions, attachments |
| **User Profile** | User activity and message history |
| **Stats** | Analytics and charts |
| **Settings** | Dashboard configuration |
| **Setup** | First-time guild selection wizard |

---

## Disclaimer

This software is provided for **educational and personal archival purposes only**. Using self-bots is against [Discord's Terms of Service](https://discord.com/terms). The authors assume no liability for any account bans, data loss, or other consequences resulting from the use of this tool.

---

## License

MIT
