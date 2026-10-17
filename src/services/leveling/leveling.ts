// leveling.js

import { EmbedBuilder } from 'discord.js';
import type { Guild, GuildMember } from 'discord.js';
import type { NexoClient } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import { NexoBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { addXp } from './xpSystem.js';
import { getUserLevelKey } from '../../utils/database/keys.js';

const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;
const MAX_LEVEL = 1000;
const MIN_LEVEL = 0;

/** Leveling settings stored under `guildConfig.leveling`. */
export interface GuildLevelingConfig {
  enabled: boolean;
  xpPerMessage: { min: number; max: number };
  xpCooldown: number;
  levelUpMessage: string;
  levelUpChannel: string | null;
  ignoredChannels: string[];
  ignoredRoles: string[];
  blacklistedUsers: string[];
  roleRewards: Record<string, string>;
  announceLevelUp: boolean;
  xpMultiplier: number;
  xpRange?: { min: number; max: number };
  configured?: boolean;
  [key: string]: unknown;
}

/** Stored per-user level record (`guild:{guildId}:leveling:users:{userId}`). */
export interface LevelData {
  xp: number;
  level: number;
  totalXp: number;
  lastMessage: number;
  rank: number;
}

export interface LeaderboardEntry extends LevelData {
  userId: string;
  username: string;
  discriminator: string;
}

export function getXpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new NexoBotError(
      `Invalid level: ${level}. Must be between ${MIN_LEVEL} and ${MAX_LEVEL}`,
      ErrorTypes.VALIDATION,
      'Das Level muss eine gültige Zahl sein.'
    );
  }
  return 5 * Math.pow(level, 2) + 50 * level + 50;
}

export function getLevelFromXp(xp: number): { level: number; currentXp: number; xpNeeded: number } {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new NexoBotError(
      `Invalid XP: ${xp}`,
      ErrorTypes.VALIDATION,
      'XP müssen eine nicht-negative Zahl sein.'
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

export function calculateTotalXp(level: number, currentXp = 0): number {
  let total = currentXp;
  for (let i = 0; i < level; i++) {
    total += getXpForLevel(i);
  }
  return total;
}

export async function getLeaderboard(client: NexoClient, guildId: string, limit = 10): Promise<LeaderboardEntry[]> {
  try {
    
    if (!guildId || typeof guildId !== 'string') {
      throw new NexoBotError(
        'Invalid guild ID',
        ErrorTypes.VALIDATION,
        'Eine Server-ID ist erforderlich.'
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
      return new Map<string, GuildMember>();
    });

    const leaderboard: LeaderboardEntry[] = [];
    
    for (const [userId, member] of members) {
      if (member.user.bot) continue;
      
      const data = await getUserLevelData(client, guildId, userId);
      if (data && (data.totalXp > 0 || data.level > 0)) {
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
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to fetch leaderboard: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Die Bestenliste konnte gerade nicht geladen werden.'
    );
  }
}

export function createLeaderboardEmbed(leaderboard: LeaderboardEntry[] | null | undefined, guild: Guild): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Bestenliste von ${guild.name}`)
    .setColor('#2ecc71')
    .setTimestamp();
    
  if (!leaderboard || leaderboard.length === 0) {
    embed.setDescription('Noch keine Nutzer auf der Bestenliste!');
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
    `**Top-Mitglieder**\n${top3Text}${restText ? '\n\n' + restText : ''}`
  );
  
  return embed;
}

export async function getLevelingConfig(client: NexoClient, guildId: string): Promise<GuildLevelingConfig> {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    return (guildConfig.leveling as GuildLevelingConfig | undefined) || {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 20,
      levelUpMessage: '{user} ist auf Level {level} aufgestiegen!',
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
      xpCooldown: 20,
      levelUpMessage: '{user} ist auf Level {level} aufgestiegen!',
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

export async function getUserLevelData(client: NexoClient, guildId: string, userId: string): Promise<LevelData> {
  try {
    if (!guildId || !userId) {
      throw new NexoBotError(
        'Guild ID and User ID are required',
        ErrorTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    const data = await client.db.get<Partial<LevelData>>(key);
    
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
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to fetch user data: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Die Level-Daten konnten gerade nicht geladen werden.'
    );
  }
}

export async function saveUserLevelData(client: NexoClient, guildId: string, userId: string, data: LevelData): Promise<void> {
  try {
    if (!guildId || !userId) {
      throw new NexoBotError(
        'Guild ID and User ID are required',
        ErrorTypes.VALIDATION
      );
    }

    if (!data || typeof data !== 'object') {
      throw new NexoBotError(
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

    const key = getUserLevelKey(guildId, userId);
    await client.db.set(key, sanitizedData);
  } catch (error) {
    logger.error(`Error saving user level data for ${userId}:`, error);
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to save user data: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Die Level-Daten konnten gerade nicht gespeichert werden.'
    );
  }
}

export async function saveLevelingConfig(client: NexoClient, guildId: string, config: GuildLevelingConfig): Promise<void> {
  try {
    if (!guildId || !config) {
      throw new NexoBotError(
        'Guild ID and config are required',
        ErrorTypes.VALIDATION
      );
    }

    const guildConfig = await getGuildConfig(client, guildId);

    if (config.xpCooldown && (config.xpCooldown < 0 || config.xpCooldown > 3600)) {
      throw new NexoBotError(
        'XP cooldown must be between 0 and 3600 seconds',
        ErrorTypes.VALIDATION,
        'Der Cooldown muss zwischen 0 und 3600 Sekunden liegen.'
      );
    }

    if (config.xpRange && (config.xpRange.min < 1 || config.xpRange.max < 1 || config.xpRange.min > config.xpRange.max)) {
      throw new NexoBotError(
        'Invalid XP range configuration',
        ErrorTypes.VALIDATION,
        'Die minimalen XP müssen kleiner als die maximalen XP sein, und beide müssen positiv sein.'
      );
    }

    guildConfig.leveling = config;
    await setGuildConfig(client, guildId, guildConfig);
    
    logger.info(`Leveling config updated for guild ${guildId}`);
  } catch (error) {
    logger.error(`Error saving leveling config for guild ${guildId}:`, error);
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to save config: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Die Konfiguration konnte gerade nicht gespeichert werden.'
    );
  }
}

export async function addLevels(client: NexoClient, guildId: string, userId: string, levels: number): Promise<LevelData> {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new NexoBotError(
        'Leveling system is disabled on this server',
        ErrorTypes.CONFIGURATION,
        'Das Levelsystem ist auf diesem Server derzeit deaktiviert.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new NexoBotError(
        `Invalid level amount: ${levels}`,
        ErrorTypes.VALIDATION,
        'Du musst eine positive Anzahl an Leveln hinzufügen.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = userData.level + levels;

    if (newLevel > MAX_LEVEL) {
      throw new NexoBotError(
        `Level ${newLevel} exceeds maximum level ${MAX_LEVEL}`,
        ErrorTypes.VALIDATION,
        `Das maximale Level ist ${MAX_LEVEL}.`
      );
    }

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Added ${levels} levels to user ${userId} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error adding levels for user ${userId}:`, error);
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to add levels: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Level konnten gerade nicht hinzugefügt werden.'
    );
  }
}

export async function removeLevels(client: NexoClient, guildId: string, userId: string, levels: number): Promise<LevelData> {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new NexoBotError(
        'Leveling system is disabled on this server',
        ErrorTypes.CONFIGURATION,
        'Das Levelsystem ist auf diesem Server derzeit deaktiviert.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new NexoBotError(
        `Invalid level amount: ${levels}`,
        ErrorTypes.VALIDATION,
        'Du musst eine positive Anzahl an Leveln entfernen.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = Math.max(MIN_LEVEL, userData.level - levels);

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Removed ${levels} levels from user ${userId} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error removing levels for user ${userId}:`, error);
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to remove levels: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Level konnten gerade nicht entfernt werden.'
    );
  }
}

export async function setUserLevel(client: NexoClient, guildId: string, userId: string, level: number): Promise<LevelData> {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new NexoBotError(
        'Leveling system is disabled on this server',
        ErrorTypes.CONFIGURATION,
        'Das Levelsystem ist auf diesem Server derzeit deaktiviert.'
      );
    }

    if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      throw new NexoBotError(
        `Invalid level: ${level}`,
        ErrorTypes.VALIDATION,
        `Das Level muss zwischen ${MIN_LEVEL} und ${MAX_LEVEL} liegen.`
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    
    const newXp = 0;
    const newTotalXp = calculateTotalXp(level, newXp);

    userData.level = level;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await saveUserLevelData(client, guildId, userId, userData);
    
    logger.info(`Set level for user ${userId} to ${level} in guild ${guildId}`);
    return userData;
  } catch (error) {
    logger.error(`Error setting level for user ${userId}:`, error);
    if (error instanceof NexoBotError) throw error;
    throw new NexoBotError(
      `Failed to set level: ${error instanceof Error ? error.message : String(error)}`,
      ErrorTypes.DATABASE,
      'Das Level konnte gerade nicht gesetzt werden.'
    );
  }
}

export async function deleteUserLevelData(client: NexoClient, guildId: string, userId: string): Promise<void> {
  try {
    if (!guildId || !userId) {
      throw new NexoBotError(
        'Guild ID and User ID are required',
        ErrorTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    await client.db.delete(key);
    
    logger.debug(`Deleted level data for user ${userId} in guild ${guildId}`);
  } catch (error) {
    logger.error(`Error deleting level data for user ${userId}:`, error);
    if (error instanceof NexoBotError) throw error;
    logger.warn(`Could not delete level data for user ${userId} in guild ${guildId}`);
  }
}