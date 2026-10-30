import { Events } from 'discord.js';
import { handleDangerAuditEntry } from '../services/moderation/dangerList.js';
import { logger } from '../utils/logger.js';

// A member on the danger list (`خطر @member`) who does something dangerous gets a week of timeout
// (our server only; see services/moderation/dangerList.js).
export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry, guild) {
    await handleDangerAuditEntry(entry, guild).catch((error) => logger.error('Error in danger list audit check:', error));
  },
};
