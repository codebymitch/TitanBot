import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { cacheGuildInvites } from '../services/inviteTrackerService.js';

// Remembers every invite's use count at startup so the invite logger can tell which one a new member used.
export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        const cached = await cacheGuildInvites(guild);
        if (cached) startupLog(`Invite tracking ready in ${guild.name}`);
        else logger.warn(`Invite tracking skipped for ${guild.name}: bot needs Manage Server.`);
      } catch (error) {
        logger.error(`Failed to cache invites in ${guild.name}:`, error);
      }
    }
  },
};
