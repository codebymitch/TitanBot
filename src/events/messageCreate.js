/**
 * Message Create Event
 * Handles XP distribution and leveling when messages are sent
 */

import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      // Ignore bot messages and DMs
      if (message.author.bot || !message.guild) return;

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

/**
 * Handle leveling for a message
 * @param {Message} message - Discord message
 * @param {Client} client - Discord client
 * @returns {Promise<void>}
 * @private
 */
async function handleLeveling(message, client) {
  try {
    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) return;

    // Check if channel is ignored
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

    // Check if user role is ignored
    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    // Check if user is blacklisted
    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;

    // Check message length (prevent empty messages)
    if (!message.content || message.content.trim().length === 0) return;

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    
    // Get cooldown time from config, default to 60 seconds
    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);
    
    // Skip if user is still on cooldown
    if (timeSinceLastMessage < cooldownTime * 1000) return;

    // Get XP range from config, with fallback defaults
    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    // Validate and clamp XP values
    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    // Calculate random XP in range
    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    // Apply multiplier if configured
    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    // Add XP to user
    const result = await addXp(client, message.guild, message.member, finalXP);
    
    if (result.success && result.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}


