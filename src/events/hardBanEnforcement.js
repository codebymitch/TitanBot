import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { enforceHardBanOnUnban } from '../services/moderation/hardBanService.js';

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    try {
      await enforceHardBanOnUnban(ban);
    } catch (error) {
      logger.error('Error enforcing hard ban on unban:', error);
    }
  },
};
