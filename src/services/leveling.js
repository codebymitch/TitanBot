import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';
import Database from '@replit/database';

// Initialize database connection
const db = new Database();

// XP required for each level (exponential formula)
const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;

export function getXpForLevel(level) {
  return Math.floor(BASE_XP * Math.pow(level, XP_MULTIPLIER));
}

export function getLevelFromXp(xp) {
  let level = 0;
  let xpNeeded = 0;
  
  while (xp >= getXpForLevel(level)) {
    xpNeeded = getXpForLevel(level);
    xp -= xpNeeded;
    level++;
  }
  
  return {
    level,
    currentXp: xp,
    xpNeeded: getXpForLevel(level)
  };
}

export async function addXp(client, guild, member, xpToAdd) {
  try {
    const config = await getLevelingConfig(client, guild.id);
    
    // Check if leveling is enabled
    if (!config.enabled) {
      return { success: false, reason: 'Leveling is disabled in this server' };
    }
    
    // Get current level data
    const levelData = await getUserLevelData(client, guild.id, member.id);
    
    // Add XP
    levelData.xp += xpToAdd;
    levelData.totalXp += xpToAdd;
    
    // Check for level up
    const { level, xpNeeded } = getLevelFromXp(levelData.totalXp);
    const didLevelUp = level > levelData.level;
    
    if (didLevelUp) {
      levelData.level = level;
      levelData.xp = levelData.totalXp - (levelData.totalXp - xpToAdd);
      
      // Handle role rewards
      if (config.roleRewards && config.roleRewards[level]) {
        const roleId = config.roleRewards[level];
        const role = guild.roles.cache.get(roleId);
        
        if (role) {
          try {
            await member.roles.add(role);
          } catch (error) {
            logger.error(`Failed to add role ${roleId} to ${member.id}:`, error);
          }
        }
      }
      
      // Send level up message
      const levelUpChannel = config.levelUpChannel ? 
        guild.channels.cache.get(config.levelUpChannel) : 
        guild.systemChannel;
      
      if (levelUpChannel && levelUpChannel.isTextBased()) {
        const message = config.levelUpMessage
          .replace(/{user}/g, member.toString())
          .replace(/{level}/g, level)
          .replace(/{xp}/g, levelData.xp)
          .replace(/{xpNeeded}/g, xpNeeded);
        
        try {
          await levelUpChannel.send(message);
        } catch (error) {
          logger.error('Failed to send level up message:', error);
        }
      }
    }
    
    // Save updated data
    await saveUserLevelData(client, guild.id, member.id, levelData);
    
    return {
      success: true,
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded,
      leveledUp: didLevelUp
    };
    
  } catch (error) {
    logger.error('Error adding XP:', error);
    return { success: false, error: error.message };
  }
}

export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    // Get all user level data
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    
    const members = await guild.members.fetch();
    const leaderboard = [];
    
    // Get level data for all members
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
    
    // Sort by total XP
    leaderboard.sort((a, b) => b.totalXp - a.totalXp);
    
    // Add rank
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard.slice(0, limit);
    
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    return [];
  }
}

export function createLeaderboardEmbed(leaderboard, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${guild.name} Leaderboard`)
    .setColor('#2ecc71')
    .setTimestamp();
    
  if (leaderboard.length === 0) {
    embed.setDescription('No users on the leaderboard yet!');
    return embed;
  }
  
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  
  // Add top 3 with special formatting
  const top3Text = top3.map((user, index) => {
    const medal = ['🥇', '🥈', '🥉'][index];
    return `${medal} **#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  // Add rest of the leaderboard
  const restText = rest.map(user => {
    return `**#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  embed.setDescription(
    `**Top Members**\n${top3Text}${restText ? '\n\n' + restText : ''}`
  );
  
  return embed;
}

/**
 * Debug function to get raw user data from database
 * @param {Object} client - The Discord client
 * @param {string} guildId - The ID of the guild
 * @param {string} userId - The ID of the user
 * @returns {Promise<Object|null>} Raw user data or null if error
 */
export async function debugGetRawUserData(client, guildId, userId) {
  try {
    if (!client.db) {
      console.error("Database not initialized in client");
      return null;
    }
    const key = `${guildId}:leveling:user:${userId}`;
    const data = await client.db.get(key);
    console.log(JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error("Error in debugGetRawUserData:", error);
    return null;
  }
}

// --- DATABASE FUNCTIONS FOR LEVELING ---

export async function getLevelingConfig(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return config.leveling || {
    enabled: true,
    xpPerMessage: 15,
    xpCooldown: 60,
    levelUpMessage: '{user} has leveled up to level {level}!',
    ignoredChannels: [],
    roleRewards: {}
  };
}

export async function getUserLevelData(client, guildId, userId) {
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
  
  // Ensure all required fields exist
  return {
    xp: data.xp || 0,
    level: data.level || 0,
    totalXp: data.totalXp || 0,
    lastMessage: data.lastMessage || 0,
    rank: data.rank || 0
  };
}

export async function saveUserLevelData(client, guildId, userId, data) {
  const key = `${guildId}:leveling:user:${userId}`;
  await client.db.set(key, data);
}
