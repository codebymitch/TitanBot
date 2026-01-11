import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  
  async execute(client) {
    try {
      // Set bot presence
      const activity = {
        name: `${client.guilds.cache.size} servers`,
        type: 3, // WATCHING
      };
      
      client.user.setPresence({
        activities: [activity],
        status: 'online',
      });
      
      logger.info(`Ready! Logged in as ${client.user.tag}`);
      logger.info(`Serving ${client.guilds.cache.size} guild(s)`);
    } catch (error) {
      logger.error('Error in ready event:', error);
    }
  },
};
