import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData, saveUserLevelData } from '../utils/database.js';
import { addXp } from '../services/xpSystem.js';
import { botConfig } from '../config/bot.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      // Ignore bot messages and DMs
      if (message.author.bot || !message.guild) return;

      // Handle prefix commands
      if (message.content.startsWith(botConfig.commands.prefix)) {
        await handlePrefixCommand(message, client);
      }

      // Handle leveling (existing functionality)
      await handleLeveling(message, client);

    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

// Handle prefix commands
async function handlePrefixCommand(message, client) {
  const prefix = botConfig.commands.prefix;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // Find the command
  const command = client.commands.get(commandName);
  if (!command) return;

  // Check if command supports prefix execution
  if (!command.executeMessage) return;

  // Check if it's an economy command (only economy commands support prefix)
  if (command.category !== 'Economy') return;

  try {
    // Execute the prefix command
    await command.executeMessage(message, args, client);
  } catch (error) {
    logger.error(`Error executing prefix command ${commandName}:`, error);
    await message.reply({
      embeds: [{
        title: 'Command Error',
        description: 'There was an error executing that command.',
        color: 0xFF0000
      }]
    });
  }
}

// Handle leveling (existing functionality)
async function handleLeveling(message, client) {
  // Get leveling configuration
  const levelingConfig = await getLevelingConfig(client, message.guild.id);
  
  // Check if leveling is enabled
  if (!levelingConfig?.enabled) return;

  // Check if channel is ignored
  if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

  // Check if user has ignored roles
  if (levelingConfig.ignoredRoles?.length > 0) {
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return;
  }

  // Check if user is blacklisted
  if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;

  // Get user's current level data
  const userData = await getUserLevelData(client, message.guild.id, message.author.id);
  
  // Check cooldown (in seconds)
  const cooldownTime = levelingConfig.xpCooldown || 60;
  const now = Date.now();
  const timeSinceLastMessage = now - (userData.lastMessage || 0);
  
  if (timeSinceLastMessage < cooldownTime * 1000) return;

  // Calculate XP to give (random between min and max)
  const minXP = levelingConfig.xpPerMessage?.min || 15;
  const maxXP = levelingConfig.xpPerMessage?.max || 25;
  const xpToGive = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;

  // Apply XP multiplier if any
  let finalXP = xpToGive;
  if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
    finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
  }

  // Add XP to user
  const result = await addXp(client, message.guild, message.member, finalXP);
  
  if (result.success && result.leveledUp) {
    logger.info(`${message.author.tag} leveled up to ${result.level} in ${message.guild.name}`);
  }
}
