import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';
import { addXp } from './xpSystem.js';

// Database is managed centrally in app.js via client.db
// All functions in this file receive 'client' as parameter and use client.db
const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;

export function getXpForLevel(level) {
  return 5 * Math.pow(level, 2) + 50 * level + 50;
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

export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    
    const members = await guild.members.fetch();
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
    const { getGuildConfigKey } = await import('../utils/database.js');
    const configKey = getGuildConfigKey(guildId);
    return await client.db.set(configKey, guildConfig);
  } catch (error) {
    logger.error('Error saving leveling config:', error);
    throw error;
  }
}
