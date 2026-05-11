/**
 * Integration Test — Simulates Discord Selfbot Logger Workflow
 *
 * Tests:
 * 1. Database initialization & migrations
 * 2. Dashboard REST API (health, messages, search, stats, users, activity)
 * 3. Socket.IO real-time events
 * 4. Database queries and filters
 *
 * Run with: npx tsx --test test/integration.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as SocketIOClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, 'test-logs.db');
const CONFIG_PATH = path.resolve(process.cwd(), 'config.yaml');
let originalConfig: string | null = null;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(`http://127.0.0.1:33333/api/v1${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  return res;
}

/* ------------------------------------------------------------------ */
/*  Test Suite                                                         */
/* ------------------------------------------------------------------ */

describe('Discord Selfbot Logger Integration', () => {
  let server: any;
  let dbModule: any;

  before(async () => {
    // Clean previous test artifacts
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}

    // Backup original config.yaml if it exists
    if (fs.existsSync(CONFIG_PATH)) {
      originalConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
    }

    // Write test-specific config.yaml
    fs.writeFileSync(
      CONFIG_PATH,
      `token: dummy-discord-token-for-testing
dashboard:
  host: 127.0.0.1
  port: 33333
database:
  path: ${TEST_DB}
logging:
  logLevel: silent
`,
      'utf-8'
    );

    process.env.NODE_ENV = 'production';

    // Import project modules (side-effects: DB init + migrations)
    dbModule = await import('../src/database/index.js');
    const dashboardModule = await import('../src/dashboard/server.js');

    // Start dashboard server
    server = dashboardModule.startDashboardServer('127.0.0.1', 33333);
    await sleep(300); // let server bind
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (dbModule) {
      dbModule.closeDatabase();
    }
    // Restore original config.yaml
    if (originalConfig !== null) {
      fs.writeFileSync(CONFIG_PATH, originalConfig, 'utf-8');
    } else {
      try { fs.unlinkSync(CONFIG_PATH); } catch {}
    }
    // Clean up test DB files
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
  });

  /* ---------------------------------------------------------------- */
  /*  1. Database & Health                                              */
  /* ---------------------------------------------------------------- */

  describe('Health & Database', () => {
    it('should return healthy status with zero counts', async () => {
      const res = await apiFetch('/health');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.guildsCount, 0);
      assert.strictEqual(body.messagesCount, 0);
      assert.ok(typeof body.uptime === 'number');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  2. Seed Data (simulating bot events)                              */
  /* ---------------------------------------------------------------- */

  describe('Data Seeding & Queries', () => {
    it('should insert guilds, channels, users, and messages', async () => {
      const { sqlite } = dbModule;

      // Insert guild
      sqlite.prepare(`INSERT INTO guilds (id, name, icon_url, owner_id, joined_at, configured_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('guild-1', 'Test Guild', 'https://example.com/icon.png', 'owner-1', Math.floor(Date.now()/1000), Math.floor(Date.now()/1000));

      // Insert channel
      sqlite.prepare(`INSERT INTO channels (id, guild_id, name, type, topic, nsfw, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('channel-1', 'guild-1', 'general', 0, 'General chat', 0, null);

      // Insert users
      sqlite.prepare(`INSERT INTO users (id, username, discriminator, avatar_url, bot, first_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('user-1', 'Alice', '1234', null, 0, Math.floor(Date.now()/1000));

      sqlite.prepare(`INSERT INTO users (id, username, discriminator, avatar_url, bot, first_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('user-2', 'Bob', '5678', null, 0, Math.floor(Date.now()/1000));

      // Insert messages
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 25; i++) {
        sqlite.prepare(`INSERT INTO messages (id, guild_id, channel_id, author_id, content, created_at, is_dm, flags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            `msg-${i}`,
            'guild-1',
            'channel-1',
            i % 2 === 0 ? 'user-1' : 'user-2',
            `Hello world message number ${i}`,
            now - i * 60,
            0,
            0
          );
      }

      // Insert message edit
      sqlite.prepare(`INSERT INTO message_edits (message_id, old_content, new_content, edited_at)
        VALUES (?, ?, ?, ?)`)
        .run('msg-0', 'Hello world message number 0', 'Edited content', now);

      // Insert reaction
      sqlite.prepare(`INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('msg-0', 'guild-1', 'channel-1', 'user-2', null, '👍', 1, now);

      // Insert member event
      sqlite.prepare(`INSERT INTO member_events (guild_id, user_id, event_type, old_value, new_value, roles_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('guild-1', 'user-1', 'JOIN', null, null, null, now);

      // Insert voice event
      sqlite.prepare(`INSERT INTO voice_events (guild_id, user_id, channel_id, event_type, old_value, new_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('guild-1', 'user-1', 'channel-1', 'JOIN', null, null, now);

      // Insert presence update
      sqlite.prepare(`INSERT INTO presence_updates (guild_id, user_id, status, client_status, activities_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run('guild-1', 'user-1', 'online', '{"desktop":"online"}', '[]', now);

      // Insert guild audit
      sqlite.prepare(`INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('guild-1', 'CHANNEL_CREATE', 'channel-1', 'CHANNEL', 'user-1', '{"name":{"old":null,"new":"general"}}', null, now);
    });

    it('should reflect seeded data in health endpoint', async () => {
      const res = await apiFetch('/health');
      const body = await res.json();
      assert.strictEqual(body.guildsCount, 1);
      assert.strictEqual(body.messagesCount, 25);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  3. REST API Tests                                                 */
  /* ---------------------------------------------------------------- */

  describe('Messages API', () => {
    it('should list messages with pagination', async () => {
      const res = await apiFetch('/messages?limit=10');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 10);
      assert.ok(body.nextCursor);
    });

    it('should filter messages by guild', async () => {
      const res = await apiFetch('/messages?guild=guild-1&limit=5');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.length, 5);
    });

    it('should get message detail with edits and reactions', async () => {
      const res = await apiFetch('/messages/msg-0');
      if (res.status !== 200) {
        const errBody = await res.json();
        console.error('Message detail error:', errBody);
      }
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.message.id, 'msg-0');
      assert.ok(Array.isArray(body.edits));
      assert.ok(Array.isArray(body.reactions));
      assert.strictEqual(body.edits.length, 1);
      assert.strictEqual(body.reactions.length, 1);
    });
  });

  describe('Search API', () => {
    it('should search messages by content (LIKE fallback)', async () => {
      const res = await apiFetch('/search?q=Hello%20world&limit=5');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length > 0);
      assert.ok(body.data.every((m: any) => m.content.includes('Hello world')));
    });

    it('should return empty search for unknown term', async () => {
      const res = await apiFetch('/search?q=xyz-unknown-term-999');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.length, 0);
    });
  });

  describe('Stats API', () => {
    it('should return overview stats', async () => {
      const res = await apiFetch('/stats/overview');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      // Note: overview stats returns dailyCounts, topChannels, topUsers, periodDays
      assert.ok(Array.isArray(body.dailyCounts));
      assert.ok(Array.isArray(body.topChannels));
      assert.ok(Array.isArray(body.topUsers));
      assert.strictEqual(body.periodDays, 30);
    });

    it('should return guild-specific stats', async () => {
      const res = await apiFetch('/stats/guild/guild-1');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.totalMessages, 25);
      assert.strictEqual(body.totalReactions, 1);
      assert.strictEqual(body.totalMemberEvents, 1);
      assert.strictEqual(body.totalVoiceEvents, 1);
    });
  });

  describe('Users API', () => {
    it('should get user profile', async () => {
      const res = await apiFetch('/users/user-1');
      if (res.status !== 200) {
        const errBody = await res.json();
        console.error('User profile error:', errBody);
      }
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      // API spreads user fields directly into response + stats object
      assert.strictEqual(body.id, 'user-1');
      assert.strictEqual(body.username, 'Alice');
      assert.ok(body.stats);
      assert.ok(typeof body.stats.messageCount === 'number');
    });

    it('should list messages by user', async () => {
      const res = await apiFetch('/users/user-1/messages?limit=5');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.every((m: any) => m.authorId === 'user-1'));
    });
  });

  describe('Activity API', () => {
    it('should list member events', async () => {
      const res = await apiFetch('/activity/member-events?guild=guild-1');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      // Activity routes return arrays directly, not wrapped in { data }
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].eventType, 'JOIN');
    });

    it('should list voice events', async () => {
      const res = await apiFetch('/activity/voice?guild=guild-1');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].eventType, 'JOIN');
    });

    it('should list presence updates', async () => {
      const res = await apiFetch('/activity/presence?guild=guild-1');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].status, 'online');
    });

    it('should list guild audit events', async () => {
      const res = await apiFetch('/activity/audit?guild=guild-1');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].actionType, 'CHANNEL_CREATE');
    });
  });

  describe('Config API', () => {
    it('should return config (token redacted)', async () => {
      const res = await apiFetch('/config');
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(body.logging);
      assert.ok(body.dashboard);
      // Token is explicitly redacted as '[REDACTED]'
      assert.strictEqual(body.token, '[REDACTED]');
      assert.ok(!('authToken' in body.dashboard));
    });

    it('should update DM logging setting', async () => {
      const res = await apiFetch('/config/logging/dm', {
        method: 'POST',
        body: JSON.stringify({ enabled: true }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.logDirectMessages, true);

      // Verify config reflects the change
      const configRes = await apiFetch('/config');
      const configBody = await configRes.json();
      assert.strictEqual(configBody.logging.logDirectMessages, true);
    });

    it('should reject invalid DM logging payload', async () => {
      const res = await apiFetch('/config/logging/dm', {
        method: 'POST',
        body: JSON.stringify({ enabled: 'yes' }),
      });
      assert.strictEqual(res.status, 400);
    });

    it('should update retention days', async () => {
      const res = await apiFetch('/config/logging/retention', {
        method: 'POST',
        body: JSON.stringify({ days: 30 }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.retentionDays, 30);

      // Verify config reflects the change
      const configRes = await apiFetch('/config');
      const configBody = await configRes.json();
      assert.strictEqual(configBody.logging.retentionDays, 30);
    });

    it('should reject invalid retention days', async () => {
      const res = await apiFetch('/config/logging/retention', {
        method: 'POST',
        body: JSON.stringify({ days: 0 }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  4. Socket.IO Tests                                                */
  /* ---------------------------------------------------------------- */

  describe('Socket.IO', () => {
    it('should connect and receive room events', async () => {
      const client = SocketIOClient('http://127.0.0.1:33333', {
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', resolve);
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
      });

      // Subscribe to channel room
      client.emit('subscribe:channel', { channelId: 'channel-1' });
      client.emit('subscribe:guild', { guildId: 'guild-1' });

      await sleep(200);

      // Trigger a broadcast by inserting a message directly
      const { sqlite } = dbModule;
      const now = Math.floor(Date.now() / 1000);
      sqlite.prepare(`INSERT INTO messages (id, guild_id, channel_id, author_id, content, created_at, is_dm, flags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('msg-socket-test', 'guild-1', 'channel-1', 'user-1', 'Socket test message', now, 0, 0);

      // Use broadcaster to emit (import after env is set)
      const { broadcaster } = await import('../src/dashboard/socket/broadcaster.js');
      broadcaster.toChannel('channel-1', 'message:new', {
        id: 'msg-socket-test',
        guildId: 'guild-1',
        channelId: 'channel-1',
        authorId: 'user-1',
        content: 'Socket test message',
        createdAt: Date.now(),
      });

      const received = await new Promise<any>((resolve) => {
        client.on('message:new', (payload: any) => resolve(payload));
        setTimeout(() => resolve(null), 2000);
      });

      client.disconnect();
      assert.ok(received, 'Should have received message:new event');
      assert.strictEqual(received.id, 'msg-socket-test');
      assert.strictEqual(received.content, 'Socket test message');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  5. Filter / Query Logic                                           */
  /* ---------------------------------------------------------------- */

  describe('Filter Evaluation', () => {
    it('should evaluate simple filter clauses', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');

      const message = {
        guildId: 'guild-1',
        channelId: 'channel-1',
        authorId: 'user-1',
        content: 'hello world',
        attachments: [{ id: 'att-1', url: 'https://example.com/img.png' }],
        embedsJson: '[]',
      };

      assert.strictEqual(evaluateFilter(message, { field: 'guildId', op: 'eq', value: 'guild-1' }), true);
      assert.strictEqual(evaluateFilter(message, { field: 'guildId', op: 'eq', value: 'guild-2' }), false);
      assert.strictEqual(evaluateFilter(message, { field: 'content', op: 'contains', value: 'world' }), true);
      // hasAttachment operator checks message.attachments array length
      assert.strictEqual(evaluateFilter(message, { field: 'attachments', op: 'hasAttachment' }), true);
    });
  });
});
