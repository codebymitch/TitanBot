import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { syncMemberLevelRolesFromData } from '../services/leveling/levelRoleSyncService.js';

// A member who leaves and comes back gets their level roles back straight away.
export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      if (member.user?.bot) return;
      await syncMemberLevelRolesFromData(member.client, member.guild, member, { reason: 'Level roles restored on rejoin' });
    } catch (error) {
      logger.error('Error restoring level roles on join:', error);
    }
  },
};
