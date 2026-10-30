import { Events } from 'discord.js';
import { saveLeavingMember } from '../services/moderation/rejoinRestore.js';
import { logger } from '../utils/logger.js';

// Saves the roles and nickname of a member who leaves, for when they come back
// (services/moderation/rejoinRestore.js, our server only).
export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await saveLeavingMember(member).catch((error) => logger.error('Could not save a leaving member:', error));
  },
};
