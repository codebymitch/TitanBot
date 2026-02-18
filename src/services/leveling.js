




import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../services/guildConfig.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { addXp } from './xpSystem.js';


const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;
const MAX_LEVEL = 1000;
const MIN_LEVEL = 0;







export function getXpForLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new TitanBotError(
      `Invalid level: ${level}. Must be between ${MIN_LEVEL} and ${MAX_LEVEL}`,
      ErrorTypes.VALIDATION,
      'The level must be a valid number.'
    );
  }
  return 5 * Math.pow(level, 2) + 50 * level + 50;
}






export function getLevelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new TitanBotError(
      `Invalid XP: ${xp}`,
      ErrorTypes.VALIDATION,
      'XP must be a non-negative number.'
    );
  }

  let level = 0;
  let xpNeeded = 0;
  
  while (xp >= getXpForLevel(level) && level < MAX_LEVEL) {
    xpNeeded = getXpForLevel(level);
    xp -= xpNeeded;
    level++;
  }
  
  return {
    level: Math.min(level, MAX_LEVEL),
    currentXp: xp,
    xpNeeded: getXpForLevel(Math.min(level, MAX_LEVEL))
  };
}








export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    
    if (!guildId || typeof guildId !== 'string') {
      throw new TitanBotError(
        'Invalid guild ID',
        ErrorTypes.VALIDATION,
        'Guild ID is required.'
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      limit = Math.min(Math.max(limit, 1), 100);
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`Guild ${guildId} not found in cache`);
      return [];
    }
    
    const members = await guild.members.fetch().catch(error => {
      logger.error(`Failed to fetch members for guild ${guildId}:`, error);
      return new Map();
    });

    const leaderboard = [];
    
    for (const [userId, member] of members) {
      if (member.user.bot) continue;
      
      const data = await getUserLevelData(client, guildId, userId);
      if (data && data.totalXp > 0) {
        leaderboard.push({
          userId,
          username: member.user.username,
          discriminator: member.user.discriminator,
          ...data
        });
      }
    }
    
    leaderboard.sort((a, b) => b.totalXp - a.totalXp);
    
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard.slice(0, limit);
    
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to fetch leaderboard: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not fetch the leaderboard at this time.'
    );
  }
}







export function createLeaderboardEmbed(leaderboard, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${guild.name} Leaderboard`)
    .setColor('#2ecc71')
    .setTimestamp();
    
  if (!leaderboard || leaderboard.length === 0) {
    embed.setDescription('No users on the leaderboard yet!');
    return embed;
  }
  
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  
  const top3Text = top3.map((user, index) => {
    const medal = ['🥇', '🥈', '🥉'][index];
    return `${medal} **#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  const restText = rest.map(user => {
    return `**#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  embed.setDescription(
    `**Top Members**\n${top3Text}${restText ? '\n\n' + restText : ''}`
  );
  
  return embed;
}







export async function getLevelingConfig(client, guildId) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    return guildConfig.leveling || {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 60,
      levelUpMessage: '{user} has leveled up to level {level}!',
      levelUpChannel: null,
      ignoredChannels: [],
      ignoredRoles: [],
      blacklistedUsers: [],
      roleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  } catch (error) {
    logger.error(`Error getting leveling config for guild ${guildId}:`, error);
    return {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 60,
      levelUpMessage: '{user} has leveled up to level {level}!',
      levelUpChannel: null,
      ignoredChannels: [],
      ignoredRoles: [],
      blacklistedUsers: [],
      roleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  }
}








export async function getUserLevelData(client, guildId, userId) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotError(
        'Guild ID and User ID are required',
        ErrorTypes.VALIDATION
      );
    }

    const key = `${guildId}:leveling:user:${userId}`;
    const data = await client.db.get(key);
    
    if (!data) {
      return {
        xp: 0,
        level: 0,
        totalXp: 0,
        lastMessage: 0,
        rank: 0
      };
    }
    
    return {
      xp: Math.max(0, data.xp || 0),
      level: Math.max(0, Math.min(data.level || 0, MAX_LEVEL)),
      totalXp: Math.max(0, data.totalXp || 0),
      lastMessage: data.lastMessage || 0,
      rank: data.rank || 0
    };
  } catch (error) {
    logger.error(`Error getting user level data for ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to fetch user data: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not fetch level data at this time.'
    );
  }
}









export async function saveUserLevelData(client, guildId, userId, data) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotError(
        'Guild ID and User ID are required',
        ErrorTypes.VALIDATION
      );
    }

    
    if (!data || typeof data !== 'object') {
      throw new TitanBotError(
        'Invalid user level data',
        ErrorTypes.VALIDATION
      );
    }

    
    const sanitizedData = {
      xp: Math.max(0, Number(data.xp) || 0),
      level: Math.max(0, Math.min(Number(data.level) || 0, MAX_LEVEL)),
      totalXp: Math.max(0, Number(data.totalXp) || 0),
      lastMessage: Number(data.lastMessage) || 0,
      rank: Number(data.rank) || 0
    };

    const key = `${guildId}:leveling:user:${userId}`;
    await client.db.set(key, sanitizedData);
    
    logger.debug(`Saved level data for user ${userId} in guild ${guildId}`);
  } catch (error) {
    logger.error(`Error saving user level data for ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to save user data: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not save level data at this time.'
    );
  }
}








export async function saveLevelingConfig(client, guildId, config) {
  try {
    if (!guildId || !config) {
      throw new TitanBotError(
        'Guild ID and config are required',
        ErrorTypes.VALIDATION
      );
    }

    const guildConfig = await getGuildConfig(client, guildId);
    
    
    if (config.xpCooldown && (config.xpCooldown < 0 || config.xpCooldown > 3600)) {
      throw new TitanBotError(
        'XP cooldown must be between 0 and 3600 seconds',
        ErrorTypes.VALIDATION,
        'Cooldown must be between 0 and 3600 seconds.'
      );
    }

    if (config.xpRange && (config.xpRange.min < 1 || config.xpRange.max < 1 || config.xpRange.min > config.xpRange.max)) {
      throw new TitanBotError(
        'Invalid XP range configuration',
        ErrorTypes.VALIDATION,
        'Minimum XP must be less than maximum XP, and both must be positive.'
      );
    }

    guildConfig.leveling = config;
    await setGuildConfig(client, guildId, guildConfig);
    
    logger.info(`Leveling config updated for guild ${guildId}`);
  } catch (error) {
    logger.error(`Error saving leveling config for guild ${guildId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to save config: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not save configuration at this time.'
    );
  }
}









export async function addLevels(client, guildId, userId, levels) {
  try {
    
    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotError(
        `Invalid level amount: ${levels}`,
        ErrorTypes.VALIDATION,
        'You must add a positive number of levels.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = userData.level + levels;

    if (newLevel > MAX_LEVEL) {
      throw new TitanBotError(
        `Level ${newLevel} exceeds maximum level ${MAX_LEVEL}`,
        ErrorTypes.VALIDATION,
        `Maximum level is ${MAX_LEVEL}.`
      );
    }

    const newXp = 0;
    const newTotalXp = userData.totalXp + (getXpForLevel(newLevel) - getXpForLevel(userData.level));

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Added ${levels} levels to user ${userId} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error adding levels for user ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to add levels: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not add levels at this time.'
    );
  }
}









export async function removeLevels(client, guildId, userId, levels) {
  try {
    
    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotError(
        `Invalid level amount: ${levels}`,
        ErrorTypes.VALIDATION,
        'You must remove a positive number of levels.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = Math.max(MIN_LEVEL, userData.level - levels);

    const newXp = 0;
    const newTotalXp = getXpForLevel(newLevel) + newXp;

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Removed ${levels} levels from user ${userId} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error removing levels for user ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to remove levels: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not remove levels at this time.'
    );
  }
}









export async function setUserLevel(client, guildId, userId, level) {
  try {
    
    if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      throw new TitanBotError(
        `Invalid level: ${level}`,
        ErrorTypes.VALIDATION,
        `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}.`
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    
    const newXp = 0;
    const newTotalXp = getXpForLevel(level) + newXp;

    userData.level = level;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Set level for user ${userId} to ${level} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error setting level for user ${userId}:`, error);
    if (error instanceof TitanBotError) throw error;
    throw new TitanBotError(
      `Failed to set level: ${error.message}`,
      ErrorTypes.DATABASE,
      'Could not set level at this time.'
    );
  }
}



