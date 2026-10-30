import { Events } from 'discord.js';
import { logMemberRoles } from '../services/logging/roleLogs.js';
import { logger } from '../utils/logger.js';

// Roles given to or taken from a member go to the roles log room (services/logging/roleLogs.js, our server only).
export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    await logMemberRoles(oldMember, newMember).catch((error) => logger.error('Role log failed (GuildMemberUpdate):', error));
  },
};
