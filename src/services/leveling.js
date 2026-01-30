import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';
import { addXp } from './xpSystem.js';
import { redisDb } from '../utils/redisDatabase.js';

// Initialize database connection
let db = null;
let useFallback = false;

// Check if we're in a Replit environment (for backward compatibility)
const isReplitEnvironment = process.env.REPL_ID || process.env.REPL_OWNER || process.env.REPL_SLUG;

// Async database initialization
async function initializeLevelingDatabase() {
  try {
    // Try to connect to Redis first
    const redisConnected = await redisDb.connect();
    if (redisConnected) {
      db = redisDb;
      logger.info('✅ Redis Database initialized for leveling service');
      return;
    }
  } catch (error) {
    logger.warn('Redis connection failed for leveling service, using fallback:', error.message);
  }
  
  // Fallback to mock database for non-Replit environments
  db = {
    get: async (key, defaultValue = null) => defaultValue,
    set: async (key, value, ttl = null) => true,
    delete: async (key) => true,
    list: async (prefix) => [],
    exists: async (key) => false,
    increment: async (key, amount = 1) => amount,
    decrement: async (key, amount = 1) => -amount
  };
  useFallback = true;
  logger.info('Using mock database for leveling service (fallback)');
}

// Initialize database immediately
initializeLevelingDatabase();

// XP required for each level (exponential formula)
const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;

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

export async function saveLevelingConfig(client, guildId, config) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    guildConfig.leveling = config;
    return await client.db.set(`${guildId}:config`, guildConfig);
  } catch (error) {
    logger.error('Error saving leveling config:', error);
    throw error;
  }
}
