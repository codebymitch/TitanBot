import { logger } from '../utils/logger.js';
import { getLevelingConfig } from '../utils/database.js';
import { getUserLevelData, saveUserLevelData } from './leveling.js';
import { getXpForLevel } from '../utils/database.js';

export async function addXp(client, guild, member, xpToAdd) {
  try {
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
      
      if (config.roleRewards && config.roleRewards[levelData.level]) {
        const roleId = config.roleRewards[levelData.level];
        const role = guild.roles.cache.get(roleId);
        
        if (role) {
          try {
            await member.roles.add(role);
            logger.info(`Added role ${role.name} to ${member.user.tag} for reaching level ${levelData.level}`);
          } catch (error) {
            logger.error(`Failed to add role ${roleId} to ${member.id}:`, error);
          }
        }
      }
      
      const levelUpChannel = config.levelUpChannel ? 
        guild.channels.cache.get(config.levelUpChannel) : 
        guild.systemChannel;
      
      if (levelUpChannel && levelUpChannel.isTextBased() && config.announceLevelUp) {
        const message = config.levelUpMessage
          .replace(/{user}/g, member.toString())
          .replace(/{level}/g, levelData.level)
          .replace(/{xp}/g, levelData.xp)
          .replace(/{xpNeeded}/g, getXpForLevel(levelData.level + 1));
        
        try {
          await levelUpChannel.send(message);
        } catch (error) {
          logger.error('Failed to send level up message:', error);
        }
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
