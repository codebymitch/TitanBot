import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { findMediaRole, grantMediaRoleToAllMembers } from '../services/mediaRoleService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      try {
        const media = await findMediaRole(guild);
        startupLog(`Media role in ${guild.name}: ${media ? 'found' : 'missing'}`);
      } catch (error) {
        logger.error(`Failed to find the media role in ${guild.name}:`, error);
      }
      try {
        const { skipped, granted, failed } = await grantMediaRoleToAllMembers(guild);
        if (!skipped) startupLog(`Media role given to all members in ${guild.name}: granted ${granted}, failed ${failed}`);
      } catch (error) {
        logger.error(`Failed to give the media role to all members in ${guild.name}:`, error);
      }
    }
  },
};
