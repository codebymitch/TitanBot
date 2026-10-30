import { Events } from 'discord.js';
import { logRoleDelete } from '../services/logging/roleLogs.js';
import { logger } from '../utils/logger.js';

// A deleted role goes to the roles log room (services/logging/roleLogs.js, our server only).
export default {
  name: Events.GuildRoleDelete,
  async execute(role) {
    await logRoleDelete(role).catch((error) => logger.error('Role log failed (GuildRoleDelete):', error));
  },
};
