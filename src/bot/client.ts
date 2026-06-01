import { Client } from 'discord.js-selfbot-v13';
import { config } from '@/config/loader.js';
import { logger } from '@/utils/logger.js';
import { registerEvents } from './events/index.js';

import { enrichGuild } from '@/services/enricher.js';

export const client = new Client({
  intents: [],
} as ConstructorParameters<typeof Client>[0]);

client.once('ready', () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
  logger.info(`Guild count: ${client.guilds.cache.size}`);

  const guildList = client.guilds.cache.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.iconURL(),
    memberCount: g.memberCount,
  }));
  logger.info({ guilds: guildList }, 'Guild discovery list');

  const allowedGuilds = config.logging.guilds;
  for (const g of client.guilds.cache.values()) {
    if (allowedGuilds.length > 0 && !allowedGuilds.includes(g.id)) {
      continue;
    }
    enrichGuild({
      id: g.id,
      name: g.name,
      iconURL: g.iconURL.bind(g) as any,
      ownerId: g.ownerId,
      memberCount: g.memberCount,
      joinedAt: g.joinedAt,
    });
  }
});

export async function startBot(db: any): Promise<void> {
  registerEvents(client, db);
  await client.login(config.token);
}
