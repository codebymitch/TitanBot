// src/services/punishmentScheduler.js
// Handles scheduled role removals that persist through bot restarts

import { logger } from '../utils/logger.js';
import { getFromDb, setInDb } from '../utils/database.js';

const SCHEDULED_KEY = (guildId) => `scheduled_punishments_${guildId}`;

export async function scheduleRoleRemoval(guildId, userId, roleId, removeAt, caseCode) {
  const existing = await getFromDb(SCHEDULED_KEY(guildId), []);
  
  // Remove any existing schedule for same user+role
  const filtered = existing.filter(s => !(s.userId === userId && s.roleId === roleId));
  
  filtered.push({
    userId,
    roleId,
    removeAt,
    caseCode,
    scheduledAt: new Date().toISOString(),
  });

  await setInDb(SCHEDULED_KEY(guildId), filtered);
  logger.info(`Scheduled role removal for user ${userId} in guild ${guildId} at ${removeAt}`);
}

export async function processScheduledRemovals(client) {
  try {
    const now = Date.now();

    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const scheduled = await getFromDb(SCHEDULED_KEY(guildId), []);
        if (!scheduled.length) continue;

        const remaining = [];
        let changed = false;

        for (const task of scheduled) {
          if (now >= new Date(task.removeAt).getTime()) {
            // Time to remove the role
            try {
              const member = await guild.members.fetch(task.userId).catch(() => null);
              if (member) {
                await member.roles.remove(task.roleId).catch(() => {});
                logger.info(`Removed scheduled role ${task.roleId} from ${task.userId} in guild ${guildId} (case ${task.caseCode})`);
              }
              changed = true;
            } catch (err) {
              logger.error(`Failed to remove scheduled role for ${task.userId}:`, err);
              remaining.push(task); // Keep it to retry
            }
          } else {
            remaining.push(task);
          }
        }

        if (changed) {
          await setInDb(SCHEDULED_KEY(guildId), remaining);
        }
      } catch (err) {
        logger.error(`Error processing scheduled removals for guild ${guildId}:`, err);
      }
    }
  } catch (err) {
    logger.error('Error in processScheduledRemovals:', err);
  }
}
