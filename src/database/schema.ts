import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/* ------------------------------------------------------------------ */
/*  Core Tables                                                        */
/* ------------------------------------------------------------------ */

export const guilds = sqliteTable('guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: text('owner_id'),
  joinedAt: integer('joined_at', { mode: 'timestamp' }),
  configuredAt: integer('configured_at', { mode: 'timestamp' }),
});

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').references(() => guilds.id, { onDelete: 'cascade' }),
  name: text('name'),
  type: integer('type'),
  topic: text('topic'),
  nsfw: integer('nsfw', { mode: 'boolean' }).default(false),
  parentId: text('parent_id'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username'),
  discriminator: text('discriminator'),
  avatarUrl: text('avatar_url'),
  bot: integer('bot', { mode: 'boolean' }).default(false),
  firstSeenAt: integer('first_seen_at', { mode: 'timestamp' }),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  guildId: text('guild_id').references(() => guilds.id),
  channelId: text('channel_id').notNull(),
  authorId: text('author_id').notNull(),
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  editedAt: integer('edited_at', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  isDm: integer('is_dm', { mode: 'boolean' }).default(false),
  replyToId: text('reply_to_id'),
  stickerIds: text('sticker_ids'),        // JSON array
  stickerLinks: text('sticker_links'),    // JSON array of markdown hyperlinks
  embedsJson: text('embeds_json'),        // JSON
  componentsJson: text('components_json'), // JSON
  flags: integer('flags').default(0),
}, (table) => ({
  idxMessagesGuildTime: index('idx_messages_guild_time').on(table.guildId, table.createdAt),
  idxMessagesChannelTime: index('idx_messages_channel_time').on(table.channelId, table.createdAt),
  idxMessagesAuthor: index('idx_messages_author').on(table.authorId, table.createdAt),
  idxMessagesSearch: index('idx_messages_search').on(table.content),
}));

export const messageEdits = sqliteTable('message_edits', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull().references(() => messages.id),
  oldContent: text('old_content'),
  newContent: text('new_content'),
  editedAt: integer('edited_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  idxEditsMessage: index('idx_edits_message').on(table.messageId),
}));

export const messageDeletes = sqliteTable('message_deletes', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull(),
  guildId: text('guild_id'),
  channelId: text('channel_id').notNull(),
  authorId: text('author_id'),
  contentSnapshot: text('content_snapshot'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  idxDeletesGuildTime: index('idx_deletes_guild_time').on(table.guildId, table.deletedAt),
}));

export const reactions = sqliteTable('reactions', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull(),
  guildId: text('guild_id'),
  channelId: text('channel_id').notNull(),
  userId: text('user_id').notNull(),
  emojiId: text('emoji_id'),
  emojiName: text('emoji_name'),
  added: integer('added', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => ({
  idxReactionsMessage: index('idx_reactions_message').on(table.messageId),
}));

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  fileName: text('file_name'),
  originalUrl: text('original_url').notNull(),
  originalSizeBytes: integer('original_size_bytes'),
  contentType: text('content_type'),
  localPath: text('local_path'),
  compressedSizeBytes: integer('compressed_size_bytes'),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => ({
  idxAttachmentsMessage: index('idx_attachments_message').on(table.messageId),
}));

export const memberEvents = sqliteTable('member_events', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  eventType: text('event_type').notNull(), // JOIN, LEAVE, BAN, UNBAN, UPDATE, NICK_CHANGE
  oldValue: text('old_value'),
  newValue: text('new_value'),
  rolesJson: text('roles_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => ({
  idxMemberEventsGuild: index('idx_member_events_guild').on(table.guildId, table.createdAt),
}));

export const presenceUpdates = sqliteTable('presence_updates', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  guildId: text('guild_id'),
  userId: text('user_id').notNull(),
  status: text('status'),
  clientStatus: text('client_status'),     // JSON
  activitiesJson: text('activities_json'), // JSON array
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (table) => ({
  idxPresenceUser: index('idx_presence_user').on(table.userId, table.updatedAt),
}));

export const voiceEvents = sqliteTable('voice_events', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  userId: text('user_id').notNull(),
  channelId: text('channel_id'),
  eventType: text('event_type').notNull(), // JOIN, LEAVE, MOVE, MUTE, DEAF, STREAM, VIDEO
  oldValue: text('old_value'),
  newValue: text('new_value'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => ({
  idxVoiceGuild: index('idx_voice_guild').on(table.guildId, table.createdAt),
}));

export const guildAudit = sqliteTable('guild_audit', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  guildId: text('guild_id').notNull(),
  actionType: text('action_type').notNull(),
  targetId: text('target_id'),
  targetType: text('target_type'),
  userId: text('user_id'),
  changesJson: text('changes_json'),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
}, (table) => ({
  idxAuditGuild: index('idx_audit_guild').on(table.guildId, table.createdAt),
}));

/* ------------------------------------------------------------------ */
/*  FTS5 Virtual Table (raw SQL only; no Drizzle table needed)        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Relations                                                          */
/* ------------------------------------------------------------------ */

export const messagesRelations = relations(messages, ({ one, many }) => ({
  edits: many(messageEdits),
  attachments: many(attachments),
  reactions: many(reactions),
  author: one(users, {
    fields: [messages.authorId],
    references: [users.id],
  }),
  guild: one(guilds, {
    fields: [messages.guildId],
    references: [guilds.id],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
}));

export const messageEditsRelations = relations(messageEdits, ({ one }) => ({
  message: one(messages, {
    fields: [messageEdits.messageId],
    references: [messages.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, {
    fields: [attachments.messageId],
    references: [messages.id],
  }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  message: one(messages, {
    fields: [reactions.messageId],
    references: [messages.id],
  }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  guild: one(guilds, {
    fields: [channels.guildId],
    references: [guilds.id],
  }),
  messages: many(messages),
}));

export const guildsRelations = relations(guilds, ({ many }) => ({
  channels: many(channels),
  messages: many(messages),
}));

export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
}));
