import { Events } from 'discord.js';
import { startupLog } from '../utils/logger.js';
export default { name: Events.ClientReady, once: true, async execute(client) {
  client.user.setPresence(client.config.bot.presence);
  startupLog(`Ready as ${client.user.tag}; serving ${client.guilds.cache.size} server(s).`);
} };
