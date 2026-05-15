import { Client, Constants } from 'discord.js-selfbot-v13';
import { sqlite } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/loader.js';

/* ------------------------------------------------------------------ */
/*  Top chatters query                                                 */
/* ------------------------------------------------------------------ */

function getTopChatters(guildId: string, limit: number): string[] {
  const rows = sqlite
    .prepare(`
      SELECT author_id
      FROM messages
      WHERE guild_id = ?
      GROUP BY author_id
      ORDER BY COUNT(*) DESC, author_id DESC
      LIMIT ?
    `)
    .pluck()
    .all(guildId, limit) as string[];

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Guild subscription helper                                          */
/* ------------------------------------------------------------------ */

function buildSubscriptionPayload(guildId: string, userIds: string[]) {
  return {
    op: Constants.Opcodes.GUILD_SUBSCRIPTIONS_BULK,
    d: {
      subscriptions: {
        [guildId]: {
          typing: true,
          threads: true,
          activities: true,
          member_updates: true,
          thread_member_lists: [],
          members: userIds,
          channels: {},
        },
      },
    },
  };
}

async function subscribeGuild(guildId: string, client: Client) {
  const maxUsers = config.logging.presence.maxSubscriptionUsers;
  const userIds = getTopChatters(guildId, maxUsers);

  if (userIds.length === 0) {
    logger.debug({ guildId }, 'No chatters found for guild, skipping presence subscription');
    return;
  }

  client.ws.broadcast(buildSubscriptionPayload(guildId, userIds));
  logger.debug({ guildId, count: userIds.length }, 'Subscribed to presence updates for top chatters');
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function startPresencePoller(client: Client, options?: { immediate?: boolean }): () => void {
  if (!config.logging.presence.enabled) {
    logger.info('Presence polling is disabled');
    return () => {};
  }

  const intervalMs = config.logging.presence.intervalSeconds * 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  async function tick() {
    const guildIds = config.logging.guilds;
    if (guildIds.length === 0) {
      logger.debug('No guilds configured, skipping presence subscriptions');
      return;
    }

    for (const guildId of guildIds) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        logger.debug({ guildId }, 'Guild not in cache, skipping presence subscription');
        continue;
      }

      try {
        await subscribeGuild(guildId, client);
      } catch (err) {
        logger.error({ err, guildId }, 'Error subscribing to guild presence');
      }
    }
  }

  async function runAndSchedule() {
    if (stopped) return;
    try {
      await tick();
    } catch (err) {
      logger.error({ err }, 'Presence poller tick failed');
    }
    if (!stopped) {
      timer = setTimeout(runAndSchedule, intervalMs);
    }
  }

  if (options?.immediate) {
    logger.info('Running initial presence subscriptions...');
    tick().then(() => {
      if (!stopped) {
        timer = setTimeout(runAndSchedule, intervalMs);
      }
    });
  } else {
    timer = setTimeout(runAndSchedule, intervalMs);
  }

  logger.info(
    { intervalSeconds: config.logging.presence.intervalSeconds },
    'Presence poller started'
  );

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
