// xpSystem.js

import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getXpForLevel, getUserLevelData, saveUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';
import { buildLevelUpMessage } from './levelUi.js';
import { getChatCounts } from './chatCounter.js';
import { getVoiceMinutes } from './voiceXp.js';
import { syncMemberLevelRoles } from './levelRoleSyncService.js';
import { awardLevelUp } from '../cc/ccService.js';
import { checkInviteReward } from '../inviteRewardService.js';
import { INVITE_REWARDS } from '../../config/inviteRewards.js';
import { xpBoostMultiplier } from './xpBoostService.js';
import { isHomeGuild } from '../../config/homeGuild.js';

/**
 * Award XP to a member. Returns null when XP is skipped (disabled/invalid amount).
 * Throws on storage or unexpected failures. Voice XP passes `fromVoice` so it doesn't start the
 * chat XP cooldown (`lastMessage`). An XP boost from the CC store (xpBoostService.js) doubles the amount.
 */
export const addXp = wrapServiceBoundary(async function addXp(client, guild, member, xpToAdd, { fromVoice = false } = {}) {
  const lockKey = `leveling:${guild.id}:${member.user.id}`;
  return await Mutex.runExclusive(lockKey, async () => {
    if (!xpToAdd || xpToAdd <= 0) {
      return null;
    }

    const config = await getLevelingConfig(client, guild.id);

    if (!config.enabled) {
      return null;
    }

    const levelData = await getUserLevelData(client, guild.id, member.user.id);

    // An XP ×2 boost bought in the CC store (our server only); a failed read must not lose the XP.
    const boost = !isHomeGuild(guild.id) ? 1 : await xpBoostMultiplier(client, guild.id, member.user.id, fromVoice ? 'voice' : 'chat').catch((error) => {
      logger.warn(`Failed to read the XP boost of ${member.user.id}: ${error.message}`);
      return 1;
    });
    xpToAdd *= boost;

    levelData.xp += xpToAdd;
    levelData.totalXp += xpToAdd;
    if (!fromVoice) levelData.lastMessage = Date.now();

    let xpNeededForNextLevel = getXpForLevel(levelData.level);
    let didLevelUp = false;
    const initialLevel = levelData.level;
    const rewardRoleIds = [];

    while (levelData.xp >= xpNeededForNextLevel && levelData.level < 1000) {
      levelData.xp -= xpNeededForNextLevel;
      levelData.level += 1;
      didLevelUp = true;
      xpNeededForNextLevel = getXpForLevel(levelData.level);

      logger.info(`🎉 ${member.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);
    }

    // Every level role the member has reached is given right away, including any they missed before.
    if (didLevelUp && config.roleRewards) {
      const { added } = await syncMemberLevelRoles(guild, member, levelData.level, config.roleRewards, { reason: 'Level reward' });
      rewardRoleIds.push(...added);
    }

    if (didLevelUp) {
      // CC for the new level(s); a failed payment must not lose the XP.
      const ccReward = await awardLevelUp(client, guild.id, member.user.id, initialLevel, levelData.level)
        .catch((error) => {
          logger.error(`Failed to pay level-up CC to ${member.user.id}:`, error);
          return null;
        });

      if (config.announceLevelUp) {
        await sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel: initialLevel, rewardRoleIds, source: fromVoice ? 'voice' : 'chat', ccReward });
      }

      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.LEVELING_LEVELUP,
          data: {
            title: 'Level Up',
            lines: [
              formatLogLine('Member', `${member.user.tag} (\`${member.user.id}\`)`),
              formatLogLine('New Level', levelData.level.toString()),
              formatLogLine('Levels Gained', (levelData.level - initialLevel).toString()),
              formatLogLine('Total XP', levelData.totalXp.toString()),
            ],
            userId: member.user.id,
          },
        });
      } catch (logError) {
        logger.debug('Failed to log leveling event:', logError.message);
      }
    }

    await saveUserLevelData(client, guild.id, member.user.id, levelData);

    // Reaching the invite level can pay whoever invited the member. Not awaited: it takes its own lock.
    if (didLevelUp && levelData.level >= INVITE_REWARDS.level) {
      checkInviteReward(client, guild, member.user.id, { level: levelData.level })
        .catch((error) => logger.error(`Failed to check the invite reward for ${member.user.id}:`, error));
    }

    return {
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded: getXpForLevel(levelData.level + 1),
      leveledUp: didLevelUp,
    };
  });
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Failed to award XP. Please try again.',
});

// Level-up messages go to this channel only, never to the chat. If it's missing, nothing is posted.
const LEVEL_UP_CHANNEL_ID = '1552786804451573772';

// One message per level-up (even when several levels are gained at once). It only pings the member
// every 5 levels (see levelUi.js); the old free-text levelUpMessage is no longer used.
async function sendLevelUpAnnouncement(guild, member, levelData, config, { fromLevel, rewardRoleIds, source, ccReward }) {
  try {
    const levelUpChannel = guild.channels.cache.get(LEVEL_UP_CHANNEL_ID)
      || await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);

    if (!levelUpChannel || !levelUpChannel.isTextBased()) {
      logger.warn(`Level-up channel ${LEVEL_UP_CHANNEL_ID} was not found in ${guild.name}; level-up not announced.`);
      return;
    }

    const permissions = levelUpChannel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions to send levelup message in ${levelUpChannel.id}`);
      return;
    }

    // The member's chat and voice totals, so the message shows both sides (best effort).
    const client = guild.client;
    const [messages, voiceMinutes] = await Promise.all([
      getChatCounts(client, guild.id).then((counts) => counts[member.id] || 0).catch(() => null),
      getVoiceMinutes(client, guild.id).then((minutes) => minutes[member.id] || 0).catch(() => null),
    ]);
    const payload = buildLevelUpMessage(member, {
      fromLevel,
      level: levelData.level,
      xp: levelData.xp,
      xpNeeded: getXpForLevel(levelData.level),
      rewardRoleIds,
      source,
      messages,
      voiceMinutes,
      ccReward: ccReward?.amount || 0,
      ccBoost: ccReward?.boost || 1,
    });
    await levelUpChannel.send(payload).catch(error => {
      logger.error(`Failed to send level up message in channel ${levelUpChannel.id}:`, error);
    });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}
