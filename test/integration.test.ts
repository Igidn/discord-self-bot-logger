/**
 * Integration Test — Discord Selfbot Logger
 *
 * Covers:
 * 1. Database initialization & migrations
 * 2. Dashboard REST API (health, messages, search, stats, users, activity,
 *    guilds, attachments, config, export, purge)
 * 3. Socket.IO real-time events (rooms, search subscriptions, stats)
 * 4. Filter evaluation (all operators + groups)
 * 5. SQL filter building (timestamp coercion, messageType, boolean flags,
 *    username resolution)
 * 6. Snowflake utilities
 * 7. Retention purge
 *
 * The suite runs inside a throwaway temp working directory and writes its own
 * config.yaml there, so the user's real ./config.yaml is never read, backed
 * up, or overwritten.
 *
 * Run with: npx tsx --test test/integration.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { io as SocketIOClient } from 'socket.io-client';
import * as schema from '../src/database/schema.js';

let tmpRoot: string;
let TEST_DB: string;
let server: any;
let dbModule: any;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(p: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:33333/api/v1${p}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
}

async function waitForExport(jobId: string, timeoutMs = 5000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await (await apiFetch(`/export/${jobId}`)).json();
    if (body.status === 'completed' || body.status === 'failed') return body;
    await sleep(40);
  }
  throw new Error(`Export ${jobId} did not complete within ${timeoutMs}ms`);
}

/* ------------------------------------------------------------------ */
/*  Seed                                                               */
/* ------------------------------------------------------------------ */

async function seedData(sqlite: any, root: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const oldDate = now - 400 * 24 * 60 * 60; // 400 days ago — for purge

  // Guilds
  const insGuild = sqlite.prepare(
    `INSERT INTO guilds (id, name, icon_url, owner_id, joined_at, configured_at, member_count) VALUES (?,?,?,?,?,?,?)`
  );
  insGuild.run('guild-1', 'Test Guild', 'https://example.com/icon.png', 'owner-1', now, now, 10);
  insGuild.run('guild-2', 'Other Guild', null, 'owner-2', now, now, 5);

  // Channels
  const insChan = sqlite.prepare(
    `INSERT INTO channels (id, guild_id, name, type, topic, nsfw, parent_id) VALUES (?,?,?,?,?,?,?)`
  );
  insChan.run('channel-1', 'guild-1', 'general', 0, 'General chat', 0, null);
  insChan.run('channel-2', 'guild-1', 'random', 0, null, 0, null);
  insChan.run('channel-3', 'guild-2', 'other-guild', 0, null, 0, null);
  insChan.run('channel-dm', null, 'dm-channel', 1, null, 0, null);

  // Users
  const insUser = sqlite.prepare(
    `INSERT INTO users (id, username, discriminator, avatar_url, bot, first_seen_at) VALUES (?,?,?,?,?,?)`
  );
  insUser.run('user-1', 'Alice', '1234', null, 0, now);
  insUser.run('user-2', 'Bob', '5678', null, 0, now);
  insUser.run('user-3', 'Carol', '9999', null, 1, now);

  // Messages
  const insMsg = sqlite.prepare(
    `INSERT INTO messages (id, guild_id, channel_id, author_id, content, created_at, edited_at, deleted_at, is_dm, reply_to_id, embeds_json, flags, attachment_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (let i = 0; i < 25; i++) {
    insMsg.run(
      `msg-${i}`, 'guild-1', 'channel-1',
      i % 2 === 0 ? 'user-1' : 'user-2',
      `Hello world message number ${i}`,
      now - i * 60, null, null, 0, null, null, 0, 0
    );
  }
  insMsg.run('msg-25', 'guild-1', 'channel-1', 'user-2', 'this is a reply', now - 5, null, null, 0, 'msg-0', null, 0, 0);
  insMsg.run('msg-26', 'guild-1', 'channel-1', 'user-1', 'deleted message', now - 4, null, now - 2, 0, null, null, 0, 0);
  insMsg.run('msg-27', 'guild-1', 'channel-1', 'user-1', 'edited message', now - 3, now - 2, null, 0, null, null, 0, 0);
  insMsg.run('msg-28', null, 'channel-dm', 'user-1', 'private dm message', now - 3, null, null, 1, null, null, 0, 0);
  insMsg.run('msg-29', 'guild-1', 'channel-1', 'user-2', 'message with embed', now - 2, null, null, 0, null, '[{"title":"hello"}]', 0, 0);
  insMsg.run('msg-30', 'guild-1', 'channel-1', 'user-1', 'message with attachment', now - 1, null, null, 0, null, null, 0, 1);
  insMsg.run('msg-old', 'guild-1', 'channel-1', 'user-1', 'very old message', oldDate, null, null, 0, null, null, 0, 0);

  // Edits
  sqlite.prepare(`INSERT INTO message_edits (message_id, old_content, new_content, edited_at) VALUES (?,?,?,?)`)
    .run('msg-0', 'Hello world message number 0', 'Edited content', now);
  sqlite.prepare(`INSERT INTO message_edits (message_id, old_content, new_content, edited_at) VALUES (?,?,?,?)`)
    .run('msg-27', 'edited message', 'edited message (updated)', now - 2);

  // Reaction
  sqlite.prepare(`INSERT INTO reactions (message_id, guild_id, channel_id, user_id, emoji_id, emoji_name, added, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run('msg-0', 'guild-1', 'channel-1', 'user-2', null, '👍', 1, now);

  // Attachments: one local file (served), one remote-only (redirect), one
  // local file outside the attachments dir (path-traversal guard).
  const attachmentsDir = path.join(root, 'storage', 'attachments');
  await fs.mkdir(attachmentsDir, { recursive: true });
  const picPath = path.join(attachmentsDir, 'pic.png');
  await fs.writeFile(picPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const secretPath = path.join(root, 'secret.txt');
  await fs.writeFile(secretPath, 'secret');

  const insAtt = sqlite.prepare(
    `INSERT INTO attachments (id, message_id, file_name, original_url, original_size_bytes, content_type, local_path, width, height, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  insAtt.run('att-1', 'msg-30', 'pic.png', 'https://example.com/pic.png', 12345, 'image/png', picPath, 100, 100, now);
  insAtt.run('att-2', 'msg-29', 'no-local.png', 'https://example.com/no-local.png', null, 'image/png', null, null, null, now);
  insAtt.run('att-3', 'msg-30', 'traverse.png', 'https://example.com/x.png', null, null, secretPath, null, null, now);

  // Activity events
  sqlite.prepare(`INSERT INTO member_events (guild_id, user_id, event_type, old_value, new_value, roles_json, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run('guild-1', 'user-1', 'JOIN', null, null, null, now);
  sqlite.prepare(`INSERT INTO voice_events (guild_id, user_id, channel_id, event_type, old_value, new_value, created_at) VALUES (?,?,?,?,?,?,?)`)
    .run('guild-1', 'user-1', 'channel-1', 'JOIN', null, null, now);
  sqlite.prepare(`INSERT INTO presence_updates (guild_id, user_id, status, client_status, activities_json, updated_at) VALUES (?,?,?,?,?,?)`)
    .run('guild-1', 'user-1', 'online', '{"desktop":"online"}', '[]', now);
  sqlite.prepare(`INSERT INTO guild_audit (guild_id, action_type, target_id, target_type, user_id, changes_json, reason, created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run('guild-1', 'CHANNEL_CREATE', 'channel-1', 'CHANNEL', 'user-1', '{"name":{"old":null,"new":"general"}}', null, now);
}

/* ------------------------------------------------------------------ */
/*  Test Suite                                                         */
/* ------------------------------------------------------------------ */

describe('Discord Selfbot Logger Integration', () => {
  before(async () => {
    // Throwaway cwd + config.yaml so the user's real config is never touched.
    // realpath: on macOS, os.tmpdir() is under /var -> /private/var; mkdtemp
    // returns the logical /var path while process.cwd() resolves to /private/var,
    // which would break path.relative() checks in the attachments route.
    tmpRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'discord-logger-test-')));
    TEST_DB = path.join(tmpRoot, 'test-logs.db');

    await fs.writeFile(
      path.join(tmpRoot, 'config.yaml'),
      `token: dummy-discord-token-for-testing
logLevel: error
dashboard:
  host: 127.0.0.1
  port: 33333
database:
  path: ${TEST_DB}
  wal: true
logging:
  retentionDays: 365
  logDirectMessages: false
  attachments:
    enabled: true
    path: ./storage/attachments
`,
      'utf-8'
    );

    process.chdir(tmpRoot);
    process.env.NODE_ENV = 'production';

    dbModule = await import('../src/database/index.js');
    const dashboardModule = await import('../src/dashboard/server.js');

    await seedData(dbModule.sqlite, tmpRoot);

    server = dashboardModule.startDashboardServer('127.0.0.1', 33333);
    await sleep(300);
  });

  after(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dbModule) dbModule.closeDatabase();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  /* ---------------------------------------------------------------- */
  /*  1. Health & Database                                             */
  /* ---------------------------------------------------------------- */

  describe('Health & Database', () => {
    it('should return healthy status with seeded counts', async () => {
      const body = await (await apiFetch('/health')).json();
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.guildsCount, 2);
      // 31 guild-1 messages + 1 DM = 32
      assert.strictEqual(body.messagesCount, 32);
      assert.ok(typeof body.uptime === 'number');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  2. Messages API                                                  */
  /* ---------------------------------------------------------------- */

  describe('Messages API', () => {
    it('should list messages with pagination + enrichment', async () => {
      const body = await (await apiFetch('/messages?limit=10')).json();
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 10);
      assert.ok(body.nextCursor);
      assert.ok(body.data[0].channel, 'channel hydration attached');
      assert.ok(body.data[0].guild, 'guild hydration attached');
    });

    it('should follow a pagination cursor to the next page', async () => {
      const page1 = await (await apiFetch('/messages?limit=5')).json();
      const page2 = await (await apiFetch(`/messages?limit=5&cursor=${page1.nextCursor}`)).json();
      assert.strictEqual(page2.data.length, 5);
      assert.notStrictEqual(page2.data[0].id, page1.data[0].id);
    });

    it('should filter by guild, channel, and author', async () => {
      const byGuild = await (await apiFetch('/messages?guild=guild-1&limit=5')).json();
      assert.strictEqual(byGuild.data.length, 5);

      const byChannel = await (await apiFetch('/messages?channel=channel-1&limit=3')).json();
      assert.ok(byChannel.data.every((m: any) => m.channelId === 'channel-1'));

      const byAuthor = await (await apiFetch('/messages?author=user-2&limit=5')).json();
      assert.ok(byAuthor.data.every((m: any) => m.authorId === 'user-2'));
    });

    it('should filter by before/after timestamps', async () => {
      const now = Math.floor(Date.now() / 1000);
      const after = await (await apiFetch(`/messages?after=${(now - 600) * 1000}&limit=50`)).json();
      assert.ok(after.data.length > 0);
      const before = await (await apiFetch(`/messages?before=${(now - 600) * 1000}&limit=50`)).json();
      assert.ok(before.data.length > 0);
    });

    it('should use the search path when ?search is given', async () => {
      const body = await (await apiFetch('/messages?search=Hello&limit=5')).json();
      assert.strictEqual(body.data.length, 5);
      assert.ok(body.data.every((m: any) => m.content.includes('Hello')));
    });

    it('should get message detail with author', async () => {
      const body = await (await apiFetch('/messages/msg-0')).json();
      assert.strictEqual(body.id, 'msg-0');
      assert.strictEqual(body.authorId, 'user-1');
      assert.strictEqual(body.author.username, 'Alice');
    });

    it('should return 404 for a missing message', async () => {
      assert.strictEqual((await apiFetch('/messages/nope')).status, 404);
    });

    it('should reject out-of-range limit', async () => {
      assert.strictEqual((await apiFetch('/messages?limit=0')).status, 400);
      assert.strictEqual((await apiFetch('/messages?limit=101')).status, 400);
    });

    it('should browse messages with filters + enrichment', async () => {
      const body = await (await apiFetch('/messages/browse?guildId=guild-1&limit=10')).json();
      assert.strictEqual(body.data.length, 10);
      assert.ok(body.data[0].channel, 'browse attaches channel');
      assert.ok(Array.isArray(body.data[0].attachments), 'browse attaches attachments');
    });

    it('should browse with a text query', async () => {
      const body = await (await apiFetch('/messages/browse?q=Hello&limit=5')).json();
      assert.ok(body.data.every((m: any) => m.content.includes('Hello')));
    });

    it('should return surrounding messages', async () => {
      const body = await (await apiFetch('/messages/msg-10/surrounding?beforeCount=3&afterCount=3')).json();
      assert.ok(Array.isArray(body.before));
      assert.ok(Array.isArray(body.after));
      assert.strictEqual(body.before.length, 3);
      assert.strictEqual(body.after.length, 3);
      assert.ok(body.before.every((m: any) => m.channelId === 'channel-1'));
    });

    it('should return 404 for surrounding of a missing message', async () => {
      assert.strictEqual((await apiFetch('/messages/nope/surrounding')).status, 404);
    });

    it('should list message edits', async () => {
      const body = await (await apiFetch('/messages/msg-27/edits')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].newContent, 'edited message (updated)');
    });

    it('should list message reactions with username', async () => {
      const body = await (await apiFetch('/messages/msg-0/reactions')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].emojiName, '👍');
      assert.strictEqual(body[0].username, 'Bob');
    });

    it('should list message attachments', async () => {
      const body = await (await apiFetch('/messages/msg-30/attachments')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 2);
      assert.ok(body.every((a: any) => a.id.startsWith('att-')));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  3. Search API                                                    */
  /* ---------------------------------------------------------------- */

  describe('Search API', () => {
    it('should search by content (FTS path)', async () => {
      const body = await (await apiFetch('/search?q=Hello&limit=5')).json();
      assert.ok(body.data.length > 0);
      assert.ok(body.data.every((m: any) => m.content.includes('Hello')));
    });

    it('should fall back to LIKE when FTS finds no tokens (substring)', async () => {
      // "essage" is not an FTS token, so FTS returns 0 and the LIKE path runs.
      const body = await (await apiFetch('/search?q=essage&limit=50')).json();
      assert.ok(body.data.length > 0);
      assert.ok(body.data.every((m: any) => m.content.includes('essage')));
    });

    it('should return empty for an unknown term', async () => {
      const body = await (await apiFetch('/search?q=xyz-unknown-term-999')).json();
      assert.strictEqual(body.data.length, 0);
    });

    it('should accept a filters JSON param', async () => {
      const filters = encodeURIComponent(JSON.stringify({
        combinator: 'and',
        filters: [{ field: 'authorId', op: 'eq', value: 'Bob' }],
      }));
      const body = await (await apiFetch(`/search?q=Hello&filters=${filters}&limit=20`)).json();
      assert.ok(body.data.length > 0);
      assert.ok(body.data.every((m: any) => m.authorId === 'user-2'));
    });

    it('should reject invalid filters JSON', async () => {
      assert.strictEqual((await apiFetch('/search?filters=not-json')).status, 400);
    });

    it('should sort oldest-first', async () => {
      const body = await (await apiFetch('/messages/browse?q=Hello&sort=oldest&limit=5')).json();
      // msg-24 is the oldest "Hello world" message (now - 24min)
      assert.strictEqual(body.data[0].id, 'msg-24');
    });

    it('should paginate search via cursor', async () => {
      const page1 = await (await apiFetch('/search?q=Hello&limit=5')).json();
      const page2 = await (await apiFetch(`/search?q=Hello&limit=5&cursor=${page1.nextCursor}`)).json();
      assert.strictEqual(page2.data.length, 5);
      assert.strictEqual(page2.data[0].id, 'msg-5');
    });

    it('should expose filter metadata at /search/filters', async () => {
      const body = await (await apiFetch('/search/filters')).json();
      assert.ok(Array.isArray(body.availableFilters));
      assert.ok(Array.isArray(body.operators));
      assert.ok(body.enumValues);
    });

    it('should suggest authors by prefix', async () => {
      const body = await (await apiFetch('/search/suggest?field=authorId&prefix=Al&limit=5')).json();
      assert.ok(Array.isArray(body));
      assert.ok(body.some((s: any) => s.label === 'Alice' && s.count > 0));
    });

    it('should suggest channels by prefix', async () => {
      const body = await (await apiFetch('/search/suggest?field=channelId&prefix=gen&limit=5')).json();
      assert.ok(body.some((s: any) => s.label === 'general'));
    });

    it('should suggest guilds by prefix', async () => {
      const body = await (await apiFetch('/search/suggest?field=guildId&prefix=Test&limit=5')).json();
      assert.ok(body.some((s: any) => s.label === 'Test Guild'));
    });

    it('should reject an invalid suggest field', async () => {
      assert.strictEqual((await apiFetch('/search/suggest?field=bad&prefix=x')).status, 400);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  4. Stats API                                                     */
  /* ---------------------------------------------------------------- */

  describe('Stats API', () => {
    it('should return overview stats with days', async () => {
      const body = await (await apiFetch('/stats/overview?days=1')).json();
      assert.ok(Array.isArray(body.dailyCounts));
      assert.ok(Array.isArray(body.topChannels));
      assert.ok(Array.isArray(body.topUsers));
      assert.strictEqual(body.periodDays, 1);
    });

    it('should let ?range override ?days', async () => {
      const body = await (await apiFetch('/stats/overview?days=1&range=7')).json();
      assert.strictEqual(body.periodDays, 7);
    });

    it('should return guild-specific stats', async () => {
      const body = await (await apiFetch('/stats/guild/guild-1')).json();
      assert.strictEqual(body.totalMessages, 31);
      assert.strictEqual(body.deletedMessages, 1);
      assert.strictEqual(body.totalEdits, 2);
      assert.strictEqual(body.totalAttachments, 3);
      assert.strictEqual(body.totalReactions, 1);
      assert.strictEqual(body.totalMemberEvents, 1);
      assert.strictEqual(body.totalVoiceEvents, 1);
      assert.ok(Array.isArray(body.topChannels));
      assert.ok(body.topChannels.some((c: any) => c.channelId === 'channel-1'));
    });

    it('should return zeros for an unknown guild', async () => {
      const body = await (await apiFetch('/stats/guild/guild-999')).json();
      assert.strictEqual(body.totalMessages, 0);
      assert.strictEqual(body.totalReactions, 0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  5. Users API                                                     */
  /* ---------------------------------------------------------------- */

  describe('Users API', () => {
    it('should list users with search + sort', async () => {
      const body = await (await apiFetch('/users?search=Ali&sort=username_asc&limit=10')).json();
      assert.ok(Array.isArray(body.data));
      assert.ok(body.total >= 1);
      assert.ok(body.data.some((u: any) => u.username === 'Alice'));
    });

    it('should sort by message count descending', async () => {
      const body = await (await apiFetch('/users?sort=messages_desc&limit=2')).json();
      assert.strictEqual(body.data[0].userId, 'user-1');
      assert.strictEqual(body.data[1].userId, 'user-2');
    });

    it('should get a user profile with stats', async () => {
      const body = await (await apiFetch('/users/user-1')).json();
      assert.strictEqual(body.id, 'user-1');
      assert.strictEqual(body.username, 'Alice');
      assert.ok(body.stats);
      assert.strictEqual(body.stats.messageCount, 18);
      assert.strictEqual(body.stats.guildCount, 1);
    });

    it('should return 404 for an unknown user', async () => {
      assert.strictEqual((await apiFetch('/users/nope')).status, 404);
    });

    it('should list messages by user with cursor pagination', async () => {
      const page1 = await (await apiFetch('/users/user-1/messages?limit=5')).json();
      assert.ok(page1.data.every((m: any) => m.authorId === 'user-1'));
      const page2 = await (await apiFetch(`/users/user-1/messages?limit=5&cursor=${page1.nextCursor}`)).json();
      assert.ok(page2.data.every((m: any) => m.authorId === 'user-1'));
      assert.notStrictEqual(page2.data[0].id, page1.data[0].id);
    });

    it('should return an activity heatmap', async () => {
      const body = await (await apiFetch('/users/user-1/activity/heatmap?days=30&tz=60')).json();
      assert.strictEqual(body.days, 30);
      assert.strictEqual(body.tz, 60);
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.some((d: any) => d.count > 0));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  6. Activity API                                                  */
  /* ---------------------------------------------------------------- */

  describe('Activity API', () => {
    it('should filter member events by guild/user/type', async () => {
      const body = await (await apiFetch('/activity/member-events?guild=guild-1&user=user-1&type=JOIN')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].eventType, 'JOIN');
    });

    it('should filter voice events by user', async () => {
      const body = await (await apiFetch('/activity/voice?user=user-1')).json();
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].eventType, 'JOIN');
    });

    it('should filter presence updates by user', async () => {
      const body = await (await apiFetch('/activity/presence?user=user-1')).json();
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].status, 'online');
    });

    it('should filter guild audit by action/user', async () => {
      const body = await (await apiFetch('/activity/audit?guild=guild-1&action=CHANNEL_CREATE&user=user-1')).json();
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].actionType, 'CHANNEL_CREATE');
    });

    it('should reject an invalid limit', async () => {
      assert.strictEqual((await apiFetch('/activity/member-events?limit=0')).status, 400);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  7. Guilds API                                                    */
  /* ---------------------------------------------------------------- */

  describe('Guilds API', () => {
    it('should list guilds with message counts', async () => {
      const body = await (await apiFetch('/guilds')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 2);
      const g1 = body.find((g: any) => g.id === 'guild-1');
      assert.strictEqual(g1.messageCount, 31);
      assert.strictEqual(g1.memberCount, 10);
      const g2 = body.find((g: any) => g.id === 'guild-2');
      assert.strictEqual(g2.messageCount, 0);
    });

    it('should get a single guild', async () => {
      const body = await (await apiFetch('/guilds/guild-1')).json();
      assert.strictEqual(body.id, 'guild-1');
      assert.strictEqual(body.messageCount, 31);
    });

    it('should return 404 for an unknown guild', async () => {
      assert.strictEqual((await apiFetch('/guilds/nope')).status, 404);
    });

    it('should list channels for a guild', async () => {
      const body = await (await apiFetch('/guilds/guild-1/channels')).json();
      assert.ok(Array.isArray(body));
      assert.strictEqual(body.length, 2);
      const c1 = body.find((c: any) => c.id === 'channel-1');
      assert.strictEqual(c1.messageCount, 31);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  8. Attachments API                                               */
  /* ---------------------------------------------------------------- */

  describe('Attachments API', () => {
    it('should serve a local attachment file', async () => {
      const res = await apiFetch('/attachments/att-1/preview');
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('image/png'));
    });

    it('should redirect to the original URL when no local file', async () => {
      const res = await apiFetch('/attachments/att-2/preview', { redirect: 'manual' });
      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.get('location'), 'https://example.com/no-local.png');
    });

    it('should 403 on a path-traversal attempt outside the attachments dir', async () => {
      const res = await apiFetch('/attachments/att-3/preview');
      assert.strictEqual(res.status, 403);
    });

    it('should 404 for an unknown attachment', async () => {
      assert.strictEqual((await apiFetch('/attachments/nope/preview')).status, 404);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  9. Config API                                                    */
  /* ---------------------------------------------------------------- */

  describe('Config API', () => {
    it('should return config with token redacted', async () => {
      const body = await (await apiFetch('/config')).json();
      assert.strictEqual(body.token, '[REDACTED]');
      assert.ok(body.logging);
      assert.ok(body.dashboard);
      assert.ok(!('authToken' in body.dashboard));
    });

    it('should update the guild whitelist', async () => {
      const res = await apiFetch('/config/guilds', {
        method: 'POST', body: JSON.stringify({ guildIds: ['123', '456'] }),
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await res.json()).success, true);
      const cfg = await (await apiFetch('/config')).json();
      assert.deepStrictEqual(cfg.logging.guilds, ['123', '456']);
    });

    it('should reject an invalid guild whitelist', async () => {
      assert.strictEqual(
        (await apiFetch('/config/guilds', { method: 'POST', body: JSON.stringify({ guildIds: 'nope' }) })).status,
        400
      );
      assert.strictEqual(
        (await apiFetch('/config/guilds', { method: 'POST', body: JSON.stringify({ guildIds: [1, 2] }) })).status,
        400
      );
    });

    it('should update DM logging', async () => {
      const res = await apiFetch('/config/logging/dm', { method: 'POST', body: JSON.stringify({ enabled: true }) });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await res.json()).logDirectMessages, true);
      const cfg = await (await apiFetch('/config')).json();
      assert.strictEqual(cfg.logging.logDirectMessages, true);
    });

    it('should reject invalid DM logging payload', async () => {
      assert.strictEqual(
        (await apiFetch('/config/logging/dm', { method: 'POST', body: JSON.stringify({ enabled: 'yes' }) })).status,
        400
      );
    });

    it('should update retention days', async () => {
      const res = await apiFetch('/config/logging/retention', { method: 'POST', body: JSON.stringify({ days: 30 }) });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await res.json()).retentionDays, 30);
      const cfg = await (await apiFetch('/config')).json();
      assert.strictEqual(cfg.logging.retentionDays, 30);
    });

    it('should reject invalid retention days', async () => {
      assert.strictEqual(
        (await apiFetch('/config/logging/retention', { method: 'POST', body: JSON.stringify({ days: 0 }) })).status,
        400
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  10. Export API                                                   */
  /* ---------------------------------------------------------------- */

  describe('Export API', () => {
    it('should create and complete a JSONL export', async () => {
      const created = await (await apiFetch('/export/messages?format=jsonl', { method: 'POST' })).json();
      assert.strictEqual(created.status, 'pending');
      assert.ok(created.jobId);
      const job = await waitForExport(created.jobId);
      assert.strictEqual(job.status, 'completed');
      assert.ok(job.totalRows > 0);
      const raw = await fs.readFile(job.filePath, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      assert.ok(lines.length > 0);
      assert.ok(JSON.parse(lines[0]).id, 'first jsonl line is a message row');
    });

    it('should produce a CSV export with a header row', async () => {
      const created = await (await apiFetch('/export/messages?format=csv', { method: 'POST' })).json();
      const job = await waitForExport(created.jobId);
      const raw = await fs.readFile(job.filePath, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      assert.ok(lines[0].startsWith('id,guild_id,'));
      assert.ok(lines.length > 1);
    });

    it('should produce an HTML export', async () => {
      const created = await (await apiFetch('/export/messages?format=html', { method: 'POST' })).json();
      const job = await waitForExport(created.jobId);
      const raw = await fs.readFile(job.filePath, 'utf-8');
      assert.ok(raw.includes('<table'));
      assert.ok(raw.includes('</html>'));
    });

    it('should reject an invalid format', async () => {
      assert.strictEqual((await apiFetch('/export/messages?format=xml', { method: 'POST' })).status, 400);
    });

    it('should reject invalid filters JSON', async () => {
      assert.strictEqual((await apiFetch('/export/messages?format=jsonl&filters=not-json', { method: 'POST' })).status, 400);
    });

    it('should 404 for an unknown export job', async () => {
      assert.strictEqual((await apiFetch('/export/nonexistent')).status, 404);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  11. Socket.IO                                                    */
  /* ---------------------------------------------------------------- */

  describe('Socket.IO', () => {
    it('should deliver room events, search matches, and stats', async () => {
      const client = SocketIOClient('http://127.0.0.1:33333', {
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', resolve);
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
      });

      client.emit('subscribe:channel', { channelId: 'channel-1' });
      client.emit('subscribe:guild', { guildId: 'guild-1' });
      client.emit('subscribe:search', { q: 'special' });
      await sleep(150);

      const { emitMessageNew } = await import('../src/dashboard/socket/broadcaster.js');
      const payload = {
        id: 'sock-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        authorId: 'user-1',
        content: 'special socket test message',
        createdAt: Date.now(),
      };

      // Register both listeners BEFORE emitting so we don't miss synchronous fires.
      const roomPromise = new Promise<any>((resolve) => {
        client.once('message:new', resolve);
        setTimeout(() => resolve(null), 2000);
      });
      const searchPromise = new Promise<any>((resolve) => {
        client.once('search:match', resolve);
        setTimeout(() => resolve(null), 2000);
      });

      emitMessageNew(payload as any);

      const roomEvent = await roomPromise;
      assert.ok(roomEvent, 'should receive message:new on channel room');
      assert.strictEqual(roomEvent.id, 'sock-1');

      const searchEvent = await searchPromise;
      assert.ok(searchEvent, 'should receive search:match for a matching subscription');
      assert.strictEqual(searchEvent.id, 'sock-1');

      // Global stats request
      const globalStats = await new Promise<any>((resolve) => {
        client.once('stats:tick', resolve);
        setTimeout(() => resolve(null), 2000);
        client.emit('request:stats', {});
      });
      assert.ok(globalStats);
      assert.ok(Array.isArray(globalStats.dailyCounts));

      // Guild stats request
      const guildStats = await new Promise<any>((resolve) => {
        client.once('stats:tick', resolve);
        setTimeout(() => resolve(null), 2000);
        client.emit('request:stats', { guildId: 'guild-1' });
      });
      assert.ok(guildStats);
      assert.ok(guildStats.stats && typeof guildStats.stats.totalMessages === 'number');

      client.disconnect();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  12. Filter Evaluation (in-memory)                                */
  /* ---------------------------------------------------------------- */

  describe('Filter Evaluation', () => {
    const message = {
      guildId: 'guild-1',
      channelId: 'channel-1',
      authorId: 'user-1',
      content: 'hello world',
      attachments: [{ id: 'att-1', url: 'https://example.com/img.png' }],
      embedsJson: '[{"title":"x"}]',
      reactions: [{ id: 'r-1' }],
      deletedAt: null,
      editedAt: 123,
      isDm: true,
    };

    const C = (field: string, op: any, value?: unknown) => ({ field, op, value });

    it('comparison + string operators', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');
      assert.strictEqual(evaluateFilter(message, C('guildId', 'eq', 'guild-1')), true);
      assert.strictEqual(evaluateFilter(message, C('guildId', 'neq', 'guild-1')), false);
      assert.strictEqual(evaluateFilter(message, C('guildId', 'eq', 'guild-2')), false);
      assert.strictEqual(evaluateFilter(message, C('content', 'contains', 'world')), true);
      assert.strictEqual(evaluateFilter(message, C('content', 'startsWith', 'hello')), true);
      assert.strictEqual(evaluateFilter(message, C('content', 'endsWith', 'world')), true);
      assert.strictEqual(evaluateFilter(message, C('content', 'endsWith', 'hello')), false);
    });

    it('in / nin / between / null', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');
      assert.strictEqual(evaluateFilter(message, C('guildId', 'in', ['guild-1', 'guild-2'])), true);
      assert.strictEqual(evaluateFilter(message, C('guildId', 'in', ['guild-2'])), false);
      assert.strictEqual(evaluateFilter(message, C('guildId', 'nin', ['guild-2'])), true);
      assert.strictEqual(evaluateFilter(message, C('editedAt', 'between', [100, 200])), true);
      assert.strictEqual(evaluateFilter(message, C('editedAt', 'between', [200, 300])), false);
      assert.strictEqual(evaluateFilter(message, C('deletedAt', 'isNull')), true);
      assert.strictEqual(evaluateFilter(message, C('editedAt', 'isNotNull')), true);
    });

    it('boolean flag operators', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');
      assert.strictEqual(evaluateFilter(message, C('attachments', 'hasAttachment')), true);
      assert.strictEqual(evaluateFilter(message, C('embedsJson', 'hasEmbed')), true);
      assert.strictEqual(evaluateFilter(message, C('reactions', 'hasReaction')), true);
      assert.strictEqual(evaluateFilter(message, C('deletedAt', 'isDeleted')), false);
      assert.strictEqual(evaluateFilter(message, C('editedAt', 'isEdited')), true);
      assert.strictEqual(evaluateFilter(message, C('isDm', 'isDm')), true);
    });

    it('boolean flag with eq + value=false negates', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');
      assert.strictEqual(evaluateFilter(message, C('hasAttachment', 'eq', false)), false);
      assert.strictEqual(evaluateFilter(message, C('isDm', 'eq', false)), false);
      assert.strictEqual(evaluateFilter(message, C('isDm', 'eq', true)), true);
    });

    it('and / or groups', async () => {
      const { evaluateFilter } = await import('../src/shared/filters.js');
      const andGroup = { combinator: 'and' as const, filters: [C('guildId', 'eq', 'guild-1'), C('content', 'contains', 'world')] };
      const orGroup = { combinator: 'or' as const, filters: [C('guildId', 'eq', 'guild-2'), C('content', 'contains', 'world')] };
      assert.strictEqual(evaluateFilter(message, andGroup), true);
      assert.strictEqual(evaluateFilter(message, { combinator: 'and', filters: [C('guildId', 'eq', 'guild-1'), C('content', 'contains', 'nope')] }), false);
      assert.strictEqual(evaluateFilter(message, orGroup), true);
      assert.strictEqual(evaluateFilter(message, { combinator: 'or', filters: [C('guildId', 'eq', 'guild-2'), C('content', 'contains', 'nope')] }), false);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  13. SQL Filter Building (buildClauseSQL)                         */
  /* ---------------------------------------------------------------- */

  describe('SQL Filter Building', () => {
    const query = (clause: any) => dbModule.db.select().from(schema.messages).where(clause).all();

    it('coerces createdAt between ISO/number values', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const nowMs = Date.now();
      const clause = buildClauseSQL({ field: 'createdAt', op: 'between', value: [nowMs - 10 * 60 * 1000, nowMs] });
      assert.ok(clause);
      const rows = query(clause);
      assert.ok(rows.length > 0);
      // msg-old (400 days ago) must be excluded
      assert.ok(rows.every((m: any) => m.id !== 'msg-old'));
    });

    it('coerces createdAt gte with a number', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'createdAt', op: 'gte', value: Date.now() - 10 * 60 * 1000 });
      assert.ok(clause);
      assert.ok(query(clause).length > 0);
    });

    it('filters messageType=reply (isNotNull replyToId)', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'messageType', op: 'eq', value: 'reply' });
      assert.ok(clause);
      const rows = query(clause);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].id, 'msg-25');
    });

    it('filters messageType=default (isNull replyToId)', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'messageType', op: 'eq', value: 'default' });
      assert.ok(clause);
      const rows = query(clause);
      assert.ok(rows.every((m: any) => m.replyToId == null));
      assert.strictEqual(rows.length, 31);
    });

    it('handles messageType in [reply]', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'messageType', op: 'in', value: ['reply'] });
      assert.ok(clause);
      assert.strictEqual(query(clause).length, 1);
    });

    it('boolean flag: hasAttachment true/false', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const yes = buildClauseSQL({ field: 'hasAttachment', op: 'eq', value: true });
      assert.ok(yes);
      const yesRows = query(yes);
      // msg-29 (att-2) and msg-30 (att-1, att-3) both have attachment rows
      assert.strictEqual(yesRows.length, 2);
      assert.ok(yesRows.some((m: any) => m.id === 'msg-30'));
      assert.ok(yesRows.some((m: any) => m.id === 'msg-29'));

      const no = buildClauseSQL({ field: 'hasAttachment', op: 'eq', value: false });
      assert.ok(no);
      const noRows = query(no);
      assert.ok(noRows.every((m: any) => m.id !== 'msg-30' && m.id !== 'msg-29'));
    });

    it('boolean flag: hasEmbed / hasReaction / isDeleted / isEdited / isDm', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      assert.strictEqual(query(buildClauseSQL({ field: 'hasEmbed', op: 'eq', value: true })).length, 1);
      assert.strictEqual(query(buildClauseSQL({ field: 'hasReaction', op: 'eq', value: true })).length, 1);
      assert.strictEqual(query(buildClauseSQL({ field: 'isDeleted', op: 'eq', value: true })).length, 1);
      assert.strictEqual(query(buildClauseSQL({ field: 'isEdited', op: 'eq', value: true })).length, 1);
      assert.strictEqual(query(buildClauseSQL({ field: 'isDm', op: 'eq', value: true })).length, 1);
      assert.strictEqual(query(buildClauseSQL({ field: 'isDm', op: 'eq', value: false })).length, 31);
    });

    it('neq with a username resolves to "not that user"', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'neq', value: 'Alice' });
      assert.ok(clause);
      const rows = query(clause);
      assert.ok(rows.every((m: any) => m.authorId === 'user-2'));
      assert.strictEqual(rows.length, 14);
    });

    it('FilterGroup and/or compose', async () => {
      const { buildFilterSQL } = await import('../src/database/queries.js');
      const andClause = buildFilterSQL({
        combinator: 'and',
        filters: [
          { field: 'authorId', op: 'eq', value: 'Bob' },
          { field: 'content', op: 'contains', value: 'reply' },
        ],
      });
      assert.ok(andClause);
      const andRows = query(andClause);
      assert.strictEqual(andRows.length, 1);
      assert.strictEqual(andRows[0].id, 'msg-25');

      const orClause = buildFilterSQL({
        combinator: 'or',
        filters: [
          { field: 'content', op: 'contains', value: 'deleted' },
          { field: 'content', op: 'contains', value: 'embed' },
        ],
      });
      assert.ok(orClause);
      const orRows = query(orClause);
      assert.strictEqual(orRows.length, 2);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  14. Username Resolution in Filters                               */
  /* ---------------------------------------------------------------- */

  describe('Username Resolution in Filters', () => {
    const queryMessages = (clause: any) => dbModule.db.select().from(schema.messages).where(clause).all();

    it('should resolve existing username to user ID (eq)', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'eq', value: 'Alice' });
      assert.ok(clause);
      const rows = queryMessages(clause);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((m: any) => m.authorId === 'user-1'));
    });

    it('should return no results for a non-existent username (eq)', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'eq', value: 'NonExistentUser12345' });
      assert.ok(clause);
      assert.strictEqual(queryMessages(clause).length, 0);
    });

    it('should return no results when all usernames in an in-filter are non-existent', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'in', value: ['NonExistentUser12345', 'AnotherFakeUser'] });
      assert.ok(clause);
      assert.strictEqual(queryMessages(clause).length, 0);
    });

    it('should be a no-op when all usernames in a nin-filter are non-existent', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'nin', value: ['NonExistentUser12345', 'AnotherFakeUser'] });
      assert.ok(clause);
      const rows = queryMessages(clause);
      const all = dbModule.db.select().from(schema.messages).all();
      assert.strictEqual(rows.length, all.length);
    });

    it('should return no results for a non-existent username (contains)', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'contains', value: 'NonExistentUser12345' });
      assert.ok(clause);
      assert.strictEqual(queryMessages(clause).length, 0);
    });

    it('should resolve mixed snowflakes and usernames in an in-filter', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'in', value: ['user-1', 'Bob'] });
      assert.ok(clause);
      const rows = queryMessages(clause);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((m: any) => m.authorId === 'user-1' || m.authorId === 'user-2'));
    });

    it('contains on a username matches by substring', async () => {
      const { buildClauseSQL } = await import('../src/database/queries.js');
      const clause = buildClauseSQL({ field: 'authorId', op: 'contains', value: 'Bo' });
      assert.ok(clause);
      const rows = queryMessages(clause);
      assert.ok(rows.length > 0);
      assert.ok(rows.every((m: any) => m.authorId === 'user-2'));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  15. Snowflake Utilities                                          */
  /* ---------------------------------------------------------------- */

  describe('Snowflake Utilities', () => {
    it('should roundtrip timestamp -> snowflake -> timestamp', async () => {
      const { timestampToSnowflake, snowflakeToMilliseconds, snowflakeToTimestamp } = await import('../src/utils/snowflake.js');
      const t = Date.now();
      const s = timestampToSnowflake(t);
      assert.strictEqual(snowflakeToMilliseconds(s), t);
      assert.strictEqual(snowflakeToTimestamp(s).getTime(), t);
    });

    it('should decode a snowflake to a post-epoch date', async () => {
      const { snowflakeToDateString, snowflakeToTimestamp } = await import('../src/utils/snowflake.js');
      const s = '123456789012345678';
      const d = snowflakeToTimestamp(s);
      assert.ok(d.getTime() > Date.UTC(2015, 0, 1), 'snowflake decodes after the Discord epoch');
      assert.ok(snowflakeToDateString(s).startsWith('20'));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  16. Retention Purge (runs last)                                  */
  /* ---------------------------------------------------------------- */

  describe('Purge API', () => {
    it('should delete old messages and keep recent ones', async () => {
      // The old message exists before purge
      assert.strictEqual((await apiFetch('/messages/msg-old')).status, 200);

      const res = await apiFetch('/purge', { method: 'DELETE' });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.deleted.messages >= 1, 'at least one old message purged');

      // The old message is gone, a recent one survives
      assert.strictEqual((await apiFetch('/messages/msg-old')).status, 404);
      assert.strictEqual((await apiFetch('/messages/msg-0')).status, 200);
    });
  });
});
