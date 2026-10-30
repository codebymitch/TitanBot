import { Events } from 'discord.js';
import { restoreRejoiningMember } from '../services/moderation/rejoinRestore.js';
import { logger } from '../utils/logger.js';

// A member who comes back gets their roles and nickname back; staff roles wait for an owner's or a
// trusted member's approval (services/moderation/rejoinRestore.js, our server only).
export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await restoreRejoiningMember(member).catch((error) => logger.error('Could not restore a returning member:', error));
  },
};
