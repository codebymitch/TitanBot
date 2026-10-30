import { Events } from 'discord.js';
import { logRoleUpdate } from '../services/logging/roleLogs.js';
import { logger } from '../utils/logger.js';

// A changed role goes to the roles log room (services/logging/roleLogs.js, our server only).
export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    await logRoleUpdate(oldRole, newRole).catch((error) => logger.error('Role log failed (GuildRoleUpdate):', error));
  },
};
