import { Client } from 'discord.js-selfbot-v13';
import { config } from '../config/loader.js';
import { logger } from '../utils/logger.js';
import { registerEvents } from './events/index.js';

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
});

export async function startBot(db: any): Promise<void> {
  registerEvents(client, db);
  await client.login(config.token);
}
