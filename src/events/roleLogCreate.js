import { Events } from 'discord.js';
import { logRoleCreate } from '../services/logging/roleLogs.js';
import { logger } from '../utils/logger.js';

// A new role goes to the roles log room (services/logging/roleLogs.js, our server only).
export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    await logRoleCreate(role).catch((error) => logger.error('Role log failed (GuildRoleCreate):', error));
  },
};
