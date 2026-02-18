



import { logger } from '../utils/logger.js';
import { getLevelingConfig, getXpForLevel, getUserLevelData, saveUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';









export async function addXp(client, guild, member, xpToAdd) {
  try {
    
    if (!xpToAdd || xpToAdd <= 0) {
      return { success: false, reason: 'Invalid XP amount' };
    }

    const config = await getLevelingConfig(client, guild.id);
    
    if (!config.enabled) {
      return { success: false, reason: 'Leveling is disabled in this server' };
    }
    
    const levelData = await getUserLevelData(client, guild.id, member.id);
    
    levelData.xp += xpToAdd;
    levelData.totalXp += xpToAdd;
    levelData.lastMessage = Date.now();
    
    const xpNeededForNextLevel = getXpForLevel(levelData.level + 1);
    let didLevelUp = false;
    
    
    if (levelData.xp >= xpNeededForNextLevel) {
      levelData.level += 1;
      levelData.xp = levelData.xp - xpNeededForNextLevel;
      didLevelUp = true;
      
      logger.info(`🎉 ${member.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);
      
      
      if (config.roleRewards && config.roleRewards[levelData.level]) {
        await awardRoleReward(guild, member, config.roleRewards[levelData.level], levelData.level);
      }
      
      
      if (config.announceLevelUp) {
        await sendLevelUpAnnouncement(guild, member, levelData, config);
      }

      
      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.LEVELING_LEVELUP,
          data: {
            description: `${member.user.tag} reached level ${levelData.level}`,
            userId: member.id,
            fields: [
              {
                name: '👤 Member',
                value: `${member.user.tag} (${member.id})`,
                inline: true
              },
              {
                name: '📊 New Level',
                value: levelData.level.toString(),
                inline: true
              },
              {
                name: '✨ Total XP',
                value: levelData.totalXp.toString(),
                inline: true
              }
            ]
          }
        });
      } catch (error) {
        logger.debug('Error logging level up event:', error);
      }
    }
    
    await saveUserLevelData(client, guild.id, member.id, levelData);
    
    return {
      success: true,
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded: getXpForLevel(levelData.level + 1),
      leveledUp: didLevelUp
    };
    
  } catch (error) {
    logger.error('Error adding XP:', error);
    return { success: false, error: error.message };
  }
}










async function awardRoleReward(guild, member, roleId, level) {
  try {
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
      logger.warn(`Role ${roleId} not found for level ${level} reward in guild ${guild.id}`);
      return;
    }

    
    if (member.roles.cache.has(roleId)) {
      logger.debug(`Member ${member.id} already has role ${roleId}`);
      return;
    }

    await member.roles.add(role, `Level ${level} reward`);
    logger.info(`✅ Awarded role ${role.name} to ${member.user.tag} for reaching level ${level}`);
  } catch (error) {
    logger.error(`Failed to award role reward to ${member.id}:`, error);
  }
}










async function sendLevelUpAnnouncement(guild, member, levelData, config) {
  try {
    const levelUpChannel = config.levelUpChannel 
      ? guild.channels.cache.get(config.levelUpChannel) 
      : guild.systemChannel;
    
    if (!levelUpChannel || !levelUpChannel.isTextBased()) {
      logger.debug(`No valid levelup channel found for guild ${guild.id}`);
      return;
    }

    
    const permissions = levelUpChannel.permissionsFor(guild.members.me);
    if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing permissions to send levelup message in ${levelUpChannel.id}`);
      return;
    }

    const message = config.levelUpMessage
      .replace(/{user}/g, member.toString())
      .replace(/{level}/g, levelData.level)
      .replace(/{xp}/g, levelData.xp)
      .replace(/{xpNeeded}/g, getXpForLevel(levelData.level + 1));
    
    await levelUpChannel.send(message).catch(error => {
      logger.error(`Failed to send level up message in channel ${levelUpChannel.id}:`, error);
    });
  } catch (error) {
    logger.error('Error sending level up announcement:', error);
  }
}


