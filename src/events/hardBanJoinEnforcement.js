import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { enforceHardBanOnJoin } from '../services/moderation/hardBanService.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await enforceHardBanOnJoin(member);
    } catch (error) {
      logger.error('Error enforcing hard ban on join:', error);
    }
  },
};
