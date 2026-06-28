<h1 align="Center">Discord Self-Bot Logger</h1>

A powerful Discord self-bot that logs messages, events, and server activity to a local SQLite database, paired with a real-time web dashboard for searching, browsing, and analyzing your Discord data.

> [!WARNING]
> **Warning:** Self-bots violate Discord's Terms of Service. Using a user token may result in account termination. This tool is intended for educational purposes and personal data archival only. Use at your own risk.

> [!NOTE]
> Some feature are still unfinished.

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
git clone https://github.com/Igidn/discord-self-bot-logger.git
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

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start backend and dashboard UI in development mode |
| `npm run build` | Build backend and frontend for production |
| `npm start` | Run the compiled production build |
| `npm run db:migrate` | Run Drizzle database migrations |
| `npm run db:generate` | Generate new migration files from schema changes |

---
