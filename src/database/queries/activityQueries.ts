import { eq, and, desc, type SQL } from 'drizzle-orm';
import { db } from '../index.js';
import * as schema from '../schema.js';

/* ------------------------------------------------------------------ */
/*  getMemberEvents / getVoiceEvents / getPresenceUpdates / getGuildAudit */
/* ------------------------------------------------------------------ */

export function getMemberEvents(
  guildId?: string,
  userId?: string,
  eventType?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.memberEvents.guildId, guildId));
  if (userId) conditions.push(eq(schema.memberEvents.userId, userId));
  if (eventType) conditions.push(eq(schema.memberEvents.eventType, eventType));

  let query = db
    .select({
      id: schema.memberEvents.id,
      guildId: schema.memberEvents.guildId,
      userId: schema.memberEvents.userId,
      eventType: schema.memberEvents.eventType,
      oldValue: schema.memberEvents.oldValue,
      newValue: schema.memberEvents.newValue,
      createdAt: schema.memberEvents.createdAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.memberEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.memberEvents.userId))
    .$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.memberEvents.createdAt)).limit(limit).all();
}

export function getVoiceEvents(
  guildId?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.voiceEvents.guildId, guildId));
  if (userId) conditions.push(eq(schema.voiceEvents.userId, userId));

  let query = db
    .select({
      id: schema.voiceEvents.id,
      guildId: schema.voiceEvents.guildId,
      userId: schema.voiceEvents.userId,
      channelId: schema.voiceEvents.channelId,
      eventType: schema.voiceEvents.eventType,
      oldValue: schema.voiceEvents.oldValue,
      newValue: schema.voiceEvents.newValue,
      createdAt: schema.voiceEvents.createdAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.voiceEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.voiceEvents.userId))
    .$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.voiceEvents.createdAt)).limit(limit).all();
}

export function getPresenceUpdates(
  guildId?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.presenceUpdates.guildId, guildId));
  if (userId) conditions.push(eq(schema.presenceUpdates.userId, userId));

  let query = db
    .select({
      id: schema.presenceUpdates.id,
      guildId: schema.presenceUpdates.guildId,
      userId: schema.presenceUpdates.userId,
      status: schema.presenceUpdates.status,
      clientStatus: schema.presenceUpdates.clientStatus,
      updatedAt: schema.presenceUpdates.updatedAt,
      username: schema.users.username,
      avatarUrl: schema.users.avatarUrl,
    })
    .from(schema.presenceUpdates)
    .leftJoin(schema.users, eq(schema.users.id, schema.presenceUpdates.userId))
    .$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.presenceUpdates.updatedAt)).limit(limit).all();
}

export function getGuildAudit(
  guildId?: string,
  actionType?: string,
  userId?: string,
  limit: number = 100
) {
  const conditions: SQL[] = [];
  if (guildId) conditions.push(eq(schema.guildAudit.guildId, guildId));
  if (actionType) conditions.push(eq(schema.guildAudit.actionType, actionType));
  if (userId) conditions.push(eq(schema.guildAudit.userId, userId));

  let query = db.select().from(schema.guildAudit).$dynamic();
  if (conditions.length > 0) query = query.where(and(...conditions));
  return query.orderBy(desc(schema.guildAudit.createdAt)).limit(limit).all();
}

/* ------------------------------------------------------------------ */
/*  getActivityEvents                                                  */
/* ------------------------------------------------------------------ */

export function getActivityEvents(
  type: 'member' | 'voice' | 'presence' | 'audit',
  guildId?: string,
  userId?: string,
  limit: number = 50
) {
  switch (type) {
    case 'member':
      return getMemberEvents(guildId, userId, undefined, limit);
    case 'voice':
      return getVoiceEvents(guildId, userId, limit);
    case 'presence':
      return getPresenceUpdates(guildId, userId, limit);
    case 'audit':
      return getGuildAudit(guildId, undefined, userId, limit);
  }
}
