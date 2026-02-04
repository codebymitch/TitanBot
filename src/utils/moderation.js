import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { logger } from './logger.js';
import { getFromDb, setInDb } from './database.js';

/**
 * Enhanced moderation logging system with comprehensive tracking
 * @param {Object} options - The log options
 * @param {import('discord.js').Client} options.client - The Discord client
 * @param {import('discord.js').Guild} options.guild - The guild object
 * @param {Object} options.event - The event details
 * @param {string} options.event.action - The action that was taken
 * @param {string} options.event.target - The target user/channel/object
 * @param {string} options.event.executor - The moderator who performed the action
 * @param {string} [options.event.reason] - The reason for the action
 * @param {string} [options.event.duration] - Duration for timed actions
 * @param {Object} [options.event.metadata] - Additional metadata
 * @param {string} [options.event.color] - Embed color override
 * @returns {Promise<void>}
 */
export async function logEvent({ client, guild, guildId, event }) {
  try {
    // Allow caller to provide either guild or guildId
    if (!guild && guildId) {
      guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      logger.warn('logEvent invoked without valid guild or guildId');
      return;
    }
    // Get the guild configuration
    const config = await getGuildConfig(client, guild.id);
    if (!config?.logChannelId || !config?.enableLogging) {
      logger.debug(`Logging disabled or no log channel configured for guild ${guild.id}`);
      return;
    }

    const logChannel = guild.channels.cache.get(config.logChannelId);
    if (!logChannel) {
      logger.warn(`Log channel ${config.logChannelId} not found in guild ${guild.id}`);
      return;
    }

    // Define action colors and icons
    const actionStyles = {
      'Member Banned': { color: '#721919', icon: '🔨' },
      'Member Kicked': { color: '#FFA500', icon: '👢' },
      'Member Timed Out': { color: '#F1C40F', icon: '⏳' },
      'Member Untimeouted': { color: '#2ECC71', icon: '✅' },
      'User Warned': { color: '#FEE75C', icon: '⚠️' },
      'Warnings Viewed': { color: '#3498DB', icon: '👁️' },
      'Messages Purged': { color: '#E67E22', icon: '🗑️' },
      'Channel Locked': { color: '#CC00CC', icon: '🔒' },
      'Channel Unlocked': { color: '#2ECC71', icon: '🔓' },
      'Case Created': { color: '#3498DB', icon: '📋' },
      'Case Updated': { color: '#9B59B6', icon: '📝' },
      'DM Sent': { color: '#3498DB', icon: '✉️' },
      'Log Channel Activated': { color: '#2ECC71', icon: '📝' }
    };

    const style = actionStyles[event.action] || { color: '#0099ff', icon: '🔨' };

    // Create comprehensive embed
    const embed = new EmbedBuilder()
      .setColor(event.color || style.color)
      .setTitle(`${style.icon} ${event.action}`)
      .addFields(
        { name: "Target", value: event.target, inline: true },
        { name: "Moderator", value: event.executor, inline: true }
      )
      .setTimestamp()
      .setFooter({ 
        text: `Guild ID: ${guild.id} | Moderator ID: ${event.executor.match(/\((\d+)\)/)?.[1] || 'Unknown'}`,
        iconURL: guild.iconURL()
      });

    // Add reason if provided
    if (event.reason) {
      embed.addFields({
        name: "Reason",
        value: event.reason.length > 1024 ? event.reason.substring(0, 1021) + '...' : event.reason,
        inline: false
      });
    }

    // Add duration if provided
    if (event.duration) {
      embed.addFields({
        name: "Duration",
        value: event.duration,
        inline: true
      });
    }

    // Add metadata if provided
    if (event.metadata) {
      Object.entries(event.metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          embed.addFields({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value: String(value).length > 1024 ? String(value).substring(0, 1021) + '...' : String(value),
            inline: true
          });
        }
      });
    }

    // Add case ID if available
    if (event.caseId) {
      embed.addFields({
        name: "Case ID",
        value: `#${event.caseId}`,
        inline: true
      });
    }

    // Send the log message
    await logChannel.send({ embeds: [embed] });
    
    // Log to system logger for audit trail
    logger.info(`Moderation action logged: ${event.action} by ${event.executor} on ${event.target} in guild ${guild.id}`);
    
  } catch (error) {
    logger.error("Error logging moderation event:", error);
  }
}

/**
 * Generate a unique case ID for moderation actions
 * @param {import('discord.js').Client} client - The Discord client
 * @param {string} guildId - The guild ID
 * @returns {Promise<number>} Next case number
 */
export async function generateCaseId(client, guildId) {
  try {
    const caseKey = `moderation_cases_${guildId}`;
    const currentCase = await getFromDb(caseKey, 0);
    const nextCase = currentCase + 1;
    await setInDb(caseKey, nextCase);
    return nextCase;
  } catch (error) {
    logger.error("Error generating case ID:", error);
    return Date.now(); // Fallback to timestamp
  }
}

/**
 * Store moderation case in database for audit trail
 * @param {Object} options - The case options
 * @param {string} options.guildId - The guild ID
 * @param {number} options.caseId - The case ID
 * @param {Object} options.caseData - The case data
 * @returns {Promise<boolean>} Success status
 */
export async function storeModerationCase({ guildId, caseId, caseData }) {
  try {
    const caseKey = `moderation_case_${guildId}_${caseId}`;
    const caseDataWithTimestamp = {
      ...caseData,
      createdAt: new Date().toISOString(),
      caseId
    };
    
    // Store individual case
    await setInDb(caseKey, caseDataWithTimestamp);
    
    // Update case list for this guild
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    caseList.push(caseDataWithTimestamp);
    
    // Keep only last 1000 cases in the list to prevent memory issues
    if (caseList.length > 1000) {
      caseList.splice(0, caseList.length - 1000);
    }
    
    await setInDb(caseListKey, caseList);
    return true;
  } catch (error) {
    logger.error("Error storing moderation case:", error);
    return false;
  }
}

/**
 * Get moderation cases for a guild
 * @param {string} guildId - The guild ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of cases
 */
export async function getModerationCases(guildId, filters = {}) {
  try {
    const { userId, moderatorId, action, limit = 50, offset = 0 } = filters;
    
    // Get all case keys for this guild
    const allCases = [];
    
    // For now, we'll implement a simple version. In a production environment,
    // you might want to use a more efficient database query system
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    
    let filteredCases = caseList;
    
    if (userId) {
      filteredCases = filteredCases.filter(case_ => case_.targetUserId === userId);
    }
    
    if (moderatorId) {
      filteredCases = filteredCases.filter(case_ => case_.moderatorId === moderatorId);
    }
    
    if (action) {
      filteredCases = filteredCases.filter(case_ => case_.action === action);
    }
    
    // Sort by creation date (newest first)
    filteredCases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return filteredCases.slice(offset, offset + limit);
  } catch (error) {
    logger.error("Error getting moderation cases:", error);
    return [];
  }
}

/**
 * Enhanced logging function that stores case in database
 * @param {Object} options - The log options
 * @returns {Promise<number>} The generated case ID
 */
export async function logModerationAction({ client, guild, event }) {
  const caseId = await generateCaseId(client, guild.id);
  
  // Store case in database
  await storeModerationCase({
    guildId: guild.id,
    caseId,
    caseData: {
      action: event.action,
      target: event.target,
      executor: event.executor,
      reason: event.reason,
      duration: event.duration,
      metadata: event.metadata,
      targetUserId: event.metadata?.userId,
      moderatorId: event.metadata?.moderatorId
    }
  });
  
  // Log to channel
  await logEvent({
    client,
    guild,
    event: {
      ...event,
      caseId
    }
  });
  
  return caseId;
}
