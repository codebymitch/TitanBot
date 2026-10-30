import { Events } from 'discord.js';
import { logger, startupLog } from '../utils/logger.js';
import { rememberStaffRoles, refreshStaffPermissionBoard, demoteAdministratorsBelowAdmin } from '../services/staffRoleHierarchyService.js';

export default {
  name: Events.ClientReady,
  once: true,

  // The bot never creates, edits, moves or deletes a role here: it only finds the staff roles for the board.
  async execute(client) {
    let found = 0;
    const boardResults = [];

    for (const guild of client.guilds.cache.values()) {
      // The permission board is edited to match the roles. The bot never posts there on its own,
      // except once per BOARD_RESET_VERSION, when it clears the channel and posts the board fresh.
      try {
        found += (await rememberStaffRoles(guild)).found;
      } catch (error) {
        logger.error(`Failed to find the staff roles in ${guild.name}:`, error);
      }
      // Report #208, once: Administrator taken off the roles below 🛡️ Admin (our server only).
      try {
        const demoted = await demoteAdministratorsBelowAdmin(guild);
        if (demoted.status === 'done') startupLog(`Administrator taken off below Admin: ${demoted.changed.join(', ') || 'none'}${demoted.failed.length ? ` (failed: ${demoted.failed.join(', ')})` : ''}`);
      } catch (error) {
        logger.error(`Failed to take Administrator off the roles below Admin in ${guild.name}:`, error);
      }
      try {
        const board = await refreshStaffPermissionBoard(guild);
        boardResults.push(board.status === 'sent' ? `${board.status} (cleared ${board.deleted})` : board.status);
      } catch (error) {
        logger.warn(`Permission board not refreshed in ${guild.name}: ${error.message}`);
      }
    }

    startupLog(`Staff roles: found ${found}, permission board ${boardResults.join(', ') || 'skipped'}`);
  },
};
