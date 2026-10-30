import { Events } from 'discord.js';
import { guardStaffRoleRemoval } from '../services/moderation/staffRoleGuard.js';
import { logger } from '../utils/logger.js';

// A staff role taken off someone by an untrusted member is given back, and the remover is warned
// (services/moderation/staffRoleGuard.js, our server only).
export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    await guardStaffRoleRemoval(oldMember, newMember).catch((error) => logger.error('Staff role guard failed:', error));
  },
};
