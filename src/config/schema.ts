import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Config Schema — matches DESIGN.md Section 5.2                     */
/* ------------------------------------------------------------------ */

export const configSchema = z.object({
  /** Discord user token (keep secret) */
  token: z.string().optional(),

  /** Pino log level */
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  logging: z.object({
    /** Guild IDs to monitor (empty = discovery mode, no logging) */
    guilds: z.array(z.coerce.string()).default([]),

    /** Opt-in to DM logging (default false for privacy) */
    logDirectMessages: z.boolean().default(false),

    /** Event categories to capture */
    events: z.object({
      messages: z.boolean().default(true),
      messageEdits: z.boolean().default(true),
      messageDeletes: z.boolean().default(true),
      reactions: z.boolean().default(true),
      members: z.boolean().default(true),
      voice: z.boolean().default(true),
      guildChanges: z.boolean().default(true),
      channelChanges: z.boolean().default(true),
      roleChanges: z.boolean().default(true),
      threads: z.boolean().default(true),
      attachments: z.boolean().default(true),
    }).default({}),

    /** Retention in days */
    retentionDays: z.number().int().positive().default(365),

    /** Presence subscription settings */
    presence: z.object({
      enabled: z.boolean().default(true),
      intervalSeconds: z.number().int().min(10).default(60),
      maxSubscriptionUsers: z.number().int().min(1).default(300),
    }).default({}),

    /** Attachment download & compression (image/* only) */
    attachments: z.object({
      enabled: z.boolean().default(true),
      maxSizeMb: z.number().positive().default(25),
      path: z.string().default('./storage/attachments'),
      compression: z.object({
        enabled: z.boolean().default(true),
        quality: z.number().int().min(0).max(100).default(80),
        maxWidth: z.number().int().positive().default(1920),
        maxHeight: z.number().int().positive().default(1080),
        format: z.enum(['webp', 'jpeg', 'png']).default('webp'),
        stripMetadata: z.boolean().default(true),
      }).default({}),
    }).default({}),
  }).default({}),

  /** Dashboard settings */
  dashboard: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(3333),
  }).default({}),

  /** Database settings */
  database: z.object({
    path: z.string().default('./storage/logs.db'),
    wal: z.boolean().default(true),
  }).default({}),
});

export type Config = z.infer<typeof configSchema>;
